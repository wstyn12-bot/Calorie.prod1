// Today: week strip, calories left, macros, nutrients peek and the four meal groups.

import { html, cls } from "../html.js";
import { store, uid } from "../store.js";
import { icon, flame } from "../icons.js";
import * as N from "../nutrition.js";
import {
  ui, actions, render, openSheet, toast, ring, bar, thumb, macroLine, syncBadge,
  targetsFor, dayTotals, dayEntries, dayStatus, streakInfo, energyUnit, getPrefs, microTargetsNow, usualFor,
} from "../ui.js";
import { logoMark, wordmark } from "./auth.js";

export function TodayView() {
  const date = ui.date;
  const unit = energyUnit();
  const targets = targetsFor(date);
  const totals = dayTotals(date);
  const entries = dayEntries(date);
  const streak = streakInfo();
  return html`
    <header class="topbar">
      <div class="brand">${logoMark(30)}${wordmark()}</div>
      <div class="topbar-right">
        ${syncBadge()}
        <button type="button" class="${cls("streak-badge", streak.current > 0 && "lit")}" data-act="open-streak" aria-label="${streak.current} day streak">
          ${flame(18, streak.current > 0)}<b>${streak.current}</b>
        </button>
      </div>
    </header>
    ${weekStrip(date)}
    ${summaryCard(totals, targets, unit)}
    ${macroCards(totals, targets)}
    ${nutrientsPeek(totals, targets, date)}
    <section class="meals" aria-label="Meals">
      ${N.MEALS.map((m) => mealCard(m, entries.filter((e) => (e.meal || "snack") === m.key), unit))}
    </section>
    <p class="foot-note">${entries.length ? `${entries.length} item${entries.length === 1 ? "" : "s"} logged` : "Tap + to log your first meal"}</p>`;
}

function weekStrip(selected) {
  const today = N.todayStr();
  const start = N.weekStart(selected, 1);
  const days = Array.from({ length: 7 }, (_, i) => N.addDays(start, i));
  const tol = (getPrefs().streak.tolerance || 10) / 100;
  return html`<nav class="week" aria-label="Choose a day">
      <button type="button" class="icon-btn week-nav" data-act="week-prev" aria-label="Previous week">${icon("left", 18)}</button>
      <div class="week-days">
        ${days.map((d) => {
          const future = d > today;
          const st = future ? { hit: false, logged: false } : dayStatus(d);
          const tg = targetsFor(d);
          const p = tg.kcal ? dayTotals(d).kcal / tg.kcal : 0;
          return html`<button type="button" class="${cls("day", d === selected && "sel", d === today && "is-today", future && "future", st.hit && "hit")}" data-act="pick-day" data-date="${d}" ${future ? "disabled" : ""} aria-label="${N.fmtDate(d, { weekday: "long", day: "numeric", month: "long" })}" aria-current="${d === selected ? "date" : "false"}">
            <span class="day-name">${N.fmtDate(d, { weekday: "narrow" })}</span>
            <span class="day-ring">
              ${ring(p, { size: 36, stroke: 3.5, over: p > 1 + tol })}
              <span class="day-num">${Number(d.slice(8))}</span>
              ${st.hit ? html`<span class="day-flame">${flame(13)}</span>` : ""}
            </span>
          </button>`;
        })}
      </div>
      <button type="button" class="icon-btn week-nav" data-act="week-next" aria-label="Next week" ${N.weekStart(today, 1) <= start ? "disabled" : ""}>${icon("right", 18)}</button>
    </nav>
    ${selected !== today
      ? html`<div class="date-banner"><span>${icon("calendar", 16)} ${N.fmtDate(selected, { weekday: "long", day: "numeric", month: "long" })}</span><button type="button" class="link" data-act="go-today">Back to today</button></div>`
      : ""}`;
}

