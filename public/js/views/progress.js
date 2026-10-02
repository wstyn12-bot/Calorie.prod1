// Progress: streak, goal calendar, energy chart, macro averages and nutrient report.

import { html, raw, cls } from "../html.js";
import { icon, flame } from "../icons.js";
import * as N from "../nutrition.js";
import {
  ui, actions, render, openSheet, seg, bar, microList, streakInfo, dayStatus, dayTotals, targetsFor,
  currentTargets, energyUnit, microTargetsNow, getPrefs, emptyState,
} from "../ui.js";
import { ruleText } from "../sheets/misc.js";

export function ProgressView() {
  const unit = energyUnit();
  const st = streakInfo();
  const range = ui.progress.range;
  const today = N.todayStr();
  const days = Array.from({ length: range }, (_, i) => N.addDays(today, i - range + 1));
  const data = days.map((d) => ({ d, t: dayTotals(d), tg: targetsFor(d), st: dayStatus(d) }));
  const logged = data.filter((x) => x.st.logged);

  return html`
    <header class="page-head"><h1>Progress</h1></header>
    ${streakCard(st)}
    ${calendarCard()}
    <div class="seg-center">${seg(
      [
        { value: "7", label: "Last 7 days" },
        { value: "30", label: "Last 30 days" },
      ],
      String(range),
      "pr-range",
    )}</div>
    ${logged.length
      ? html`${energyChart(data, unit)}${macroAverages(logged, unit)}${nutrientReport(logged)}`
      : html`<div class="card">${emptyState("📈", "No data yet", `Log food on a few days and your ${range}-day trends will show up here.`)}</div>`}`;
}

function streakCard(st) {
  const prefs = getPrefs();
  return html`<button type="button" class="card streak-card" data-act="open-streak">
    <div class="${cls("streak-flame", st.current > 0 && "lit")}">${flame(54, st.current > 0)}</div>
    <div class="streak-card-text">
      <b>${st.current} day${st.current === 1 ? "" : "s"}</b>
      <span>Current streak · best ${st.best}</span>
      <small>Goal day: ${ruleText(prefs.streak)}</small>
    </div>
    ${icon("right", 18)}
  </button>`;
}

function calendarCard() {
  const month = ui.progress.month;
  const [y, m] = month.split("-").map(Number);
  const offset = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7;
  const dim = new Date(y, m, 0).getDate();
  const today = N.todayStr();
  let hits = 0;
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(html`<span class="cal-cell blank"></span>`);
  for (let day = 1; day <= dim; day++) {
    const d = `${month}-${String(day).padStart(2, "0")}`;
    const future = d > today;
    const st = future ? { hit: false, logged: false } : dayStatus(d);
    if (st.hit) hits++;
    cells.push(html`<button type="button" class="${cls("cal-cell", st.hit && "hit", !st.hit && st.logged && "logged", d === today && "is-today")}" data-act="cal-day" data-date="${d}" ${future ? "disabled" : ""} aria-label="${N.fmtDate(d, { weekday: "long", day: "numeric", month: "long" })}${st.hit ? ", goal hit" : st.logged ? ", logged" : ""}">
      ${st.hit ? flame(11) : ""}<span>${day}</span>
    </button>`);
  }
  const label = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1, 12));
  return html`<section class="card cal">
    <div class="cal-head">
      <button type="button" class="icon-btn" data-act="cal-prev" aria-label="Previous month">${icon("left", 18)}</button>
      <div class="cal-title"><b>${label}</b><small>${hits} goal day${hits === 1 ? "" : "s"}</small></div>
      <button type="button" class="icon-btn" data-act="cal-next" aria-label="Next month" ${month >= today.slice(0, 7) ? "disabled" : ""}>${icon("right", 18)}</button>
    </div>
    <div class="cal-grid">
      ${["M", "T", "W", "T", "F", "S", "S"].map((x) => html`<span class="cal-dow">${x}</span>`)}
      ${cells}
    </div>
    <div class="cal-legend"><span><i class="lg hit"></i>Goal hit</span><span><i class="lg logged"></i>Logged</span><span><i class="lg today"></i>Today</span></div>
  </section>`;
}

