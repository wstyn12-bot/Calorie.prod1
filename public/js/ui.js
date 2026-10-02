// Shared UI state, action registry, data selectors and small components.

import { html, raw, cls, esc } from "./html.js";
import { store, images, uid } from "./store.js";
import { icon } from "./icons.js";
import * as N from "./nutrition.js";

export const APP_NAME = "calorie.prod";

export const ui = {
  tab: "today",
  date: N.todayStr(),
  sheets: [],
  toast: null,
  auth: { mode: "login", busy: false, error: "", status: null },
  onboarding: null,
  me: null,
  ai: true,
  model: "",
  lib: { tab: "saved", query: "" },
  progress: { range: 7, month: N.todayStr().slice(0, 7) },
  focus: null, // CSS selector to focus after the next render
};

// Handlers are looked up by name from data-act / data-input / data-change / data-submit attributes.
export const actions = {};

let renderFn = () => {};
export const setRenderer = (fn) => (renderFn = fn);
export const render = () => renderFn();

// ---------------------------------------------------------------- sheets & toasts

export function openSheet(sheet) {
  ui.sheets.push({ key: uid("s"), ...sheet });
  try {
    history.pushState({ sheet: ui.sheets.length }, "");
  } catch {
    /* ignore */
  }
  render();
  return ui.sheets[ui.sheets.length - 1];
}

export const topSheet = () => ui.sheets[ui.sheets.length - 1] || null;

let closingTimer = null;
let ignorePops = 0;
export function closeSheet({ fromHistory = false, all = false } = {}) {
  const open = ui.sheets.filter((s) => !s.closing);
  if (!open.length) return;
  const toClose = all ? open : [open[open.length - 1]];
  for (const s of toClose) {
    s.abort?.abort?.();
    s.closing = true;
  }
  render();
  clearTimeout(closingTimer);
  closingTimer = setTimeout(() => {
    ui.sheets = ui.sheets.filter((s) => !s.closing);
    render();
  }, 190);
  if (!fromHistory) {
    try {
      if (history.state?.sheet) {
        ignorePops++;
        history.go(-toClose.length);
      }
    } catch {
      /* ignore */
    }
  }
}

// Browser/Android back button: close the top sheet (ignore pops we caused ourselves).
export function onPopState() {
  if (ignorePops > 0) {
    ignorePops--;
    return;
  }
  if (ui.sheets.some((s) => !s.closing)) closeSheet({ fromHistory: true });
}

export function replaceSheet(sheet) {
  const t = topSheet();
  if (!t) return openSheet(sheet);
  const next = { key: uid("s"), ...sheet };
  ui.sheets[ui.sheets.length - 1] = next;
  render();
  return next;
}

let toastTimer = null;
export function toast(msg, opts = {}) {
  ui.toast = { id: uid("t"), msg, actionLabel: opts.actionLabel || "", onAction: opts.onAction || null, tone: opts.tone || "" };
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = null;
    render();
  }, opts.duration || (opts.onAction ? 5000 : 3000));
}
actions["toast-action"] = () => {
  const t = ui.toast;
  ui.toast = null;
  t?.onAction?.();
  render();
};

// ---------------------------------------------------------------- data selectors

export const getProfile = () => store.get("profile");

export function getGoals() {
  const g = store.get("goals");
  return { id: "goals", kind: "goals", custom: {}, microCustom: {}, history: [], ...(g || {}) };
}

export function getPrefs() {
  const p = store.get("prefs") || {};
  return { ...N.DEFAULT_PREFS, ...p, streak: { ...N.DEFAULT_PREFS.streak, ...(p.streak || {}) } };
}

export const energyUnit = () => getPrefs().energyUnit;

export function currentTargets() {
  return N.effectiveTargets(getProfile() || {}, getGoals());
}

export function targetsFor(date) {
  const hist = getGoals().history || [];
  if (!hist.length || date >= hist[hist.length - 1].from) return currentTargets();
  let pick = hist[0];
  for (const h of hist) if (h.from <= date) pick = h;
  return pick;
}

export function microTargetsNow(kcal) {
  return N.microTargets(getProfile() || {}, kcal ?? currentTargets().kcal, getGoals().microCustom);
}

// Record today's effective targets so past days keep the goals they had at the time.
export function snapshotTargets() {
  const g = getGoals();
  const t = N.effectiveTargets(getProfile() || {}, g);
  const today = N.todayStr();
  const hist = (g.history || []).filter((h) => h.from < today);
  const last = hist[hist.length - 1];
  if (!last || last.kcal !== t.kcal || last.protein !== t.protein || last.carbs !== t.carbs || last.fat !== t.fat) {
    hist.push({ from: today, kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat });
  }
  const same = JSON.stringify(hist) === JSON.stringify(g.history || []);
  if (!same || !store.get("goals")) store.put({ ...g, history: hist });
}

