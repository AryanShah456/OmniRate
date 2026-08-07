/* ============================================================
 * Saved Items — one system, four names
 * ============================================================
 * "Watchlist", "Reading list", "Listen later", "Play later" are the same
 * behaviour with different labels, so they share one Firestore collection
 * and one view. Deliberately NOT user-created named lists — that's a
 * different (and much larger) feature.
 *
 * Collection "saved":
 *   docId: `${uid}_${mediaType}_${mediaId}`
 *   { uid, mediaType, mediaId, mediaTitle, mediaPoster, mediaYear, addedAt }
 *
 * The current user's saved set is held in memory so the bookmark button on
 * every card can render its state synchronously.
 * ============================================================ */

const SAVED_LS_KEY = 'omnirate_saved';

const SAVED_LABELS = {
  movies: { verb: 'Watchlist', add: 'Add to Watchlist', remove: 'In Watchlist' },
  books:  { verb: 'Reading List', add: 'Add to Reading List', remove: 'In Reading List' },
  music:  { verb: 'Listen Later', add: 'Add to Listen Later', remove: 'In Listen Later' },
  games:  { verb: 'Play Later', add: 'Add to Play Later', remove: 'In Play Later' },
};

let _savedItems = [];                 // current user's saved records
let _savedKeys = new Set();           // `${mediaType}:${mediaId}` for O(1) lookups
let _savedLoadedFor = null;           // uid the cache belongs to

function saved_label(mediaType) {
  return SAVED_LABELS[mediaType] || { verb: 'Saved', add: 'Save', remove: 'Saved' };
}

function _key(mediaType, mediaId) { return `${mediaType}:${mediaId}`; }

function _ls_saved() {
  try { return JSON.parse(safeStorage.getItem(SAVED_LS_KEY) || '[]'); } catch { return []; }
}
function _ls_saveSaved(arr) {
  safeStorage.setItem(SAVED_LS_KEY, JSON.stringify(arr));
}

function _reindex() {
  _savedKeys = new Set(_savedItems.map(s => _key(s.mediaType, String(s.mediaId))));
}

/** Load (or reload) the signed-in user's saved items into memory. */
async function saved_load(force = false) {
  if (!auth_isSignedIn()) {
    _savedItems = []; _savedKeys = new Set(); _savedLoadedFor = null;
    return _savedItems;
  }
  const uid = auth_getCurrentUser().uid;
  if (!force && _savedLoadedFor === uid) return _savedItems;

  if (isFirebaseReady()) {
    try {
      const snap = await db.collection('saved').where('uid', '==', uid).get();
      _savedItems = snap.docs.map(d => d.data());
    } catch (e) {
      console.warn('[OmniRate] Could not load saved items:', e);
      _savedItems = [];
    }
  } else {
    _savedItems = _ls_saved().filter(s => s.uid === uid);
  }

  _savedLoadedFor = uid;
  _reindex();
  return _savedItems;
}

/** Synchronous — safe to call while rendering a grid. */
function saved_has(mediaType, mediaId) {
  return _savedKeys.has(_key(mediaType, String(mediaId)));
}

function saved_all() {
  return [..._savedItems].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

function saved_countFor(mediaType) {
  return _savedItems.filter(s => s.mediaType === mediaType).length;
}

function saved_count() { return _savedItems.length; }

/**
 * Toggle an item in/out of the saved list.
 * Returns the new state: true = now saved, false = now removed.
 */
async function saved_toggle(mediaType, item) {
  if (!auth_isSignedIn()) throw new Error('Not signed in');
  const uid = auth_getCurrentUser().uid;
  const mediaId = String(item.id);
  const docId = `${uid}_${mediaType}_${mediaId}`;
  const isSaved = saved_has(mediaType, mediaId);

  if (isSaved) {
    if (isFirebaseReady()) {
      await db.collection('saved').doc(docId).delete();
    } else {
      _ls_saveSaved(_ls_saved().filter(s => !(s.uid === uid && s.mediaType === mediaType && String(s.mediaId) === mediaId)));
    }
    _savedItems = _savedItems.filter(s => !(s.mediaType === mediaType && String(s.mediaId) === mediaId));
    _reindex();
    return false;
  }

  const record = {
    uid,
    mediaType,
    mediaId,
    mediaTitle: item.title || '',
    mediaPoster: item.poster || '',
    mediaYear: item.year || '',
    addedAt: Date.now(),
  };

  if (isFirebaseReady()) {
    await db.collection('saved').doc(docId).set(record);
  } else {
    const all = _ls_saved();
    all.push(record);
    _ls_saveSaved(all);
  }

  _savedItems.push(record);
  _reindex();
  return true;
}
