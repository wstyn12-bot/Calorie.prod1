// "My own numbers": enter nutrition yourself (or read it off a label photo), optionally
// let the AI fill in every other nutrient, and save it to My Meals for one-tap logging.

import { html, cls } from "../html.js";
import { api } from "../api.js";
import { store, images, uid } from "../store.js";
import { icon } from "../icons.js";
import { preparePhoto } from "../image.js";
import * as N from "../nutrition.js";
import { ui, actions, render, closeSheet, toast, sheetFrame, toggle, seg, energyUnit, inputNum } from "../ui.js";
import { mealChips, pickPhoto } from "./add.js";
import { saveAsMeal } from "./editor.js";

const EXTRA = [
  { key: "fibre", label: "Fibre", unit: "g" },
  { key: "sugars", label: "Sugars", unit: "g" },
  { key: "satFat", label: "Saturated fat", unit: "g" },
  { key: "sodium", label: "Sodium", unit: "mg" },
];

const EMOJIS = "🍽️ 🥣 🥗 🍝 🍛 🍲 🥪 🌯 🍔 🍕 🍗 🥩 🐟 🍳 🥚 🍚 🥔 🥦 🥑 🍎 🍌 🫐 🥜 🍫 🍪 🍰 🥤 ☕ 🥛 🧋 💪".split(" ");

function manualSheet() {
  return ui.sheets.find((x) => x.type === "manual" && !x.closing) || null;
}

