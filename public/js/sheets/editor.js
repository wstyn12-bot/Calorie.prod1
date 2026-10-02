// The food editor: review an AI result, adjust servings and ingredients, fix with AI,
// then log it (entry) or keep it (saved meal).

import { html, cls } from "../html.js";
import { api } from "../api.js";
import { store, images, uid } from "../store.js";
import { icon } from "../icons.js";
import { blobToDataUrl } from "../image.js";
import * as N from "../nutrition.js";
import {
  ui, actions, render, openSheet, closeSheet, topSheet, toast, sheetFrame, bar, toggle, microList,
  energyUnit, microTargetsNow, targetsFor, inputNum, savedMatches, thumb,
} from "../ui.js";
import { mealChips } from "./add.js";
import { cloneForLog } from "../views/today.js";

const EMOJIS = "🍳 🥞 🥣 🥐 🥯 🍞 🥪 🌯 🌮 🥙 🍔 🍟 🍕 🌭 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍗 🍖 🥩 🐟 🥚 🧀 🥓 🍚 🥔 🥦 🥕 🌽 🥑 🍎 🍌 🍓 🫐 🍇 🍊 🥭 🥜 🍫 🍪 🍩 🍰 🍦 🍿 🥤 ☕ 🍵 🥛 🧋 🍺 🍷 💪".split(" ");

const sum = (items, k) => items.reduce((a, it) => a + (Number(it[k]) || 0), 0);

