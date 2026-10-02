// Adding food: the add sheet, photo/label scanning, describing with text, and quick logging
// from saved meals and history.

import { html, cls } from "../html.js";
import { api } from "../api.js";
import { store, images, uid } from "../store.js";
import { icon } from "../icons.js";
import { preparePhoto } from "../image.js";
import * as N from "../nutrition.js";
import {
  ui, actions, render, openSheet, closeSheet, replaceSheet, topSheet, toast, sheetFrame, thumb, macroLine,
  energyUnit, foodHistory, emptyState, savedMatches,
} from "../ui.js";
import { cloneForLog } from "../views/today.js";

// ---------------------------------------------------------------- helpers

export function newDraftFromResult(r, ctx) {
  const items = (r.items || []).map((it) => ({ ...it, id: uid("it") }));
  return {
    id: null,
    kind: ctx.kind || "entry",
    name: r.name || "Meal",
    emoji: r.emoji || "🍽️",
    servingDesc: r.servingDesc || "1 serving",
    items,
    micros: { ...(r.micros || {}) },
    microsKcal: N.itemsTotals(items).kcal,
    servings: 1,
    health: r.healthScore ? { score: r.healthScore, note: r.healthNote || "" } : null,
    confidence: r.confidence || "",
    notes: r.notes || "",
    source: ctx.source,
    date: ctx.date || ui.date,
    meal: ctx.meal || N.defaultMeal(),
    time: N.timeStr(),
    imgId: ctx.imgId || null,
  };
}

export function entryFrom(src, ctx) {
  const { uses, lastUsed, defaultMeal, ...rest } = src;
  return cloneForLog(rest, {
    kind: "entry",
    date: ctx.date,
    meal: ctx.meal,
    savedId: src.kind === "meal" ? src.id : src.savedId || null,
    servings: src.kind === "meal" ? 1 : Number(src.servings) || 1,
    needsMicros: false,
  });
}

function markUsed(meal) {
  if (meal?.kind === "meal") store.put({ ...meal, uses: (meal.uses || 0) + 1, lastUsed: Date.now() });
}

export function quickLog(src, ctx) {
  const rec = store.put(entryFrom(src, ctx));
  markUsed(src.kind === "meal" ? src : store.get(src.savedId));
  toast(`Added ${src.name} to ${N.mealLabel(ctx.meal)}`, { actionLabel: "Undo", onAction: () => store.remove(rec.id) });
  return rec;
}

function addContext() {
  const s = ui.sheets.find((x) => x.type === "add" && !x.closing);
  if (s) return { meal: s.meal, date: s.date };
  return { meal: N.defaultMeal(), date: ui.date };
}

// ---------------------------------------------------------------- add sheet

export function openAdd(meal, date = ui.date) {
  openSheet({ type: "add", meal: meal || N.defaultMeal(), date, list: "saved", query: "" });
}

export function mealChips(current, act) {
  return html`<div class="chips meal-chips" role="radiogroup" aria-label="Meal">
    ${N.MEALS.map(
      (m) => html`<button type="button" class="${cls("chip", current === m.key && "on")}" role="radio" aria-checked="${String(current === m.key)}" data-act="${act}" data-value="${m.key}">${m.emoji} ${m.label}</button>`,
    )}
  </div>`;
}

const ADD_ACTIONS = [
  { act: "add-photo", src: "camera", ic: "camera", label: "Scan food", sub: "Take a photo" },
  { act: "add-photo", src: "library", ic: "image", label: "Upload photo", sub: "From your library" },
  { act: "add-describe", ic: "pencil", label: "Describe it", sub: "Type what you ate" },
  { act: "add-label", ic: "tag", label: "Scan a label", sub: "Nutrition panel" },
  { act: "add-manual", ic: "sliders", label: "My own numbers", sub: "Enter nutrition" },
  { act: "add-copy", ic: "history", label: "Copy a meal", sub: "From another day" },
];

