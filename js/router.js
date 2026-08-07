/* ============================================================
 * Hash Router — gives OmniRate real, shareable URLs
 * ============================================================
 * Before this, the whole app was one URL and modals had no address, so you
 * couldn't link to a film, bookmark one, or use the Back button to close a
 * dialog. Hash routing (rather than the History API) is deliberate: it works
 * on GitHub Pages with no server-side rewrite rules.
 *
 *   #/movies                 browse a media tab
 *   #/movies/27205           open one item's detail
 *   #/saved                  your saved lists
 *   #/activity               site-wide recent activity
 *   #/users                  users directory (owner only)
 *   #/u/<uid>                a user's profile
 * ============================================================ */

const MEDIA_KEYS = ['movies', 'books', 'music', 'games'];

let _routeCallback = null;
let _lastAppliedHash = null;
let _suppressNext = false;

/** Parse the current location.hash into a route descriptor. */
function router_parse() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean).map(decodeURIComponent);

  if (!parts.length) return { view: 'browse', media: null, id: null };

  const [head, ...rest] = parts;

  if (MEDIA_KEYS.includes(head)) {
    return { view: 'browse', media: head, id: rest[0] ? rest.join('/') : null };
  }
  if (head === 'saved') return { view: 'saved', media: null, id: null };
  if (head === 'activity') return { view: 'activity', media: null, id: null };
  if (head === 'users') return { view: 'users', media: null, id: null };
  if (head === 'u') return { view: 'profile', media: null, id: rest.join('/') || null };

  return { view: 'browse', media: null, id: null };
}

/** Build a hash string for a route. */
function router_path(view, media, id) {
  if (view === 'browse') {
    if (media && id != null) return `#/${media}/${encodeURIComponent(id)}`;
    if (media) return `#/${media}`;
    return '#/';
  }
  if (view === 'profile') return `#/u/${encodeURIComponent(id || '')}`;
  return `#/${view}`;
}

/**
 * Navigate. `silent` writes the URL without re-running the route handler —
 * used when the UI has *already* performed the navigation (e.g. a card click
 * opened the modal) and we only want the address bar to catch up.
 */
function router_go(view, media, id, { replace = false, silent = false } = {}) {
  const hash = router_path(view, media, id);
  if (hash === (location.hash || '#/')) return;
  if (silent) _suppressNext = true;
  _lastAppliedHash = silent ? hash : _lastAppliedHash;
  if (replace) {
    history.replaceState(null, '', hash);
    if (!silent) _handleChange();
  } else {
    location.hash = hash;
  }
}

/** Current absolute URL for an item — what the Share button copies. */
function router_shareUrl(mediaType, id) {
  return `${location.origin}${location.pathname}${router_path('browse', mediaType, id)}`;
}

function _handleChange() {
  if (_suppressNext) { _suppressNext = false; _lastAppliedHash = location.hash; return; }
  if (location.hash === _lastAppliedHash) return;
  _lastAppliedHash = location.hash;
  if (_routeCallback) _routeCallback(router_parse());
}

function router_init(callback) {
  _routeCallback = callback;
  window.addEventListener('hashchange', _handleChange);
  _lastAppliedHash = location.hash;
  callback(router_parse());
}