export function EditorSheet(s) {
  const d = s.draft;
  const unit = energyUnit();
  const isEntry = s.target === "entry";
  const totals = N.entryTotals(d);
  const title = isEntry ? (s.mode === "new" ? "Log food" : "Edit entry") : s.mode === "new" ? "New meal" : "My meal";
  const photoUrl = s.photo?.previewUrl || (d.imgId ? images.url(d.imgId) : null);
  const today = N.todayStr();
  const right = s.mode === "edit" ? html`<button type="button" class="icon-btn danger" data-act="ed-delete" aria-label="Delete">${icon("trash", 20)}</button>` : "";

  const body = html`
    ${photoUrl ? html`<div class="hero-photo"><img src="${photoUrl}" alt="" /></div>` : ""}
    <div class="ed-name-row">
      <button type="button" class="emoji-btn" data-act="ed-emoji" aria-label="Change emoji">${d.emoji || "🍽️"}</button>
      <input class="input name-input" value="${d.name}" maxlength="80" data-input="ed-name" aria-label="Name" placeholder="Name" />
    </div>
    ${s.emojiOpen ? html`<div class="emoji-grid">${EMOJIS.map((e) => html`<button type="button" data-act="ed-emoji-pick" data-value="${e}">${e}</button>`)}</div>` : ""}
    ${matchBanner(s, unit)}

    ${isEntry
      ? html`${mealChips(d.meal, "ed-meal")}
          <div class="ed-when">
            <label class="pill pill-input">${icon("calendar", 15)}<input type="date" value="${d.date}" max="${today}" data-change="ed-date" aria-label="Date" /></label>
            <label class="pill pill-input">${icon("clock", 15)}<input type="time" value="${d.time || ""}" data-change="ed-time" aria-label="Time" /></label>
          </div>`
      : html`<label class="field"><span>One serving is</span><input class="input" value="${d.servingDesc || ""}" maxlength="60" placeholder="e.g. 1 bowl (350 g)" data-input="ed-serving" /></label>`}

    ${d.health ? healthRow(d.health, d.confidence) : ""}

    <div class="servings-row">
      <div class="servings-label"><b>Servings</b><small>${d.servingDesc || "1 serving"}</small></div>
      <div class="stepper">
        <button type="button" data-act="ed-serv" data-delta="-0.25" aria-label="Less">${icon("minus", 18)}</button>
        <input inputmode="decimal" value="${N.fmtG(d.servings || 1)}" data-change="ed-serv-input" aria-label="Servings" />
        <button type="button" data-act="ed-serv" data-delta="0.25" aria-label="More">${icon("plus", 18)}</button>
      </div>
    </div>
    <div class="chips serving-chips">
      ${[0.5, 1, 1.5, 2].map((v) => html`<button type="button" class="${cls("chip", Number(d.servings || 1) === v && "on")}" data-act="ed-serv-set" data-value="${v}">${v === 0.5 ? "½" : v === 1.5 ? "1½" : v}×</button>`)}
    </div>

    <div class="ed-totals">
      <div class="ed-kcal"><b>${N.fmtEnergy(totals.kcal, unit)}</b><small>${N.unitLabel(unit)}</small></div>
      ${N.MACROS.map((m) => html`<div class="${cls("ed-macro", m.key)}"><b>${N.fmtG(totals[m.key])}g</b><small>${m.label}</small></div>`)}
    </div>

    <div class="section-head"><h3>Ingredients</h3><small>${d.items.length ? `${d.items.length} · amounts for 1 serving` : "none yet"}</small></div>
    <div class="items">${d.items.map((it) => itemRow(it, s.expanded === it.id, unit))}</div>
    ${addItemArea(s)}

    <div class="ai-tools">
      ${s.fixOpen
        ? html`<div class="fix-box">
            <label class="field"><span>${icon("sparkles", 15)} What should change?</span>
              <textarea class="input textarea" rows="2" maxlength="1000" placeholder="e.g. It was brown rice, two eggs not one, and no cheese" data-input="ed-fixtext" data-controlled>${s.fixText || ""}</textarea>
            </label>
            <div class="btn-row">
              <button type="button" class="btn btn-primary btn-sm" data-act="ed-fix-go" ${s.busy || !(s.fixText || "").trim() ? "disabled" : ""}>${s.busy === "fix" ? html`<span class="spinner sm"></span> Fixing…` : html`${icon("sparkles", 16)} Fix it`}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-act="ed-fix-cancel">Cancel</button>
            </div>
          </div>`
        : html`<button type="button" class="btn btn-secondary btn-sm" data-act="ed-fix-open" ${!ui.ai ? "disabled" : ""}>${icon("sparkles", 16)} Fix with AI</button>`}
    </div>
    ${s.error ? html`<p class="form-error" role="alert">${s.error}</p>` : ""}

    <button type="button" class="disclosure" data-act="ed-micros" aria-expanded="${String(Boolean(s.showMicros))}">
      <span>All nutrients</span><small>fibre, vitamins, minerals…</small>${icon(s.showMicros ? "up" : "down", 18)}
    </button>
    ${s.showMicros ? html`<div class="micro-wrap">${microList(totals.micros, microTargetsNow(targetsFor(d.date || today).kcal))}<p class="muted small">% of your daily target. Micronutrients are AI estimates.</p></div>` : ""}

    ${d.notes ? html`<p class="ai-note">${icon("sparkles", 14)} ${d.notes}</p>` : ""}

    ${isEntry && s.mode === "new" ? toggle(s.saveToMeals, "ed-save-meals", "Save to My Meals", "Log it again with one tap next time") : ""}
    ${isEntry && s.mode === "edit"
      ? html`<div class="btn-row wrap">
          <button type="button" class="btn btn-secondary btn-sm" data-act="ed-log-again">${icon("copy", 16)} Log again today</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="ed-save-as-meal">${icon("star", 16)} Save to My Meals</button>
        </div>`
      : ""}
    ${!isEntry && s.mode === "edit"
      ? html`<div class="btn-row wrap"><button type="button" class="btn btn-secondary btn-sm" data-act="ed-log-meal">${icon("plus", 16)} Log this now</button></div>`
      : ""}`;

  const label = isEntry ? (s.mode === "new" ? html`Log it · ${N.fmtEnergy(totals.kcal, unit)} ${N.unitLabel(unit)}` : "Save changes") : "Save meal";
  const footer = html`<button type="button" class="btn btn-primary btn-block btn-lg" data-act="ed-save" ${s.busy ? "disabled" : ""}>${label}</button>`;
  return sheetFrame({ title, body, footer, right, sheet: s, cls: "sheet-tall" });
}