export function entriesByDate() {
  return store.derive("byDate", () => {
    const map = new Map();
    for (const e of store.list("entry")) {
      if (!e.date) continue;
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    }
    for (const list of map.values()) list.sort((a, b) => (a.time || "").localeCompare(b.time || "") || a.createdAt - b.createdAt);
    return map;
  });
}

export const dayEntries = (date) => entriesByDate().get(date) || [];
export const dayTotals = (date) => store.derive("tot:" + date, () => N.sumEntries(dayEntries(date)));

export function dayStatus(date) {
  return store.derive("st:" + date, () => {
    const logged = dayEntries(date).length > 0;
    return { logged, hit: N.evaluateDay(dayTotals(date), targetsFor(date), getPrefs().streak, logged) };
  });
}

export function streakInfo() {
  return store.derive("streak", () => {
    const dates = [...entriesByDate().keys()].sort();
    return N.computeStreaks(dayStatus, N.todayStr(), dates[0]);
  });
}

// Unique foods from the diary, most recent first (for Recent / Frequent lists).
export function foodHistory() {
  return store.derive("foodHistory", () => {
    const byName = new Map();
    const entries = [...store.list("entry")].sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")) || b.createdAt - a.createdAt);
    for (const e of entries) {
      const k = (e.name || "").trim().toLowerCase();
      if (!k) continue;
      const cur = byName.get(k);
      if (cur) cur.count++;
      else byName.set(k, { key: k, entry: e, count: 1, last: e.date });
    }
    return [...byName.values()];
  });
}

// ---------------------------------------------------------------- components

export function ring(p, { size = 64, stroke = 7, color = "var(--ink)", track = "var(--track)", over = false } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, Number(p) || 0));
  const col = over ? "var(--bad)" : color;
  return raw(
    `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>` +
      (v > 0
        ? `<circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - v)).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`
        : "") +
      `</svg>`,
  );
}

export function bar(p, color = "var(--ink)", over = false) {
  const v = Math.max(0, Math.min(1, Number(p) || 0));
  return html`<div class="bar"><span style="width:${(v * 100).toFixed(1)}%;background:${over ? "var(--bad)" : color}"></span></div>`;
}

export function thumb(rec, size = 52, extraClass = "") {
  const url = rec?.imgId ? images.url(rec.imgId) : null;
  if (url) return html`<div class="${cls("thumb", extraClass)}" style="width:${size}px;height:${size}px"><img src="${url}" alt="" /></div>`;
  return html`<div class="${cls("thumb emoji", extraClass)}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.48)}px">${rec?.emoji || "🍽️"}</div>`;
}

export function sheetFrame({ title = "", body, footer = "", back = false, right = "", cls: extra = "", sheet }) {
  return html`<div class="${cls("sheet", extra, sheet?.closing && "closing")}" role="dialog" aria-modal="true" aria-label="${title || "Panel"}">
    <div class="sheet-grabber"></div>
    <div class="sheet-head">
      <button type="button" class="icon-btn" data-act="sheet-close" aria-label="${back ? "Back" : "Close"}">${icon(back ? "left" : "x", 22)}</button>
      <h2>${title}</h2>
      <div class="sheet-head-right">${right}</div>
    </div>
    <div class="sheet-body">${body}</div>
    ${footer ? html`<div class="sheet-foot">${footer}</div>` : ""}
  </div>`;
}
actions["sheet-close"] = () => closeSheet();
actions["noop"] = () => {};

export function seg(options, value, act, extra = "", data = {}) {
  const attrs = raw(Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join(""));
  return html`<div class="${cls("seg", extra)}" role="tablist">
    ${options.map(
      (o) => html`<button type="button" role="tab" aria-selected="${String(o.value === value)}" class="${cls("seg-btn", o.value === value && "on")}" data-act="${act}" data-value="${o.value}"${attrs}>${o.label}</button>`,
    )}
  </div>`;
}

export function toggle(on, act, label, sub = "") {
  return html`<button type="button" class="toggle-row" data-act="${act}" role="switch" aria-checked="${String(Boolean(on))}">
    <span class="toggle-text"><span>${label}</span>${sub ? html`<small>${sub}</small>` : ""}</span>
    <span class="${cls("switch", on && "on")}"><span></span></span>
  </button>`;
}

