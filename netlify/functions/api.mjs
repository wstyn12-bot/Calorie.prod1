// calorie.prod API: a single Netlify Function that serves every /api/* route.
//
//   GET  /api/health          → is the AI configured?
//   GET  /api/auth/status     → can people sign up?
//   POST /api/auth/signup     → create an account (first account = owner)
//   POST /api/auth/login      → sign in, returns a bearer token
//   POST /api/auth/logout     → end this session
//   POST /api/auth/password   → change password (signs out other devices)
//   GET  /api/me              → who am I?
//   POST /api/sync            → two-way sync of the food diary (last write wins per record)
//   POST /api/analyze         → Claude estimates nutrition from a photo, label or text
//   PUT  /api/img/:id         → store a meal photo thumbnail
//   GET  /api/img/:id         → fetch a meal photo thumbnail
//
// Storage is Netlify Blobs (no database to set up). Environment variables:
//   ANTHROPIC_API_KEY  required for AI features
//   SIGNUP_CODE        optional invite code that lets extra people create accounts
//   AI_MODEL           optional, defaults to claude-sonnet-5-5
//   AI_DAILY_LIMIT     optional, AI requests per user per day (default 150, 0 = unlimited)
//   AI_THINKING        optional, "on" lets the model think before answering (slower)
//   RESET_PASSWORD     optional, "username:new-password" to recover a forgotten password

import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const config = { path: "/api/*" };

const STORE_NAME = "calorie-prod";
const DEFAULT_MODEL = "claude-sonnet-5-5";
const SESSION_TTL = 1000 * 60 * 60 * 24 * 180; // 180 days, sliding
const SHARD_RE = /^(meta|meals|log-\d{4}-\d{2})$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_RECORD_BYTES = 64_000;

// ---------------------------------------------------------------------------
// helpers

function env(name, fallback) {
  try {
    const v = globalThis.Netlify?.env?.get?.(name);
    if (v !== undefined && v !== null && v !== "") return v;
  } catch {
    /* not running on Netlify */
  }
  const v = process.env[name];
  return v !== undefined && v !== "" ? v : fallback;
}