// When an AI result looks like one of your saved meals, offer your own numbers instead.
function matchBanner(s, unit) {
  const d = s.draft;
  if (s.target !== "entry" || s.mode !== "new" || s.fromSaved || s.dismissMatch) return "";
  if (!["photo", "text", "label"].includes(d.source)) return "";
  const m = savedMatches(d.name, { min: 0.6, limit: 1 })[0];
  if (!m) return "";
  const t = N.entryTotals({ ...m, servings: 1 });
  return html`<div class="match-banner">
    <div class="match-top">${thumb(m, 40)}<span><b>Looks like your saved “${m.name}”</b><small>${N.fmtEnergy(t.kcal, unit)} ${N.unitLabel(unit)} per ${m.servingDesc || "serve"} · use your own numbers instead of the AI estimate?</small></span></div>
    <div class="btn-row">
      <button type="button" class="btn btn-primary btn-sm" data-act="ed-use-saved" data-id="${m.id}">${icon("star", 16)} Use my numbers</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="ed-dismiss-match">Keep AI estimate</button>
    </div>
  </div>`;
}

function healthRow(h, confidence) {
  const tone = N.healthTone(h.score);
  return html`<div class="${cls("health", tone)}">
    <div class="health-top">
      <span>Health score</span>
      ${confidence ? html`<span class="${cls("conf", confidence)}">${confidence} confidence</span>` : ""}
      <b>${h.score}/10</b>
    </div>
    ${bar(h.score / 10, `var(--${tone})`)}
    ${h.note ? html`<small>${h.note}</small>` : ""}
  </div>`;
}

function itemRow(it, open, unit) {
  if (!open) {
    return html`<button type="button" class="item" data-key="${it.id}" data-act="ed-item" data-id="${it.id}">
      <span class="item-main">
        <span class="item-name">${it.name || "Ingredient"}</span>
        <span class="item-sub">${[it.portion, it.grams && !/\d\s*(g|grams?)\b/i.test(it.portion || "") ? `${N.fmtInt(it.grams)} g` : ""].filter(Boolean).join(" · ")}</span>
      </span>
      <span class="item-macros"><b>${N.fmtEnergy(it.kcal, unit)}</b> ${N.unitLabel(unit)}<small>P ${N.fmtG(it.protein)} · C ${N.fmtG(it.carbs)} · F ${N.fmtG(it.fat)}</small></span>
      <span class="item-chev">${icon("pencil", 15)}</span>
    </button>`;
  }
  const f = (field, label, val, dp = 1) => html`<label class="mini-field"><span>${label}</span><input class="input" inputmode="decimal" value="${inputNum(val, dp)}" placeholder="0" data-input="ed-item-field" data-id="${it.id}" data-field="${field}" /></label>`;
  return html`<div class="item item-open" data-key="${it.id}">
    <div class="item-edit-head">
      <input class="input" value="${it.name}" maxlength="80" placeholder="Ingredient name" data-input="ed-item-field" data-id="${it.id}" data-field="name" aria-label="Ingredient name" />
      <button type="button" class="icon-btn danger" data-act="ed-item-del" data-id="${it.id}" aria-label="Remove ingredient">${icon("trash", 18)}</button>
    </div>
    <div class="grid-5">
      ${f("grams", "Grams", it.grams, 0)}
      ${f("energy", N.unitLabel(unit), N.toUnit(it.kcal, unit), 0)}
      ${f("protein", "Protein", it.protein)}
      ${f("carbs", "Carbs", it.carbs)}
      ${f("fat", "Fat", it.fat)}
    </div>
    <p class="muted small">Changing grams scales the other numbers.</p>
    <button type="button" class="btn btn-secondary btn-sm" data-act="ed-item" data-id="${it.id}">${icon("check", 16)} Done</button>
  </div>`;
}

function addItemArea(s) {
  if (!s.addOpen) {
    return html`<button type="button" class="btn btn-ghost btn-sm add-ingredient" data-act="ed-add-open">${icon("plus", 16)} Add ingredient</button>`;
  }
  return html`<form class="add-item" data-submit="ed-add-ai">
    <input class="input" name="text" value="${s.addText || ""}" maxlength="300" placeholder="e.g. 1 tbsp olive oil" autocomplete="off" data-input="ed-add-text" enterkeyhint="done" />
    <button type="submit" class="btn btn-primary btn-sm" ${s.busy || !ui.ai ? "disabled" : ""}>${s.busy === "add" ? html`<span class="spinner sm"></span>` : icon("sparkles", 16)} Add</button>
    <button type="button" class="btn btn-ghost btn-sm" data-act="ed-add-manual">Manual</button>
  </form>`;
}

