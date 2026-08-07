/* ============================================================
 * App Orchestration
 * ============================================================
 * Ties together api.js, baseline.js, auth.js, ratings.js, saved.js,
 * router.js and ui.js.
 * ============================================================ */

const App = {
  state: {
    view: 'browse',
    media: 'movies',
    query: '',
    filters: {},
    page: 1,
    totalPages: 1,
    items: [],
    loading: false,
  },
  genreCache: {},
  _browseLoaded: false,
  _currentDetail: null,

  async init() {
    /* --- Auth ---
     * Register the listener BEFORE auth_init(): in demo mode auth_init
     * notifies synchronously, so a listener added afterwards would miss the
     * restored session and the saved-list cache would never warm up. */
    auth_onAuthChange((user) => this.onAuthChange(user));
    auth_init();
    if (!isFirebaseReady()) ui.showDemoBanner();
    ui.updateAuthUI(auth_getCurrentUser());

    this.wireEvents();
    this.initInfiniteScroll();

    /* Warm the review cache up front — card score badges, the activity feed
     * and the users directory all read from it. */
    ratings_loadAll().catch(e => console.warn('[OmniRate]', e));

    /* --- Routing drives everything from here --- */
    router_init((route) => this.handleRoute(route));
  },

  /* ============================================================
   * Event wiring
   * ============================================================ */
  wireEvents() {
    /* Tabs */
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => router_go('browse', btn.dataset.media));
    });

    /* Header nav */
    document.getElementById('nav-activity').addEventListener('click', () => router_go('activity'));
    document.getElementById('nav-saved').addEventListener('click', () => router_go('saved'));
    document.getElementById('nav-users').addEventListener('click', () => router_go('users'));
    document.getElementById('user-chip').addEventListener('click', () => {
      if (auth_isSignedIn()) router_go('profile', null, auth_getCurrentUser().uid);
    });

    /* Search */
    const searchInput = document.getElementById('search-input');
    document.getElementById('search-btn').addEventListener('click', () => this.handleSearch());
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.handleSearch(); });
    document.getElementById('clear-search').addEventListener('click', () => this.clearSearch());

    /* Filters */
    document.getElementById('filter-bar').addEventListener('change', (e) => {
      if (e.target.classList.contains('filter-select')) {
        this.handleFilterChange(e.target.dataset.filter, e.target.value);
      }
    });

    /* Delegated clicks */
    document.getElementById('results-grid').addEventListener('click', (e) => this.onGridClick(e));
    document.getElementById('panel-view').addEventListener('click', (e) => this.onPanelClick(e));
    document.getElementById('detail-content').addEventListener('click', (e) => this.onDetailClick(e));

    /* Modal close buttons */
    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => this.closeModal(el.dataset.close));
    });

    /* Auth modal */
    document.getElementById('auth-btn').addEventListener('click', () => ui.showAuthModal('signin'));
    document.getElementById('auth-toggle').addEventListener('click', (e) => {
      e.preventDefault();
      const mode = document.getElementById('auth-modal').dataset.mode;
      ui.showAuthModal(mode === 'signin' ? 'signup' : 'signin');
    });
    document.getElementById('auth-form').addEventListener('submit', (e) => this.handleAuthSubmit(e));
    document.getElementById('google-signin-btn').addEventListener('click', () => this.handleGoogleSignIn());
    document.getElementById('sign-out-btn').addEventListener('click', () => this.handleSignOut());

    /* ESC closes the topmost modal */
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!document.getElementById('auth-modal').classList.contains('hidden')) ui.closeAuthModal();
      else if (!document.getElementById('detail-modal').classList.contains('hidden')) this.closeModal('detail-modal');
    });
  },

  closeModal(id) {
    if (id === 'detail-modal') {
      ui.closeDetailModal();
      this._currentDetail = null;
      // Drop the item off the URL so the address bar matches what's on screen.
      if (this.state.view === 'browse') {
        router_go('browse', this.state.media, null, { silent: true });
      }
      return;
    }
    document.getElementById(id).classList.add('hidden');
    document.body.style.overflow = '';
  },

  /* ============================================================
   * Routing
   * ============================================================ */
  async handleRoute(route) {
    this.state.view = route.view;
    ui.setActiveNav(route.view);

    if (route.view !== 'browse') {
      ui.closeDetailModal();
      this._currentDetail = null;
      if (route.view === 'saved') return this.showSaved();
      if (route.view === 'activity') return this.showActivity();
      if (route.view === 'users') return this.showUsers();
      if (route.view === 'profile') return this.showProfile(route.id);
      return;
    }

    ui.showBrowse();
    const media = (route.media && MEDIA_TYPES[route.media]) ? route.media : this.state.media;

    if (!this._browseLoaded) {
      this.state.media = media;
      this.applyTabChrome(media);
      await this.loadTab();
      this._browseLoaded = true;
    } else if (media !== this.state.media) {
      await this.switchTab(media);
    }

    if (route.id) {
      await this.openDetail(route.id, media, { fromRoute: true });
    } else {
      ui.closeDetailModal();
      this._currentDetail = null;
    }
  },

  /* ============================================================
   * Browse
   * ============================================================ */
  applyTabChrome(mediaType) {
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.media === mediaType));
    document.body.setAttribute('data-media', mediaType);
    const input = document.getElementById('search-input');
    input.value = '';
    input.placeholder = `Search ${MEDIA_TYPES[mediaType].name.toLowerCase()}...`;
    document.getElementById('clear-search').classList.add('hidden');
  },

  async switchTab(mediaType) {
    if (!MEDIA_TYPES[mediaType]) return;

    this.applyTabChrome(mediaType);
    Object.assign(this.state, {
      media: mediaType, query: '', filters: {}, page: 1, totalPages: 1, items: [],
    });
    ui.setSectionTitle(`Newest ${MEDIA_TYPES[mediaType].name}`);
    ui.showLoading();
    ui.clearScrollStatus();
    await this.loadTab();
  },

  /** Genres + first page for the current tab. */
  async loadTab() {
    const media = this.state.media;
    if (MEDIA_TYPES[media].api.isConfigured()) await this.loadGenres(media);
    ui.renderFilters(media, this.genreCache[media]);
    await this.loadContent();
  },

  async loadGenres(mediaType) {
    if (this.genreCache[mediaType]) return;
    const api = MEDIA_TYPES[mediaType].api;
    try {
      if (api.getGenres) this.genreCache[mediaType] = await api.getGenres();
    } catch (e) {
      console.warn(`[OmniRate] Could not load genres for ${mediaType}:`, e);
      this.genreCache[mediaType] = [];
    }
  },

  async loadContent(append = false) {
    const { media, query, filters, page } = this.state;
    const api = MEDIA_TYPES[media].api;

    if (!api.isConfigured()) {
      ui.showConfigError(media);
      ui.clearScrollStatus();
      return;
    }

    this.state.loading = true;
    if (append) ui.showScrollLoading();
    else { ui.showLoading(); ui.clearScrollStatus(); }

    try {
      const result = query
        ? await api.search(query, page, filters)
        : await api.getNewest(page, filters);

      const fresh = result.items || [];

      /* Cache any baseline that arrived with the list payload so the detail
       * view doesn't refetch it. */
      fresh.forEach(i => baseline_prime(media, i.id, i.baseline));

      // Guard: a slow response for a tab the user has since left must not render.
      if (media !== this.state.media) return;

      if (append) {
        // De-dupe — several of these APIs happily return the same item twice
        // across page boundaries, which would double up cards.
        const seen = new Set(this.state.items.map(i => String(i.id)));
        const added = fresh.filter(i => !seen.has(String(i.id)));
        this.state.items = [...this.state.items, ...added];
        ui.renderCards(added, media, { append: true });
      } else {
        this.state.items = fresh;
        ui.renderCards(fresh, media);
      }

      this.state.totalPages = result.totalPages || 1;

      ui.setSectionTitle(
        query ? `Search: "${query}"` : `Newest ${MEDIA_TYPES[media].name}`,
        this.state.items.length
      );

      if (this.state.page >= this.state.totalPages || !this.state.items.length) {
        ui.showScrollEnd(this.state.items.length);
      } else {
        ui.clearScrollStatus();
      }
    } catch (e) {
      console.error('[OmniRate] Load error:', e);
      if (append) {
        this.state.page = Math.max(1, this.state.page - 1);
        ui.clearScrollStatus();
      } else {
        ui.showStatus(`Failed to load ${MEDIA_TYPES[media].name.toLowerCase()}. Check your connection or API key and try again.`);
      }
    } finally {
      this.state.loading = false;
    }
  },

  /* ============================================================
   * Infinite scroll (replaces the Load More button)
   * ============================================================ */
  initInfiniteScroll() {
    const sentinel = document.getElementById('scroll-sentinel');
    if (!('IntersectionObserver' in window)) {
      // Very old browser: fall back to a scroll listener.
      window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) this.maybeLoadMore();
      }, { passive: true });
      return;
    }
    // rootMargin starts the fetch before the sentinel is actually on screen,
    // so the next page is usually already there by the time you reach it.
    this._observer = new IntersectionObserver((entries) => {
      if (entries.some(en => en.isIntersecting)) this.maybeLoadMore();
    }, { rootMargin: '600px 0px' });
    this._observer.observe(sentinel);
  },

  maybeLoadMore() {
    const s = this.state;
    if (s.view !== 'browse' || s.loading || !s.items.length) return;
    if (s.page >= s.totalPages) return;
    s.page++;
    this.loadContent(true);
  },

  /* ============================================================
   * Search & filters
   * ============================================================ */
  handleSearch() {
    const input = document.getElementById('search-input');
    const query = input.value.trim();
    document.getElementById('clear-search').classList.toggle('hidden', !query);
    this.state.query = query;
    this.state.page = 1;
    this.state.items = [];
    this.loadContent();
  },

  clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('clear-search').classList.add('hidden');
    this.state.query = '';
    this.state.page = 1;
    this.state.items = [];
    ui.setSectionTitle(`Newest ${MEDIA_TYPES[this.state.media].name}`);
    this.loadContent();
  },

  handleFilterChange(filter, value) {
    if (value) this.state.filters[filter] = value;
    else delete this.state.filters[filter];
    this.state.page = 1;
    this.state.items = [];
    this.loadContent();
  },

  /* ============================================================
   * Delegated click handlers
   * ============================================================ */
  onGridClick(e) {
    const save = e.target.closest('.save-btn');
    if (save) { e.preventDefault(); return this.toggleSave(save); }
    const card = e.target.closest('.media-card');
    if (card) this.openDetail(card.dataset.id, card.dataset.media);
  },

  onPanelClick(e) {
    if (e.target.closest('#panel-sign-in')) return ui.showAuthModal('signin');

    const save = e.target.closest('.save-btn');
    if (save) { e.preventDefault(); return this.toggleSave(save); }

    const prof = e.target.closest('[data-profile-uid]');
    if (prof) return router_go('profile', null, prof.dataset.profileUid);

    const card = e.target.closest('.media-card, .my-review-card, .activity-row');
    if (card) {
      const mt = card.dataset.media || card.dataset.mediaType;
      const id = card.dataset.id || card.dataset.mediaId;
      if (mt && id) this.openDetail(id, mt);
    }
  },

  onDetailClick(e) {
    if (e.target.closest('#prompt-sign-in')) return ui.showAuthModal('signin');
    if (e.target.closest('#submit-review')) return this.handleSubmitReview();
    if (e.target.closest('#delete-review') || e.target.closest('.comment-delete-btn')) return this.handleDeleteReview();
    if (e.target.closest('#detail-save')) return this.toggleSaveDetail();
    if (e.target.closest('#detail-share')) return this.shareCurrent();

    const prof = e.target.closest('[data-profile-uid]');
    if (prof) {
      this.closeModal('detail-modal');
      router_go('profile', null, prof.dataset.profileUid);
    }
  },

  /* ============================================================
   * Saved items
   * ============================================================ */
  async toggleSave(btn) {
    if (!auth_isSignedIn()) return ui.showAuthModal('signin');

    const mediaType = btn.dataset.saveMedia;
    const id = btn.dataset.saveId;
    const item = this.itemFor(mediaType, id, btn.closest('.media-card'));

    btn.disabled = true;
    try {
      const nowSaved = await saved_toggle(mediaType, item);
      ui.refreshSaveButtons();
      ui.updateSavedCount();
      ui.refreshDetailSave(mediaType, id);
      ui.toast(nowSaved
        ? `Added to ${saved_label(mediaType).verb}`
        : `Removed from ${saved_label(mediaType).verb}`);
      if (this.state.view === 'saved') this.showSaved();
    } catch (err) {
      console.error('[OmniRate] Save failed:', err);
      ui.toast('Could not update your list: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  },

  async toggleSaveDetail() {
    if (!auth_isSignedIn()) return ui.showAuthModal('signin');
    if (!this._currentDetail) return;
    const { detail, mediaType } = this._currentDetail;
    const btn = document.getElementById('detail-save');
    if (btn) btn.disabled = true;
    try {
      const nowSaved = await saved_toggle(mediaType, detail);
      ui.refreshDetailSave(mediaType, detail.id);
      ui.refreshSaveButtons();
      ui.updateSavedCount();
      ui.toast(nowSaved
        ? `Added to ${saved_label(mediaType).verb}`
        : `Removed from ${saved_label(mediaType).verb}`);
    } catch (err) {
      ui.toast('Could not update your list: ' + err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  /** Best available item record for an id — state, then the card's own DOM. */
  itemFor(mediaType, id, cardEl) {
    if (this.state.media === mediaType) {
      const hit = this.state.items.find(i => String(i.id) === String(id));
      if (hit) return hit;
    }
    if (this._currentDetail && this._currentDetail.mediaType === mediaType
        && String(this._currentDetail.detail.id) === String(id)) {
      return this._currentDetail.detail;
    }
    if (cardEl) {
      return {
        id,
        title: cardEl.querySelector('.media-title')?.textContent || '',
        poster: cardEl.querySelector('img.media-poster')?.getAttribute('src') || '',
        year: cardEl.querySelector('.media-meta span')?.textContent || '',
      };
    }
    return { id, title: '', poster: '', year: '' };
  },

  /* ============================================================
   * Sharing
   * ============================================================ */
  async shareCurrent() {
    if (!this._currentDetail) return;
    const { detail, mediaType } = this._currentDetail;
    const url = router_shareUrl(mediaType, detail.id);
    const title = `${detail.title} on OmniRate`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // user dismissed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      ui.toast('Link copied to clipboard');
    } catch {
      ui.toast(url);
    }
  },

  /* ============================================================
   * Auth
   * ============================================================ */
  async handleAuthSubmit(e) {
    e.preventDefault();
    const mode = document.getElementById('auth-modal').dataset.mode || 'signin';
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim();
    const errorEl = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit');

    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Please wait...';

    try {
      if (mode === 'signup') await auth_signUp(email, password, name);
      else await auth_signIn(email, password);
      ui.closeAuthModal();
    } catch (err) {
      errorEl.textContent = this.authErrorMessage(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'signup' ? 'Sign Up' : 'Sign In';
    }
  },

  async handleGoogleSignIn() {
    const btn = document.getElementById('google-signin-btn');
    const errorEl = document.getElementById('google-error');
    errorEl.textContent = '';
    btn.disabled = true;

    try {
      await auth_signInWithGoogle();
      ui.closeAuthModal();
    } catch (err) {
      errorEl.textContent = this.authErrorMessage(err);
    } finally {
      btn.disabled = false;
    }
  },

  authErrorMessage(err) {
    const map = {
      'auth/invalid-credential': 'That email and password combination didn\'t work.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/user-not-found': 'No account with that email — try signing up.',
      'auth/email-already-in-use': 'That email already has an account. Try signing in.',
      'auth/weak-password': 'Password needs to be at least 6 characters.',
      'auth/invalid-email': 'That doesn\'t look like a valid email address.',
      'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
      'auth/network-request-failed': 'Network problem — check your connection.',
    };
    return map[err?.code] || err?.message || 'Authentication failed. Please try again.';
  },

  async handleSignOut() {
    await auth_signOut();
    ui.toast('Signed out');
    if (this.state.view === 'saved' || this.state.view === 'users') {
      router_go('browse', this.state.media);
    }
  },

  async onAuthChange(user) {
    ui.updateAuthUI(user);
    await saved_load(true);
    ui.updateSavedCount();
    ui.refreshSaveButtons();

    // Re-render whatever's on screen now that identity changed.
    if (this.state.view === 'saved') this.showSaved();
    else if (this.state.view === 'users') this.showUsers();
    else if (this.state.view === 'browse' && this._currentDetail) this.refreshDetail();
  },

  /* ============================================================
   * Detail modal
   * ============================================================ */
  async openDetail(id, mediaType, { fromRoute = false } = {}) {
    if (!MEDIA_TYPES[mediaType]) return;
    const api = MEDIA_TYPES[mediaType].api;

    if (!fromRoute) {
      // Give the modal its own URL + history entry, so Back closes it.
      router_go('browse', mediaType, id, { silent: true });
    }

    ui.showDetailLoading();

    try {
      const [detail, reviews] = await Promise.all([
        api.getDetails(id),
        ratings_getReviews(mediaType, id),
      ]);

      const baseline = await baseline_fetch(mediaType, detail);
      baseline_prime(mediaType, id, baseline);

      const userReview = auth_isSignedIn()
        ? reviews.find(r => r.uid === auth_getCurrentUser().uid) || null
        : null;

      this._currentDetail = { detail, mediaType, id: String(id), baseline };
      ui.renderDetail(detail, mediaType, reviews, userReview, baseline);

      // Now that a baseline is known, the grid card can show a real score.
      ui.refreshCard(id, mediaType, { id, baseline });
    } catch (e) {
      console.error('[OmniRate] Detail error:', e);
      document.getElementById('detail-content').innerHTML = `
        <div class="detail-loading" style="padding: var(--space-16);">
          <p>Failed to load details. Please try again.</p>
          <p style="font-size: var(--text-xs); color: var(--theme-text-faint);">${ui._esc(e.message)}</p>
        </div>`;
    }
  },

  /** Re-render the open detail modal from fresh review data. */
  async refreshDetail() {
    if (!this._currentDetail) return;
    const { detail, mediaType, id, baseline } = this._currentDetail;
    const reviews = await ratings_getReviews(mediaType, id);
    const userReview = auth_isSignedIn()
      ? reviews.find(r => r.uid === auth_getCurrentUser().uid) || null
      : null;
    ui.renderDetail(detail, mediaType, reviews, userReview, baseline);
    ui.refreshCard(id, mediaType, { id, baseline });
  },

  async handleSubmitReview() {
    if (!auth_isSignedIn()) return ui.showAuthModal('signin');
    if (!this._currentDetail) return;

    const { detail, mediaType } = this._currentDetail;
    const cfg = MEDIA_TYPES[mediaType];

    const scores = {};
    cfg.ratingCategories.forEach(cat => {
      const slider = document.querySelector(`.slider-input[data-cat="${cat.key}"]`);
      if (slider) scores[cat.key] = parseInt(slider.value, 10);
    });
    const comment = document.getElementById('review-comment')?.value.trim() || '';

    const btn = document.getElementById('submit-review');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      await ratings_saveReview(mediaType, detail, scores, comment);
      await this.refreshDetail();
      ui.toast('Review saved');
    } catch (e) {
      console.error('[OmniRate] Review save error:', e);
      ui.toast('Failed to save review: ' + e.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Review';
    }
  },

  async handleDeleteReview() {
    if (!auth_isSignedIn()) return ui.showAuthModal('signin');
    if (!this._currentDetail) return;
    if (!confirm('Delete your review? This cannot be undone.')) return;

    const { mediaType, id } = this._currentDetail;
    try {
      await ratings_deleteReview(mediaType, id);
      await this.refreshDetail();
      ui.toast('Review deleted');
    } catch (e) {
      console.error('[OmniRate] Review delete error:', e);
      ui.toast('Failed to delete review: ' + e.message, 'error');
    }
  },

  /* ============================================================
   * Panel views
   * ============================================================ */
  async showSaved() {
    if (!auth_isSignedIn()) {
      return ui.showPanel(`
        <div class="panel-header"><h2 class="section-title">Saved</h2></div>
        <div class="empty-state">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          <p class="empty-title">Sign in to keep lists</p>
          <p class="empty-sub">Your watchlist, reading list, listen-later and play-later piles all live here.</p>
          <button id="panel-sign-in" class="btn btn-primary">Sign In</button>
        </div>`);
    }
    ui.panelLoading('Saved');
    await Promise.all([saved_load(), ratings_loadAll()]);
    ui.renderSavedView(saved_all());
  },

  async showActivity() {
    ui.panelLoading('Recent Activity');
    try {
      const reviews = await ratings_getRecentActivity(40);
      ui.renderActivityView(reviews);
    } catch (e) {
      ui.panelError('Recent Activity', e.message);
    }
  },

  async showUsers() {
    if (!auth_isSignedIn()) {
      return ui.showPanel(`
        <div class="panel-header"><h2 class="section-title">Users</h2></div>
        <div class="empty-state">
          <p class="empty-title">Sign in to view the directory</p>
          <p class="empty-sub">Account records are only readable by signed-in users, and email addresses only by the site owner.</p>
          <button id="panel-sign-in" class="btn btn-primary">Sign In</button>
        </div>`);
    }

    const isAdmin = auth_isAdmin();
    ui.panelLoading(isAdmin ? 'Users' : 'Community');
    try {
      const [users, stats] = await Promise.all([auth_getAllUsers(), ratings_getStatsByUid()]);
      ui.renderUsersView(users, stats, { isAdmin });
    } catch (e) {
      console.error('[OmniRate] Users load error:', e);
      ui.panelError('Users',
        'Could not read the users collection. If Firebase is configured, deploy the firestore.rules from this repo — the users collection must be readable by signed-in accounts.');
    }
  },

  async showProfile(uid) {
    if (!uid) return router_go('browse', this.state.media, null, { replace: true });
    ui.panelLoading('Profile');
    try {
      const [profile, reviews] = await Promise.all([
        auth_getUserProfile(uid),
        ratings_getReviewsByUid(uid),
      ]);
      const resolved = profile || {
        uid,
        name: reviews[0]?.userName || 'Unknown user',
        photoURL: reviews[0]?.userPhoto || '',
      };
      if (auth_isSignedIn() && auth_getCurrentUser().uid === uid) await saved_load();
      ui.renderProfileView(resolved, reviews, saved_count());
    } catch (e) {
      console.error('[OmniRate] Profile load error:', e);
      ui.panelError('Profile', e.message);
    }
  },
};

/* --- Boot --- */
document.addEventListener('DOMContentLoaded', () => App.init());
