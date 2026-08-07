/* ============================================================
 * Ratings & Reviews Storage
 * ============================================================
 * Firestore when Firebase is configured, localStorage otherwise.
 *
 * Data model (single collection "reviews"):
 *   docId: `${mediaType}_${mediaId}_${uid}`
 *   { mediaType, mediaId, uid, userName, userPhoto, mediaTitle, mediaPoster,
 *     mediaYear, scores: { cast: 8, ... }, comment, createdAt, updatedAt }
 *
 * Caching strategy — deliberate, and worth explaining:
 * OmniRate is a small project, so the entire reviews collection is loaded
 * ONCE into memory (capped at REVIEW_LOAD_LIMIT). Card score badges, the
 * activity feed, profiles and the users directory then all read from that
 * one array instead of firing a query each. At a few hundred reviews this
 * is a single cheap read; if the collection ever got genuinely large this
 * is the first thing that would need to change.
 * ============================================================ */

const REVIEWS_LS_KEY = 'omnirate_reviews';
const REVIEW_LOAD_LIMIT = 2000;

let _allReviews = [];
let _allReviewsLoaded = false;
let _allReviewsPromise = null;

// --- Storage helpers (demo mode) ---
function _ls_getAll() {
  try { return JSON.parse(safeStorage.getItem(REVIEWS_LS_KEY) || '[]'); } catch { return []; }
}
function _ls_saveAll(arr) {
  safeStorage.setItem(REVIEWS_LS_KEY, JSON.stringify(arr));
}

/* ============================================================
 * Whole-collection load (the backbone of everything below)
 * ============================================================ */
async function ratings_loadAll(force = false) {
  if (force) { _allReviewsLoaded = false; _allReviewsPromise = null; }
  if (_allReviewsLoaded) return _allReviews;
  if (_allReviewsPromise) return _allReviewsPromise;

  _allReviewsPromise = (async () => {
    if (isFirebaseReady()) {
      try {
        const snap = await db.collection('reviews').limit(REVIEW_LOAD_LIMIT).get();
        _allReviews = snap.docs.map(d => d.data());
      } catch (e) {
        console.warn('[OmniRate] Could not load reviews collection:', e);
        _allReviews = [];
      }
    } else {
      _allReviews = _ls_getAll();
    }
    _allReviewsLoaded = true;
    _allReviewsPromise = null;
    return _allReviews;
  })();

  return _allReviewsPromise;
}

/** Synchronous peek at whatever is already cached. */
function ratings_cached() { return _allReviews; }
function ratings_isLoaded() { return _allReviewsLoaded; }

function _cacheUpsert(review) {
  const i = _allReviews.findIndex(r =>
    r.uid === review.uid && r.mediaType === review.mediaType && String(r.mediaId) === String(review.mediaId));
  if (i >= 0) _allReviews[i] = review; else _allReviews.push(review);
}

function _cacheRemove(mediaType, mediaId, uid) {
  _allReviews = _allReviews.filter(r =>
    !(r.uid === uid && r.mediaType === mediaType && String(r.mediaId) === String(mediaId)));
}

/* ============================================================
 * Write path
 * ============================================================ */