export function AddSheet(s) {
  const unit = energyUnit();
  const q = s.query.trim().toLowerCase();
  const saved = [...store.list("meal")].sort((a, b) => (b.uses || 0) - (a.uses || 0) || (b.lastUsed || 0) - (a.lastUsed || 0));
  const hist = foodHistory();
  let rows;
  if (q) {
    rows = [
      ...saved.filter((m) => m.name.toLowerCase().includes(q)).map((m) => ({ src: "meal", rec: m })),
      ...hist.filter((h) => h.key.includes(q) && !saved.some((m) => m.name.toLowerCase() === h.key)).map((h) => ({ src: "entry", rec: h.entry, count: h.count })),
    ].slice(0, 30);
  } else if (s.list === "recent") {
    rows = hist.slice(0, 20).map((h) => ({ src: "entry", rec: h.entry, count: h.count }));
  } else if (s.list === "frequent") {
    rows = [...hist].sort((a, b) => b.count - a.count).filter((h) => h.count > 1).slice(0, 20).map((h) => ({ src: "entry", rec: h.entry, count: h.count }));
  } else {
    rows = saved.map((m) => ({ src: "meal", rec: m }));
  }

  const body = html`
    ${mealChips(s.meal, "add-meal")}
    ${s.date !== N.todayStr() ? html`<p class="muted small center">Adding to ${N.fmtDate(s.date, { weekday: "long", day: "numeric", month: "long" })}</p>` : ""}
    <div class="action-grid">
      ${ADD_ACTIONS.map(
        (a) => html`<button type="button" class="action-tile" data-act="${a.act}" data-src="${a.src || ""}">
          <span class="action-ic">${icon(a.ic, 24)}</span><b>${a.label}</b><small>${a.sub}</small>
        </button>`,
      )}
    </div>
    <div class="list-head">
      <div class="search">${icon("search", 18)}<input class="input" type="search" placeholder="Search my meals and history" value="${s.query}" data-input="add-search" enterkeyhint="search" /></div>
      ${q
        ? ""
        : html`<div class="seg-row">${[
            ["saved", "My meals"],
            ["recent", "Recent"],
            ["frequent", "Frequent"],
          ].map(([v, l]) => html`<button type="button" class="${cls("pill", s.list === v && "on")}" data-act="add-list" data-value="${v}">${l}</button>`)}</div>`}
    </div>
    <div class="food-list">
      ${rows.length
        ? rows.map((r) => foodRow(r, unit))
        : q
          ? emptyState("🔎", "No matches", "Nothing saved or logged with that name yet.")
          : s.list === "saved"
            ? emptyState("⭐", "No saved meals yet", "Save any logged food to My Meals, or add your own numbers, and it'll show up here for one-tap logging.")
            : emptyState("🕑", "Nothing here yet", "Foods you log will appear here so you can add them again quickly.")}
    </div>`;
  return sheetFrame({ title: "Add food", body, sheet: s, cls: "sheet-tall" });
}

export function foodRow(r, unit, ctxAttrs = "") {
  const t = N.entryTotals({ ...r.rec, servings: r.src === "meal" ? 1 : r.rec.servings });
  const sub = [r.rec.servingDesc, r.count > 1 ? `logged ${r.count}×` : "", r.src === "meal" ? "" : r.rec.date ? N.relDay(r.rec.date) : ""].filter(Boolean).join(" · ");
  return html`<div class="food-row" data-key="${r.src}-${r.rec.id}">
    <button type="button" class="food-main" data-act="food-open" data-src="${r.src}" data-id="${r.rec.id}" ${ctxAttrs}>
      ${thumb(r.rec, 44)}
      <span class="food-text"><span class="food-name">${r.src === "meal" ? html`<span class="star">${icon("star", 13)}</span>` : ""}${r.rec.name}</span><span class="food-sub">${sub}</span>${macroLine(t)}</span>
      <span class="food-kcal"><b>${N.fmtEnergy(t.kcal, unit)}</b><small>${N.unitLabel(unit)}</small></span>
    </button>
    <button type="button" class="icon-btn quick-add" data-act="quick-log" data-src="${r.src}" data-id="${r.rec.id}" aria-label="Log ${r.rec.name}">${icon("plus", 20)}</button>
  </div>`;
}