// ---------------------------------------------------------------- helpers

const ed = () => {
  const s = topSheet();
  return s?.type === "editor" ? s : null;
};

// Fold the current micro scaling into the stored values so new items can be merged in.
function normalizeMicros(d) {
  const t = N.entryTotals({ ...d, servings: 1 });
  d.micros = t.micros;
  d.microsKcal = sum(d.items.filter((i) => !i.manual), "kcal");
}

function refFor(s, it) {
  s.refs ||= {};
  if (!s.refs[it.id]) s.refs[it.id] = { grams: Number(it.grams) || 0, kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat };
  return s.refs[it.id];
}

// ---------------------------------------------------------------- actions

actions["ed-name"] = (el) => {
  ed().draft.name = el.value;
};
actions["ed-serving"] = (el) => {
  ed().draft.servingDesc = el.value;
};
actions["ed-emoji"] = () => {
  const s = ed();
  s.emojiOpen = !s.emojiOpen;
  render();
};
actions["ed-emoji-pick"] = (el) => {
  const s = ed();
  s.draft.emoji = el.dataset.value;
  s.emojiOpen = false;
  render();
};
actions["ed-meal"] = (el) => {
  ed().draft.meal = el.dataset.value;
  render();
};
actions["ed-date"] = (el) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) ed().draft.date = el.value > N.todayStr() ? N.todayStr() : el.value;
  render();
};
actions["ed-time"] = (el) => {
  if (/^\d{2}:\d{2}/.test(el.value)) ed().draft.time = el.value.slice(0, 5);
  render();
};
actions["ed-serv"] = (el) => {
  const d = ed().draft;
  const next = Math.round(((Number(d.servings) || 1) + Number(el.dataset.delta)) * 100) / 100;
  d.servings = Math.max(0.25, Math.min(50, next));
  render();
};
actions["ed-serv-set"] = (el) => {
  ed().draft.servings = Number(el.dataset.value);
  render();
};
actions["ed-serv-input"] = (el) => {
  const v = Number(String(el.value).replace(",", "."));
  const d = ed().draft;
  d.servings = Number.isFinite(v) && v > 0 ? Math.min(50, Math.round(v * 100) / 100) : 1;
  render();
};
actions["ed-item"] = (el) => {
  const s = ed();
  s.expanded = s.expanded === el.dataset.id ? null : el.dataset.id;
  if (s.expanded) s.refs = {};
  render();
};
actions["ed-item-del"] = (el) => {
  const s = ed();
  s.draft.items = s.draft.items.filter((it) => it.id !== el.dataset.id);
  s.expanded = null;
  render();
};
actions["ed-item-field"] = (el) => {
  const s = ed();
  const it = s.draft.items.find((x) => x.id === el.dataset.id);
  if (!it) return;
  const field = el.dataset.field;
  if (field === "name") {
    it.name = el.value;
    return;
  }
  const v = Math.max(0, Number(String(el.value).replace(",", ".")) || 0);
  const ref = refFor(s, it);
  if (field === "grams") {
    it.grams = Math.round(v);
    if (ref.grams > 0) {
      const k = v / ref.grams;
      it.kcal = Math.round(ref.kcal * k);
      it.protein = Math.round(ref.protein * k * 10) / 10;
      it.carbs = Math.round(ref.carbs * k * 10) / 10;
      it.fat = Math.round(ref.fat * k * 10) / 10;
    }
  } else {
    const val = field === "energy" ? (energyUnit() === "kJ" ? v / N.KJ_PER_KCAL : v) : v;
    it[field === "energy" ? "kcal" : field] = field === "energy" ? Math.round(val) : Math.round(val * 10) / 10;
    s.refs[it.id] = { grams: Number(it.grams) || 0, kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat };
  }
  render();
};
actions["ed-add-open"] = () => {
  const s = ed();
  s.addOpen = true;
  s.addText = "";
  ui.focus = ".add-item input";
  render();
};
actions["ed-add-text"] = (el) => {
  ed().addText = el.value;
};
actions["ed-add-manual"] = () => {
  const s = ed();
  const it = { id: uid("it"), name: (s.addText || "").trim() || "New ingredient", portion: "", grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, manual: true };
  s.draft.items.push(it);
  s.expanded = it.id;
  s.refs = {};
  s.addOpen = false;
  s.addText = "";
  render();
};
actions["ed-add-ai"] = async (form) => {
  const s = ed();
  const text = String(new FormData(form).get("text") || s.addText || "").trim();
  if (!text || s.busy) return;
  s.busy = "add";
  s.error = "";
  render();
  try {
    const res = await api.post("/analyze", { mode: "text", text }, { timeout: 70_000 });
    const r = res.result;
    if (!r.isFood) throw new Error("Couldn't work out that ingredient. Try adding an amount, e.g. '1 tbsp olive oil'.");
    const d = s.draft;
    normalizeMicros(d);
    const added = r.items.map((it) => ({ ...it, id: uid("it") }));
    d.items.push(...added);
    for (const [k, v] of Object.entries(r.micros || {})) d.micros[k] = (Number(d.micros[k]) || 0) + (Number(v) || 0);
    d.microsKcal += sum(added, "kcal");
    s.addOpen = false;
    s.addText = "";
    toast(`Added ${added.map((a) => a.name).join(", ")}`);
  } catch (err) {
    s.error = err.message;
  } finally {
    s.busy = "";
    render();
  }
};
actions["ed-fix-open"] = () => {
  const s = ed();
  s.fixOpen = true;
  ui.focus = ".fix-box textarea";
  render();
};
actions["ed-fix-cancel"] = () => {
  const s = ed();
  s.fixOpen = false;
  render();
};
actions["ed-fixtext"] = (el) => {
  const s = ed();
  const had = Boolean((s.fixText || "").trim());
  s.fixText = el.value;
  if (had !== Boolean(s.fixText.trim())) render();
};
actions["ed-fix-go"] = async () => {
  const s = ed();
  const text = (s.fixText || "").trim();
  if (!text || s.busy) return;
  s.busy = "fix";
  s.error = "";
  render();
  try {
    let image = s.aiImage || null;
    if (!image && s.draft.imgId) {
      const blob = await images.blob(s.draft.imgId).catch(() => null);
      if (blob) image = await blobToDataUrl(blob);
    }
    const d = s.draft;
    const res = await api.post(
      "/analyze",
      { mode: "fix", text, image, previous: { name: d.name, servingDesc: d.servingDesc, items: d.items } },
      { timeout: 70_000 },
    );
    const r = res.result;
    if (!r.isFood) throw new Error("The AI couldn't apply that. Try rephrasing the correction.");
    d.name = r.name || d.name;
    d.emoji = r.emoji || d.emoji;
    d.servingDesc = r.servingDesc || d.servingDesc;
    d.items = r.items.map((it) => ({ ...it, id: uid("it") }));
    d.micros = { ...r.micros };
    d.microsKcal = sum(d.items, "kcal");
    d.health = r.healthScore ? { score: r.healthScore, note: r.healthNote } : d.health;
    d.confidence = r.confidence || d.confidence;
    d.notes = r.notes || d.notes;
    s.fixOpen = false;
    s.fixText = "";
    s.expanded = null;
    toast("Updated with your fix");
  } catch (err) {
    s.error = err.message;
  } finally {
    s.busy = "";
    render();
  }
};
actions["ed-micros"] = () => {
  const s = ed();
  s.showMicros = !s.showMicros;
  render();
};
actions["ed-save-meals"] = () => {
  const s = ed();
  s.saveToMeals = !s.saveToMeals;
  render();
};