function summaryCard(totals, targets, unit) {
  const left = targets.kcal - totals.kcal;
  const p = targets.kcal ? totals.kcal / targets.kcal : 0;
  const tol = (getPrefs().streak.tolerance || 10) / 100;
  const showLeft = ui.summaryMode !== "eaten";
  const ul = N.unitLabel(unit);
  return html`<section class="card summary" data-act="toggle-summary" role="button" tabindex="0" aria-label="Calories">
    <div class="summary-text">
      <div class="big-num">${showLeft ? N.fmtEnergy(Math.abs(left), unit) : N.fmtEnergy(totals.kcal, unit)}</div>
      <div class="big-label">${showLeft ? (left < 0 ? `${ul} over` : `${ul} left`) : `${ul} eaten`}</div>
      <div class="summary-sub">${showLeft ? `${N.fmtEnergy(totals.kcal, unit)} eaten` : `${N.fmtEnergy(Math.max(0, left), unit)} left`} · goal ${N.fmtEnergy(targets.kcal, unit)}</div>
    </div>
    <div class="summary-ring">
      ${ring(p, { size: 108, stroke: 11, over: p > 1 + tol })}
      <span class="summary-ring-icon">${icon("zap", 26)}</span>
    </div>
  </section>`;
}

function macroCards(totals, targets) {
  const showLeft = ui.summaryMode !== "eaten";
  return html`<section class="macros">
    ${N.MACROS.map((m) => {
      const eaten = totals[m.key];
      const goal = targets[m.key];
      const left = goal - eaten;
      const p = goal ? eaten / goal : 0;
      return html`<div class="card macro" data-act="toggle-summary">
        <div class="macro-val">
          ${showLeft ? html`<b>${N.fmtG(Math.abs(left))}g</b><small>${m.label} ${left < 0 ? "over" : "left"}</small>` : html`<b>${N.fmtG(eaten)}<span class="of">/${N.fmtG(goal)}g</span></b><small>${m.label} eaten</small>`}
        </div>
        <div class="macro-ring">${ring(p, { size: 56, stroke: 6, color: m.color })}<span class="${cls("macro-letter", m.key)}">${m.short}</span></div>
      </div>`;
    })}
  </section>`;
}

function nutrientsPeek(totals, targets, date) {
  const mt = microTargetsNow(targets.kcal);
  const keys = ["fibre", "sugars", "sodium"];
  return html`<button type="button" class="card peek" data-act="open-nutrients" data-date="${date}">
    ${keys.map((k) => {
      const def = N.microDef(k);
      const v = totals.micros[k] || 0;
      const t = mt[k] || 0;
      const over = def.kind === "limit" && v > t;
      return html`<span class="peek-item">
        <span class="peek-top"><small>${def.label}</small><b>${N.fmtAmount(v)}<i>/${N.fmtAmount(t)}${def.unit}</i></b></span>
        ${bar(t ? v / t : 0, def.kind === "limit" ? "var(--text-3)" : "var(--fibre)", over)}
      </span>`;
    })}
    <span class="peek-more"><span class="peek-more-text">All nutrients</span>${icon("right", 16)}</span>
  </button>`;
}

function mealCard(m, entries, unit) {
  const t = N.sumEntries(entries);
  return html`<section class="card meal" data-key="meal-${m.key}">
    <div class="meal-head">
      <span class="meal-emoji" aria-hidden="true">${m.emoji}</span>
      <div class="meal-title">
        <h3>${m.label}</h3>
        <small>${entries.length ? html`${N.fmtEnergy(t.kcal, unit)} ${N.unitLabel(unit)} · ${macroLine(t)}` : "Nothing logged yet"}</small>
      </div>
      <button type="button" class="icon-btn" data-act="meal-menu" data-meal="${m.key}" aria-label="${m.label} options">${icon("more", 20)}</button>
      <button type="button" class="icon-btn add-btn" data-act="open-add" data-meal="${m.key}" aria-label="Add to ${m.label}">${icon("plus", 20)}</button>
    </div>
    ${entries.length ? html`<div class="entries">${entries.map((e) => entryRow(e, unit))}</div>` : usualChip(m.key, unit)}
  </section>`;
}

