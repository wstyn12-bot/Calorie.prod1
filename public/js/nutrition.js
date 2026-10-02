// Nutrition maths: nutrient definitions, recommended targets, AU/NZ reference values,
// totals, goal evaluation, streaks, dates and number formatting.

export const KJ_PER_KCAL = 4.184;

// ---------------------------------------------------------------- dates (local time)

export function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseDate(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export const todayStr = () => dateStr();
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86_400_000);
}
export function weekStart(s, startDay = 1) {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() - startDay + 7) % 7));
  return dateStr(d);
}
export function fmtDate(s, opts) {
  return new Intl.DateTimeFormat("en-AU", opts).format(parseDate(s));
}
export function relDay(s) {
  const t = todayStr();
  if (s === t) return "Today";
  if (s === addDays(t, -1)) return "Yesterday";
  if (s === addDays(t, 1)) return "Tomorrow";
  return fmtDate(s, { weekday: "short", day: "numeric", month: "short" });
}
export function timeStr(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function fmtTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(d).replace(" ", " ");
}

// ---------------------------------------------------------------- meals, activity, goals

export const MEALS = [
  { key: "breakfast", label: "Breakfast", emoji: "🍳" },
  { key: "lunch", label: "Lunch", emoji: "🥪" },
  { key: "dinner", label: "Dinner", emoji: "🍝" },
  { key: "snack", label: "Snacks", emoji: "🍎" },
];
export const mealLabel = (k) => MEALS.find((m) => m.key === k)?.label || "Snacks";

export function defaultMeal(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 4 * 60) return "snack";
  if (m < 10 * 60 + 30) return "breakfast";
  if (m < 14 * 60 + 30) return "lunch";
  if (m < 17 * 60) return "snack";
  if (m < 21 * 60) return "dinner";
  return "snack";
}

export const ACTIVITY = [
  { key: "sedentary", label: "Sedentary", desc: "Desk job, little or no exercise", factor: 1.2 },
  { key: "light", label: "Lightly active", desc: "Exercise 1–3 days a week", factor: 1.375 },
  { key: "moderate", label: "Moderately active", desc: "Exercise 3–5 days a week", factor: 1.55 },
  { key: "very", label: "Very active", desc: "Hard training 6–7 days a week", factor: 1.725 },
  { key: "athlete", label: "Athlete", desc: "Physical job plus training, or two sessions a day", factor: 1.9 },
];

export const GOALS = [
  { key: "lose", label: "Lose fat", emoji: "🔥", desc: "Calorie deficit, high protein" },
  { key: "maintain", label: "Maintain", emoji: "⚖️", desc: "Eat at maintenance" },
  { key: "gain", label: "Build muscle", emoji: "💪", desc: "Small surplus, high protein" },
];
export const RATES = { lose: [0.25, 0.5, 0.75, 1], gain: [0.25, 0.5] };

export const STREAK_RULES = [
  { key: "cal_protein", label: "Calories + protein", desc: "Calories within range and protein hit" },
  { key: "cal", label: "Calories only", desc: "Calories within range" },
  { key: "all", label: "All 4 macros", desc: "Calories, protein, carbs and fat all within range" },
  { key: "log", label: "Log every day", desc: "Any day with food logged counts" },
];
export const DEFAULT_PREFS = {
  energyUnit: "kcal",
  streak: { rule: "cal_protein", tolerance: 10, proteinMin: 90 },
};

// ---------------------------------------------------------------- nutrients

export const MACROS = [
  { key: "protein", label: "Protein", short: "P", color: "var(--protein)" },
  { key: "carbs", label: "Carbs", short: "C", color: "var(--carbs)" },
  { key: "fat", label: "Fat", short: "F", color: "var(--fat)" },
];