const db = () => getStore({ name: STORE_NAME, consistency: "strong" });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function fail(status, message) {
  throw new HttpError(status, message);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

async function readJson(req, maxBytes = 100_000) {
  const text = await req.text();
  if (text.length > maxBytes) fail(413, "That request is too large.");
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : {};
  } catch {
    fail(400, "Invalid JSON.");
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("base64url");

function safeEqual(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function scrypt(password, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(String(password), salt, 64, SCRYPT_OPTS, (err, key) => (err ? reject(err) : resolve(key))),
  );
}
async function verifyPassword(password, user) {
  const key = await scrypt(String(password ?? ""), Buffer.from(user.salt, "base64"));
  const expected = Buffer.from(user.hash, "base64");
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// ---------------------------------------------------------------------------
// router

export default async function handler(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase();

  try {
    if (method === "GET" && path === "/health") {
      return json({ ok: true, ai: Boolean(env("ANTHROPIC_API_KEY")), model: env("AI_MODEL", DEFAULT_MODEL) });
    }
    if (method === "GET" && path === "/auth/status") return await authStatus();
    if (method === "POST" && path === "/auth/signup") return await signup(req);
    if (method === "POST" && path === "/auth/login") return await login(req);

    const auth = await authenticate(req);
    if (!auth) return json({ error: "Your session has ended. Please sign in again." }, 401);

    if (method === "GET" && path === "/me") return await me(auth);
    if (method === "POST" && path === "/auth/logout") return await logout(auth);
    if (method === "POST" && path === "/auth/password") return await changePassword(req, auth);
    if (method === "POST" && path === "/sync") return await sync(req, auth);
    if (method === "POST" && path === "/analyze") return await analyze(req, auth);

    const img = /^\/img\/([A-Za-z0-9_-]{6,64})$/.exec(path);
    if (img && method === "PUT") return await putImage(req, auth, img[1]);
    if (img && method === "GET") return await getImage(auth, img[1]);

    return json({ error: "Not found." }, 404);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("[calorie.prod api]", err);
    return json({ error: "Something went wrong on the server. Please try again." }, 500);
  }
}

// ---------------------------------------------------------------------------
// accounts & sessions

function cleanUsername(raw) {
  const display = String(raw ?? "").trim();
  const key = display.toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(key)) {
    fail(400, "Usernames are 3–32 characters: letters, numbers, dots, dashes or underscores.");
  }
  return { display, key };
}

function checkPassword(pw) {
  if (typeof pw !== "string" || pw.length < 8) fail(400, "Passwords need at least 8 characters.");
  if (pw.length > 200) fail(400, "That password is too long.");
}

async function authStatus() {
  const owner = await db().get("system/owner", { type: "json" });
  return json({
    hasOwner: Boolean(owner),
    signupOpen: !owner || Boolean(env("SIGNUP_CODE")),
    signupNeedsCode: Boolean(owner),
    ai: Boolean(env("ANTHROPIC_API_KEY")),
  });
}

async function signup(req) {
  const body = await readJson(req, 5_000);
  const { display, key } = cleanUsername(body.username);
  checkPassword(body.password);

  const s = db();
  const owner = await s.get("system/owner", { type: "json" });
  if (owner) {
    const code = env("SIGNUP_CODE");
    if (!code) fail(403, "Sign-ups are closed on this site. The owner can open them by setting SIGNUP_CODE in Netlify.");
    if (!safeEqual(String(body.code ?? "").trim(), String(code).trim())) fail(403, "That invite code isn't right.");
  }

  const salt = crypto.randomBytes(16);
  const hash = await scrypt(body.password, salt);
  const user = {
    uid: "u" + crypto.randomBytes(12).toString("base64url"),
    username: display,
    key,
    salt: salt.toString("base64"),
    hash: hash.toString("base64"),
    createdAt: Date.now(),
    fails: 0,
    lockUntil: 0,
  };
  const created = await s.setJSON(`users/${key}`, user, { onlyIfNew: true });
  if (!created.modified) fail(409, "That username is taken. Try another one.");

  let isOwner = false;
  if (!owner) {
    const o = await s.setJSON("system/owner", { key, uid: user.uid, at: Date.now() }, { onlyIfNew: true });
    isOwner = Boolean(o.modified);
  }
  const token = await createSession(s, user, req);
  return json({ token, user: publicUser(user, isOwner) });
}

async function login(req) {
  const body = await readJson(req, 5_000);
  const key = String(body.username ?? "").trim().toLowerCase();
  const s = db();
  const got = /^[a-z0-9._-]{3,32}$/.test(key) ? await s.getWithMetadata(`users/${key}`, { type: "json" }) : null;
  if (!got) {
    await scrypt(String(body.password ?? ""), crypto.randomBytes(16)); // keep timing similar
    fail(401, "Wrong username or password.");
  }
  const user = got.data;

  // Forgotten password: the site owner sets RESET_PASSWORD="username:new-password" in Netlify,
  // signs in with that new password once, then removes the variable.
  const reset = String(env("RESET_PASSWORD", ""));
  const sep = reset.indexOf(":");
  if (sep > 0) {
    const resetUser = reset.slice(0, sep).trim().toLowerCase();
    const resetPass = reset.slice(sep + 1);
    if (resetUser === key && resetPass.length >= 8 && safeEqual(String(body.password ?? ""), resetPass)) {
      const salt = crypto.randomBytes(16);
      const hash = await scrypt(resetPass, salt);
      Object.assign(user, { salt: salt.toString("base64"), hash: hash.toString("base64"), fails: 0, lockUntil: 0, passwordChangedAt: Date.now() });
      await s.setJSON(`users/${key}`, user);
      const owner = await s.get("system/owner", { type: "json" });
      const token = await createSession(s, user, req);
      return json({ token, user: publicUser(user, owner?.uid === user.uid) });
    }
  }

  if (user.lockUntil && user.lockUntil > Date.now()) {
    fail(429, "Too many wrong attempts. Wait 10 minutes and try again.");
  }
  const ok = await verifyPassword(body.password, user);
  if (!ok) {
    user.fails = (user.fails || 0) + 1;
    if (user.fails >= 8) {
      user.fails = 0;
      user.lockUntil = Date.now() + 10 * 60_000;
    }
    await s.setJSON(`users/${key}`, user, { onlyIfMatch: got.etag }).catch(() => {});
    fail(401, "Wrong username or password.");
  }
  if (user.fails || user.lockUntil) {
    user.fails = 0;
    user.lockUntil = 0;
    await s.setJSON(`users/${key}`, user, { onlyIfMatch: got.etag }).catch(() => {});
  }
  const owner = await s.get("system/owner", { type: "json" });
  const token = await createSession(s, user, req);
  return json({ token, user: publicUser(user, owner?.uid === user.uid) });
}

function publicUser(user, isOwner) {
  return { uid: user.uid, username: user.username, isOwner: Boolean(isOwner), createdAt: user.createdAt };
}

async function createSession(s, user, req) {
  const token = `${user.uid}.${crypto.randomBytes(32).toString("base64url")}`;
  const now = Date.now();
  await s.setJSON(`sessions/${user.uid}/${sha256(token)}`, {
    uid: user.uid,
    key: user.key,
    createdAt: now,
    exp: now + SESSION_TTL,
    ua: (req.headers.get("user-agent") || "").slice(0, 160),
  });
  return token;
}

const sessionCache = new Map();

async function authenticate(req) {
  const m = /^Bearer\s+(u[A-Za-z0-9_-]{8,40})\.([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get("authorization") || "");
  if (!m) return null;
  const token = `${m[1]}.${m[2]}`;
  const sessKey = `sessions/${m[1]}/${sha256(token)}`;
  const now = Date.now();

  const hit = sessionCache.get(sessKey);
  if (hit && hit.until > now) return hit.auth;

  const s = db();
  const sess = await s.get(sessKey, { type: "json" });
  if (!sess || sess.uid !== m[1] || !(sess.exp > now)) {
    sessionCache.delete(sessKey);
    return null;
  }
  if (sess.exp - now < SESSION_TTL / 2) {
    sess.exp = now + SESSION_TTL;
    await s.setJSON(sessKey, sess).catch(() => {});
  }
  const auth = { uid: sess.uid, key: sess.key, sessKey };
  if (sessionCache.size > 500) sessionCache.clear();
  sessionCache.set(sessKey, { auth, until: now + 60_000 });
  return auth;
}

async function me(auth) {
  const s = db();
  const [user, owner] = await Promise.all([
    s.get(`users/${auth.key}`, { type: "json" }),
    s.get("system/owner", { type: "json" }),
  ]);
  if (!user) return json({ error: "Account not found." }, 401);
  return json({
    user: publicUser(user, owner?.uid === user.uid),
    ai: Boolean(env("ANTHROPIC_API_KEY")),
    model: env("AI_MODEL", DEFAULT_MODEL),
  });
}

async function logout(auth) {
  await db().delete(auth.sessKey);
  sessionCache.delete(auth.sessKey);
  return json({ ok: true });
}

async function changePassword(req, auth) {
  const body = await readJson(req, 5_000);
  checkPassword(body.next);
  const s = db();
  const got = await s.getWithMetadata(`users/${auth.key}`, { type: "json" });
  if (!got) fail(401, "Account not found.");
  if (!(await verifyPassword(body.current, got.data))) fail(403, "Your current password isn't right.");

  const salt = crypto.randomBytes(16);
  const hash = await scrypt(body.next, salt);
  const user = { ...got.data, salt: salt.toString("base64"), hash: hash.toString("base64"), passwordChangedAt: Date.now() };
  const saved = await s.setJSON(`users/${auth.key}`, user, { onlyIfMatch: got.etag });
  if (!saved.modified) fail(409, "Please try that again.");

  // Sign out every other device.
  const { blobs } = await s.list({ prefix: `sessions/${auth.uid}/` });
  const others = blobs.filter((b) => b.key !== auth.sessKey);
  await Promise.all(others.map((b) => s.delete(b.key)));
  sessionCache.clear();
  return json({ ok: true, signedOutDevices: others.length });
}

// ---------------------------------------------------------------------------
// sync
//
// Each user's diary is split into shards: "meta" (profile, goals, settings),
// "meals" (saved meals) and "log-YYYY-MM" (entries, by creation month).
// A shard is { rev, records: { [id]: record } }. Records carry `updatedAt`;
// the newer version of a record wins. An index blob tracks each shard's rev so
// devices only download shards that changed since they last looked.

function sanitizeRecord(raw, now) {
  if (!isObj(raw) || typeof raw.id !== "string" || !ID_RE.test(raw.id)) return null;
  let updatedAt = Number(raw.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  let clamped = false;
  if (updatedAt > now + 5 * 60_000) {
    updatedAt = now; // device clock is far ahead; don't let it win forever
    clamped = true;
  }
  const rec = { ...raw, updatedAt };
  if (JSON.stringify(rec).length > MAX_RECORD_BYTES) return null;
  return { rec, clamped };
}

function isNewer(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return JSON.stringify(a) > JSON.stringify(b); // deterministic tie-break
}

async function mergeShard(s, key, incoming) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = await s.getWithMetadata(key, { type: "json" });
    const doc = cur && isObj(cur.data) && isObj(cur.data.records) ? cur.data : { rev: 0, records: {} };
    const prevRev = Number(doc.rev) || 0;
    let changed = false;
    let rejected = false;
    for (const { rec, clamped } of incoming) {
      if (clamped) rejected = true;
      const existing = doc.records[rec.id];
      if (!existing || isNewer(rec, existing)) {
        doc.records[rec.id] = rec;
        changed = true;
      } else if (existing.updatedAt !== rec.updatedAt || JSON.stringify(existing) !== JSON.stringify(rec)) {
        rejected = true; // server already has a newer version; the device must take ours
      }
    }
    if (!changed) return { doc, prevRev, rejected };
    doc.rev = prevRev + 1;
    doc.updatedAt = Date.now();
    const res = await s.setJSON(key, doc, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return { doc, prevRev, rejected };
    await sleep(30 + Math.random() * 120 * (attempt + 1)); // someone else wrote first; retry
  }
  fail(503, "The server is busy. Your changes are safe on this device and will sync shortly.");
}

async function updateIndex(s, key, revs) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = await s.getWithMetadata(key, { type: "json" });
    const idx = cur && isObj(cur.data) && isObj(cur.data.shards) ? cur.data : { shards: {} };
    let changed = false;
    for (const [name, rev] of Object.entries(revs)) {
      if (!(idx.shards[name] >= rev)) {
        idx.shards[name] = rev;
        changed = true;
      }
    }
    if (!changed) return idx;
    const res = await s.setJSON(key, idx, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return idx;
    await sleep(30 + Math.random() * 120 * (attempt + 1));
  }
  fail(503, "The server is busy. Your changes are safe on this device and will sync shortly.");
}

async function sync(req, auth) {
  const body = await readJson(req, 4_500_000);
  const have = isObj(body.have) ? body.have : {};
  const push = isObj(body.push) ? body.push : {};
  const names = Object.keys(push);
  if (names.length > 60) fail(413, "Too many changes in one go.");

  const s = db();
  const base = `data/${auth.uid}`;
  const now = Date.now();

  const merged = {};
  await Promise.all(
    names.map(async (name) => {
      if (!SHARD_RE.test(name)) fail(400, `Unknown data group "${name}".`);
      const list = Array.isArray(push[name]) ? push[name] : [];
      if (list.length > 5000) fail(413, "Too many changes in one go.");
      const incoming = [];
      let dropped = false;
      for (const raw of list) {
        const clean = sanitizeRecord(raw, now);
        if (clean) incoming.push(clean);
        else dropped = true;
      }
      const result = await mergeShard(s, `${base}/shard/${name}`, incoming);
      if (dropped) result.rejected = true;
      merged[name] = result;
    }),
  );

  const index = await updateIndex(
    s,
    `${base}/index`,
    Object.fromEntries(Object.entries(merged).map(([name, r]) => [name, r.doc.rev])),
  );

  const shards = {};
  const toLoad = [];
  for (const [name, rev] of Object.entries(index.shards)) {
    const r = merged[name];
    if (r) {
      if (!r.rejected && Number(have[name] || 0) === r.prevRev) shards[name] = { rev: r.doc.rev, upToDate: true };
      else shards[name] = { rev: r.doc.rev, records: Object.values(r.doc.records) };
    } else if (Number(have[name] || 0) !== rev) {
      toLoad.push(name);
    }
  }
  await Promise.all(
    toLoad.map(async (name) => {
      const doc = await s.get(`${base}/shard/${name}`, { type: "json" });
      shards[name] = { rev: Number(doc?.rev) || index.shards[name], records: doc ? Object.values(doc.records || {}) : [] };
    }),
  );

  // Shards this device has but the server has never seen (e.g. a fresh Netlify site):
  // ask the device to upload them in full.
  const unknown = Object.keys(have).filter((n) => SHARD_RE.test(n) && !(n in index.shards) && Number(have[n]) > 0);

  return json({ shards, unknown, serverTime: now });
}

// ---------------------------------------------------------------------------
// photo thumbnails

async function putImage(req, auth, id) {
  const type = (req.headers.get("content-type") || "").split(";")[0].trim();
  if (!/^image\/(jpeg|png|webp)$/.test(type)) fail(415, "Images must be JPEG, PNG or WebP.");
  const buf = await req.arrayBuffer();
  if (buf.byteLength > 800_000) fail(413, "That image is too large.");
  if (buf.byteLength < 100) fail(400, "That image is empty.");
  await db().set(`img/${auth.uid}/${id}`, buf, { metadata: { type } });
  return json({ ok: true });
}

async function getImage(auth, id) {
  const got = await db().getWithMetadata(`img/${auth.uid}/${id}`, { type: "arrayBuffer" });
  if (!got) return json({ error: "Not found." }, 404);
  return new Response(got.data, {
    status: 200,
    headers: {
      "content-type": got.metadata?.type || "image/jpeg",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

// ---------------------------------------------------------------------------
// AI nutrition analysis (Claude)

// [field the model fills, key the app uses]
const MICRO_FIELDS = [
  ["fibre_g", "fibre"],
  ["sugars_g", "sugars"],
  ["saturated_fat_g", "satFat"],
  ["monounsaturated_fat_g", "monoFat"],
  ["polyunsaturated_fat_g", "polyFat"],
  ["cholesterol_mg", "cholesterol"],
  ["sodium_mg", "sodium"],
  ["potassium_mg", "potassium"],
  ["calcium_mg", "calcium"],
  ["iron_mg", "iron"],
  ["magnesium_mg", "magnesium"],
  ["zinc_mg", "zinc"],
  ["phosphorus_mg", "phosphorus"],
  ["selenium_ug", "selenium"],
  ["vitamin_a_ug_rae", "vitA"],
  ["vitamin_c_mg", "vitC"],
  ["vitamin_d_ug", "vitD"],
  ["vitamin_e_mg", "vitE"],
  ["vitamin_k_ug", "vitK"],
  ["thiamin_b1_mg", "thiamin"],
  ["riboflavin_b2_mg", "riboflavin"],
  ["niacin_b3_mg", "niacin"],
  ["vitamin_b6_mg", "vitB6"],
  ["folate_ug_dfe", "folate"],
  ["vitamin_b12_ug", "vitB12"],
  ["caffeine_mg", "caffeine"],
  ["alcohol_g", "alcohol"],
];

const NUM = { type: "number" };

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "analysis",
    "is_food",
    "name",
    "emoji",
    "serving_desc",
    "confidence",
    "health_score",
    "health_note",
    "items",
    "micros",
    "notes",
  ],
  properties: {
    analysis: {
      type: "string",
      description: "Brief working notes, max ~60 words: what you see, portion-size cues, cooking method.",
    },
    is_food: { type: "boolean" },
    name: { type: "string", description: "Short natural title, max ~5 words" },
    emoji: { type: "string", description: "A single emoji that represents the food" },
    serving_desc: { type: "string", description: "What one serving of this result is, e.g. '1 plate' or '1 serve (45 g)'" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    health_score: { type: "number", description: "Whole number from 1 (poor) to 10 (excellent)" },
    health_note: { type: "string", description: "One short sentence explaining the health score" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "portion", "grams", "kcal", "protein_g", "carbs_g", "fat_g"],
        properties: {
          name: { type: "string" },
          portion: { type: "string", description: "Everyday portion, e.g. '1 cup' or '2 slices'" },
          grams: NUM,
          kcal: NUM,
          protein_g: NUM,
          carbs_g: NUM,
          fat_g: NUM,
        },
      },
    },
    micros: {
      type: "object",
      additionalProperties: false,
      required: MICRO_FIELDS.map(([f]) => f),
      properties: Object.fromEntries(MICRO_FIELDS.map(([f]) => [f, NUM])),
    },
    notes: { type: "string", description: "Main assumptions, 1–2 short sentences" },
  },
};

const SYSTEM_PROMPT = `You are the nutrition analysis engine inside calorie.prod, a calorie and macro tracking app. Whatever you return is logged straight into the user's food diary, so aim for accurate, realistic and consistent estimates.

Method
- Identify every distinct food and drink. Count hidden calories: cooking oil, butter, sauces, dressings, cheese, spreads, and sugar or milk in drinks.
- Estimate each portion's edible weight in grams as served (cooked weight for cooked foods). Use visual cues such as plate size (a standard dinner plate is about 26 cm across), bowls, cutlery, hands and packaging. Prefer realistic everyday portions; don't lowball.
- Use standard food composition data: AUSNUT/NUTTAB for Australian foods, USDA FoodData Central otherwise. The user lives in Australia, so when a product, brand or serving size is ambiguous, assume the common Australian version.
- For each item give kcal, protein, carbs (available carbohydrate, excluding fibre) and fat. kcal should be close to 4×protein + 4×carbs + 9×fat (+ 7×alcohol).
- micros are totals for everything in the result (one serving, as described by serving_desc), in the unit in each field name: _g grams, _mg milligrams, _ug micrograms. Estimate every one from typical composition; use 0 only when the nutrient is genuinely absent.
- health_score (1–10) rates overall nutritional quality: whole foods, protein, fibre and micronutrients push it up; added sugar, refined starch, saturated fat, sodium and ultra-processing push it down.
- confidence: high when the foods and portions are clear, medium when portions are uncertain, low when the food itself is unclear.
- name: a short natural title (max ~5 words). emoji: one emoji. notes: 1–2 short sentences on the main assumptions, in Australian English.
- If there is no food or drink to analyse, set is_food to false, items to [] and every number to 0.
- Always give your best estimate rather than refusing.`;

const MEAL_NAMES = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

function clip(v, max) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function buildPrompt(mode, body) {
  const note = clip(body.note, 400);
  const meal = MEAL_NAMES[body.meal] ? `Meal slot: ${MEAL_NAMES[body.meal]}.` : "";
  const noteLine = note ? `The user adds: "${note}"` : "";

  if (mode === "photo") {
    return [
      "Analyse the food and drink in this photo. Treat everything visible that's meant to be eaten as one serving, unless the user's note says otherwise.",
      meal,
      noteLine,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (mode === "text") {
    const text = clip(body.text, 1500);
    if (!text) fail(400, "Describe what you ate first.");
    return [`Estimate the nutrition for what the user ate, exactly as described:\n"""${text}"""`, "Treat the whole description as one serving.", meal]
      .filter(Boolean)
      .join("\n");
  }
  if (mode === "label") {
    return [
      "This photo shows a packaged food or its nutrition information panel. Read it carefully.",
      "- Report ONE serving as defined on the panel and describe it in serving_desc, e.g. \"1 serve (45 g)\". If only per-100 g values are printed, use 100 g as the serving.",
      "- Copy printed values exactly where available (convert kJ to kcal by dividing by 4.184). Estimate any nutrient that isn't printed from the product type and ingredients.",
      "- items must contain exactly one item: the product, with the serving's grams and macros.",
      "- Use the product name (with brand, if visible) as name.",
      noteLine,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (mode === "fix") {
    const text = clip(body.text, 1000);
    if (!text) fail(400, "Tell the AI what to fix.");
    const prev = isObj(body.previous) ? body.previous : {};
    const summary = {
      name: clip(prev.name, 80),
      serving: clip(prev.servingDesc, 80),
      items: (Array.isArray(prev.items) ? prev.items : []).slice(0, 25).map((it) => ({
        name: clip(it.name, 80),
        portion: clip(it.portion, 60),
        grams: Number(it.grams) || 0,
        kcal: Number(it.kcal) || 0,
        protein_g: Number(it.protein) || 0,
        carbs_g: Number(it.carbs) || 0,
        fat_g: Number(it.fat) || 0,
      })),
    };
    return [
      body.image ? "Here is the meal photo again." : "There's no photo for this one; work from the item list.",
      `Your previous analysis was:\n${JSON.stringify(summary)}`,
      `The user says it needs correcting:\n"""${text}"""`,
      "Return a corrected, complete analysis. Apply the user's correction exactly (they know what they ate), keep whatever was already right, and recalculate every number, including micros.",
    ].join("\n");
  }
  if (mode === "nutrients") {
    const f = isObj(body.food) ? body.food : {};
    const known = [
      `${Number(f.kcal) || 0} kcal`,
      `${Number(f.protein) || 0} g protein`,
      `${Number(f.carbs) || 0} g carbs`,
      `${Number(f.fat) || 0} g fat`,
    ];
    if (isObj(f.micros)) {
      for (const [field, key] of MICRO_FIELDS) {
        const v = Number(f.micros[key]);
        if (!Number.isFinite(v) || v <= 0) continue;
        const m = /^(.*?)_(g|mg|ug)(?:_(rae|dfe))?$/.exec(field);
        const unit = { g: "g", mg: "mg", ug: "µg" }[m[2]] + (m[3] ? ` ${m[3].toUpperCase()}` : "");
        known.push(`${m[1].replace(/_/g, " ")} ${v} ${unit}`);
      }
    }
    return [
      "The user logged a food with their own nutrition values (for example from a label or a recipe).",
      `Food: ${clip(f.name, 120) || "Unnamed food"}`,
      `Serving: ${clip(f.servingDesc, 80) || "1 serving"}`,
      `Known values for that serving: ${known.join(", ")}.`,
      "Return exactly one item named after the food with exactly these kcal, protein, carbs and fat values. Use any known micro values as given, and estimate every other micro so it's consistent with this food and serving.",
    ].join("\n");
  }
  fail(400, "Unknown analysis type.");
}

function parseImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) fail(400, "Unsupported image. Use a JPEG, PNG or WebP photo.");
  if (m[2].length > 7_000_000) fail(413, "That photo is too large.");
  return { media_type: m[1], data: m[2] };
}

async function useQuota(auth) {
  const limit = Number(env("AI_DAILY_LIMIT", "150"));
  if (!Number.isFinite(limit) || limit <= 0) return;
  const s = db();
  const key = `usage/${auth.uid}/${new Date().toISOString().slice(0, 10)}`;
  const cur = (await s.get(key, { type: "json" })) || { count: 0 };
  if (cur.count >= limit) fail(429, `You've used today's ${limit} AI scans. The limit resets at 10am Brisbane time (midnight UTC).`);
  cur.count += 1;
  await s.setJSON(key, cur);
}

// Food estimates come back faster without up-front thinking. How to switch it off depends on
// the model: Sonnet 5.5 uses "between_tools", Sonnet 5 uses "disabled", and 4.x models don't
// think unless asked. Anything else keeps its default (a 400 falls back to the default too).
function thinkingConfig(model) {
  const pref = String(env("AI_THINKING", "off")).toLowerCase();
  const older = /claude-(3|haiku-4|sonnet-4|opus-4)/.test(model);
  if (pref === "on" || pref === "adaptive") return older ? null : { type: "adaptive" };
  if (/sonnet-5-5/.test(model)) return { type: "between_tools" };
  if (/sonnet-5(?![-.]\d)/.test(model)) return { type: "disabled" };
  return null;
}

async function callClaude(content) {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) {
    fail(503, "AI isn't set up yet. Add ANTHROPIC_API_KEY in Netlify (Site configuration → Environment variables), then redeploy.");
  }
  const model = env("AI_MODEL", DEFAULT_MODEL);
  const payload = {
    model,
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema: RESULT_SCHEMA } },
  };
  const thinking = thinkingConfig(model);
  if (thinking) payload.thinking = thinking;
  if (thinking?.type === "adaptive") payload.output_config.effort = env("AI_EFFORT", "low");

  const deadline = Date.now() + 52_000; // functions stop at 60 s
  let data = null;
  for (let attempt = 0; attempt < 4 && !data; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(4_000, deadline - Date.now()));
    let status = 0;
    let text = "";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      status = res.status;
      text = await res.text();
    } catch (err) {
      if (err?.name === "AbortError") fail(504, "The AI took too long to answer. Try again.");
      console.error("[calorie.prod ai] network", err);
      fail(502, "Couldn't reach the AI service. Try again in a moment.");
    } finally {
      clearTimeout(timer);
    }

    if (status === 200) {
      try {
        data = JSON.parse(text);
      } catch {
        fail(502, "The AI service sent an unreadable reply. Try again.");
      }
      break;
    }
    if (status === 400 && (payload.thinking || payload.output_config.effort) && /thinking|effort/i.test(text)) {
      delete payload.thinking; // this model doesn't accept that setting; use its default
      delete payload.output_config.effort;
      continue;
    }
    if ((status === 429 || status === 529 || status >= 500) && attempt < 3 && deadline - Date.now() > 8_000) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    console.error("[calorie.prod ai] status", status, text.slice(0, 800));
    let apiMessage = "";
    try {
      apiMessage = clip(JSON.parse(text)?.error?.message, 240);
    } catch {
      /* not JSON */
    }
    if (status === 401 || status === 403) fail(502, "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Netlify.");
    if (/credit balance/i.test(text)) fail(502, "Your Anthropic account is out of credit. Top up at console.anthropic.com.");
    if (status === 404 && /model/i.test(text)) fail(502, `The AI model "${model}" isn't available. Check AI_MODEL in Netlify.`);
    if (status === 429 || status === 529) fail(503, "The AI is busy right now. Try again in a minute.");
    if (status === 400 && apiMessage) fail(502, `The AI rejected the request: ${apiMessage}`);
    fail(502, "The AI service had a problem. Try again.");
  }
  if (!data) fail(503, "The AI is busy right now. Try again in a minute.");

  if (data.stop_reason === "refusal") fail(422, "The AI couldn't analyse that. Try another photo or describe the food instead.");
  if (data.stop_reason === "max_tokens") fail(502, "The AI's answer got cut off. Try again.");
  const out = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  try {
    return { result: JSON.parse(out), model: data.model || model };
  } catch {
    console.error("[calorie.prod ai] bad JSON", out.slice(0, 400));
    fail(502, "The AI's answer couldn't be read. Try again.");
  }
}

