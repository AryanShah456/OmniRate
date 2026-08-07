# OmniRate — Complete Setup

Every command and console option you need, in order. Commands are given for
**Windows CMD / PowerShell** first, with macOS/Linux noted where they differ.

Total time: about 15 minutes. Steps 1–2 get it running locally. Steps 3–6 add
real accounts. Step 7 puts it online.

---

## Prerequisites

| Tool | Needed for | Check it's installed |
|------|-----------|---------------------|
| Python 3 **or** Node.js | Running a local server | `python --version` / `node --version` |
| Node.js + npm | Firebase CLI (optional) | `npm --version` |
| Git | Deploying to GitHub Pages | `git --version` |

Only one of Python or Node is required. Everything else is optional.

---

## Step 1 — Unzip and open a terminal there

```cmd
cd %USERPROFILE%\Downloads
tar -xf OmniRate-final.zip -C omnirate
cd omnirate
```

`tar` ships with Windows 10+ and handles zips fine. Or just right-click →
Extract All, then `cd` into the folder.

**macOS / Linux:**
```bash
unzip OmniRate-final.zip -d omnirate && cd omnirate
```

---

## Step 2 — Run it locally

Pick one. **Do not** open `index.html` by double-clicking it — `file://` URLs
break the API calls (CORS) and Firebase auth.

```cmd
python -m http.server 8000
```

```cmd
npx serve -l 8000
```

Then open **http://localhost:8000**

At this point Books, Music and Games all work. It runs in **demo mode**:
accounts and ratings save to that browser only, and Google sign-in is
unavailable until Firebase is set up.

Stop the server with `Ctrl+C`.

---

## Step 3 — Get your API keys

### TMDB (required for the Movies tab)