async function persistPhoto(s) {
  if (s.photo?.thumb && !s.draft.imgId) {
    s.draft.imgId = uid("i_");
    await images.save(s.draft.imgId, s.photo.thumb);
  }
}

export function saveAsMeal(entry) {
  const { id, shard, createdAt, updatedAt, date, meal, time, savedId, servings, deleted, needsMicros, source, ...rest } = entry;
  const rec = store.put({ ...rest, id: uid("m_"), kind: "meal", servings: 1, uses: 1, lastUsed: Date.now(), source: "saved" });
  return rec;
}

actions["ed-save"] = async () => {
  const s = ed();
  if (!s || s.busy) return;
  const d = s.draft;
  d.name = (d.name || "").trim() || d.items[0]?.name || "Food";
  if (!d.items.length) {
    s.error = "Add at least one ingredient (it can be zero calories).";
    return render();
  }
  s.busy = "save";
  render();
  try {
    await persistPhoto(s);
    if (s.target === "entry") {
      const rec = store.put({ ...d, id: d.id || uid("e_"), kind: "entry", date: d.date || N.todayStr(), meal: d.meal || N.defaultMeal() });
      if (s.saveToMeals) {
        const m = saveAsMeal(rec);
        store.put({ ...rec, savedId: m.id });
      }
      if (s.fromSaved) {
        const m = store.get(s.fromSaved);
        if (m) store.put({ ...m, uses: (m.uses || 0) + 1, lastUsed: Date.now() });
      }
      closeSheet({ all: true });
      ui.tab = "today";
      ui.date = rec.date;
      toast(s.mode === "new" ? `Logged to ${N.mealLabel(rec.meal)}${s.saveToMeals ? " and saved to My Meals" : ""}` : "Changes saved");
    } else {
      store.put({ ...d, id: d.id || uid("m_"), kind: "meal", servings: 1, uses: d.uses || 0 });
      closeSheet({ all: true });
      toast(s.mode === "new" ? "Saved to My Meals" : "Meal updated");
    }
  } finally {
    s.busy = "";
  }
};

