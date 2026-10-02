// Sign in / create account, and first-run onboarding (profile → recommended plan).

import { html, raw, cls } from "../html.js";
import { api } from "../api.js";
import { store } from "../store.js";
import { icon } from "../icons.js";
import * as N from "../nutrition.js";
import { ui, actions, render, seg, getGoals, getPrefs, snapshotTargets, ring, energyUnit, openSheet } from "../ui.js";

export function logoMark(size = 56) {
  return raw(`<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="16" fill="var(--ink)"/>
    <circle cx="32" cy="32" r="17" fill="none" stroke="var(--logo-track)" stroke-width="7"/>
    <path d="M32 15a17 17 0 1 1-17 17" fill="none" stroke="var(--ink-contrast)" stroke-width="7" stroke-linecap="round"/>
    <circle cx="15" cy="32" r="5" fill="var(--accent)"/>
  </svg>`);
}

export function wordmark() {
  return html`<span class="wordmark">calorie<span class="dot">.prod</span></span>`;
}

// ---------------------------------------------------------------- auth

export function AuthView() {
  const a = ui.auth;
  const st = a.status;
  const signup = a.mode === "signup";
  const closed = signup && st && !st.signupOpen;
  return html`<main class="auth">
    <div class="auth-hero">
      ${logoMark(64)}
      <h1>${wordmark()}</h1>
      <p class="tagline">Snap your food. Hit your macros.</p>
    </div>
    <form class="card auth-card" data-submit="auth-submit" autocomplete="on" novalidate>
      ${seg(
        [
          { value: "login", label: "Sign in" },
          { value: "signup", label: "Create account" },
        ],
        a.mode,
        "auth-mode",
        "seg-wide",
      )}
      ${signup && st && !st.hasOwner
        ? html`<p class="note">You're the first one here, so this account becomes the owner. After that, new accounts need an invite code.</p>`
        : ""}
      ${closed
        ? html`<p class="note warn">Sign-ups are closed on this site. The owner can open them by setting a <b>SIGNUP_CODE</b> in Netlify.</p>`
        : ""}
      <label class="field">
        <span>Username</span>
        <input class="input" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="32" required />
      </label>
      <label class="field">
        <span>Password</span>
        <input class="input" type="password" name="password" autocomplete="${signup ? "new-password" : "current-password"}" maxlength="200" required />
      </label>
      ${signup && st?.signupNeedsCode && st?.signupOpen
        ? html`<label class="field"><span>Invite code</span><input class="input" name="code" autocomplete="off" autocapitalize="none" required /></label>`
        : ""}
      ${a.error ? html`<p class="form-error" role="alert">${a.error}</p>` : ""}
      <button class="btn btn-primary btn-block btn-lg" type="submit" ${a.busy || closed ? "disabled" : ""}>
        ${a.busy ? "One moment…" : signup ? "Create account" : "Sign in"}
      </button>
    </form>
    <p class="auth-foot">${icon("cloud", 16)} Your diary syncs to every device you sign in on.</p>
  </main>`;
}

actions["auth-mode"] = (el) => {
  ui.auth.mode = el.dataset.value;
  ui.auth.error = "";
  render();
};

actions["auth-submit"] = async (form) => {
  const fd = new FormData(form);
  const username = String(fd.get("username") || "").trim();
  const password = String(fd.get("password") || "");
  const code = String(fd.get("code") || "").trim();
  const signup = ui.auth.mode === "signup";
  if (username.length < 3) return setAuthError("Enter your username (at least 3 characters).");
  if (password.length < 8) return setAuthError("Passwords have at least 8 characters.");
  ui.auth.busy = true;
  ui.auth.error = "";
  render();
  try {
    const res = await api.post(signup ? "/auth/signup" : "/auth/login", { username, password, code });
    // Different person on this device? Start from a clean slate.
    const prev = api.savedUser;
    if (prev?.uid && prev.uid !== res.user.uid) await store.reset();
    api.setToken(res.token);
    api.saveUser(res.user);
    ui.me = res.user;
    ui.auth = { mode: "login", busy: false, error: "", status: ui.auth.status };
    window.dispatchEvent(new CustomEvent("cp:signed-in"));
  } catch (err) {
    ui.auth.busy = false;
    setAuthError(err.message);
  }
};

function setAuthError(msg) {
  ui.auth.error = msg;
  render();
}

// ---------------------------------------------------------------- onboarding

export function startOnboarding(existing) {
  ui.onboarding = {
    step: 0,
    error: "",
    draft: {
      sex: existing?.sex || "male",
      age: existing?.age || "",
      heightCm: existing?.heightCm || "",
      weightKg: existing?.weightKg || "",
      activity: existing?.activity || "moderate",
      goal: existing?.goal || "maintain",
      rate: existing?.rate || 0.5,
    },
  };
}

const STEPS = 4;

export function profileFields(d, prefix) {
  return html`
    <div class="field">
      <span>Sex <small>(for the energy formula)</small></span>
      ${seg(
        [
          { value: "male", label: "Male" },
          { value: "female", label: "Female" },
        ],
        d.sex,
        `${prefix}-sex`,
        "seg-wide",
      )}
    </div>
    <div class="grid-3">
      <label class="field"><span>Age</span><input class="input" inputmode="numeric" name="age" value="${d.age}" data-input="${prefix}-field" data-field="age" placeholder="18" maxlength="3" /></label>
      <label class="field"><span>Height <small>cm</small></span><input class="input" inputmode="decimal" name="heightCm" value="${d.heightCm}" data-input="${prefix}-field" data-field="heightCm" placeholder="178" maxlength="5" /></label>
      <label class="field"><span>Weight <small>kg</small></span><input class="input" inputmode="decimal" name="weightKg" value="${d.weightKg}" data-input="${prefix}-field" data-field="weightKg" placeholder="75" maxlength="5" /></label>
    </div>`;
}

export function activityFields(d, prefix) {
  return html`<div class="option-list">
    ${N.ACTIVITY.map(
      (a) => html`<button type="button" class="${cls("option", d.activity === a.key && "on")}" data-act="${prefix}-activity" data-value="${a.key}">
        <span class="option-text"><b>${a.label}</b><small>${a.desc}</small></span>
        <span class="radio"></span>
      </button>`,
    )}
  </div>`;
}

export function goalFields(d, prefix) {
  const rates = N.RATES[d.goal] || [];
  return html`<div class="goal-grid">
      ${N.GOALS.map(
        (g) => html`<button type="button" class="${cls("goal-card", d.goal === g.key && "on")}" data-act="${prefix}-goal" data-value="${g.key}">
          <span class="goal-emoji">${g.emoji}</span><b>${g.label}</b><small>${g.desc}</small>
        </button>`,
      )}
    </div>
    ${rates.length
      ? html`<div class="field">
          <span>Pace <small>kg per week</small></span>
          ${seg(
            rates.map((r) => ({ value: String(r), label: `${d.goal === "lose" ? "−" : "+"}${r}` })),
            String(d.rate),
            `${prefix}-rate`,
            "seg-wide",
          )}
        </div>`
      : ""}`;
}

export function validProfile(d) {
  const age = Number(d.age);
  const h = Number(d.heightCm);
  const w = Number(d.weightKg);
  if (!(age >= 13 && age <= 100)) return "Enter an age between 13 and 100.";
  if (!(h >= 120 && h <= 230)) return "Enter your height in centimetres (120–230).";
  if (!(w >= 30 && w <= 300)) return "Enter your weight in kilograms (30–300).";
  return "";
}

export function cleanProfile(d) {
  return {
    sex: d.sex === "female" ? "female" : "male",
    age: Math.round(Number(d.age)),
    heightCm: Math.round(Number(d.heightCm) * 10) / 10,
    weightKg: Math.round(Number(d.weightKg) * 10) / 10,
    activity: d.activity,
    goal: d.goal,
    rate: d.goal === "maintain" ? 0 : Number(d.rate) || 0.5,
  };
}

export function OnboardingView() {
  const o = ui.onboarding;
  const d = o.draft;
  const titles = ["About you", "How active are you?", "What's your goal?", "Your daily plan"];
  let body;
  if (o.step === 0) body = profileFields(d, "ob");
  else if (o.step === 1) body = activityFields(d, "ob");
  else if (o.step === 2) body = goalFields(d, "ob");
  else body = planSummary(cleanProfile(d));
  return html`<main class="onboard">
    <div class="onboard-top">
      ${o.step > 0 ? html`<button type="button" class="icon-btn" data-act="ob-back" aria-label="Back">${icon("left", 22)}</button>` : html`<span class="icon-btn-spacer"></span>`}
      <div class="steps">${Array.from({ length: STEPS }, (_, i) => html`<span class="${cls(i <= o.step && "on")}"></span>`)}</div>
      <span class="icon-btn-spacer"></span>
    </div>
    <div class="onboard-body">
      ${o.step === 0 ? html`<p class="eyebrow">Welcome to ${wordmark()}</p>` : ""}
      <h1 class="onboard-title">${titles[o.step]}</h1>
      ${o.step === 0 ? html`<p class="muted">We'll use this to recommend calorie and macro targets. You can fine-tune everything later.</p>` : ""}
      ${body}
      ${o.error ? html`<p class="form-error" role="alert">${o.error}</p>` : ""}
    </div>
    <div class="onboard-foot">
      ${o.step < STEPS - 1
        ? html`<button type="button" class="btn btn-primary btn-block btn-lg" data-act="ob-next">Continue</button>`
        : html`<button type="button" class="btn btn-primary btn-block btn-lg" data-act="ob-finish">Start tracking</button>
            <button type="button" class="btn btn-ghost btn-block" data-act="ob-finish" data-custom="1">Customise my targets</button>`}
    </div>
  </main>`;
}

export function planSummary(profile) {
  const t = N.effectiveTargets(profile, getGoals());
  const r = t.rec;
  const unit = energyUnit();
  return html`<div class="plan">
    <div class="plan-kcal card">
      <div class="plan-ring">${ring(1, { size: 132, stroke: 12 })}<div class="plan-ring-label"><b>${N.fmtEnergy(t.kcal, unit)}</b><small>${N.unitLabel(unit)} / day</small></div></div>
      <p class="muted small">BMR ${N.fmtInt(r.bmr)} × activity ${r.factor} = ${N.fmtInt(r.tdee)} kcal maintenance${r.adj ? html`, ${r.adj > 0 ? "+" : "−"}${N.fmtInt(Math.abs(r.adj))} kcal for your goal` : ""}.</p>
    </div>
    <div class="plan-macros">
      ${N.MACROS.map(
        (m) => html`<div class="card plan-macro">
          ${ring(1, { size: 54, stroke: 6, color: m.color })}
          <b>${t[m.key]} g</b><small>${m.label}</small>
        </div>`,
      )}
    </div>
    <p class="muted small">Protein ${r.proteinPerKg} g per kg · fat ${r.fatPct}% of calories · carbs fill the rest.</p>
  </div>`;
}

actions["ob-sex"] = (el) => {
  ui.onboarding.draft.sex = el.dataset.value;
  render();
};
actions["ob-field"] = (el) => {
  ui.onboarding.draft[el.dataset.field] = el.value.replace(",", ".");
  ui.onboarding.error = "";
};
actions["ob-activity"] = (el) => {
  ui.onboarding.draft.activity = el.dataset.value;
  render();
};
actions["ob-goal"] = (el) => {
  const d = ui.onboarding.draft;
  d.goal = el.dataset.value;
  const rates = N.RATES[d.goal] || [];
  if (rates.length && !rates.includes(Number(d.rate))) d.rate = d.goal === "gain" ? 0.25 : 0.5;
  render();
};
actions["ob-rate"] = (el) => {
  ui.onboarding.draft.rate = Number(el.dataset.value);
  render();
};
actions["ob-back"] = () => {
  ui.onboarding.step = Math.max(0, ui.onboarding.step - 1);
  ui.onboarding.error = "";
  render();
};
actions["ob-next"] = () => {
  const o = ui.onboarding;
  if (o.step === 0) {
    const err = validProfile(o.draft);
    if (err) {
      o.error = err;
      return render();
    }
  }
  o.step = Math.min(STEPS - 1, o.step + 1);
  o.error = "";
  render();
  window.scrollTo(0, 0);
};
actions["ob-finish"] = (el) => {
  const profile = cleanProfile(ui.onboarding.draft);
  store.put({ id: "profile", kind: "profile", ...profile });
  if (!store.get("prefs")) store.put({ id: "prefs", kind: "prefs", ...getPrefs() });
  snapshotTargets();
  ui.onboarding = null;
  ui.tab = "today";
  render();
  if (el.dataset.custom) openSheet({ type: "goals" });
};
