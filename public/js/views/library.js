// My Meals: saved meals (your own numbers or saved scans), recent and frequent foods.

import { html, cls } from "../html.js";
import { store } from "../store.js";
import { icon } from "../icons.js";
import * as N from "../nutrition.js";
import { ui, actions, render, openSheet, energyUnit, foodHistory, emptyState } from "../ui.js";
import { foodRow } from "../sheets/add.js";

export function LibraryView() {
  const unit = energyUnit();
  const q = ui.lib.query.trim().toLowerCase();
  const tab = ui.lib.tab;
  const saved = [...store.list("meal")].sort((a, b) => (b.uses || 0) - (a.uses || 0) || (b.lastUsed || b.updatedAt || 0) - (a.lastUsed || a.updatedAt || 0));
  const hist = foodHistory();
  let rows;
  if (tab === "recent") rows = hist.map((h) => ({ src: "entry", rec: h.entry, count: h.count }));
  else if (tab === "frequent") rows = [...hist].sort((a, b) => b.count - a.count).map((h) => ({ src: "entry", rec: h.entry, count: h.count }));
  else rows = saved.map((m) => ({ src: "meal", rec: m }));
  if (q) rows = rows.filter((r) => (r.rec.name || "").toLowerCase().includes(q));
  rows = rows.slice(0, 80);
  const slot = N.mealLabel(N.defaultMeal());

  return html`
    <header class="page-head">
      <h1>My Meals</h1>
      <button type="button" class="btn btn-primary btn-sm" data-act="lib-new">${icon("plus", 18)} New</button>
    </header>
    <div class="search page-search">${icon("search", 18)}<input class="input" type="search" placeholder="Search" value="${ui.lib.query}" data-input="lib-search" enterkeyhint="search" /></div>
    <div class="seg-row">
      ${[
        ["saved", `Saved${saved.length ? ` · ${saved.length}` : ""}`],
        ["recent", "Recent"],
        ["frequent", "Frequent"],
      ].map(([v, l]) => html`<button type="button" class="${cls("pill", tab === v && "on")}" data-act="lib-tab" data-value="${v}">${l}</button>`)}
    </div>
    <section class="card list-card">
      ${rows.length
        ? html`<div class="food-list">${rows.map((r) => foodRow(r, unit))}</div>`
        : tab === "saved" && !q
          ? emptyState(
              "⭐",
              "Save your go-to meals",
              "Add your own nutrition numbers (or snap a label) for meals you eat often, like your meal prep or protein shake. Then log them in one tap.",
              html`<button type="button" class="btn btn-primary" data-act="lib-new">${icon("plus", 18)} Add a meal</button>`,
            )
          : emptyState("🔎", q ? "No matches" : "Nothing yet", q ? "Try a different search." : "Foods you log will appear here.")}
    </section>
    ${rows.length ? html`<p class="foot-note">Tap ${icon("plus", 14)} to log to ${slot} on ${N.relDay(ui.date).toLowerCase()}. Tap a meal to ${tab === "saved" ? "edit it" : "adjust before logging"}.</p>` : ""}`;
}

actions["lib-tab"] = (el) => {
  ui.lib.tab = el.dataset.value;
  render();
};
actions["lib-search"] = (el) => {
  ui.lib.query = el.value;
  render();
};
actions["lib-new"] = () => openSheet({ type: "manual", target: "library" });