// One-tap "your usual" for an empty meal slot.
function usualChip(mealKey, unit) {
  const u = usualFor(mealKey);
  if (!u) return "";
  const t = N.entryTotals(u);
  return html`<button type="button" class="usual-chip" data-act="log-usual" data-id="${u.id}" data-meal="${mealKey}">
    ${icon("plus", 16)}<span>Your usual: <b>${u.name}</b></span><small>${N.fmtEnergy(t.kcal, unit)} ${N.unitLabel(unit)}</small>
  </button>`;
}

export function entryRow(e, unit) {
  const t = N.entryTotals(e);
  const serving = [e.servings && Number(e.servings) !== 1 ? `${N.fmtG(e.servings)} ×` : "", e.servingDesc || ""].filter(Boolean).join(" ");
  return html`<button type="button" class="entry-row" data-key="${e.id}" data-act="open-entry" data-id="${e.id}">
    ${thumb(e, 48)}
    <span class="entry-main">
      <span class="entry-name">${e.name || "Food"}${e.needsMicros ? html` <span class="mini-badge" title="Estimating nutrients">${icon("sparkles", 12)}</span>` : ""}</span>
      <span class="entry-sub">${[serving, e.time ? N.fmtTime(e.time) : ""].filter(Boolean).join(" · ")}</span>
      ${macroLine(t)}
    </span>
    <span class="entry-kcal"><b>${N.fmtEnergy(t.kcal, unit)}</b><small>${N.unitLabel(unit)}</small></span>
  </button>`;
}

// ---------------------------------------------------------------- actions

actions["week-prev"] = () => {
  ui.date = N.addDays(ui.date, -7);
  render();
};
actions["week-next"] = () => {
  const next = N.addDays(ui.date, 7);
  ui.date = next > N.todayStr() ? N.todayStr() : next;
  render();
};
actions["pick-day"] = (el) => {
  ui.date = el.dataset.date;
  render();
};
actions["go-today"] = () => {
  ui.date = N.todayStr();
  render();
};
actions["toggle-summary"] = () => {
  ui.summaryMode = ui.summaryMode === "eaten" ? "left" : "eaten";
  render();
};
actions["open-streak"] = () => openSheet({ type: "streak" });
actions["open-nutrients"] = (el) => openSheet({ type: "dayNutrients", date: el.dataset.date || ui.date });
actions["meal-menu"] = (el) => openSheet({ type: "mealMenu", meal: el.dataset.meal, date: ui.date });

// Copy a meal's entries from one day to another.
export function cloneForLog(src, overrides = {}) {
  const { id, shard, createdAt, updatedAt, deleted, ...rest } = src;
  return { ...rest, id: uid("e_"), kind: "entry", time: N.timeStr(), ...overrides };
}

export function copyMeal(fromDate, meal, toDate, toMeal = meal) {
  const src = dayEntries(fromDate).filter((e) => (e.meal || "snack") === meal);
  if (!src.length) return 0;
  const created = src.map((e) => store.put(cloneForLog(e, { date: toDate, meal: toMeal })));
  toast(`Copied ${created.length} item${created.length === 1 ? "" : "s"} to ${N.mealLabel(toMeal)}`, {
    actionLabel: "Undo",
    onAction: () => created.forEach((e) => store.remove(e.id)),
  });
  return created.length;
}

actions["log-usual"] = (el) => {
  const src = store.get(el.dataset.id);
  if (!src) return;
  const rec = store.put(cloneForLog(src, { date: ui.date, meal: el.dataset.meal }));
  toast(`Added ${src.name} to ${N.mealLabel(el.dataset.meal)}`, { actionLabel: "Undo", onAction: () => store.remove(rec.id) });
};
