# calorie.prod

A Cal AI–style calorie and macro tracker you host yourself on Netlify.

- **Snap a photo** (or upload one) and Claude identifies each food, estimates portions, and returns calories, protein, carbs, fat, a health score and 27 other nutrients (fibre, iron, calcium, vitamins A–K, sodium, caffeine…).
- **Describe it** in words, **scan a nutrition label**, or **enter your own numbers**. If you only enter macros, the AI fills in the other nutrients.
- **Breakfast / Lunch / Dinner / Snacks** groups, editable ingredients, servings, and **Fix with AI** ("it was brown rice, no cheese").
- **My Meals:** save any meal or your own numbers, then log it in one tap. Recent and frequent foods, copy a meal from another day, a "your usual" button on empty meals, and when the AI recognises one of your saved meals it offers your own numbers instead of its estimate.
- **Targets:** recommended calories and macros from your details (Mifflin-St Jeor), with each of calories, protein, carbs and fat switchable between **Auto** and **Custom**. Nutrient targets use Australian/NZ reference values, and you can override any of them.
- **History and streaks:** every day is kept, with a calendar, 7/30-day charts, a nutrient report, and a streak for days you hit your goals (default: calories within ±10% and protein at least 90%).
- **Syncs across devices** with a username and password, works offline, and installs to your home screen like an app. Shows kcal or kJ, with a light or dark theme.

---

## What's in this folder

```
public/                     the app itself (HTML, CSS, JS; no build step)
netlify/functions/api.mjs   the server: accounts, sync, Claude analysis, photo storage
netlify.toml                Netlify settings
package.json                one dependency: @netlify/blobs (Netlify's built-in storage)
```

Your data is stored in **Netlify Blobs**, which is built into every Netlify project, so there's no database to set up.

---

## Deploy it (about 10 minutes)

### 1. Get a Claude API key

1. Go to **console.anthropic.com** and sign up or log in.
2. Under **Billing**, add some prepaid credit.
3. Under **API keys**, create a key and copy it (it starts with `sk-ant-`).

### 2. Put the project on Netlify

The app has a server function, so Netlify needs to *build* it. Any of these three methods works. **A** is the easiest to keep updated.

**A. GitHub (recommended)**
1. Create a new GitHub repository and upload everything in this folder, keeping the folder structure.
2. In Netlify: **Add new project → Import an existing project → GitHub**, then pick the repo.
3. Leave the build settings as they are (`netlify.toml` already sets them) and click **Deploy**.

**B. Drag and drop**
1. **Log in to Netlify first.** Netlify only builds dropped projects when you're signed in.
2. Drag this folder (or the zip) onto **app.netlify.com/drop**.
3. If the app later shows *"The app's server isn't responding"*, the function didn't build. Use A or C instead.

**C. Netlify CLI**
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod      # run inside this folder; choose "Create & configure a new project"
```

### 3. Add your API key

In Netlify, open your project, go to **Project configuration → Environment variables → Add a variable**, and add:

| Key | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | your `sk-ant-…` key |

Environment variable changes only apply after a new deploy. Redeploy in whichever way you deployed:
- **GitHub:** Deploys → Trigger deploy → Deploy project.
- **Drag and drop:** drop the folder again.
- **CLI:** run `netlify deploy --prod` again.

### 4. Create your account

Open your site's URL and tap **Create account**. **The first account becomes the owner, and after that sign-ups are closed.** To let someone else join, set a `SIGNUP_CODE` (see below) and give them the code.

### 5. Install it on your phone

- **iPhone:** open the site in Safari → Share → **Add to Home Screen**.
- **Android:** open it in Chrome → ⋮ → **Install app**.

Sign in with the same username and password on any device and your diary syncs automatically.

---

## Optional settings (environment variables)

| Variable | Default | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (none) | **Required** for photo, label and text analysis. |
| `SIGNUP_CODE` | (none) | Invite code that lets other people create accounts on your site. |
| `AI_MODEL` | `claude-sonnet-5-5` | The Claude model to use. `claude-haiku-4-5-20251001` is cheaper and faster, but a little less accurate on mixed plates. |
| `AI_DAILY_LIMIT` | `150` | Maximum AI requests per account per day, as a guard against runaway costs. `0` means unlimited. |
| `AI_THINKING` | `off` | Set to `on` to let the model reason before answering. This can help with tricky plates but is slower. |
| `RESET_PASSWORD` | (none) | Recovers a forgotten password. Set it to `username:new-password`, redeploy, sign in with the new password, then **delete the variable** and redeploy. |

Remember to redeploy after changing any of these.

---

## Costs

- **Claude:** with Sonnet 5.5, a photo scan costs roughly 1–2 cents (Haiku 4.5 costs about half that). Photos are shrunk on your phone before they're sent. Manual entries and saved meals cost nothing, and the optional "estimate other nutrients" step is about a cent.
- **Netlify:** one person's diary is a few small files plus a thumbnail per photo. Check usage under your Netlify team's billing page.

---

## How it works

- **Photos:** each photo is resized on the device (1280 px for the AI, 640 px thumbnail). Claude Sonnet 5.5 returns structured JSON with every item, its grams and macros, plus whole-meal micronutrients, a health score, a confidence level and its assumptions. The prompt is tuned for Australian foods and serving sizes. Micronutrients are estimates.
- **Editing:** changing an ingredient's grams scales its macros. Micronutrients scale with the meal's energy. "Fix with AI" re-analyses the photo with your correction.
- **Sync:** the app is offline-first. Everything is saved on the device straight away (IndexedDB) and synced in the background. Each item keeps its latest edit, so two devices editing at once don't clobber each other. Thumbnails sync too.
- **Accounts:** passwords are hashed with scrypt. Sessions last 180 days, and changing your password signs out other devices. AI requests require an account, so strangers can't spend your credit.
- **Targets:** maintenance = BMR (Mifflin-St Jeor) × activity factor. Fat loss subtracts `rate × 7,700 / 7` kcal a day, and muscle gain adds it. Protein is 1.6–2.2 g per kg (capped for higher body weights), fat is a percentage of calories, and carbs fill the rest. If you set a custom calorie goal, the Auto macros follow it.
- **Streaks:** past days are judged against the targets you had *on that day*, so changing your goals doesn't rewrite your history.

## Backups

Go to **Settings → Export backup** to download your whole diary as JSON. **Import backup** merges a file back in, keeping the newer version of anything that exists in both. Your data lives in the Netlify project, so deleting the project deletes your data. Export a backup now and then.

## Local development

```bash
npm install
npx netlify dev          # serves the app + function on http://localhost:8888 with local Blobs
```

Put `ANTHROPIC_API_KEY=...` in a `.env` file, or link the project with `netlify link` to use the variables you set in Netlify.

## Troubleshooting

| Message | Fix |
| --- | --- |
| "AI isn't set up yet" | Add `ANTHROPIC_API_KEY`, then redeploy. |
| "The app's server isn't responding" | The function wasn't deployed. Deploy with GitHub or the CLI (see step 2). |
| "Sign-ups are closed on this site" | The owner account already exists. Set `SIGNUP_CODE` to invite people. |
| "The Anthropic API key was rejected" / "out of credit" | Check the key, or top up at console.anthropic.com. |
| "You've used today's … AI scans" | You hit `AI_DAILY_LIMIT`. Raise it or wait for the reset (10am Brisbane time). |
| Forgot password | Use `RESET_PASSWORD` (above). |

---

AI nutrition estimates are approximate and aren't medical advice.
