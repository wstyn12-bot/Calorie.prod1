// Offline-first data store. Everything lives on the device (IndexedDB) and syncs with the
// server in the background. Records are grouped into shards; the newest edit of a record wins.

import { idb } from "./idb.js";
import { api } from "./api.js";

const listeners = new Set();
const state = {
  shards: new Map(), // name -> { rev, records: Map<id, record> }
  pending: new Map(), // id -> record not yet confirmed by the server
  version: 0,
  sync: { status: "idle", lastAt: 0, error: "" },
  ready: false,
};
const dirtyShards = new Set();
let memo = new Map();
let generation = 0; // bumps on sign-out so late network replies can't leak into the next session

function bump() {
  state.version++;
  memo = new Map();
  for (const fn of listeners) fn();
}

export function uid(prefix) {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return prefix + Date.now().toString(36) + Array.from(a, (b) => (b % 36).toString(36)).join("");
}

function shardFor(rec) {
  if (rec.kind === "entry") return "log-" + new Date().toISOString().slice(0, 7);
  if (rec.kind === "meal") return "meals";
  return "meta";
}

function setLocal(rec) {
  let sh = state.shards.get(rec.shard);
  if (!sh) {
    sh = { rev: 0, records: new Map() };
    state.shards.set(rec.shard, sh);
  }
  sh.records.set(rec.id, rec);
  dirtyShards.add(rec.shard);
}

// ---------------------------------------------------------------- persistence

let persistTimer = null;
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 250);
}
async function persistNow() {
  clearTimeout(persistTimer);
  const writes = [];
  for (const name of dirtyShards) {
    const sh = state.shards.get(name);
    if (sh) writes.push([`shard:${name}`, { rev: sh.rev, records: [...sh.records.values()] }]);
  }
  dirtyShards.clear();
  writes.push(["pending", [...state.pending.values()]]);
  try {
    await idb.setMany(writes);
  } catch (err) {
    console.warn("Couldn't save to this device", err);
  }
}

// ---------------------------------------------------------------- photos

const imgUrls = new Map(); // id -> object URL
const imgState = new Map(); // id -> "loading" | "missing" | failedAt timestamp

async function loadImage(id) {
  imgState.set(id, "loading");
  const gen = generation;
  try {
    let rec = await idb.get(`img:${id}`);
    if (!rec && api.token) {
      const res = await api.req("GET", `/img/${id}`, undefined, { raw: true, timeout: 20_000 });
      rec = { type: res.headers.get("content-type") || "image/jpeg", buf: await res.arrayBuffer() };
      if (gen !== generation) return;
      await idb.set(`img:${id}`, rec).catch(() => {});
    }
    if (gen !== generation) return;
    if (rec) {
      imgUrls.set(id, URL.createObjectURL(new Blob([rec.buf], { type: rec.type })));
      imgState.delete(id);
      bump();
    } else imgState.set(id, "missing");
  } catch (err) {
    // 404: the other device may not have uploaded it yet, so check again later.
    imgState.set(id, err?.status === 404 ? Date.now() + 270_000 : Date.now());
  }
}

let imgFlushing = false;
async function flushImages() {
  if (imgFlushing || !api.token) return;
  imgFlushing = true;
  try {
    const queue = (await idb.get("imgQueue")) || [];
    const done = new Set();
    for (const id of queue) {
      const rec = await idb.get(`img:${id}`);
      if (!rec) {
        done.add(id);
        continue;
      }
      try {
        await api.req("PUT", `/img/${id}`, new Blob([rec.buf], { type: rec.type }), { timeout: 30_000 });
        done.add(id);
      } catch (err) {
        if (!(err.network || err.status >= 500 || err.status === 429)) done.add(id); // permanent failure, give up
        else break;
      }
    }
    if (done.size) {
      const latest = (await idb.get("imgQueue")) || [];
      await idb.set("imgQueue", latest.filter((id) => !done.has(id)));
    }
  } finally {
    imgFlushing = false;
  }
}

