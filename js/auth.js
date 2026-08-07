/* ============================================================
 * Authentication
 * ============================================================
 * Firebase Auth (Email/Password + Google) when configured,
 * localStorage pseudo-auth otherwise.
 *
 * Every successful sign-in also upserts a document into the "users"
 * collection. That collection is what the Users directory reads — Firebase
 * Auth's own user list isn't queryable from client-side JS, so the profile
 * has to be mirrored into Firestore for us to ever list it.
 * ============================================================ */

let currentUser = null;
let authCallbacks = [];

const USERS_LS_KEY = 'omnirate_users';

function auth_init() {
  if (isFirebaseReady()) {
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        currentUser = {
          uid: user.uid,
          email: user.email || '',
          name: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
          photoURL: user.photoURL || '',
          provider: _providerLabel(user),
        };
        // Fire and forget — a failed profile write must never block sign-in.
        _upsertUserProfile(currentUser).catch(e =>
          console.warn('[OmniRate] Could not save user profile:', e));
      } else {
        currentUser = null;
      }
      _notifyAuthChange();
    });
  } else {
    const saved = safeStorage.getItem('omnirate_user');
    if (saved) {
      try { currentUser = JSON.parse(saved); } catch { currentUser = null; }
    }
    _notifyAuthChange();
  }
}

function _providerLabel(user) {
  const ids = (user.providerData || []).map(p => p.providerId);
  if (ids.includes('google.com')) return 'Google';
  if (ids.includes('password')) return 'Email';
  return ids[0] || 'Unknown';
}

function auth_getCurrentUser() { return currentUser; }
function auth_isSignedIn() { return !!currentUser; }

/** Is the signed-in account listed in CONFIG.admins? Gates the Users directory. */
function auth_isAdmin() {
  if (!currentUser?.email) return false;
  const admins = (CONFIG?.admins || []).map(e => String(e).trim().toLowerCase()).filter(Boolean);
  if (!admins.length) return false;
  return admins.includes(currentUser.email.toLowerCase());
}

function auth_onAuthChange(callback) { authCallbacks.push(callback); }

function _notifyAuthChange() {
  authCallbacks.forEach(cb => { try { cb(currentUser); } catch (e) { console.warn(e); } });
}

/* ============================================================
 * Sign-in methods
 * ============================================================ */
async function auth_signIn(email, password) {
  if (isFirebaseReady()) {
    await auth.signInWithEmailAndPassword(email, password);
  } else {
    _demoSignIn(email, email.split('@')[0], 'Email');
  }
}

async function auth_signUp(email, password, name) {
  if (isFirebaseReady()) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    currentUser = {
      uid: cred.user.uid, email, name,
      photoURL: '', provider: 'Email',
    };
    await _upsertUserProfile(currentUser).catch(e => console.warn(e));
    _notifyAuthChange();
  } else {
    _demoSignIn(email, name || email.split('@')[0], 'Email');
  }
}

async function auth_signInWithGoogle() {
  if (!isFirebaseReady()) {
    throw new Error('Google sign-in needs Firebase. Add your Firebase config to js/config.js and enable Google in Authentication → Sign-in method.');
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  // Always show the account chooser rather than silently reusing a session —
  // less surprising when several Google accounts are signed in on one browser.
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    // Popups get blocked on plenty of mobile browsers; redirect is the fallback.
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await auth.signInWithRedirect(provider);
      return;
    }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
      return; // User backed out — not an error worth surfacing.
    }
    if (e.code === 'auth/unauthorized-domain') {
      throw new Error('This domain isn\'t authorised in Firebase. Add it under Authentication → Settings → Authorized domains.');
    }
    throw e;
  }
  // onAuthStateChanged handles the rest.
}

async function auth_signOut() {
  if (isFirebaseReady()) {
    await auth.signOut();
  } else {
    safeStorage.removeItem('omnirate_user');
    currentUser = null;
    _notifyAuthChange();
  }
}

/* --- Demo mode helper -------------------------------------------------- */
function _demoSignIn(email, name, provider) {
  currentUser = {
    uid: 'demo_' + btoa(email).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12),
    email,
    name,
    photoURL: '',
    provider,
  };
  safeStorage.setItem('omnirate_user', JSON.stringify(currentUser));
  _upsertUserProfile(currentUser);
  _notifyAuthChange();
}

/* ============================================================
 * users collection — mirror of the auth profile
 * ============================================================ */
async function _upsertUserProfile(user) {
  if (!user?.uid) return;
  const now = Date.now();

  if (isFirebaseReady()) {
    const ref = db.collection('users').doc(user.uid);
    // Only stamp createdAt the first time, so "joined" stays accurate.
    let isNew = true;
    try {
      const snap = await ref.get();
      isNew = !snap.exists;
    } catch { /* rules may block the read; assume new and merge */ }

    const payload = {
      uid: user.uid,
      name: user.name || '',
      email: user.email || '',
      photoURL: user.photoURL || '',
      provider: user.provider || '',
      lastSeenAt: now,
    };
    if (isNew) payload.createdAt = now;
    await ref.set(payload, { merge: true });
  } else {
    const all = _demoUsers();
    const i = all.findIndex(u => u.uid === user.uid);
    const payload = { ...user, lastSeenAt: now };
    if (i >= 0) {
      all[i] = { ...all[i], ...payload };
    } else {
      all.push({ ...payload, createdAt: now });
    }
    safeStorage.setItem(USERS_LS_KEY, JSON.stringify(all));
  }
}

function _demoUsers() {
  try { return JSON.parse(safeStorage.getItem(USERS_LS_KEY) || '[]'); } catch { return []; }
}

/** Every account that has ever signed in. Used by the Users directory. */
async function auth_getAllUsers() {
  if (isFirebaseReady()) {
    const snap = await db.collection('users').limit(1000).get();
    return snap.docs.map(d => d.data());
  }
  return _demoUsers();
}

/** One account's public-ish profile record. */
async function auth_getUserProfile(uid) {
  if (isFirebaseReady()) {
    try {
      const snap = await db.collection('users').doc(uid).get();
      return snap.exists ? snap.data() : null;
    } catch {
      return null;
    }
  }
  return _demoUsers().find(u => u.uid === uid) || null;
}