function energyChart(data, unit) {
  const W = 340;
  const H = 168;
  const top = 14;
  const bottom = 22;
  const n = data.length;
  const maxV = Math.max(...data.map((x) => Math.max(x.t.kcal, x.tg.kcal)), 1) * 1.08;
  const slot = W / n;
  const bw = Math.max(3, Math.min(26, slot * 0.6));
  const y = (v) => H - bottom - (v / maxV) * (H - top - bottom);
  const logged = data.filter((x) => x.st.logged);
  const avg = logged.reduce((a, x) => a + x.t.kcal, 0) / (logged.length || 1);
  const avgTarget = logged.reduce((a, x) => a + x.tg.kcal, 0) / (logged.length || 1);
  let bars = "";
  let line = "";
  let labels = "";
  data.forEach((x, i) => {
    const cx = slot * i + slot / 2;
    if (x.t.kcal > 0) {
      const h = Math.max(2, H - bottom - y(x.t.kcal));
      const color = x.st.hit ? "var(--good)" : x.t.kcal > x.tg.kcal * 1.1 ? "var(--bad)" : "var(--chart-bar)";
      bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(H - bottom - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, bw / 2).toFixed(1)}" fill="${color}"><title>${N.fmtDate(x.d, { weekday: "short", day: "numeric", month: "short" })}: ${N.fmtEnergy(x.t.kcal, unit)} ${N.unitLabel(unit)}</title></rect>`;
    }
    line += `${i === 0 ? "M" : "L"}${(slot * i).toFixed(1)},${y(x.tg.kcal).toFixed(1)}H${(slot * (i + 1)).toFixed(1)}`;
    const showLabel = n <= 7 || i % 5 === 4 || i === n - 1;
    if (showLabel) {
      const txt = n <= 7 ? N.fmtDate(x.d, { weekday: "narrow" }) : String(Number(x.d.slice(8)));
      labels += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${txt}</text>`;
    }
  });
  return html`<section class="card chart-card">
    <div class="chart-head">
      <div><small>Average energy</small><b>${N.fmtEnergy(avg, unit)} <i>${N.unitLabel(unit)}</i></b></div>
      <div class="right"><small>Target</small><b>${N.fmtEnergy(avgTarget, unit)}</b></div>
    </div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily energy for the last ${n} days compared with target">
      ${raw(bars)}
      <path d="${line}" fill="none" stroke="var(--text-2)" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
      <g class="chart-labels">${raw(labels)}</g>
    </svg>
    <div class="cal-legend"><span><i class="lg hit"></i>Goal hit</span><span><i class="lg bar"></i>Logged</span><span><i class="lg over"></i>Over 110%</span><span><i class="lg line"></i>Target</span></div>
  </section>`;
}

function macroAverages(logged, unit) {
  const avg = (k) => logged.reduce((a, x) => a + x.t[k], 0) / logged.length;
  const avgT = (k) => logged.reduce((a, x) => a + x.tg[k], 0) / logged.length;
  const hits = logged.filter((x) => x.st.hit).length;
  return html`<section class="card">
    <div class="section-head"><h3>Daily averages</h3><small>${logged.length} day${logged.length === 1 ? "" : "s"} logged · ${hits} goal day${hits === 1 ? "" : "s"}</small></div>
    <div class="macro-bars">
      ${N.MACROS.map((m) => {
        const v = avg(m.key);
        const t = avgT(m.key);
        return html`<div class="macro-bar-row">
          <span class="mb-label">${m.label}</span>
          <span class="mb-val">${N.fmtG(v)}<i> / ${N.fmtG(t)} g</i></span>
          ${bar(t ? v / t : 0, m.color)}
        </div>`;
      })}
    </div>
  </section>`;
}

function nutrientReport(logged) {
  const avg = {};
  for (const x of logged) for (const [k, v] of Object.entries(x.t.micros)) avg[k] = (avg[k] || 0) + v / logged.length;
  const kcalT = logged.reduce((a, x) => a + x.tg.kcal, 0) / logged.length;
  const mt = microTargetsNow(kcalT);
  const low = N.MICROS.filter((m) => m.kind === "target" && mt[m.key])
    .map((m) => ({ m, p: (avg[m.key] || 0) / mt[m.key] }))
    .filter((x) => x.p < 0.8)
    .sort((a, b) => a.p - b.p)
    .slice(0, 5);
  const over = N.MICROS.filter((m) => m.kind === "limit" && mt[m.key] && (avg[m.key] || 0) > mt[m.key]);
  return html`<section class="card">
    <div class="section-head"><h3>Nutrient report</h3><small>average per logged day</small></div>
    ${low.length
      ? html`<p class="report-label">Running low</p>
          <div class="chips">${low.map((x) => html`<span class="chip static low">${x.m.label} ${Math.round(x.p * 100)}%</span>`)}</div>`
      : html`<p class="report-good">${icon("check", 16)} You're averaging at least 80% of every vitamin and mineral target.</p>`}
    ${over.length
      ? html`<p class="report-label">Over the limit</p><div class="chips">${over.map((m) => html`<span class="chip static over">${m.label} ${N.pct(avg[m.key], mt[m.key])}%</span>`)}</div>`
      : ""}
    <button type="button" class="disclosure" data-act="pr-all" aria-expanded="${String(Boolean(ui.progress.showAll))}"><span>All nutrient averages</span>${icon(ui.progress.showAll ? "up" : "down", 18)}</button>
    ${ui.progress.showAll ? microList(avg, mt) : ""}
  </section>`;
}

actions["pr-range"] = (el) => {
  ui.progress.range = Number(el.dataset.value);
  render();
};
actions["pr-all"] = () => {
  ui.progress.showAll = !ui.progress.showAll;
  render();
};
actions["cal-prev"] = () => {
  const [y, m] = ui.progress.month.split("-").map(Number);
  const d = new Date(y, m - 2, 1, 12);
  ui.progress.month = N.dateStr(d).slice(0, 7);
  render();
};
actions["cal-next"] = () => {
  const [y, m] = ui.progress.month.split("-").map(Number);
  const d = new Date(y, m, 1, 12);
  const next = N.dateStr(d).slice(0, 7);
  if (next <= N.todayStr().slice(0, 7)) ui.progress.month = next;
  render();
};
actions["cal-day"] = (el) => {
  ui.date = el.dataset.date;
  ui.tab = "today";
  render();
  window.scrollTo(0, 0);
};