1. Go to https://www.themoviedb.org/signup — create a free account
2. Go to https://www.themoviedb.org/settings/api
3. Click **Create** → choose **Developer**
4. Accept the terms, fill the form (any URL and description will do — "personal
   project" is fine)
5. Copy the **API Key (v3 auth)** — a 32-character hex string

### RAWG (optional — adds baseline ratings + Metacritic to Games)

1. Go to https://rawg.io/login and sign up
2. Go to https://rawg.io/apidocs — your key is shown at the top of the page
3. Copy it

Skip this and games simply show `—` until someone reviews them. Everything else
still works.

Books and Music need no keys.

---

## Step 4 — Create the Firebase project

This part is console clicks — most of it can't be done from the CLI.

### 4a. Create the project

1. Go to https://console.firebase.google.com
2. **Add project** → name it `omnirate` (or anything) → Continue
3. Google Analytics: **disable it** (you don't need it) → Create project

### 4b. Register a web app and grab the config

1. On the project overview, click the **`</>`** (Web) icon
2. App nickname: `OmniRate` → **do not** tick "Firebase Hosting" yet → Register
3. You'll see a `firebaseConfig` object. **Copy these six values** — you need
   them in Step 5:
   ```
   apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId
   ```
4. If you navigate away, get them again at
   **⚙️ Project settings → General → Your apps → SDK setup and configuration**

### 4c. Enable both sign-in methods

**Build → Authentication → Get started → Sign-in method tab**

1. Click **Email/Password** → toggle **Enable** → Save
2. Click **Google** → toggle **Enable**
   - **Project public-facing name:** `OmniRate`
   - **Support email:** pick your address from the dropdown
   - Save

> Miss the Google one and the "Continue with Google" button returns
> `auth/operation-not-allowed`.

### 4d. Authorize your domains

**Authentication → Settings tab → Authorized domains**

`localhost` is there by default. Click **Add domain** and add your live domain:

- GitHub Pages: `YOUR_USERNAME.github.io`
- Firebase Hosting: `YOUR_PROJECT_ID.web.app` (usually pre-added)

> Miss this and the Google popup fails with `auth/unauthorized-domain`.

### 4e. Create the Firestore database

**Build → Firestore Database → Create database**

1. Location: pick the region closest to you (**this cannot be changed later**)
2. Start in **production mode** — the rules in Step 6 replace the defaults
3. Create

---

## Step 5 — Fill in `js/config.js`

Open `js/config.js` in any editor and paste everything in:

```js
const CONFIG = {
  tmdb: { apiKey: 'your-32-char-tmdb-key' },
  rawg: { apiKey: 'your-rawg-key' },              // optional, '' is fine

  firebase: {
    apiKey: 'AIza...',
    authDomain: 'omnirate-xxxxx.firebaseapp.com',
    projectId: 'omnirate-xxxxx',
    storageBucket: 'omnirate-xxxxx.appspot.com',
    messagingSenderId: '123456789012',
    appId: '1:123456789012:web:abc123def456'
  },

  admins: ['pshah@idc.com'],   // ← YOUR email. Unlocks the Users directory.
  baselineWeight: 2,
};
```

Two things that matter here:

- **`admins`** — put the email you'll actually sign in with. That account (and
  only that account) sees the **Users** icon in the header with the full table
  of names and emails.
- **`baselineWeight: 2`** — how many reviews the imported external rating is
  worth. `2` is community-first. Raise to `5` or `20` if you want scores to stay
  anchored to TMDB/Open Library longer.

Restart your local server and reload. The yellow "Demo mode" banner should be
gone.

---

## Step 6 — Deploy the Firestore security rules

**Until you do this, nothing will save.** Production mode denies all reads and
writes by default.

### Option A — Copy/paste (no install, 30 seconds)

1. **Firebase Console → Firestore Database → Rules** tab
2. Select everything in the editor and delete it
3. Open `firestore.rules` from this project, copy the whole file, paste it in
4. Click **Publish**

### Option B — Firebase CLI (better if you'll edit rules again)

```cmd
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

- `firebase login` opens a browser to authenticate
- `firebase use --add` lists your projects — pick `omnirate`, give it the alias
  `default`
- The included `firebase.json` already points at `firestore.rules`, so **do not
  run `firebase init`** — it would overwrite the rules file with a blank one

Expected output:

```
+  cloud.firestore: rules file firestore.rules compiled successfully
+  firestore: released rules firestore.rules to cloud.firestore
+  Deploy complete!
```

**No composite indexes are needed** — every query in the app uses equality
filters only, which Firestore handles automatically. `firestore.indexes.json`
is intentionally empty.

### Verify it worked

Reload the site, sign in with Google, rate something, then check
**Firestore Database → Data**. You should see three collections appear as you
use the app:

| Collection | Created when |
|------------|-------------|
| `users` | You sign in |
| `reviews` | You submit a review |
| `saved` | You bookmark an item |

---

## Step 7 — Put it online

### Option A — GitHub Pages (free, what the project is built for)

```cmd
git init
git add .
git commit -m "OmniRate"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/omnirate.git
git push -u origin main
```

Create the empty repo at https://github.com/new first (no README, no
.gitignore — this project has both).

Then on GitHub: **Settings → Pages**
- Source: **Deploy from a branch**
- Branch: `main`, folder: `/ (root)`
- Save

Live in 1–2 minutes at `https://YOUR_USERNAME.github.io/omnirate/`

Then go back to **Step 4d** and add `YOUR_USERNAME.github.io` to Firebase's
authorized domains.

> The `.nojekyll` file in this project stops GitHub from mangling the folder
> structure. Don't delete it.

**Pushing updates later:**
```cmd
git add .
git commit -m "what changed"
git push
```

### Option B — Firebase Hosting (one command, custom domain support)

```cmd
firebase deploy --only hosting
```

Live at `https://YOUR_PROJECT_ID.web.app`. The `hosting` block in
`firebase.json` is already configured and excludes the docs and config template.

**Deploy rules and site together:**
```cmd
firebase deploy
```

---

## Command reference

Everything in one place.

### Local development
```cmd
python -m http.server 8000          :: serve on :8000
npx serve -l 8000                   :: same, via Node
```

### Firebase CLI
```cmd
npm install -g firebase-tools       :: install (once)
firebase login                      :: authenticate
firebase logout                      :: sign out
firebase projects:list               :: list your projects
firebase use --add                   :: link this folder to a project
firebase use                         :: show the linked project
firebase deploy --only firestore:rules
firebase deploy --only hosting
firebase deploy                      :: rules + hosting
firebase emulators:start             :: local Firestore/Auth, no cloud writes
firebase --version
```

### Git / GitHub Pages
```cmd
git init
git add .
git commit -m "message"
git branch -M main
git remote add origin https://github.com/USER/omnirate.git
git push -u origin main
git push                             :: subsequent pushes
git status                           :: what's staged
```

### Windows unzip
```cmd
tar -xf OmniRate-final.zip -C omnirate
```

---

## Firebase Console checklist

Tick these off — every one is required except where noted.

- [ ] Project created (Analytics off)
- [ ] Web app registered, six config values copied into `js/config.js`
- [ ] **Authentication → Sign-in method → Email/Password** enabled
- [ ] **Authentication → Sign-in method → Google** enabled (+ support email set)
- [ ] **Authentication → Settings → Authorized domains** includes `localhost`
      and your live domain
- [ ] **Firestore Database** created (production mode, region chosen)
- [ ] **Firestore → Rules** published from `firestore.rules`
- [ ] Your email in `CONFIG.admins`
- [ ] TMDB key in `CONFIG.tmdb.apiKey`
- [ ] *(optional)* RAWG key in `CONFIG.rawg.apiKey`

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Yellow "Demo mode" banner | Firebase config empty or incomplete | All six values in `CONFIG.firebase`; `apiKey`, `authDomain` and `projectId` are the ones actually checked |
| `auth/operation-not-allowed` | Google provider not enabled | Step 4c |
| `auth/unauthorized-domain` | Domain not authorized | Step 4d — add the exact hostname, no `https://`, no path |
| Google popup opens then closes, nothing happens | Popup blocker | The app auto-falls back to redirect; allow popups to skip that |
| `Missing or insufficient permissions` | Rules not deployed | Step 6 |
| Reviews save but the Users table is empty | Rules not deployed, or you're not in `CONFIG.admins` | Check both; the Users icon only appears for admin emails |
| Movies tab shows the "needs a key" screen | No TMDB key | Step 3 |
| Games all show `—` | No RAWG key | Expected. Add one or leave it |
| Many albums show `—` | MusicBrainz genuinely has no rating for them | Expected — the app shows `—` rather than inventing a number |
| Nothing loads, console shows CORS errors | Opened via `file://` | Use a local server (Step 2) |
| Infinite scroll never fires | Filter returned a single page | Check the "That's all N results" line at the bottom |
| GitHub Pages shows a 404 or unstyled page | Missing `.nojekyll`, or Pages still building | Confirm `.nojekyll` is committed; wait 2 minutes |

### Useful console checks

Open DevTools (`F12`) → Console. On a healthy boot you'll see:

```
[OmniRate] Firebase initialized.
```

In demo mode you'll see this instead:

```
[OmniRate] Running in demo mode — ratings saved locally.
```

---

## Where the data lives

| Collection | Doc ID | Who can read | Who can write |
|------------|--------|-------------|--------------|
| `reviews` | `{mediaType}_{mediaId}_{uid}` | Anyone | Owner only |
| `users` | `{uid}` | Signed-in users | Owner only |
| `saved` | `{uid}_{mediaType}_{mediaId}` | Owner only | Owner only |

**One thing to be clear about:** the `users` collection holds email addresses,
and the rules allow any *signed-in* account to read it. The UI hides emails from
everyone outside `CONFIG.admins`, but that's a convenience gate, not a security
boundary — a determined signed-in user could read the collection directly, since
your Firebase config is necessarily public in a static site. Public profiles
never expose an email. If you need emails to be genuinely private, they'd have
to move behind a Cloud Function.
