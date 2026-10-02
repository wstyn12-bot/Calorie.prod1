// Settings: goals, profile, streak rule, units, theme, backup/restore, account.

import { html, cls } from "../html.js";
import { api } from "../api.js";
import { store } from "../store.js";
import { icon } from "../icons.js";
import * as N from "../nutrition.js";
import { ui, actions, render, openSheet, toast, seg, getProfile, getPrefs, currentTargets, APP_NAME } from "../ui.js";
import { confirmSheet } from "../sheets/misc.js";

export function getTheme() {
  try {
    return localStorage.getItem("cp_theme") || "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(theme = getTheme()) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
  const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0c0c0d" : "#f4f4f1");
}

function ago(ts) {
  if (!ts) return "not yet";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(new Date(ts));
}

const row = (act, ic, title, sub = "", tone = "") => html`<button type="button" class="${cls("list-row", tone)}" data-act="${act}">
  <span class="lr-icon">${icon(ic, 20)}</span>
  <span class="lr-text"><b>${title}</b>${sub ? html`<small>${sub}</small>` : ""}</span>
  ${tone === "danger" ? "" : icon("right", 18, "lr-chev")}
</button>`;

export function SettingsView() {
  const me = ui.me || api.savedUser;
  const prefs = getPrefs();
  const profile = getProfile();
  const t = currentTargets();
  const unit = prefs.energyUnit;
  const sync = store.syncState;
  const pending = store.pendingCount;
  const rule = N.STREAK_RULES.find((r) => r.key === prefs.streak.rule) || N.STREAK_RULES[0];
  const syncText =
    sync.status === "syncing" ? "Syncing…" : sync.status === "offline" ? `Offline${pending ? ` · ${pending} change${pending === 1 ? "" : "s"} waiting` : ""}` : sync.status === "error" ? `Sync problem: ${sync.error}` : `Synced ${ago(sync.lastAt)}`;
  const goal = N.GOALS.find((g) => g.key === profile?.goal);

  return html`
    <header class="page-head"><h1>Settings</h1></header>
    <section class="card account-card">
      <div class="avatar">${(me?.username || "?").slice(0, 1).toUpperCase()}</div>
      <div class="account-text"><b>${me?.username || "Signed in"}</b><small>${me?.isOwner ? "Owner" : "Member"} · ${syncText}</small></div>
    </section>

    <p class="group-label">Plan</p>
    <section class="card list">
      ${row("open-goals", "target", "Goals & targets", `${N.fmtEnergy(t.kcal, unit)} ${N.unitLabel(unit)} · P ${t.protein}g · C ${t.carbs}g · F ${t.fat}g`)}
      ${row("open-profile", "user", "Your details", profile ? `${profile.age} yrs · ${profile.heightCm} cm · ${profile.weightKg} kg · ${goal?.label || ""}` : "Not set")}
      ${row("open-streak-rule", "flame", "Streak rule", rule.label)}
    </section>

    <p class="group-label">Display</p>
    <section class="card list">
      <div class="list-row static">
        <span class="lr-icon">${icon("zap", 20)}</span>
        <span class="lr-text"><b>Energy unit</b><small>Labels in Australia use kJ</small></span>
        ${seg(
          [
            { value: "kcal", label: "kcal" },
            { value: "kJ", label: "kJ" },
          ],
          unit,
          "set-unit",
          "seg-sm",
        )}
      </div>
      <div class="list-row static">
        <span class="lr-icon">${icon("moon", 20)}</span>
        <span class="lr-text"><b>Theme</b></span>
        ${seg(
          [
            { value: "auto", label: "Auto" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ],
          getTheme(),
          "set-theme",
          "seg-sm",
        )}
      </div>
    </section>

    <p class="group-label">Data</p>
    <section class="card list">
      ${row("sync-now", "refresh", "Sync now", syncText)}
      ${row("export-data", "download", "Export backup", "Download everything as a JSON file")}
      ${row("import-data", "upload", "Import backup", "Merge a backup file into your diary")}
    </section>

    <p class="group-label">Account</p>
    <section class="card list">
      ${row("open-password", "lock", "Change password")}
      ${row("sign-out", "logout", "Sign out", "Your diary stays safe in the cloud", "danger")}
    </section>

    <section class="about">
      <p><b>${APP_NAME}</b> · ${ui.ai ? html`AI: ${ui.model || "Claude"}` : html`<span class="warn-text">AI not set up: add ANTHROPIC_API_KEY in Netlify</span>`}</p>
      <p>Install it like an app: on iPhone tap Share → <b>Add to Home Screen</b>; on Android tap ⋮ → <b>Install app</b>.</p>
      <p class="muted">AI estimates are approximate. This isn't medical advice.</p>
    </section>`;
}

actions["open-goals"] = () => openSheet({ type: "goals" });
actions["open-profile"] = () => openSheet({ type: "profile" });
actions["open-password"] = () => openSheet({ type: "password" });

actions["set-unit"] = (el) => {
  const prefs = getPrefs();
  store.put({ ...prefs, id: "prefs", kind: "prefs", energyUnit: el.dataset.value });
};
actions["set-theme"] = (el) => {
  try {
    localStorage.setItem("cp_theme", el.dataset.value);
  } catch {
    /* ignore */
  }
  applyTheme(el.dataset.value);
  render();
};

actions["export-data"] = () => {
  const data = {
    app: APP_NAME,
    format: 1,
    exportedAt: new Date().toISOString(),
    user: (ui.me || api.savedUser)?.username || "",
    records: store.exportAll(),
  };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `calorie-prod-backup-${N.todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`Exported ${data.records.length} records`);
};

actions["import-data"] = () => document.getElementById("file-import").click();

export async function onImportFile(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const records = Array.isArray(data?.records) ? data.records : Array.isArray(data) ? data : null;
    if (!records) throw new Error("That file isn't a calorie.prod backup.");
    const entries = records.filter((r) => r.kind === "entry").length;
    const meals = records.filter((r) => r.kind === "meal").length;
    confirmSheet({
      title: "Import backup?",
      text: `This merges ${entries} diary entr${entries === 1 ? "y" : "ies"} and ${meals} saved meal${meals === 1 ? "" : "s"} into your account. Newer versions of the same item are kept.`,
      confirmLabel: "Import",
      onConfirm: () => {
        const n = store.importRecords(records);
        toast(n ? `Imported ${n} record${n === 1 ? "" : "s"}` : "Nothing new to import");
      },
    });
  } catch (err) {
    toast(err.message || "Couldn't read that file.", { tone: "bad" });
  }
}

actions["sign-out"] = () => {
  const pending = store.pendingCount;
  confirmSheet({
    title: "Sign out?",
    text: pending
      ? `${pending} change${pending === 1 ? " hasn't" : "s haven't"} synced yet and will be lost if you sign out now. Connect to the internet first to keep ${pending === 1 ? "it" : "them"}.`
      : "Your diary stays in your account. Sign in again on any device to pick up where you left off.",
    confirmLabel: "Sign out",
    danger: true,
    onConfirm: () => window.dispatchEvent(new CustomEvent("cp:sign-out")),
  });
};