export const images = {
  url(id) {
    if (!id) return null;
    const u = imgUrls.get(id);
    if (u) return u;
    const st = imgState.get(id);
    if (st === "loading" || st === "missing") return null;
    if (typeof st === "number" && Date.now() - st < 30_000) return null;
    loadImage(id);
    return null;
  },
  async save(id, blob) {
    imgUrls.set(id, URL.createObjectURL(blob));
    await idb.set(`img:${id}`, { type: blob.type || "image/jpeg", buf: await blob.arrayBuffer() });
    const q = (await idb.get("imgQueue")) || [];
    if (!q.includes(id)) q.push(id);
    await idb.set("imgQueue", q);
    bump();
    setTimeout(flushImages, 500);
  },
  async blob(id) {
    const rec = await idb.get(`img:${id}`);
    return rec ? new Blob([rec.buf], { type: rec.type }) : null;
  },
};

// ---------------------------------------------------------------- sync

let syncTimer = null;
let syncing = false;
let syncAgain = false;
let backoff = 0;

function setSync(patch) {
  state.sync = { ...state.sync, ...patch };
  for (const fn of listeners) fn();
}

function scheduleSync(delay = 800) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => store.syncNow(), delay);
}

// The app is being hidden or closed: save locally and fire off unsynced changes with a
// keepalive request so they reach the server even if the page is about to be suspended.
// (The response is ignored; the next normal sync reconciles everything.)
function flushOnHide() {
  persistNow();
  if (!state.pending.size || !api.token) return;
  const push = {};
  for (const rec of state.pending.values()) (push[rec.shard] ||= []).push(rec);
  const have = {};
  for (const [name, sh] of state.shards) have[name] = sh.rev;
  const body = JSON.stringify({ have, push });
  if (body.length > 60_000) return; // keepalive requests are capped at 64 KB
  try {
    fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${api.token}` },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

async function runSync() {
  for (let round = 0; round < 6; round++) {
    syncAgain = false;
    const batch = new Map(state.pending);
    const push = {};
    for (const rec of batch.values()) (push[rec.shard] ||= []).push(rec);
    const have = {};
    for (const [name, sh] of state.shards) have[name] = sh.rev;

    const gen = generation;
    const res = await api.post("/sync", { have, push }, { timeout: 45_000 });
    if (gen !== generation) return; // signed out while this was in flight

    for (const [id, rec] of batch) {
      const p = state.pending.get(id);
      if (p && p.updatedAt === rec.updatedAt) state.pending.delete(id);
    }
    for (const [name, sh] of Object.entries(res.shards || {})) {
      let local = state.shards.get(name);
      if (!local) {
        local = { rev: 0, records: new Map() };
        state.shards.set(name, local);
      }
      if (Array.isArray(sh.records)) {
        local.records = new Map(sh.records.map((r) => [r.id, r]));
        for (const rec of state.pending.values()) {
          if (rec.shard !== name) continue;
          const ex = local.records.get(rec.id);
          if (!ex || rec.updatedAt >= ex.updatedAt) local.records.set(rec.id, rec);
        }
      }
      local.rev = sh.rev;
      dirtyShards.add(name);
    }
    for (const name of res.unknown || []) {
      const sh = state.shards.get(name);
      if (!sh) continue;
      for (const r of sh.records.values()) state.pending.set(r.id, r);
      sh.rev = 0;
      dirtyShards.add(name);
      syncAgain = true;
    }
    state.ready = true;
    bump();
    await persistNow();
    if (state.pending.size) syncAgain = true;
    if (!syncAgain) break;
  }
}

// ---------------------------------------------------------------- public API

export const store = {
  get version() {
    return state.version;
  },
  get syncState() {
    return state.sync;
  },
  get ready() {
    return state.ready;
  },
  get pendingCount() {
    return state.pending.size;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async load() {
    const keys = await idb.keys().catch(() => []);
    for (const k of keys) {
      if (typeof k !== "string" || !k.startsWith("shard:")) continue;
      const v = await idb.get(k);
      if (v && Array.isArray(v.records)) {
        state.shards.set(k.slice(6), { rev: Number(v.rev) || 0, records: new Map(v.records.map((r) => [r.id, r])) });
      }
    }
    const pend = (await idb.get("pending").catch(() => null)) || [];
    for (const r of pend) {
      state.pending.set(r.id, r);
      setLocal(r);
    }
    dirtyShards.clear();
    state.ready = state.shards.size > 0;
    bump();
  },

  async reset() {
    generation++;
    clearTimeout(syncTimer);
    state.shards = new Map();
    state.pending = new Map();
    state.ready = false;
    state.sync = { status: "idle", lastAt: 0, error: "" };
    dirtyShards.clear();
    for (const u of imgUrls.values()) URL.revokeObjectURL(u);
    imgUrls.clear();
    imgState.clear();
    await idb.clear().catch(() => {});
    bump();
  },

  get(id, includeDeleted = false) {
    for (const sh of state.shards.values()) {
      const r = sh.records.get(id);
      if (r) return r.deleted && !includeDeleted ? null : r;
    }
    return null;
  },

  list(kind) {
    const key = "list:" + kind;
    if (memo.has(key)) return memo.get(key);
    const out = [];
    for (const sh of state.shards.values()) for (const r of sh.records.values()) if (r.kind === kind && !r.deleted) out.push(r);
    memo.set(key, out);
    return out;
  },

  // Memoise any derived value until the data next changes.
  derive(key, fn) {
    if (memo.has(key)) return memo.get(key);
    const v = fn();
    memo.set(key, v);
    return v;
  },

  put(rec) {
    const now = Date.now();
    const prev = store.get(rec.id, true);
    const shard = rec.shard || prev?.shard || shardFor(rec);
    const next = {
      ...rec,
      shard,
      createdAt: rec.createdAt || prev?.createdAt || now,
      updatedAt: Math.max(now, (prev?.updatedAt || 0) + 1),
    };
    setLocal(next);
    state.pending.set(next.id, next);
    bump();
    persistSoon();
    scheduleSync();
    return next;
  },

  remove(id) {
    const prev = store.get(id);
    if (!prev) return null;
    store.put({ id, kind: prev.kind, shard: prev.shard, date: prev.date, deleted: true, createdAt: prev.createdAt });
    return prev;
  },

  // Restore an exact earlier version (used by undo).
  restore(rec) {
    return store.put({ ...rec, deleted: false });
  },

  importRecords(records) {
    let count = 0;
    for (const raw of records) {
      if (!raw || typeof raw.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.id) || !raw.kind) continue;
      const rec = { ...raw, shard: raw.shard || shardFor(raw), updatedAt: Number(raw.updatedAt) || Date.now() };
      const existing = store.get(rec.id, true);
      if (existing && existing.updatedAt >= rec.updatedAt) continue;
      setLocal(rec);
      state.pending.set(rec.id, rec);
      count++;
    }
    if (count) {
      bump();
      persistSoon();
      scheduleSync(300);
    }
    return count;
  },

  exportAll() {
    const out = [];
    for (const sh of state.shards.values()) for (const r of sh.records.values()) if (!r.deleted) out.push(r);
    return out;
  },

  async syncNow() {
    if (!api.token) return;
    if (syncing) {
      syncAgain = true;
      return;
    }
    clearTimeout(syncTimer);
    syncing = true;
    setSync({ status: "syncing" });
    try {
      await runSync();
      backoff = 0;
      setSync({ status: "idle", lastAt: Date.now(), error: "" });
      flushImages();
    } catch (err) {
      if (err?.status === 401) return setSync({ status: "idle", error: "" });
      backoff = Math.min(backoff ? backoff * 2 : 4000, 120_000);
      setSync({ status: err?.network ? "offline" : "error", error: err?.message || "Sync failed" });
      scheduleSync(backoff);
    } finally {
      syncing = false;
      if (syncAgain && !backoff) scheduleSync(200);
    }
  },

  startAutoSync() {
    setInterval(() => {
      if (document.visibilityState === "visible") store.syncNow();
    }, 60_000);
    window.addEventListener("online", () => store.syncNow());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") store.syncNow();
      else flushOnHide();
    });
    window.addEventListener("pagehide", flushOnHide);
  },

  flushImages,
  persistNow,
};