actions["ed-delete"] = () => {
  const s = ed();
  const prev = store.remove(s.draft.id);
  closeSheet({ all: true });
  if (prev) toast(s.target === "entry" ? "Entry deleted" : "Meal deleted", { actionLabel: "Undo", onAction: () => store.restore(prev) });
};

actions["ed-log-again"] = () => {
  const s = ed();
  const rec = store.put(cloneForLog(s.draft, { date: N.todayStr(), meal: N.defaultMeal() }));
  closeSheet({ all: true });
  ui.date = N.todayStr();
  toast(`Logged again to ${N.mealLabel(rec.meal)}`, { actionLabel: "Undo", onAction: () => store.remove(rec.id) });
};

actions["ed-save-as-meal"] = () => {
  const s = ed();
  const m = saveAsMeal({ ...s.draft });
  if (s.draft.id) store.put({ ...store.get(s.draft.id), savedId: m.id });
  toast("Saved to My Meals");
};

actions["ed-log-meal"] = () => {
  const s = ed();
  const m = s.draft;
  const rec = store.put(cloneForLog({ ...m, uses: undefined, lastUsed: undefined }, { kind: "entry", date: ui.date, meal: N.defaultMeal(), savedId: m.id, servings: 1 }));
  store.put({ ...store.get(m.id), uses: (m.uses || 0) + 1, lastUsed: Date.now() });
  closeSheet({ all: true });
  toast(`Logged to ${N.mealLabel(rec.meal)}`, { actionLabel: "Undo", onAction: () => store.remove(rec.id) });
};

export function openEntry(id) {
  const rec = store.get(id);
  if (!rec) return;
  openSheet({ type: "editor", target: "entry", mode: "edit", draft: structuredClone(rec) });
}
actions["open-entry"] = (el) => openEntry(el.dataset.id);

actions["ed-use-saved"] = (el) => {
  const s = ed();
  const m = store.get(el.dataset.id);
  if (!s || !m) return;
  const d = s.draft;
  Object.assign(d, {
    name: m.name,
    emoji: m.emoji || d.emoji,
    servingDesc: m.servingDesc || d.servingDesc,
    items: (m.items || []).map((it) => ({ ...it, id: uid("it") })),
    micros: { ...(m.micros || {}) },
    microsKcal: m.microsKcal,
    health: m.health || d.health,
    confidence: "",
    notes: "",
    savedId: m.id,
    source: "saved",
  });
  s.fromSaved = m.id;
  s.saveToMeals = false;
  s.expanded = null;
  toast("Using your saved numbers");
  render();
};
actions["ed-dismiss-match"] = () => {
  const s = ed();
  s.dismissMatch = true;
  render();
};
