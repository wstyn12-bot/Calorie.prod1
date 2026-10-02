// calorie.prod: app shell, render loop, event delegation and startup.

import { html } from "./html.js";
import { morph } from "./morph.js";
import { api } from "./api.js";
import { store } from "./store.js";
import { icon } from "./icons.js";
import * as N from "./nutrition.js";
import { ui, actions, setRenderer, render, closeSheet, onPopState, toast, getProfile, snapshotTargets, getGoals } from "./ui.js";
import { AuthView, OnboardingView, startOnboarding, logoMark, wordmark } from "./views/auth.js";
import { TodayView } from "./views/today.js";
import { ProgressView } from "./views/progress.js";
import { LibraryView } from "./views/library.js";
import { SettingsView, applyTheme, onImportFile } from "./views/settings.js";
import { AddSheet, AnalyzingSheet, DescribeSheet, onPhotoChosen, openAdd } from "./sheets/add.js";
import { EditorSheet } from "./sheets/editor.js";
import { ManualSheet, enrichPending } from "./sheets/manual.js";
import {
  DayNutrientsSheet, StreakSheet, StreakRuleSheet, MealMenuSheet, CopyFromSheet, GoalsSheet, ProfileSheet,
  PasswordSheet, ConfirmSheet,
} from "./sheets/misc.js";

const SHEETS = {
  add: AddSheet,
  analyzing: AnalyzingSheet,
  describe: DescribeSheet,
  editor: EditorSheet,
  manual: ManualSheet,
  dayNutrients: DayNutrientsSheet,
  streak: StreakSheet,
  streakRule: StreakRuleSheet,
  mealMenu: MealMenuSheet,
  copyFrom: CopyFromSheet,
  goals: GoalsSheet,
  profile: ProfileSheet,
  password: PasswordSheet,
  confirm: ConfirmSheet,
};

const root = document.getElementById("app");

// ---------------------------------------------------------------- views

function LoadingView() {
  const s = store.syncState;
  const failed = s.status === "error" || s.status === "offline";
  return html`<main class="loading">
    ${logoMark(64)}
    <h1>${wordmark()}</h1>
    ${failed
      ? html`<p class="form-error">${s.error || "Couldn't load your diary."}</p>
          <div class="btn-row center">
            <button type="button" class="btn btn-primary" data-act="sync-now">${icon("refresh", 18)} Try again</button>
            <button type="button" class="btn btn-ghost" data-act="sign-out-now">Sign out</button>
          </div>`
      : html`<div class="spinner"></div><p class="muted">Loading your diary…</p>`}
  </main>`;
}

function TabBar() {
  const tab = (key, ic, label) => html`<button type="button" class="${"tab" + (ui.tab === key ? " on" : "")}" data-act="tab" data-tab="${key}" aria-current="${ui.tab === key ? "page" : "false"}">${icon(ic, 22)}<span>${label}</span></button>`;
  return html`<nav class="tabbar" aria-label="Main">
    <div class="tabbar-inner">
      ${tab("today", "home", "Today")}
      ${tab("progress", "chart", "Progress")}
      <button type="button" class="fab" data-act="fab" aria-label="Add food">${icon("plus", 30)}</button>
      ${tab("meals", "bookmark", "My Meals")}
      ${tab("settings", "sliders", "Settings")}
    </div>
  </nav>`;
}

function Sheets() {
  if (!ui.sheets.length) return "";
  const last = ui.sheets.length - 1;
  return html`<div class="sheet-layer">
    ${ui.sheets.map((s, i) => {
      const view = SHEETS[s.type];
      return html`<div class="${"sheet-wrap" + (i === last ? " top" : " under") + (s.closing ? " closing" : "")}" data-key="${s.key}">
        <div class="sheet-backdrop" data-act="${i === last ? "sheet-close" : "noop"}"></div>
        ${view ? view(s) : ""}
      </div>`;
    })}
  </div>`;
}

function Toast() {
  const t = ui.toast;
  if (!t) return "";
  return html`<div class="${"toast" + (t.tone ? " " + t.tone : "")}" role="status" data-key="${t.id}">
    <span>${t.msg}</span>
    ${t.actionLabel ? html`<button type="button" class="toast-btn" data-act="toast-action">${t.actionLabel}</button>` : ""}
  </div>`;
}

function View() {
  let main;
  if (!api.token) main = AuthView();
  else if (!store.ready) main = LoadingView();
  else if (ui.onboarding) main = OnboardingView();
  else {
    const page = ui.tab === "progress" ? ProgressView() : ui.tab === "meals" ? LibraryView() : ui.tab === "settings" ? SettingsView() : TodayView();
    main = html`<div class="shell"><main class="${"page page-" + ui.tab}" id="main">${page}</main>${TabBar()}</div>`;
  }
  return html`${main}${Sheets()}${Toast()}`;
}

// ---------------------------------------------------------------- render loop

let queued = false;
function doRender() {
  queued = false;
  try {
    morph(root, View().toString());
  } catch (err) {
    console.error("Render failed", err);
  }
  document.body.classList.toggle("sheet-open", ui.sheets.some((s) => !s.closing));
  if (ui.focus) {
    const el = root.querySelector(ui.focus);
    ui.focus = null;
    if (el) {
      el.focus();
      try {
        if (el.value) el.setSelectionRange(el.value.length, el.value.length);
      } catch {
        /* not a text input */
      }
    }
  }
}
setRenderer(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(doRender);
});
store.subscribe(render);

