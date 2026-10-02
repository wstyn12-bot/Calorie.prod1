// Smaller sheets: day nutrients, streak, meal menu, copy meals, goals, profile,
// streak rule, password and a generic confirm.

import { html, cls } from "../html.js";
import { api } from "../api.js";
import { store, uid } from "../store.js";
import { icon, flame } from "../icons.js";
import * as N from "../nutrition.js";
import {
  ui, actions, render, openSheet, closeSheet, replaceSheet, topSheet, toast, sheetFrame, seg, bar, ring, microList,
  thumb, macroLine, getProfile, getGoals, getPrefs, snapshotTargets, targetsFor, dayTotals, dayEntries, dayStatus,
  streakInfo, energyUnit, microTargetsNow, currentTargets, inputNum,
} from "../ui.js";
import { mealChips } from "./add.js";
import { copyMeal } from "../views/today.js";
import { profileFields, activityFields, goalFields, validProfile, cleanProfile } from "../views/auth.js";

const top = (type) => {
  const s = topSheet();
  return s?.type === type ? s : null;
};

// ---------------------------------------------------------------- day nutrients

export function DayNutrientsSheet(s) {
  const unit = energyUnit();
  const t = dayTotals(s.date);
  const tg = targetsFor(s.date);
  const mt = microTargetsNow(tg.kcal);
  const count = dayEntries(s.date).length;
  const rows = [{ key: "kcal", label: "Energy", color: "var(--ink)", v: t.kcal, t: tg.kcal, unit: N.unitLabel(unit), energy: true }, ...N.MACROS.map((m) => ({ key: m.key, label: m.label, color: m.color, v: t[m.key], t: tg[m.key], unit: "g" }))];
  const body = html`
    <p class="muted small center">${N.relDay(s.date)} · ${count} item${count === 1 ? "" : "s"} logged</p>
    <div class="card inset macro-bars">
      ${rows.map(
        (r) => html`<div class="macro-bar-row">
          <span class="mb-label">${r.label}</span>
          <span class="mb-val">${r.energy ? N.fmtEnergy(r.v, unit) : N.fmtG(r.v)}<i> / ${r.energy ? N.fmtEnergy(r.t, unit) : N.fmtG(r.t)} ${r.unit}</i></span>
          ${bar(r.t ? r.v / r.t : 0, r.color, r.key === "kcal" && r.v > r.t * 1.1)}
        </div>`,
      )}
    </div>
    ${microList(t.micros, mt)}
    <p class="muted small">Targets use Australian/NZ Nutrient Reference Values for your age and sex. Sugars, saturated fat, sodium and caffeine are upper limits. You can change any target in Goals.</p>`;
  return sheetFrame({ title: "Nutrients", body, sheet: s, cls: "sheet-tall" });
}

// ---------------------------------------------------------------- streak

export function StreakSheet(s) {
  const st = streakInfo();
  const prefs = getPrefs();
  const rule = N.STREAK_RULES.find((r) => r.key === prefs.streak.rule) || N.STREAK_RULES[0];
  const today = N.todayStr();
  const days = Array.from({ length: 14 }, (_, i) => N.addDays(today, i - 13));
  const todayHit = dayStatus(today).hit;
  const body = html`
    <div class="streak-hero">
      <div class="${cls("streak-flame", st.current > 0 && "lit")}">${flame(84, st.current > 0)}</div>
      <div class="streak-num">${st.current}</div>
      <div class="streak-label">day streak</div>
      <p class="muted">${st.current === 0 ? "Hit your goals today to start a streak." : todayHit ? "Today's done. Keep it going tomorrow!" : "Hit your goals today to keep it alive."}</p>
    </div>
    <div class="stat-row">
      <div class="stat"><b>${st.best}</b><small>Best streak</small></div>
      <div class="stat"><b>${st.hits}</b><small>Goal days</small></div>
      <div class="stat"><b>${st.logged}</b><small>Days logged</small></div>
    </div>
    <div class="card inset">
      <div class="streak-days">
        ${days.map((d) => {
          const ds = dayStatus(d);
          return html`<div class="${cls("sd", ds.hit && "hit", !ds.hit && ds.logged && "logged", d === today && "is-today")}" title="${N.fmtDate(d, { weekday: "short", day: "numeric", month: "short" })}">
            <span>${ds.hit ? flame(14) : ""}</span><small>${N.fmtDate(d, { weekday: "narrow" })}</small>
          </div>`;
        })}
      </div>
      <p class="small"><b>Goal day:</b> ${ruleText(prefs.streak)}</p>
    </div>
    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-act="open-streak-rule">${icon("target", 18)} Change rule</button>
      <button type="button" class="btn btn-ghost" data-act="go-progress">${icon("calendar", 18)} Calendar</button>
    </div>`;
  return sheetFrame({ title: rule.label + " streak", body, sheet: s });
}