export function ManualSheet(s) {
  s.f ||= { name: "", emoji: "🍽️", servingDesc: "1 serve", energy: "", unit: energyUnit(), protein: "", carbs: "", fat: "" };
  if (s.estimate === undefined) s.estimate = ui.ai;
  if (s.saveToMeals === undefined) s.saveToMeals = true;
  const f = s.f;
  const isEntry = s.target === "entry";
  const field = (key, label, unit, mode = "decimal") => html`<label class="field">
    <span>${label} <small>${unit}</small></span>
    <input class="input" inputmode="${mode}" value="${f[key] ?? ""}" placeholder="0" data-input="man-field" data-field="${key}" />
  </label>`;

  const body = html`
    <button type="button" class="label-scan" data-act="man-label" ${s.busy || !ui.ai ? "disabled" : ""}>
      ${s.busy === "label" ? html`<span class="spinner sm"></span><span><b>Reading the label…</b><small>This takes a few seconds</small></span>` : html`${icon("tag", 22)}<span><b>Fill from a label photo</b><small>Snap the nutrition panel and we'll copy the numbers</small></span>${icon("right", 18)}`}
    </button>
    ${s.photo ? html`<div class="hero-photo small"><img src="${s.photo.previewUrl}" alt="" /></div>` : ""}
    <div class="ed-name-row">
      <button type="button" class="emoji-btn" data-act="man-emoji" aria-label="Change emoji">${f.emoji}</button>
      <input class="input name-input" value="${f.name}" maxlength="80" placeholder="Name, e.g. Meal prep chicken & rice" data-input="man-field" data-field="name" aria-label="Name" />
    </div>
    ${s.emojiOpen ? html`<div class="emoji-grid">${EMOJIS.map((e) => html`<button type="button" data-act="man-emoji-pick" data-value="${e}">${e}</button>`)}</div>` : ""}
    <label class="field"><span>One serving is</span><input class="input" value="${f.servingDesc}" maxlength="60" placeholder="e.g. 1 container (400 g)" data-input="man-field" data-field="servingDesc" /></label>

    <div class="field">
      <span>Energy per serving</span>
      <div class="input-with-seg">
        <input class="input" inputmode="decimal" value="${f.energy}" placeholder="0" data-input="man-field" data-field="energy" aria-label="Energy" />
        ${seg(
          [
            { value: "kcal", label: "kcal" },
            { value: "kJ", label: "kJ" },
          ],
          f.unit,
          "man-unit",
        )}
      </div>
      ${f.unit === "kJ" && Number(f.energy) > 0 ? html`<small class="muted">= ${N.fmtInt(Number(f.energy) / N.KJ_PER_KCAL)} kcal</small>` : ""}
    </div>
    <div class="grid-3">
      ${field("protein", "Protein", "g")}
      ${field("carbs", "Carbs", "g")}
      ${field("fat", "Fat", "g")}
    </div>
    <button type="button" class="disclosure" data-act="man-more" aria-expanded="${String(Boolean(s.showMore))}">
      <span>More from the label</span><small>optional</small>${icon(s.showMore ? "up" : "down", 18)}
    </button>
    ${s.showMore ? html`<div class="grid-2">${EXTRA.map((x) => field(x.key, x.label, x.unit))}</div>` : ""}

    ${isEntry ? mealChips(s.meal, "man-meal") : ""}
    ${s.label
      ? html`<p class="ai-note">${icon("sparkles", 14)} Vitamins and minerals were estimated from the label photo.</p>`
      : ui.ai
        ? toggle(s.estimate, "man-estimate", "Estimate other nutrients with AI", "Fills in fibre, vitamins, minerals and more")
        : ""}
    ${isEntry ? toggle(s.saveToMeals, "man-save-meals", "Save to My Meals", "So you can log it again in one tap") : ""}
    ${s.error ? html`<p class="form-error" role="alert">${s.error}</p>` : ""}`;

  const footer = html`<button type="button" class="btn btn-primary btn-block btn-lg" data-act="man-save" ${s.busy ? "disabled" : ""}>${isEntry ? "Log it" : "Save to My Meals"}</button>`;
  return sheetFrame({ title: isEntry ? "My own numbers" : "New meal", body, footer, sheet: s, cls: "sheet-tall" });
}

actions["man-field"] = (el) => {
  const s = manualSheet();
  s.f[el.dataset.field] = el.dataset.field === "name" || el.dataset.field === "servingDesc" ? el.value : el.value.replace(",", ".");
  s.error = "";
  if (el.dataset.field === "energy" && s.f.unit === "kJ") render();
};
actions["man-unit"] = (el) => {
  const s = manualSheet();
  const f = s.f;
  const v = Number(f.energy);
  if (v > 0 && f.unit !== el.dataset.value) f.energy = inputNum(el.dataset.value === "kJ" ? v * N.KJ_PER_KCAL : v / N.KJ_PER_KCAL, 0);
  f.unit = el.dataset.value;
  render();
};
actions["man-more"] = () => {
  const s = manualSheet();
  s.showMore = !s.showMore;
  render();
};
actions["man-meal"] = (el) => {
  manualSheet().meal = el.dataset.value;
  render();
};
actions["man-emoji"] = () => {
  const s = manualSheet();
  s.emojiOpen = !s.emojiOpen;
  render();
};
actions["man-emoji-pick"] = (el) => {
  const s = manualSheet();
  s.f.emoji = el.dataset.value;
  s.emojiOpen = false;
  render();
};
actions["man-estimate"] = () => {
  const s = manualSheet();
  s.estimate = !s.estimate;
  render();
};
actions["man-save-meals"] = () => {
  const s = manualSheet();
  s.saveToMeals = !s.saveToMeals;
  render();
};

actions["man-label"] = () => {
  pickPhoto({
    onPhoto: async (file) => {
      const s = manualSheet();
      if (!s) return;
      s.busy = "label";
      s.error = "";
      render();
      try {
        const photo = await preparePhoto(file);
        const res = await api.post("/analyze", { mode: "label", image: photo.dataUrl }, { timeout: 70_000 });
        const r = res.result;
        if (!r.isFood) throw new Error("Couldn't read a nutrition label there. Try again with the panel flat and in focus.");
        const t = N.itemsTotals(r.items);
        const f = s.f;
        f.name = r.name || f.name;
        f.emoji = r.emoji || f.emoji;
        f.servingDesc = r.servingDesc || f.servingDesc;
        f.energy = inputNum(f.unit === "kJ" ? t.kcal * N.KJ_PER_KCAL : t.kcal, 0);
        f.protein = inputNum(t.protein);
        f.carbs = inputNum(t.carbs);
        f.fat = inputNum(t.fat);
        for (const x of EXTRA) f[x.key] = inputNum(r.micros?.[x.key], x.unit === "mg" ? 0 : 1);
        s.showMore = true;
        s.label = r;
        s.photo = photo;
        toast("Label read: check the numbers, then save");
      } catch (err) {
        s.error = err.message;
      } finally {
        s.busy = "";
        render();
      }
    },
  }, "library");
};

actions["man-save"] = async () => {
  const s = manualSheet();
  if (!s || s.busy) return;
  const f = s.f;
  const name = f.name.trim();
  const energy = Number(f.energy);
  if (!name) {
    s.error = "Give it a name.";
    return render();
  }
  if (!(energy >= 0) || f.energy === "") {
    s.error = "Enter the energy per serving (0 is fine for things like black coffee).";
    return render();
  }
  const kcal = Math.round(f.unit === "kJ" ? energy / N.KJ_PER_KCAL : energy);
  const n = (k) => Math.max(0, Math.round((Number(f[k]) || 0) * 10) / 10);
  const userMicros = {};
  for (const x of EXTRA) if (Number(f[x.key]) > 0) userMicros[x.key] = Number(f[x.key]);
  const micros = s.label ? { ...s.label.micros, ...userMicros } : { ...userMicros };
  const item = {
    id: uid("it"),
    name,
    portion: f.servingDesc.trim(),
    grams: s.label?.items?.[0]?.grams || 0,
    kcal,
    protein: n("protein"),
    carbs: n("carbs"),
    fat: n("fat"),
  };
  let imgId = null;
  if (s.photo?.thumb) {
    imgId = uid("i_");
    await images.save(imgId, s.photo.thumb);
  }
  const base = {
    name,
    emoji: f.emoji,
    servingDesc: f.servingDesc.trim() || "1 serve",
    items: [item],
    micros,
    userMicros,
    microsKcal: kcal,
    servings: 1,
    source: s.label ? "label" : "manual",
    health: s.label?.healthScore ? { score: s.label.healthScore, note: s.label.healthNote } : null,
    notes: s.label?.notes || "",
    imgId,
    needsMicros: Boolean(!s.label && s.estimate && ui.ai && kcal > 0),
  };
  if (s.target === "entry") {
    const rec = store.put({ ...base, id: uid("e_"), kind: "entry", date: s.date || ui.date, meal: s.meal || N.defaultMeal(), time: N.timeStr() });
    if (s.saveToMeals) {
      const m = saveAsMeal(rec);
      store.put({ ...store.get(m.id), needsMicros: base.needsMicros, userMicros });
      store.put({ ...store.get(rec.id), savedId: m.id });
    }
    closeSheet({ all: true });
    ui.tab = "today";
    ui.date = rec.date;
    toast(`Logged to ${N.mealLabel(rec.meal)}`);
  } else {
    store.put({ ...base, id: uid("m_"), kind: "meal", uses: 0 });
    closeSheet({ all: true });
    toast("Saved to My Meals");
  }
  if (base.needsMicros) enrichPending();
};

// ---------------------------------------------------------------- background micronutrient estimates

let enrichRunning = false;

export async function enrichPending() {
  if (enrichRunning || !ui.ai || !api.token) return;
  enrichRunning = true;
  const skip = new Set();
  try {
    for (let guard = 0; guard < 25; guard++) {
      const rec = [...store.list("entry"), ...store.list("meal")].find((r) => r.needsMicros && !skip.has(r.id));
      if (!rec) break;
      try {
        const t = N.itemsTotals(rec.items);
        const res = await api.post(
          "/analyze",
          { mode: "nutrients", food: { name: rec.name, servingDesc: rec.servingDesc, kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, micros: rec.userMicros || {} } },
          { timeout: 70_000 },
        );
        const r = res.result;
        const latest = store.get(rec.id);
        if (!latest || !latest.needsMicros) continue;
        // Apply to this record and anything else waiting on the same food (e.g. its saved meal).
        const same = [...store.list("entry"), ...store.list("meal")].filter((x) => x.id !== latest.id && x.needsMicros && x.name === latest.name);
        for (const target of [latest, ...same]) {
          store.put({
            ...target,
            micros: { ...r.micros, ...(target.userMicros || {}) },
            microsKcal: N.itemsTotals((target.items || []).filter((i) => !i.manual)).kcal,
            needsMicros: false,
            health: target.health || (r.healthScore ? { score: r.healthScore, note: r.healthNote } : null),
          });
        }
      } catch (err) {
        if (err.network) break; // try again when back online
        if (err.status === 429 || err.status >= 500) skip.add(rec.id);
        else {
          const latest = store.get(rec.id);
          if (latest) store.put({ ...latest, needsMicros: false });
        }
      }
    }
  } finally {
    enrichRunning = false;
  }
}