function roundTo(v, dp) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
function smartRound(v) {
  return v >= 100 ? Math.round(v) : v >= 10 ? roundTo(v, 1) : roundTo(v, 2);
}
function pos(v, max) {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.min(x, max) : 0;
}
function pickEmoji(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const first = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)][0]?.segment || "";
  return /\p{Extended_Pictographic}/u.test(first) ? first : "";
}

function normalizeResult(raw) {
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 25).map((it) => ({
    name: clip(it?.name, 80) || "Food",
    portion: clip(it?.portion, 60),
    grams: Math.round(pos(it?.grams, 5000)),
    kcal: Math.round(pos(it?.kcal, 10000)),
    protein: roundTo(pos(it?.protein_g, 1000), 1),
    carbs: roundTo(pos(it?.carbs_g, 2000), 1),
    fat: roundTo(pos(it?.fat_g, 1000), 1),
  }));
  const micros = {};
  for (const [field, key] of MICRO_FIELDS) micros[key] = smartRound(pos(raw.micros?.[field], 100_000));
  const score = Math.round(Number(raw.health_score));
  const confidence = String(raw.confidence || "").toLowerCase();
  return {
    isFood: raw.is_food !== false && items.length > 0,
    name: clip(raw.name, 80) || items[0]?.name || "Meal",
    emoji: pickEmoji(raw.emoji) || "🍽️",
    servingDesc: clip(raw.serving_desc, 60),
    confidence: ["low", "medium", "high"].includes(confidence) ? confidence : "medium",
    healthScore: score >= 1 && score <= 10 ? score : null,
    healthNote: clip(raw.health_note, 200),
    notes: clip(raw.notes, 400),
    items,
    micros,
  };
}

async function analyze(req, auth) {
  const body = await readJson(req, 7_500_000);
  const mode = String(body.mode || "");
  if (!["photo", "text", "label", "fix", "nutrients"].includes(mode)) fail(400, "Unknown analysis type.");
  if ((mode === "photo" || mode === "label") && !body.image) fail(400, "Add a photo first.");
  if (!env("ANTHROPIC_API_KEY")) {
    fail(503, "AI isn't set up yet. Add ANTHROPIC_API_KEY in Netlify (Site configuration → Environment variables), then redeploy.");
  }

  const content = [];
  if (body.image && mode !== "text" && mode !== "nutrients") {
    const img = parseImage(body.image);
    content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  }
  content.push({ type: "text", text: buildPrompt(mode, body) });

  await useQuota(auth);
  const { result, model } = await callClaude(content);
  return json({ result: normalizeResult(result), model });
}