export function macroLine(t) {
  return html`<span class="macro-line"><b class="p">P</b> ${N.fmtG(t.protein)}g <b class="c">C</b> ${N.fmtG(t.carbs)}g <b class="f">F</b> ${N.fmtG(t.fat)}g</span>`;
}

export function syncBadge() {
  const s = store.syncState;
  const pending = store.pendingCount;
  let label = "Synced";
  let ic = "cloud";
  let tone = "ok";
  if (s.status === "syncing") {
    label = "Syncing…";
    tone = "busy";
  } else if (s.status === "offline") {
    label = pending ? `Offline · ${pending} to sync` : "Offline";
    ic = "cloudOff";
    tone = "warn";
  } else if (s.status === "error") {
    label = "Sync issue";
    ic = "cloudOff";
    tone = "bad";
  } else if (pending) {
    label = "Saving…";
    tone = "busy";
  }
  return html`<button type="button" class="${cls("sync-badge", tone)}" data-act="sync-now" title="${s.error || label}" aria-label="${label}">${icon(ic, 18)}</button>`;
}
actions["sync-now"] = () => {
  store.syncNow();
  const s = store.syncState;
  if (s.status === "error" || s.status === "offline") toast(s.error || "Trying to sync…");
};

export function emptyState(emoji, title, text, button = "") {
  return html`<div class="empty"><div class="empty-emoji">${emoji}</div><h3>${title}</h3><p>${text}</p>${button}</div>`;
}

export function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function inputNum(v, dp = 1) {
  const x = Number(v);
  if (!Number.isFinite(x) || x === 0) return "";
  const f = 10 ** dp;
  return String(Math.round(x * f) / f);
}

// Full micronutrient breakdown, grouped, with % of target.
export function microList(micros, targets) {
  return N.MICRO_GROUPS.map(
    (g) => html`<div class="micro-group">
      <h4>${g.label}</h4>
      ${N.MICROS.filter((m) => m.group === g.key).map((m) => {
        const v = micros?.[m.key] || 0;
        const t = targets?.[m.key] || 0;
        const over = m.kind === "limit" && t > 0 && v > t;
        return html`<div class="micro-row">
          <span class="micro-name">${m.label}${m.kind === "limit" ? html` <i class="limit-tag">limit</i>` : ""}</span>
          <span class="micro-val">${N.fmtAmount(v)} ${m.unit}${t ? html`<i> / ${N.fmtAmount(t)}</i>` : ""}</span>
          <span class="${cls("micro-pct", over && "over", !t && "muted")}">${t ? `${N.pct(v, t)}%` : "–"}</span>
          ${t ? bar(v / t, m.kind === "limit" ? "var(--text-3)" : "var(--fibre)", over) : html`<div class="bar bar-empty"></div>`}
        </div>`;
      })}
    </div>`,
  );
}

// ---------------------------------------------------------------- matching saved meals

const STOP = new Set(["with", "and", "the", "a", "an", "of", "on", "in", "w", "plus", "some", "my", "x"]);

export function nameTokens(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

export function similarity(a, b) {
  const A = new Set(nameTokens(a));
  const B = new Set(nameTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = new Set([...A, ...B]).size;
  return 0.5 * (inter / Math.min(A.size, B.size)) + 0.5 * (inter / union);
}

// Saved meals that look like `text`, best first.
export function savedMatches(text, { min = 0.5, limit = 4 } = {}) {
  const q = String(text || "").trim().toLowerCase();
  if (q.length < 2) return [];
  return store
    .list("meal")
    .map((m) => ({ m, score: Math.max(similarity(q, m.name), m.name.toLowerCase().includes(q) ? 0.9 : 0) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score || (b.m.uses || 0) - (a.m.uses || 0))
    .slice(0, limit)
    .map((x) => x.m);
}

// The thing you usually have for a meal slot (logged at least twice in the last 3 weeks).
export function usualFor(mealKey) {
  return store.derive("usual:" + mealKey, () => {
    const since = N.addDays(N.todayStr(), -21);
    const counts = new Map();
    for (const e of store.list("entry")) {
      if (e.meal !== mealKey || !e.date || e.date < since) continue;
      const k = (e.name || "").trim().toLowerCase();
      if (!k) continue;
      const cur = counts.get(k);
      if (!cur) counts.set(k, { n: 1, entry: e });
      else {
        cur.n++;
        if ((e.date + (e.time || "")) > (cur.entry.date + (cur.entry.time || ""))) cur.entry = e;
      }
    }
    let best = null;
    for (const v of counts.values()) if (v.n >= 2 && (!best || v.n > best.n)) best = v;
    return best ? best.entry : null;
  });
}