actions["open-add"] = (el) => openAdd(el?.dataset?.meal || null, ui.date);
actions["add-meal"] = (el) => {
  const s = topSheet();
  s.meal = el.dataset.value;
  render();
};
actions["add-list"] = (el) => {
  topSheet().list = el.dataset.value;
  render();
};
actions["add-search"] = (el) => {
  topSheet().query = el.value;
  render();
};
actions["quick-log"] = (el) => {
  const src = store.get(el.dataset.id);
  if (!src) return;
  const inAdd = topSheet()?.type === "add";
  quickLog(src, addContext());
  if (inAdd) closeSheet();
};
actions["food-open"] = (el) => {
  const src = store.get(el.dataset.id);
  if (!src) return;
  const ctx = addContext();
  if (el.dataset.src === "meal" && !topSheet()) {
    // From the My Meals tab: edit the saved meal itself.
    return openSheet({ type: "editor", target: "meal", mode: "edit", draft: structuredClone(src) });
  }
  const draft = entryFrom(src, ctx);
  draft.id = null;
  openSheet({ type: "editor", target: "entry", mode: "new", draft, fromSaved: el.dataset.src === "meal" ? src.id : null });
};
actions["add-describe"] = () => {
  const s = topSheet();
  openSheet({ type: "describe", meal: s?.meal || N.defaultMeal(), date: s?.date || ui.date, text: "" });
  ui.focus = ".sheet:last-child textarea";
};
actions["add-manual"] = () => {
  const s = topSheet();
  openSheet({ type: "manual", target: "entry", meal: s?.meal || N.defaultMeal(), date: s?.date || ui.date });
};
actions["add-copy"] = () => {
  const s = topSheet();
  openSheet({ type: "copyFrom", meal: s?.meal || N.defaultMeal(), date: s?.date || ui.date, fromDate: N.addDays(s?.date || ui.date, -1) });
};

// ---------------------------------------------------------------- photos

let photoCtx = null;

actions["add-photo"] = (el) => {
  const s = topSheet();
  photoCtx = { mode: "photo", meal: s?.meal || N.defaultMeal(), date: s?.date || ui.date };
  document.getElementById(el.dataset.src === "library" ? "file-library" : "file-camera").click();
};
actions["add-label"] = () => {
  const s = topSheet();
  photoCtx = { mode: "label", meal: s?.meal || N.defaultMeal(), date: s?.date || ui.date };
  // No forced camera here: phones offer "Take photo" or "Photo library" for labels.
  document.getElementById("file-library").click();
};

export function pickPhoto(ctx, source = "camera") {
  photoCtx = ctx;
  document.getElementById(source === "library" ? "file-library" : "file-camera").click();
}

export async function onPhotoChosen(file) {
  const ctx = photoCtx;
  photoCtx = null;
  if (!file || !ctx) return;
  if (ctx.onPhoto) return ctx.onPhoto(file);
  let photo;
  try {
    photo = await preparePhoto(file);
  } catch (err) {
    return toast(err.message, { tone: "bad" });
  }
  const sheet = openSheet({
    type: "analyzing",
    mode: ctx.mode,
    meal: ctx.meal,
    date: ctx.date,
    previewUrl: photo.previewUrl,
    photo,
    status: "working",
    error: "",
  });
  runAnalysis(sheet, { mode: ctx.mode, image: photo.dataUrl, meal: ctx.meal });
}

export async function runAnalysis(sheet, body) {
  sheet.status = "working";
  sheet.error = "";
  sheet.request = body;
  sheet.abort = new AbortController();
  render();
  try {
    const res = await api.post("/analyze", body, { timeout: 70_000, signal: sheet.abort.signal });
    if (!ui.sheets.includes(sheet) || sheet.closing) return;
    const r = res.result;
    if (!r.isFood) {
      sheet.status = "error";
      sheet.error =
        body.mode === "label"
          ? "Couldn't read a nutrition label in that photo. Try again with the panel flat and in focus."
          : body.mode === "text"
            ? "That doesn't sound like food. Try describing what you ate and roughly how much."
            : "No food spotted in that photo. Try another angle, or describe it instead.";
      return render();
    }
    const draft = newDraftFromResult(r, { source: body.mode, date: sheet.date, meal: sheet.meal });
    replaceSheet({
      type: "editor",
      target: "entry",
      mode: "new",
      draft,
      photo: sheet.photo || null,
      aiImage: body.image || null,
      saveToMeals: body.mode === "label",
    });
  } catch (err) {
    if (err.cancelled || !ui.sheets.includes(sheet)) return;
    sheet.status = "error";
    sheet.error = err.message;
    render();
  }
}

