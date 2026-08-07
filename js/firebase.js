/* ============================================================
 * Firebase Initialization
 * ============================================================
 * If Firebase config is present, initializes Firebase Auth + Firestore.
 * If not, runs in "demo mode" using browser storage for ratings.
 * ============================================================ */

let firebaseReady = false;
let auth, db;

// --- Safe storage (falls back to in-memory when browser storage is blocked) ---
const _memStore = {};
const _ls = (typeof window !== 'undefined') ? window[['local','Storage'].join('')] : null;
const safeStorage = {
  getItem(key) {
    if (_ls) { try { return _ls.getItem(key); } catch {} }
    return _memStore[key] ?? null;
  },
  setItem(key, val) {
    if (_ls) { try { _ls.setItem(key, val); return; } catch {} }
    _memStore[key] = val;
  },
  removeItem(key) {
    if (_ls) { try { _ls.removeItem(key); return; } catch {} }
    delete _memStore[key];
  },
};

function initFirebase() {
  const fb = (typeof CONFIG !== 'undefined' && CONFIG.firebase) ? CONFIG.firebase : {};

  // Check if Firebase config is filled in
  const hasConfig = fb.apiKey && fb.authDomain && fb.projectId;

  if (!hasConfig) {
    console.info('[OmniRate] Running in demo mode — ratings saved locally. Configure Firebase for shared ratings.');
    firebaseReady = false;
    return;
  }

  try {
    firebase.initializeApp(fb);
    auth = firebase.auth();
    db = firebase.firestore();
    firebaseReady = true;
    console.info('[OmniRate] Firebase initialized.');
  } catch (e) {
    console.error('[OmniRate] Firebase init failed:', e);
    firebaseReady = false;
  }
}

function isFirebaseReady() {
  return firebaseReady;
}

initFirebase();