export function ruleText(streak) {
  const tol = streak.tolerance || 10;
  switch (streak.rule) {
    case "log":
      return "any day you log food.";
    case "cal":
      return `calories within ±${tol}% of your target.`;
    case "all":
      return `calories, protein, carbs and fat all within ±${tol}% of target.`;
    default:
      return `calories within ±${tol}% of target and protein at least ${streak.proteinMin || 90}% of target.`;
  }
}

actions["go-progress"] = () => {
  closeSheet({ all: true });
  ui.tab = "progress";
  render();
  window.scrollTo(0, 0);
};
actions["open-streak-rule"] = () => openSheet({ type: "streakRule", d: structuredClone(getPrefs().streak) });

// ---------------------------------------------------------------- streak rule

export function StreakRuleSheet(s) {
  const d = s.d;
  const body = html`
    <div class="option-list">
      ${N.STREAK_RULES.map(
        (r) => html`<button type="button" class="${cls("option", d.rule === r.key && "on")}" data-act="sr-rule" data-value="${r.key}">
          <span class="option-text"><b>${r.label}</b><small>${r.desc}</small></span><span class="radio"></span>
        </button>`,
      )}
    </div>
    ${d.rule !== "log"
      ? html`<div class="field"><span>Calorie range</span>${seg(
          [5, 10, 15, 20].map((v) => ({ value: String(v), label: `±${v}%` })),
          String(d.tolerance),
          "sr-tol",
          "seg-wide",
        )}</div>`
      : ""}
    ${d.rule === "cal_protein"
      ? html`<div class="field"><span>Protein at least</span>${seg(
          [80, 90, 100].map((v) => ({ value: String(v), label: `${v}%` })),
          String(d.proteinMin),
          "sr-pmin",
          "seg-wide",
        )}</div>`
      : ""}
    <p class="muted small">Goal day: ${ruleText(d)} Past days are judged against the targets you had on that day.</p>`;
  const footer = html`<button type="button" class="btn btn-primary btn-block btn-lg" data-act="sr-save">Save</button>`;
  return sheetFrame({ title: "Streak rule", body, footer, sheet: s, back: true });
}
actions["sr-rule"] = (el) => {
  top("streakRule").d.rule = el.dataset.value;
  render();
};
actions["sr-tol"] = (el) => {
  top("streakRule").d.tolerance = Number(el.dataset.value);
  render();
};
actions["sr-pmin"] = (el) => {
  top("streakRule").d.proteinMin = Number(el.dataset.value);
  render();
};
actions["sr-save"] = () => {
  const s = top("streakRule");
  const prefs = getPrefs();
  store.put({ ...prefs, id: "prefs", kind: "prefs", streak: s.d });
  closeSheet();
  toast("Streak rule updated");
};

// ---------------------------------------------------------------- meal menu & copying