export function AnalyzingSheet(s) {
  const label = s.mode === "label" ? "Reading the label" : s.mode === "text" ? "Working it out" : "Analysing your meal";
  const body = html`
    <div class="${cls("scan", s.status === "error" && "scan-error")}">
      ${s.previewUrl
        ? html`<div class="scan-photo"><img src="${s.previewUrl}" alt="Your photo" />${s.status === "working" ? html`<div class="scan-beam"></div><div class="scan-grid"></div>` : ""}</div>`
        : html`<div class="scan-text"><span class="scan-quote">“${s.request?.text || ""}”</span>${s.status === "working" ? html`<div class="scan-beam"></div>` : ""}</div>`}
      ${s.status === "working"
        ? html`<div class="scan-status">
            <span class="spinner"></span>
            <div class="ticker" aria-live="polite">
              <span>${label}…</span><span>Estimating portions…</span><span>Crunching nutrients…</span><span>Almost there…</span>
            </div>
          </div>`
        : html`<div class="scan-fail">
            <p class="form-error" role="alert">${s.error}</p>
            <div class="btn-row">
              <button type="button" class="btn btn-primary" data-act="analysis-retry">${icon("refresh", 18)} Try again</button>
              ${s.mode !== "text" ? html`<button type="button" class="btn btn-secondary" data-act="analysis-describe">${icon("pencil", 18)} Describe instead</button>` : ""}
              <button type="button" class="btn btn-ghost" data-act="analysis-manual">Enter numbers</button>
            </div>
          </div>`}
    </div>`;
  return sheetFrame({ title: label, body, sheet: s });
}

actions["analysis-retry"] = () => {
  const s = topSheet();
  if (s?.type === "analyzing" && s.request) runAnalysis(s, s.request);
};
actions["analysis-describe"] = () => {
  const s = topSheet();
  replaceSheet({ type: "describe", meal: s.meal, date: s.date, text: "" });
  ui.focus = ".sheet:last-child textarea";
};
actions["analysis-manual"] = () => {
  const s = topSheet();
  replaceSheet({ type: "manual", target: "entry", meal: s.meal, date: s.date });
};

// ---------------------------------------------------------------- describe

const EXAMPLES = [
  "2 scrambled eggs on sourdough with butter",
  "Large flat white and a banana",
  "Chicken burrito bowl with guac",
  "Protein shake: 1 scoop whey, 300 ml milk",
];

export function DescribeSheet(s) {
  const body = html`
    ${mealChips(s.meal, "describe-meal")}
    <label class="field">
      <span>What did you eat? <small>Include amounts if you know them</small></span>
      <textarea class="input textarea" rows="4" maxlength="1500" placeholder="e.g. a bowl of spaghetti bolognese with parmesan and a glass of OJ" data-input="describe-text" data-controlled>${s.text}</textarea>
    </label>
    ${matchesBlock(s)}
    <div class="examples">
      ${EXAMPLES.map((e) => html`<button type="button" class="pill" data-act="describe-example" data-value="${e}">${e}</button>`)}
    </div>`;
  const footer = html`<button type="button" class="btn btn-primary btn-block btn-lg" data-act="describe-go" ${s.text.trim() ? "" : "disabled"}>${icon("sparkles", 18)} Estimate nutrition</button>`;
  return sheetFrame({ title: "Describe your food", body, footer, sheet: s });
}

// Saved meals that match what's being typed: use your own numbers instead of an AI estimate.
function matchesBlock(s) {
  const found = savedMatches(s.text);
  if (!found.length) return "";
  const unit = energyUnit();
  return html`<div class="saved-matches">
    <p class="report-label">From My Meals: your own numbers</p>
    ${found.map((m) => {
      const t = N.entryTotals({ ...m, servings: 1 });
      return html`<button type="button" class="saved-match" data-act="describe-use-saved" data-id="${m.id}">
        ${thumb(m, 36)}<span class="sm-text"><b>${m.name}</b><small>${m.servingDesc || "1 serve"} · ${N.fmtEnergy(t.kcal, unit)} ${N.unitLabel(unit)}</small></span>${icon("plus", 18)}
      </button>`;
    })}
  </div>`;
}

actions["describe-use-saved"] = (el) => {
  const s = topSheet();
  const m = store.get(el.dataset.id);
  if (!m) return;
  quickLog(m, { meal: s.meal, date: s.date });
  closeSheet({ all: true });
};

actions["describe-meal"] = (el) => {
  topSheet().meal = el.dataset.value;
  render();
};
actions["describe-text"] = (el) => {
  const s = topSheet();
  s.text = el.value;
  render();
};
actions["describe-example"] = (el) => {
  topSheet().text = el.dataset.value;
  render();
};
actions["describe-go"] = () => {
  const s = topSheet();
  const text = s.text.trim();
  if (!text) return;
  const sheet = replaceSheet({ type: "analyzing", mode: "text", meal: s.meal, date: s.date, status: "working", error: "" });
  runAnalysis(sheet, { mode: "text", text, meal: s.meal });
};