// kind: target = aim to reach, limit = stay under, info = no target
export const MICROS = [
  { key: "fibre", label: "Fibre", unit: "g", group: "detail", kind: "target" },
  { key: "sugars", label: "Sugars", unit: "g", group: "detail", kind: "limit" },
  { key: "satFat", label: "Saturated fat", unit: "g", group: "detail", kind: "limit" },
  { key: "monoFat", label: "Monounsaturated fat", unit: "g", group: "detail", kind: "info" },
  { key: "polyFat", label: "Polyunsaturated fat", unit: "g", group: "detail", kind: "info" },
  { key: "cholesterol", label: "Cholesterol", unit: "mg", group: "detail", kind: "info" },
  { key: "sodium", label: "Sodium", unit: "mg", group: "minerals", kind: "limit" },
  { key: "potassium", label: "Potassium", unit: "mg", group: "minerals", kind: "target" },
  { key: "calcium", label: "Calcium", unit: "mg", group: "minerals", kind: "target" },
  { key: "iron", label: "Iron", unit: "mg", group: "minerals", kind: "target" },
  { key: "magnesium", label: "Magnesium", unit: "mg", group: "minerals", kind: "target" },
  { key: "zinc", label: "Zinc", unit: "mg", group: "minerals", kind: "target" },
  { key: "phosphorus", label: "Phosphorus", unit: "mg", group: "minerals", kind: "target" },
  { key: "selenium", label: "Selenium", unit: "µg", group: "minerals", kind: "target" },
  { key: "vitA", label: "Vitamin A", unit: "µg", group: "vitamins", kind: "target" },
  { key: "vitC", label: "Vitamin C", unit: "mg", group: "vitamins", kind: "target" },
  { key: "vitD", label: "Vitamin D", unit: "µg", group: "vitamins", kind: "target" },
  { key: "vitE", label: "Vitamin E", unit: "mg", group: "vitamins", kind: "target" },
  { key: "vitK", label: "Vitamin K", unit: "µg", group: "vitamins", kind: "target" },
  { key: "thiamin", label: "Thiamin (B1)", unit: "mg", group: "vitamins", kind: "target" },
  { key: "riboflavin", label: "Riboflavin (B2)", unit: "mg", group: "vitamins", kind: "target" },
  { key: "niacin", label: "Niacin (B3)", unit: "mg", group: "vitamins", kind: "target" },
  { key: "vitB6", label: "Vitamin B6", unit: "mg", group: "vitamins", kind: "target" },
  { key: "folate", label: "Folate", unit: "µg", group: "vitamins", kind: "target" },
  { key: "vitB12", label: "Vitamin B12", unit: "µg", group: "vitamins", kind: "target" },
  { key: "caffeine", label: "Caffeine", unit: "mg", group: "other", kind: "limit" },
  { key: "alcohol", label: "Alcohol", unit: "g", group: "other", kind: "info" },
];
export const MICRO_KEYS = MICROS.map((m) => m.key);
export const MICRO_GROUPS = [
  { key: "detail", label: "Carbs & fats" },
  { key: "minerals", label: "Minerals" },
  { key: "vitamins", label: "Vitamins" },
  { key: "other", label: "Other" },
];
export const microDef = (k) => MICROS.find((m) => m.key === k);

// Australian/NZ Nutrient Reference Values (NHMRC): RDI or AI by sex and age.
export function nrvTargets(profile = {}) {
  const male = profile.sex !== "female";
  const a = Number(profile.age) || 30;
  const teen = a < 19;
  const t = {};
  t.fibre = male ? (teen ? 28 : 30) : teen ? 22 : 25;
  t.potassium = male ? (teen ? 3600 : 3800) : teen ? 2600 : 2800;
  t.calcium = teen ? 1300 : male ? (a < 71 ? 1000 : 1300) : a < 51 ? 1000 : 1300;
  t.iron = teen ? (male ? 11 : 15) : male ? 8 : a < 51 ? 18 : 8;
  t.magnesium = teen ? (male ? 410 : 360) : male ? (a < 31 ? 400 : 420) : a < 31 ? 310 : 320;
  t.zinc = teen ? (male ? 13 : 7) : male ? 14 : 8;
  t.phosphorus = teen ? 1250 : 1000;
  t.selenium = male ? 70 : 60;
  t.vitA = male ? 900 : 700;
  t.vitC = teen ? 40 : 45;
  t.vitD = a < 51 ? 5 : a < 71 ? 10 : 15;
  t.vitE = male ? 10 : teen ? 8 : 7;
  t.vitK = teen ? 55 : male ? 70 : 60;
  t.thiamin = male ? 1.2 : 1.1;
  t.riboflavin = male ? 1.3 : a >= 71 ? 1.3 : 1.1;
  t.niacin = male ? 16 : 14;
  t.vitB6 = teen ? (male ? 1.3 : 1.2) : a < 51 ? 1.3 : male ? 1.7 : 1.5;
  t.folate = 400;
  t.vitB12 = 2.4;
  return t;
}