export function MealMenuSheet(s) {
  const label = N.mealLabel(s.meal);
  const entries = dayEntries(s.date).filter((e) => (e.meal || "snack") === s.meal);
  const yesterday = N.addDays(s.date, -1);
  const yCount = dayEntries(yesterday).filter((e) => (e.meal || "snack") === s.meal).length;
  const item = (act, ic, title, sub, disabled = false, danger = false) => html`<button type="button" class="${cls("menu-item", danger && "danger")}" data-act="${act}" ${disabled ? "disabled" : ""}>
    ${icon(ic, 20)}<span><b>${title}</b><small>${sub}</small></span>
  </button>`;
  const body = html`<div class="menu">
    ${item("mm-copy-yesterday", "copy", `Copy yesterday's ${label.toLowerCase()}`, yCount ? `${yCount} item${yCount === 1 ? "" : "s"}` : "Nothing logged yesterday", !yCount)}
    ${item("mm-copy-other", "history", "Copy from another day…", "Pick a day and meal")}
    ${item("mm-save-combo", "star", "Save as one meal", entries.length ? `Combine ${entries.length} item${entries.length === 1 ? "" : "s"} into My Meals` : "Log something first", !entries.length)}
    ${item("mm-clear", "trash", `Clear ${label.toLowerCase()}`, entries.length ? "You can undo this" : "Nothing to clear", !entries.length, true)}
  </div>`;
  return sheetFrame({ title: `${label} · ${N.relDay(s.date)}`, body, sheet: s });
}

actions["mm-copy-yesterday"] = () => {
  const s = top("mealMenu");
  copyMeal(N.addDays(s.date, -1), s.meal, s.date);
  closeSheet();
};
actions["mm-copy-other"] = () => {
  const s = top("mealMenu");
  replaceSheet({ type: "copyFrom", meal: s.meal, date: s.date, fromDate: N.addDays(s.date, -1), fromMeal: s.meal });
};
actions["mm-save-combo"] = () => {
  const s = top("mealMenu");
  const entries = dayEntries(s.date).filter((e) => (e.meal || "snack") === s.meal);
  const items = [];
  const micros = {};
  for (const e of entries) {
    const servings = Number(e.servings) || 1;
    const t = N.entryTotals(e);
    for (const it of e.items || []) {
      items.push({ ...it, id: uid("it"), manual: false, kcal: Math.round(it.kcal * servings), protein: Math.round(it.protein * servings * 10) / 10, carbs: Math.round(it.carbs * servings * 10) / 10, fat: Math.round(it.fat * servings * 10) / 10, grams: Math.round((it.grams || 0) * servings) });
    }
    for (const [k, v] of Object.entries(t.micros)) micros[k] = (micros[k] || 0) + v;
  }
  const draft = {
    id: null,
    kind: "meal",
    name: entries.length === 1 ? entries[0].name : `My ${N.mealLabel(s.meal).toLowerCase()}`,
    emoji: N.MEALS.find((m) => m.key === s.meal)?.emoji || "🍽️",
    servingDesc: "1 meal",
    items,
    micros,
    microsKcal: N.itemsTotals(items).kcal,
    servings: 1,
    source: "saved",
    notes: "",
  };
  replaceSheet({ type: "editor", target: "meal", mode: "new", draft });
};
actions["mm-clear"] = () => {
  const s = top("mealMenu");
  const removed = dayEntries(s.date)
    .filter((e) => (e.meal || "snack") === s.meal)
    .map((e) => store.remove(e.id))
    .filter(Boolean);
  closeSheet();
  toast(`Cleared ${removed.length} item${removed.length === 1 ? "" : "s"}`, { actionLabel: "Undo", onAction: () => removed.forEach((r) => store.restore(r)) });
};

export function CopyFromSheet(s) {
  s.fromMeal ||= s.meal;
  const unit = energyUnit();
  const src = dayEntries(s.fromDate).filter((e) => (e.meal || "snack") === s.fromMeal);
  const t = N.sumEntries(src);
  const quick = [
    [N.addDays(s.date, -1), "Yesterday"],
    [N.addDays(s.date, -2), "2 days ago"],
    [N.addDays(s.date, -7), "Last week"],
  ];
  const body = html`
    <div class="field"><span>Copy from</span>
      <div class="chips">${quick.map(([d, l]) => html`<button type="button" class="${cls("chip", s.fromDate === d && "on")}" data-act="cf-date" data-value="${d}">${l}</button>`)}</div>
      <input class="input" type="date" value="${s.fromDate}" max="${N.todayStr()}" data-change="cf-date-input" aria-label="Day to copy from" />
    </div>
    ${mealChips(s.fromMeal, "cf-meal")}
    <div class="card inset copy-preview">
      ${src.length
        ? html`${src.map((e) => html`<div class="mini-row">${thumb(e, 34)}<span>${e.name}</span><b>${N.fmtEnergy(N.entryTotals(e).kcal, unit)}</b></div>`)}
            <div class="mini-total"><span>Total</span><b>${N.fmtEnergy(t.kcal, unit)} ${N.unitLabel(unit)}</b></div>`
        : html`<p class="muted center">Nothing logged for ${N.mealLabel(s.fromMeal).toLowerCase()} on ${N.relDay(s.fromDate).toLowerCase()}.</p>`}
    </div>
    <p class="muted small center">Copies into ${N.mealLabel(s.meal)} on ${N.relDay(s.date)}.</p>`;
  const footer = html`<button type="button" class="btn btn-primary btn-block btn-lg" data-act="cf-go" ${src.length ? "" : "disabled"}>Copy ${src.length || ""} item${src.length === 1 ? "" : "s"}</button>`;
  return sheetFrame({ title: "Copy a meal", body, footer, sheet: s });
}
actions["cf-date"] = (el) => {
  top("copyFrom").fromDate = el.dataset.value;
  render();
};
actions["cf-date-input"] = (el) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) top("copyFrom").fromDate = el.value;
  render();
};
actions["cf-meal"] = (el) => {
  top("copyFrom").fromMeal = el.dataset.value;
  render();
};
actions["cf-go"] = () => {
  const s = top("copyFrom");
  copyMeal(s.fromDate, s.fromMeal, s.date, s.meal);
  closeSheet({ all: true });
};

// ---------------------------------------------------------------- goals

export function GoalsSheet(s) {
  s.d ||= structuredClone(getGoals());
  const d = s.d;
  d.custom ||= {};
  d.microCustom ||= {};
  const profile = getProfile() || {};
  const t = N.effectiveTargets(profile, d);
  const r = t.rec;
  const unit = energyUnit();
  const implied = t.protein * 4 + t.carbs * 4 + t.fat * 9;
  const mismatch = Math.abs(implied - t.kcal) > Math.max(50, t.kcal * 0.04);
  const rows = [
    { key: "kcal", label: "Calories", unit: N.unitLabel(unit), color: "var(--ink)", rec: r.kcal, val: t.kcal, energy: true },
    ...N.MACROS.map((m) => ({ key: m.key, label: m.label, unit: "g", color: m.color, rec: m.key === "carbs" || m.key === "fat" ? null : r[m.key], val: t[m.key] })),
  ];
  const mt = N.microTargets(profile, t.kcal, {});
  const body = html`
    <div class="card inset rec-box">
      <div class="rec-head">${icon("sparkles", 18)}<b>Recommended for you</b></div>
      <p class="small muted">${profile.age ? html`Mifflin-St Jeor: BMR ${N.fmtInt(r.bmr)} kcal × ${r.factor} activity = ${N.fmtInt(r.tdee)} kcal maintenance${r.adj ? `, ${r.adj > 0 ? "+" : "−"}${N.fmtInt(Math.abs(r.adj))} kcal for your goal` : ""}.` : "Add your details in Settings → Your details for personalised numbers."}</p>
      <div class="field"><span>Protein</span>${seg([1.6, 1.8, 2.0, 2.2].map((v) => ({ value: String(v), label: `${v} g/kg` })), String(r.proteinPerKg), "gl-ppk", "seg-wide")}</div>
      <div class="field"><span>Fat share of calories</span>${seg([25, 30, 35].map((v) => ({ value: String(v), label: `${v}%` })), String(r.fatPct), "gl-fat", "seg-wide")}</div>
    </div>

    <div class="goal-rows">
      ${rows.map((row) => {
        const custom = !t.auto[row.key];
        const shown = row.energy ? N.toUnit(row.val, unit) : row.val;
        return html`<div class="${cls("goal-row", custom && "custom")}">
          <div class="goal-row-top">
            <span class="goal-dot" style="background:${row.color}"></span>
            <b>${row.label}</b>
            ${seg(
              [
                { value: "auto", label: "Auto" },
                { value: "custom", label: "Custom" },
              ],
              custom ? "custom" : "auto",
              "gl-mode",
              "seg-sm",
              { key: row.key },
            )}
          </div>
          <div class="goal-row-val">
            ${custom
              ? html`<input class="input" inputmode="decimal" value="${inputNum(shown, 0)}" data-input="gl-val" data-key="${row.key}" aria-label="${row.label} target" /><span class="unit">${row.unit}</span>`
              : html`<b class="big">${N.fmtInt(shown)}</b><span class="unit">${row.unit}</span>`}
            <small class="muted">${custom ? (row.rec ? `Recommended ${N.fmtInt(row.energy ? N.toUnit(row.rec, unit) : row.rec)} ${row.unit}` : "Your number") : row.key === "carbs" ? "Fills the remaining calories" : row.key === "fat" ? `${r.fatPct}% of calories` : "Recommended"}</small>
          </div>
        </div>`;
      })}
    </div>
    ${mismatch ? html`<p class="note warn">Your macros add up to ${N.fmtEnergy(implied, unit)} ${N.unitLabel(unit)}, not ${N.fmtEnergy(t.kcal, unit)}. That's fine if it's intended; set carbs or fat to Auto to balance them.</p>` : ""}

    <button type="button" class="disclosure" data-act="gl-micros" aria-expanded="${String(Boolean(s.showMicros))}">
      <span>Nutrient targets</span><small>fibre, vitamins, minerals</small>${icon(s.showMicros ? "up" : "down", 18)}
    </button>
    ${s.showMicros
      ? html`<div class="micro-targets">
          <p class="muted small">Defaults are Australian/NZ reference values for your age and sex (limits for sugars, saturated fat, sodium and caffeine). Type a number to override; clear it to go back to the default.</p>
          ${N.MICROS.filter((m) => m.kind !== "info").map(
            (m) => html`<label class="micro-target">
              <span>${m.label}${m.kind === "limit" ? html` <i class="limit-tag">limit</i>` : ""}</span>
              <input class="input" inputmode="decimal" value="${d.microCustom[m.key] ? String(d.microCustom[m.key]) : ""}" placeholder="${N.fmtAmount(mt[m.key])}" data-input="gl-micro" data-key="${m.key}" />
              <small>${m.unit}</small>
            </label>`,
          )}
        </div>`
      : ""}`;
  const footer = html`<div class="btn-row">
    <button type="button" class="btn btn-ghost" data-act="gl-reset">Reset to recommended</button>
    <button type="button" class="btn btn-primary grow" data-act="gl-save">Save targets</button>
  </div>`;
  return sheetFrame({ title: "Goals & targets", body, footer, sheet: s, cls: "sheet-tall" });
}

actions["gl-ppk"] = (el) => {
  top("goals").d.proteinPerKg = Number(el.dataset.value);
  render();
};
actions["gl-fat"] = (el) => {
  top("goals").d.fatPct = Number(el.dataset.value);
  render();
};
actions["gl-mode"] = (el) => {
  const s = top("goals");
  const key = el.dataset.key;
  if (el.dataset.value === "auto") delete s.d.custom[key];
  else {
    const t = N.effectiveTargets(getProfile() || {}, s.d);
    s.d.custom[key] = t[key];
    ui.focus = `input[data-key="${key}"]`;
  }
  render();
};
actions["gl-val"] = (el) => {
  const s = top("goals");
  const v = Number(String(el.value).replace(",", "."));
  const key = el.dataset.key;
  if (!(v > 0)) return;
  s.d.custom[key] = key === "kcal" && energyUnit() === "kJ" ? Math.round(v / N.KJ_PER_KCAL) : Math.round(v);
  render();
};
actions["gl-micros"] = () => {
  const s = top("goals");
  s.showMicros = !s.showMicros;
  render();
};
actions["gl-micro"] = (el) => {
  const s = top("goals");
  const v = Number(String(el.value).replace(",", "."));
  if (v > 0) s.d.microCustom[el.dataset.key] = v;
  else delete s.d.microCustom[el.dataset.key];
};
actions["gl-reset"] = () => {
  const s = top("goals");
  s.d.custom = {};
  s.d.microCustom = {};
  delete s.d.proteinPerKg;
  delete s.d.fatPct;
  render();
};
actions["gl-save"] = () => {
  const s = top("goals");
  const d = s.d;
  if (!d.proteinPerKg) delete d.proteinPerKg;
  store.put({ ...getGoals(), ...d, id: "goals", kind: "goals" });
  snapshotTargets();
  closeSheet();
  const t = currentTargets();
  toast(`Targets saved: ${N.fmtEnergy(t.kcal, energyUnit())} ${N.unitLabel(energyUnit())} · P${t.protein} C${t.carbs} F${t.fat}`);
};

// ---------------------------------------------------------------- profile

export function ProfileSheet(s) {
  s.d ||= { ...(getProfile() || { sex: "male", activity: "moderate", goal: "maintain", rate: 0.5 }) };
  const d = s.d;
  const preview = validProfile(d) ? null : N.effectiveTargets(cleanProfile(d), getGoals());
  const unit = energyUnit();
  const body = html`
    ${profileFields(d, "pf")}
    <h3 class="sub-head">Activity</h3>
    ${activityFields(d, "pf")}
    <h3 class="sub-head">Goal</h3>
    ${goalFields(d, "pf")}
    ${preview ? html`<p class="note">New targets: <b>${N.fmtEnergy(preview.kcal, unit)} ${N.unitLabel(unit)}</b> · protein ${preview.protein} g · carbs ${preview.carbs} g · fat ${preview.fat} g${Object.values(preview.auto).some((a) => !a) ? " (custom targets stay as you set them)" : ""}</p>` : ""}
    ${s.error ? html`<p class="form-error" role="alert">${s.error}</p>` : ""}`;
  const footer = html`<button type="button" class="btn btn-primary btn-block btn-lg" data-act="pf-save">Save</button>`;
  return sheetFrame({ title: "Your details", body, footer, sheet: s, cls: "sheet-tall" });
}
actions["pf-sex"] = (el) => {
  top("profile").d.sex = el.dataset.value;
  render();
};
actions["pf-field"] = (el) => {
  const s = top("profile");
  s.d[el.dataset.field] = el.value.replace(",", ".");
  s.error = "";
  render();
};
actions["pf-activity"] = (el) => {
  top("profile").d.activity = el.dataset.value;
  render();
};
actions["pf-goal"] = (el) => {
  const d = top("profile").d;
  d.goal = el.dataset.value;
  const rates = N.RATES[d.goal] || [];
  if (rates.length && !rates.includes(Number(d.rate))) d.rate = d.goal === "gain" ? 0.25 : 0.5;
  render();
};
actions["pf-rate"] = (el) => {
  top("profile").d.rate = Number(el.dataset.value);
  render();
};
actions["pf-save"] = () => {
  const s = top("profile");
  const err = validProfile(s.d);
  if (err) {
    s.error = err;
    return render();
  }
  store.put({ ...(getProfile() || {}), id: "profile", kind: "profile", ...cleanProfile(s.d) });
  snapshotTargets();
  closeSheet();
  toast("Details saved, targets updated");
};

// ---------------------------------------------------------------- password

export function PasswordSheet(s) {
  const body = html`<form class="stack" data-submit="pw-save" autocomplete="on">
    <input type="text" name="username" value="${ui.me?.username || ""}" autocomplete="username" hidden />
    <label class="field"><span>Current password</span><input class="input" type="password" name="current" autocomplete="current-password" required /></label>
    <label class="field"><span>New password <small>8+ characters</small></span><input class="input" type="password" name="next" autocomplete="new-password" minlength="8" required /></label>
    <label class="field"><span>Confirm new password</span><input class="input" type="password" name="confirm" autocomplete="new-password" required /></label>
    ${s.error ? html`<p class="form-error" role="alert">${s.error}</p>` : ""}
    <button type="submit" class="btn btn-primary btn-block btn-lg" ${s.busy ? "disabled" : ""}>${s.busy ? "Saving…" : "Change password"}</button>
    <p class="muted small">Other devices will be signed out.</p>
  </form>`;
  return sheetFrame({ title: "Change password", body, sheet: s });
}
actions["pw-save"] = async (form) => {
  const s = top("password");
  const fd = new FormData(form);
  const current = String(fd.get("current") || "");
  const next = String(fd.get("next") || "");
  if (next.length < 8) {
    s.error = "New password needs at least 8 characters.";
    return render();
  }
  if (next !== fd.get("confirm")) {
    s.error = "The new passwords don't match.";
    return render();
  }
  s.busy = true;
  s.error = "";
  render();
  try {
    const res = await api.post("/auth/password", { current, next });
    closeSheet();
    toast(res.signedOutDevices ? `Password changed. Signed out ${res.signedOutDevices} other device${res.signedOutDevices === 1 ? "" : "s"}.` : "Password changed");
  } catch (err) {
    s.busy = false;
    s.error = err.message;
    render();
  }
};

// ---------------------------------------------------------------- confirm

export function ConfirmSheet(s) {
  const body = html`<p class="confirm-text">${s.text}</p>
    <div class="btn-row">
      <button type="button" class="btn btn-ghost grow" data-act="sheet-close">Cancel</button>
      <button type="button" class="${cls("btn grow", s.danger ? "btn-danger" : "btn-primary")}" data-act="confirm-yes">${s.confirmLabel || "OK"}</button>
    </div>`;
  return sheetFrame({ title: s.title || "Are you sure?", body, sheet: s, cls: "sheet-small" });
}
actions["confirm-yes"] = () => {
  const s = top("confirm");
  closeSheet();
  s?.onConfirm?.();
};
export const confirmSheet = (opts) => openSheet({ type: "confirm", ...opts });