// ---------------------------------------------------------------- events

root.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || !root.contains(el) || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (!fn) return console.warn("No handler for", el.dataset.act);
  if (el.tagName !== "INPUT" && el.tagName !== "LABEL" && el.tagName !== "SELECT") {
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA") && !el.contains(ae) && ae.type !== "search") ae.blur();
  }
  fn(el, e);
});
root.addEventListener("input", (e) => {
  const el = e.target.closest("[data-input]");
  if (el) actions[el.dataset.input]?.(el, e);
});
root.addEventListener("change", (e) => {
  const el = e.target.closest("[data-change]");
  if (el) actions[el.dataset.change]?.(el, e);
});
root.addEventListener("submit", (e) => {
  const form = e.target.closest("form[data-submit]");
  if (!form) return;
  e.preventDefault();
  actions[form.dataset.submit]?.(form, e);
});
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('[role="button"][data-act]')) {
    e.preventDefault();
    e.target.click();
  }
  if (e.key === "Escape" && ui.sheets.some((s) => !s.closing)) closeSheet();
});

// Android back button / browser back closes the top sheet.
window.addEventListener("popstate", onPopState);

actions.tab = (el) => {
  ui.tab = el.dataset.tab;
  if (ui.tab === "today" && ui.date > N.todayStr()) ui.date = N.todayStr();
  render();
  window.scrollTo(0, 0);
};
actions.fab = () => openAdd(null, ui.tab === "today" ? ui.date : N.todayStr());
actions["sign-out-now"] = () => window.dispatchEvent(new CustomEvent("cp:sign-out"));

for (const id of ["file-camera", "file-library"]) {
  document.getElementById(id).addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    onPhotoChosen(file);
  });
}
document.getElementById("file-import").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  onImportFile(file);
});

// ---------------------------------------------------------------- session lifecycle

let autoSyncStarted = false;

function maybeOnboard() {
  if (store.ready && !getProfile() && !ui.onboarding) {
    startOnboarding();
    render();
  }
}

async function refreshMe() {
  try {
    const res = await api.get("/me");
    ui.me = res.user;
    ui.ai = Boolean(res.ai);
    ui.model = res.model || "";
    api.saveUser(res.user);
    render();
  } catch {
    /* offline is fine */
  }
}

async function afterSignIn() {
  render();
  if (!autoSyncStarted) {
    autoSyncStarted = true;
    store.startAutoSync();
  }
  refreshMe();
  maybeOnboard();
  await store.syncNow();
  maybeOnboard();
  // Keep targets history current (e.g. first run on a device after an update).
  if (getProfile() && !(getGoals().history || []).length) snapshotTargets();
  enrichPending();
  // Home-screen shortcut: /?add=1 opens the add sheet.
  const params = new URLSearchParams(location.search);
  if (params.has("add")) {
    history.replaceState(null, "", "/");
    if (getProfile() && !ui.sheets.length) openAdd(null, N.todayStr());
  }
}

async function loadAuthStatus() {
  try {
    ui.auth.status = await api.get("/auth/status");
    if (!ui.auth.status.hasOwner) ui.auth.mode = "signup";
  } catch (err) {
    ui.auth.error = err.network ? "Can't reach the server right now." : err.message;
  }
  render();
}

function toAuthScreen(message = "") {
  api.setToken(null);
  ui.sheets = [];
  ui.onboarding = null;
  ui.tab = "today";
  ui.date = N.todayStr();
  ui.auth = { mode: "login", busy: false, error: message, status: ui.auth.status };
  render();
  loadAuthStatus();
}

window.addEventListener("cp:signed-in", async () => {
  await store.load();
  afterSignIn();
});

window.addEventListener("cp:sign-out", async () => {
  api.post("/auth/logout").catch(() => {});
  await store.reset();
  api.saveUser(null);
  toAuthScreen();
  toast("Signed out");
});

// Session expired or revoked (e.g. password changed elsewhere): keep local data, ask to sign in.
api.onUnauthorized(() => toAuthScreen("Your session ended. Please sign in again."));

// Re-render when the day rolls over so "Today" stays correct.
let lastDay = N.todayStr();
setInterval(() => {
  const now = N.todayStr();
  if (now !== lastDay) {
    if (ui.date === lastDay) ui.date = now;
    lastDay = now;
    render();
  }
}, 30_000);

matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme());

// Retry any pending "estimate the other nutrients" jobs when we're back online or reopened.
window.addEventListener("online", () => setTimeout(enrichPending, 2000));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && api.token) setTimeout(enrichPending, 3000);
});

async function boot() {
  applyTheme();
  if (!api.token) {
    render();
    loadAuthStatus();
  } else {
    ui.me = api.savedUser;
    await store.load();
    afterSignIn();
  }
  const sw = "serviceWorker" in navigator && (location.protocol === "https:" || new URLSearchParams(location.search).has("sw"));
  if (sw) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

boot();
