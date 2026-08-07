# OmniRate

A multi-media rating app. Rate **movies, books, music and games** across six
categories each, leave comments, keep lists, and see what the community thinks.
Every media type has its own colour theme.

Inspired by IMDb, Letterboxd, Goodreads and Metacritic — rolled into one.

> **Why the score isn't blank on a brand-new site:** every item starts with a
> baseline rating imported from the source that already tracks one (TMDB,
> Open Library, RAWG, MusicBrainz). Community reviews then blend on top. See
> [Scoring](#scoring) — and [FEATURE_ANALYSIS.md](FEATURE_ANALYSIS.md) for why
> this was built instead of a recommendation engine.

## Features

- **4 media tabs** — Movies, Books, Music, Games, each with its own colour theme
- **Multi-category ratings** — 6 aspects per media type, not one blunt star count
- **Baseline + community scoring** — imported external ratings, blended with reviews here
- **Google sign-in** — plus email/password
- **Saved lists** — Watchlist, Reading List, Listen Later, Play Later (one system, four labels)
- **Profiles** — every review a user has left, across all four media types
- **Recent activity** — site-wide feed of the newest reviews
- **Users directory** — owner-only table of accounts with names, emails and review counts
- **Deep links + sharing** — every item has its own URL; Back closes the modal
- **Infinite scroll** — no Load More button; results stream in as you scroll
- **Search & filters** — genre, language, length, type, platform, sort order
- **Responsive** — desktop and mobile
- **GitHub Pages ready** — static site, no build step, no server

## Rating Categories

| Movies | Books | Music | Games |
|--------|-------|-------|-------|
| Cast | Prose & Writing | Lyrics | Gameplay |
| Cinematography | Characters | Production | Story |
| Script | Pacing | Vocals | Graphics |
| Acting | Worldbuilding | Replay Value | Soundtrack |
| Length | Ending | Cohesion | Replayability |
| Pacing | Cover Art | Originality | Length |

## Scoring

Each item's **OmniRate Score** is a Bayesian blend of an imported baseline and
the reviews left here:

```
score = (baseline × W + sum of community ratings) / (W + number of reviews)
```

`W` is `CONFIG.baselineWeight` — how many reviews the external baseline is
worth. It ships at **2**, which is community-first: two reviews here already
carry as much weight as the imported number, and by ten reviews the baseline is
barely visible. Raise it to 5 or 20 if you'd rather scores stayed anchored to
the external source until a real crowd shows up.

Where the baselines come from:

| Media | Baseline source | Key needed | Coverage |
|-------|-----------------|-----------|----------|
| Movies | TMDB `vote_average` | TMDB (already required) | Near-total. Comes with the list payload, so **cards show scores too** |
| Books | Open Library ratings | No | Partial — popular titles yes, obscure ones often not. Also on cards |
| Games | RAWG rating + Metacritic | RAWG (free, optional) | Good, but **only if you add the key** |
| Music | MusicBrainz release-group rating | No | Sparse — many albums simply have no rating |

Two honest limitations:

- **iTunes and FreeToGame return no rating data whatsoever.** That's why games
  need RAWG and music falls back to MusicBrainz. Where no external rating
  exists the app shows `—`, never an invented number.
- **Music and game baselines are only fetched when you open an item**, not on
  the grid. RAWG needs a title match and MusicBrainz rate-limits to roughly one
  request per second — far too slow to enrich a whole page of cards.

## Tech Stack

- **Vanilla HTML/CSS/JS** — no build step, no framework
- [TMDB](https://www.themoviedb.org/settings/api) — movie catalogue + baseline ratings
- [Open Library](https://openlibrary.org/developers/api) — book catalogue + baseline ratings (no key)
- [iTunes Search](https://performance-partners.apple.com/search-api) — music catalogue (no key)
- [FreeToGame](https://www.freetogame.com/api-doc) — game catalogue (no key)
- [RAWG](https://rawg.io/apidocs) — game baseline ratings + Metacritic (free key, optional)
- [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) — music baseline ratings (no key)
- [Firebase](https://firebase.google.com/) — Auth (Email + Google) and Firestore

## Quick Start

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/omnirate.git
cd omnirate
```

### 2. Get your keys

**TMDB — required for the Movies tab**

1. https://www.themoviedb.org/settings/api
2. Create a free account, request an API key (Developer type)
3. Copy the **v3 auth** key

**RAWG — optional, adds baseline ratings to Games**

1. https://rawg.io/apidocs — sign up, the key is instant
2. Without it, games simply have no baseline until someone reviews them

Books and Music need no keys.

### 3. Configure

Open `js/config.js` and fill it in. This file is tracked in git — on a static
site there's no server to hold secrets, so committing client keys is the normal
approach (see [Notes](#notes)).

```js
const CONFIG = {
  tmdb: { apiKey: 'your-tmdb-key' },
  rawg: { apiKey: 'your-rawg-key' },   // optional
  firebase: { /* ... */ },
  admins: ['you@example.com'],          // who can see the Users directory
  baselineWeight: 2,
};
```

### 4. Run locally

```bash
python3 -m http.server 8000    # or: npx serve
```

Open http://localhost:8000.

> With no Firebase config the app runs in **demo mode** — accounts, ratings and
> saved lists live in that browser only. Google sign-in is unavailable in demo
> mode, since it needs Firebase.

### 5. Set up Firebase

1. [Firebase Console](https://console.firebase.google.com) → create a project
2. Add a Web App (the `</>` icon) → copy the config into `js/config.js`
3. **Authentication → Sign-in method** — enable **both**:
   - Email/Password
   - **Google** ← required for the Google sign-in button
4. **Firestore Database** → create one (production mode)
5. **Firestore → Rules** → paste in the contents of `firestore.rules` and publish
6. **Authentication → Settings → Authorized domains** — add `localhost` and your
   Pages domain (e.g. `yourname.github.io`). Miss this and the Google popup
   fails with `auth/unauthorized-domain`.

### 6. Become the owner

Add your email to `CONFIG.admins` in `js/config.js`:

```js
admins: ['you@example.com'],
```

Sign in with that address and a **Users** icon appears in the header. It lists
every account that has ever signed in — name, email, sign-in method, join date,
review counts per media type — and clicking a row opens that account's full
review history across all four media types.

### 7. Deploy to GitHub Pages

```bash
git add .
git commit -m "OmniRate"
git push origin main
```

Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)`.
Live at `https://YOUR_USERNAME.github.io/omnirate/` in a minute or two. Remember
to add that domain to Firebase's authorized domains.

## Project Structure

```
omnirate/
├── index.html               # Single page; all views live here
├── FEATURE_ANALYSIS.md      # Which features were built, which were cut, and why
├── firestore.rules          # Security rules for reviews / users / saved
├── .nojekyll                # Disables Jekyll on GitHub Pages
├── assets/
│   ├── logo.svg             # Full lockup (mark + wordmark)
│   ├── logo-mark.svg        # Mark alone
│   └── og-image.svg         # Social preview card
├── css/
│   ├── base.css             # Reset, design tokens, brand colours
│   ├── theme.css            # Per-tab colour themes
│   └── components.css       # All UI components
└── js/
    ├── config.example.js    # Config template with full setup notes
    ├── config.js            # Your actual config
    ├── firebase.js          # Firebase init + safe storage + demo mode
    ├── baseline.js          # External rating import + Bayesian blending
    ├── api.js               # The four catalogue APIs
    ├── auth.js              # Email + Google auth, users collection mirror
    ├── ratings.js           # Reviews storage, caching, averages, stats
    ├── saved.js             # Watchlist / reading list / listen later / play later
    ├── router.js            # Hash routing + share URLs
    ├── ui.js                # All DOM rendering
    └── app.js               # Orchestration, infinite scroll, view handling
```

## URLs

Every view has an address, so links and the Back button both work:

| URL | View |
|-----|------|
| `#/movies` | Browse a media tab (also `books`, `music`, `games`) |
| `#/movies/27205` | One item's detail modal — this is what Share copies |
| `#/saved` | Your saved lists |
| `#/activity` | Site-wide recent activity |
| `#/users` | Users directory (owner only) |
| `#/u/<uid>` | A user's profile and full review history |

## Data Model

Three Firestore collections:

| Collection | Doc ID | Read | Write |
|------------|--------|------|-------|
| `reviews` | `{mediaType}_{mediaId}_{uid}` | Public | Own only |
| `users` | `{uid}` | Signed-in | Own only |
| `saved` | `{uid}_{mediaType}_{mediaId}` | Own only | Own only |

`users` exists because Firebase Auth's user list **is not queryable from
client-side JavaScript** — the profile has to be mirrored into Firestore for the
app to list accounts at all. It's written on every sign-in.

## APIs Used

| Media | Catalogue API | Key | Rate limit |
|-------|---------------|-----|-----------|
| Movies | TMDB | Yes (free) | ~40 req/10s |
| Books | Open Library | No | ~100 req/min |
| Music | iTunes Search | No | ~20 req/min |
| Games | FreeToGame | No | Generous |
| — | RAWG (ratings only) | Optional (free) | ~20 req/s |
| — | MusicBrainz (ratings only) | No | **~1 req/s** |

## Notes

- **Client keys are visible.** Normal for Firebase config and TMDB/RAWG
  read-only keys. Firestore rules are what actually protect your data.
- **Emails in the users table are not truly private.** The rules restrict reads
  to signed-in accounts, and the UI hides emails from anyone outside
  `CONFIG.admins` — but any rule your browser can satisfy, another signed-in
  user's browser can satisfy too. The UI gate is convenience; the rules gate is
  the real boundary. Genuinely private emails would need a Cloud Function.
  Public profiles never show an email.
- **Reviews load in one query.** The whole `reviews` collection is fetched once
  and cached in memory (capped at 2000 docs), which is what makes card score
  badges, the activity feed and profiles instant. Fine for a hobby project; the
  first thing to change if it ever gets big.
- The iTunes Search API is region-locked (defaults to US) — change the country
  code in `js/api.js` if needed.
- Open Library covers are often missing; those books show a placeholder emoji.

## License

MIT — do whatever you want with it.