// Upper targets scale with the calorie goal where it makes sense.
export function limitTargets(kcal) {
  const k = kcal > 0 ? kcal : 2000;
  return {
    sugars: Math.round((90 * k) / 2080), // Australian label reference: 90 g per 8,700 kJ
    satFat: Math.round((0.1 * k) / 9), // under 10% of energy
    sodium: 2000, // NHMRC suggested dietary target
    caffeine: 400,
  };
}

export function microTargets(profile, kcalTarget, custom = {}) {
  const out = { ...nrvTargets(profile), ...limitTargets(kcalTarget) };
  for (const [k, v] of Object.entries(custom || {})) if (Number(v) > 0) out[k] = Number(v);
  return out;
}

// ---------------------------------------------------------------- energy & macro targets

const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

export function recommend(profile = {}, goals = {}) {
  const sex = profile.sex === "female" ? "female" : "male";
  const age = num(profile.age) || 30;
  const h = num(profile.heightCm) || (sex === "female" ? 165 : 178);
  const w = num(profile.weightKg) || (sex === "female" ? 65 : 78);
  const act = ACTIVITY.find((a) => a.key === profile.activity) || ACTIVITY[2];
  const bmr = 10 * w + 6.25 * h - 5 * age + (sex === "female" ? -161 : 5);
  const tdee = bmr * act.factor;
  const goal = profile.goal || "maintain";
  const rate = goal === "maintain" ? 0 : num(profile.rate) || (goal === "gain" ? 0.25 : 0.5);
  const adj = goal === "lose" ? (-rate * 7700) / 7 : goal === "gain" ? (rate * 7700) / 7 : 0;
  const floor = sex === "female" ? 1200 : 1500;
  const kcal = Math.max(floor, Math.round((tdee + adj) / 10) * 10);
  const proteinPerKg = num(goals.proteinPerKg) || (goal === "lose" ? 2.0 : 1.8);
  const fatPct = num(goals.fatPct) || 30;
  const refW = Math.min(w, 27 * (h / 100) ** 2); // don't over-prescribe protein at high body weight
  const protein = Math.round(proteinPerKg * refW);
  const fat = Math.round(Math.max((kcal * fatPct) / 100 / 9, 0.6 * refW));
  const carbs = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), adj: Math.round(adj), factor: act.factor, kcal, protein, carbs, fat, proteinPerKg, fatPct, refW };
}

// Recommended values, with any custom overrides. Auto macros follow a custom calorie goal.
export function effectiveTargets(profile = {}, goals = {}) {
  const rec = recommend(profile, goals);
  const c = goals.custom || {};
  const kcal = num(c.kcal) || rec.kcal;
  const protein = num(c.protein) || rec.protein;
  const fat = num(c.fat) || Math.round(Math.max((kcal * rec.fatPct) / 100 / 9, 0.6 * rec.refW));
  const carbs = num(c.carbs) || Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    auto: { kcal: !num(c.kcal), protein: !num(c.protein), carbs: !num(c.carbs), fat: !num(c.fat) },
    rec,
  };
}

// ---------------------------------------------------------------- totals

export function emptyTotals() {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, micros: {} };
}