async function ratings_saveReview(mediaType, mediaItem, scores, comment) {
  if (!auth_isSignedIn()) throw new Error('Not signed in');
  const user = auth_getCurrentUser();
  const docId = `${mediaType}_${mediaItem.id}_${user.uid}`;
  const now = Date.now();

  // Preserve the original createdAt when updating an existing review.
  const existing = _allReviews.find(r =>
    r.uid === user.uid && r.mediaType === mediaType && String(r.mediaId) === String(mediaItem.id));

  const review = {
    mediaType,
    mediaId: String(mediaItem.id),
    uid: user.uid,
    userName: user.name,
    userPhoto: user.photoURL || '',
    mediaTitle: mediaItem.title,
    mediaPoster: mediaItem.poster || '',
    mediaYear: mediaItem.year || '',
    scores,
    comment: comment || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (isFirebaseReady()) {
    await db.collection('reviews').doc(docId).set(review, { merge: true });
  } else {
    const all = _ls_getAll();
    const idx = all.findIndex(r => r.mediaType === mediaType && r.mediaId === String(mediaItem.id) && r.uid === user.uid);
    if (idx >= 0) { review.createdAt = all[idx].createdAt; all[idx] = review; }
    else { all.push(review); }
    _ls_saveAll(all);
  }

  _cacheUpsert(review);
  return review;
}

async function ratings_deleteReview(mediaType, mediaId) {
  if (!auth_isSignedIn()) throw new Error('Not signed in');
  const user = auth_getCurrentUser();
  const docId = `${mediaType}_${mediaId}_${user.uid}`;

  if (isFirebaseReady()) {
    await db.collection('reviews').doc(docId).delete();
  } else {
    const all = _ls_getAll();
    _ls_saveAll(all.filter(r => !(r.mediaType === mediaType && r.mediaId === String(mediaId) && r.uid === user.uid)));
  }

  _cacheRemove(mediaType, String(mediaId), user.uid);
}

/* ============================================================
 * Read path
 * ============================================================ */
async function ratings_getReviews(mediaType, mediaId) {
  const id = String(mediaId);
  await ratings_loadAll();
  if (_allReviewsLoaded) {
    return _allReviews.filter(r => r.mediaType === mediaType && String(r.mediaId) === id);
  }
  // Fallback: targeted query if the bulk load failed.
  if (isFirebaseReady()) {
    const snap = await db.collection('reviews')
      .where('mediaType', '==', mediaType)
      .where('mediaId', '==', id)
      .get();
    return snap.docs.map(d => d.data());
  }
  return _ls_getAll().filter(r => r.mediaType === mediaType && r.mediaId === id);
}

/** Synchronous — for card badges, where we can't await per item. */
function ratings_getReviewsSync(mediaType, mediaId) {
  const id = String(mediaId);
  return _allReviews.filter(r => r.mediaType === mediaType && String(r.mediaId) === id);
}

async function ratings_getUserReview(mediaType, mediaId) {
  if (!auth_isSignedIn()) return null;
  const user = auth_getCurrentUser();
  const reviews = await ratings_getReviews(mediaType, mediaId);
  return reviews.find(r => r.uid === user.uid) || null;
}

async function ratings_getUserReviews() {
  if (!auth_isSignedIn()) return [];
  return ratings_getReviewsByUid(auth_getCurrentUser().uid);
}

async function ratings_getReviewsByUid(uid) {
  await ratings_loadAll();
  if (_allReviewsLoaded) return _allReviews.filter(r => r.uid === uid);
  if (isFirebaseReady()) {
    const snap = await db.collection('reviews').where('uid', '==', uid).get();
    return snap.docs.map(d => d.data());
  }
  return _ls_getAll().filter(r => r.uid === uid);
}

/** Newest reviews across the whole site — powers the activity feed. */
async function ratings_getRecentActivity(limit = 40) {
  await ratings_loadAll();
  return [..._allReviews]
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
    .slice(0, limit);
}

/** uid → { total, byMedia: { movies: n, ... }, lastActive } */
async function ratings_getStatsByUid() {
  await ratings_loadAll();
  const stats = {};
  _allReviews.forEach(r => {
    if (!stats[r.uid]) {
      stats[r.uid] = { total: 0, byMedia: { movies: 0, books: 0, music: 0, games: 0 }, lastActive: 0, userName: r.userName };
    }
    const s = stats[r.uid];
    s.total++;
    if (s.byMedia[r.mediaType] != null) s.byMedia[r.mediaType]++;
    const ts = r.updatedAt || r.createdAt || 0;
    if (ts > s.lastActive) s.lastActive = ts;
    if (r.userName) s.userName = r.userName;
  });
  return stats;
}

/* ============================================================
 * Averages
 * ============================================================
 * Returns per-category averages AND per-category counts — the counts are
 * what let baseline_blend() weight each category correctly when different
 * reviewers skipped different categories.
 * ============================================================ */
function ratings_computeAverages(reviews, categories) {
  if (!reviews || !reviews.length) return null;
  const sums = {};
  const counts = {};
  categories.forEach(c => { sums[c.key] = 0; counts[c.key] = 0; });

  reviews.forEach(r => {
    categories.forEach(c => {
      if (r.scores && r.scores[c.key] != null) {
        sums[c.key] += r.scores[c.key];
        counts[c.key]++;
      }
    });
  });

  const averages = {};
  let totalSum = 0, totalCount = 0;
  categories.forEach(c => {
    averages[c.key] = counts[c.key] > 0 ? (sums[c.key] / counts[c.key]) : 0;
    if (counts[c.key] > 0) { totalSum += averages[c.key]; totalCount++; }
  });

  const overall = totalCount > 0 ? (totalSum / totalCount) : 0;
  return { averages, counts, overall, count: reviews.length };
}

/** Mean of one reviewer's own category scores, on 0-10. */
function ratings_reviewAverage(review, categories) {
  if (!review?.scores) return 0;
  const cats = (categories || []).filter(c => review.scores[c.key] != null);
  if (!cats.length) {
    // Categories unknown (e.g. rendering a review for a media type config
    // we don't have handy) — fall back to averaging whatever is there.
    const vals = Object.values(review.scores).filter(v => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  return cats.reduce((s, c) => s + review.scores[c.key], 0) / cats.length;
}

function ratings_getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ratings_formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ratings_computeAverages, ratings_getInitials, ratings_formatDate };
}
