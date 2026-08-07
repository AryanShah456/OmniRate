/* ============================================================
 * OmniRate Configuration
 * ============================================================
 * Copy this file to js/config.js and fill in your keys.
 *
 * 1. TMDB API Key — REQUIRED for the Movies tab
 *    https://www.themoviedb.org/settings/api
 *    → Request an API key ("Developer" type), paste the v3 auth key below.
 *    → Also supplies the baseline rating for every movie.
 *
 * 2. Firebase — REQUIRED for accounts, shared ratings, saved lists
 *    https://console.firebase.google.com
 *    → Create a project → add a Web App (</> icon) → copy the config values.
 *    → Authentication > Sign-in method: enable BOTH
 *         • Email/Password
 *         • Google          ← needed for the Google sign-in button
 *    → Firestore Database: create one (start in test mode, then deploy
 *      firestore.rules from this repo).
 *    → Authentication > Settings > Authorized domains: add your GitHub Pages
 *      domain (e.g. yourname.github.io), otherwise the Google popup is blocked.
 *
 * 3. RAWG API Key — OPTIONAL, adds baseline ratings + Metacritic to Games
 *    https://rawg.io/apidocs  (free, instant)
 *    Without it, games simply have no baseline rating until someone reviews them.
 *
 * No key needed: Books (Open Library), Music (iTunes + MusicBrainz),
 * game catalogue (FreeToGame).
 * ============================================================ */

const CONFIG = {
  tmdb: {
    apiKey: '', // ← Your TMDB API key here
  },

  rawg: {
    apiKey: '', // ← Optional. Baseline ratings + Metacritic for games.
  },

  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },

  /* --- Owner access -----------------------------------------------------
   * Emails listed here can open the Users directory (names + emails +
   * review counts). Everyone else only ever sees public profiles, which
   * never include an email address. Case-insensitive.
   *   admins: ['you@example.com'],
   * ------------------------------------------------------------------- */
  admins: [],

  /* --- Score blending --------------------------------------------------
   * The external baseline rating is treated as if it were this many
   * community reviews. Lower = community opinion takes over faster.
   *   2  → community-first: a couple of reviews clearly move the score
   *   5  → balanced
   *   20 → anchored: score stays near the external source until a crowd shows up
   * ------------------------------------------------------------------- */
  baselineWeight: 2,
};