export function itemsTotals(items = []) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const it of items) {
    t.kcal += num(it.kcal);
    t.protein += num(it.protein);
    t.carbs += num(it.carbs);
    t.fat += num(it.fat);
  }
  return t;
}

// Micronutrients are stored for the amount as analysed (microsKcal). When items are
// edited, micros scale with the change in energy; servings scale everything.
export function entryTotals(e) {
  const servings = num(e?.servings) || 1;
  const base = itemsTotals(e?.items);
  // Items the user added by hand carry no micronutrient data, so they don't scale micros.
  const microBase = itemsTotals((e?.items || []).filter((i) => !i.manual)).kcal;
  const ratio = num(e?.microsKcal) > 0 ? microBase / num(e.microsKcal) : 1;
  const micros = {};
  for (const [k, v] of Object.entries(e?.micros || {})) micros[k] = num(v) * ratio * servings;
  return {
    kcal: base.kcal * servings,
    protein: base.protein * servings,
    carbs: base.carbs * servings,
    fat: base.fat * servings,
    micros,
  };
}

export function addTotals(a, b) {
  const out = { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, micros: { ...a.micros } };
  for (const [k, v] of Object.entries(b.micros || {})) out.micros[k] = (out.micros[k] || 0) + v;
  return out;
}

export function sumEntries(entries) {
  return entries.reduce((acc, e) => addTotals(acc, entryTotals(e)), emptyTotals());
}

// ---------------------------------------------------------------- goals & streaks

export function evaluateDay(totals, targets, streak, logged) {
  if (!logged) return false;
  const rule = streak?.rule || "cal_protein";
  if (rule === "log") return true;
  const tol = (num(streak?.tolerance) || 10) / 100;
  const within = (v, t) => t > 0 && Math.abs(v - t) <= tol * t;
  const calOk = within(totals.kcal, targets.kcal);
  if (rule === "cal") return calOk;
  if (rule === "all") return calOk && within(totals.protein, targets.protein) && within(totals.carbs, targets.carbs) && within(totals.fat, targets.fat);
  const pMin = (num(streak?.proteinMin) || 90) / 100;
  return calOk && targets.protein > 0 && totals.protein >= pMin * targets.protein;
}

// status(date) -> { hit: boolean, logged: boolean }
export function computeStreaks(status, today, firstDate) {
  let current = 0;
  let d = status(today).hit ? today : addDays(today, -1);
  while (firstDate && d >= firstDate && status(d).hit) {
    current++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  let hits = 0;
  let logged = 0;
  if (firstDate) {
    for (let x = firstDate; x <= today; x = addDays(x, 1)) {
      const s = status(x);
      if (s.logged) logged++;
      if (s.hit) {
        hits++;
        run++;
        if (run > best) best = run;
      } else run = 0;
    }
  }
  return { current, best: Math.max(best, current), hits, logged };
}

// ---------------------------------------------------------------- formatting

export const fmtInt = (n) => Math.round(Number(n) || 0).toLocaleString("en-AU");
export const toUnit = (kcal, unit) => (unit === "kJ" ? (Number(kcal) || 0) * KJ_PER_KCAL : Number(kcal) || 0);
export const fmtEnergy = (kcal, unit) => fmtInt(toUnit(kcal, unit));
export const unitLabel = (unit) => (unit === "kJ" ? "kJ" : "kcal");

export function fmtG(n) {
  const x = Number(n) || 0;
  if (x === 0) return "0";
  if (x < 10) return String(Math.round(x * 10) / 10);
  return fmtInt(x);
}

export function fmtAmount(n) {
  const x = Number(n) || 0;
  if (x === 0) return "0";
  if (x < 1) return String(Math.round(x * 100) / 100);
  if (x < 10) return String(Math.round(x * 10) / 10);
  return fmtInt(x);
}

export function pct(v, t) {
  return t > 0 ? Math.round((v / t) * 100) : 0;
}

export function healthTone(score) {
  if (!score) return "muted";
  if (score >= 7) return "good";
  if (score >= 4) return "warn";
  return "bad";
}
