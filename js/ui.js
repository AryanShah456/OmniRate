/* ============================================================
 * UI Rendering
 * ============================================================
 * All DOM manipulation lives here. Functions are called by app.js.
 * ============================================================ */

const ui = {

  /* ============================================================
   * Score helpers
   * ============================================================ */

  /** Blended score for one item, from cached reviews + whatever baseline we have. */
  scoreFor(item, mediaType) {
    const cats = MEDIA_TYPES[mediaType].ratingCategories;
    const community = ratings_computeAverages(ratings_getReviewsSync(mediaType, item.id), cats);
    const base = item.baseline || baseline_peek(mediaType, item.id);
    return baseline_blend(base, community, cats);
  },

  /** Small score chip used on cards and in lists. */
  scoreBadge(blend, mediaType) {
    if (!blend || blend.score == null) {
      return `<div class="rating-badge no-rating" title="No rating yet">
        <span class="rb-score">—</span><span class="rb-meta">Not rated</span></div>`;
    }
    const cls = baseline_scoreClass(blend.score);
    let meta, title;
    if (blend.hasCommunity && blend.hasBaseline) {
      meta = `${blend.reviewCount} review${blend.reviewCount > 1 ? 's' : ''}`;
      title = `${blend.score.toFixed(1)} — ${blend.reviewCount} OmniRate review${blend.reviewCount > 1 ? 's' : ''} blended with ${blend.baseline.value.toFixed(1)} from ${blend.baseline.sourceLabel}`;
    } else if (blend.hasCommunity) {
      meta = `${blend.reviewCount} review${blend.reviewCount > 1 ? 's' : ''}`;
      title = `${blend.score.toFixed(1)} from ${blend.reviewCount} OmniRate review${blend.reviewCount > 1 ? 's' : ''}`;
    } else {
      meta = blend.baseline.sourceLabel;
      title = `Baseline ${blend.score.toFixed(1)} from ${blend.baseline.sourceLabel}. No OmniRate reviews yet.`;
    }
    return `<div class="rating-badge has-rating ${cls}" title="${ui._esc(title)}">
      <span class="rb-score">${blend.score.toFixed(1)}</span>
      <span class="rb-meta">${ui._esc(meta)}</span></div>`;
  },

  /* ============================================================
   * Cards
   * ============================================================ */
  renderCards(items, mediaType, { append = false } = {}) {
    const grid = document.getElementById('results-grid');
    if (!items.length && !append) {
      grid.innerHTML = '';
      ui.showStatus('No results found. Try a different search or filter.');
      return;
    }
    const html = items.map(item => ui._cardHTML(item, mediaType)).join('');
    if (append) grid.insertAdjacentHTML('beforeend', html);
    else grid.innerHTML = html;
    ui.clearStatus();
  },

  _cardHTML(item, mediaType) {
    const cfg = MEDIA_TYPES[mediaType];
    const blend = ui.scoreFor(item, mediaType);
    const isSaved = auth_isSignedIn() && saved_has(mediaType, item.id);
    const labels = saved_label(mediaType);

    return `
      <div class="media-card" data-id="${ui._esc(item.id)}" data-media="${mediaType}">
        <div class="media-poster-wrap">
          ${item.poster
            ? `<img class="media-poster" src="${ui._esc(item.poster)}" alt="${ui._esc(item.title)}" loading="lazy" referrerpolicy="no-referrer" />`
            : `<div class="media-poster-placeholder">${cfg.placeholderEmoji}</div>`}
          <button class="save-btn ${isSaved ? 'is-saved' : ''}"
                  data-save-id="${ui._esc(item.id)}" data-save-media="${mediaType}"
                  title="${ui._esc(isSaved ? labels.remove : labels.add)}"
                  aria-label="${ui._esc(isSaved ? labels.remove : labels.add)}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>
        <div class="media-info">
          <div class="media-title">${ui._esc(item.title)}</div>
          <div class="media-meta">
            ${item.year ? `<span>${ui._esc(item.year)}</span>` : ''}
            ${item.year && item.genre ? '<span class="media-meta-dot"></span>' : ''}
            ${item.genre ? `<span>${ui._esc(item.genre)}</span>` : ''}
          </div>
          ${ui.scoreBadge(blend, mediaType)}
        </div>
      </div>`;
  },

  /** Refresh just one card's badge + save state without re-rendering the grid. */
  refreshCard(mediaId, mediaType, item) {
    const card = document.querySelector(`.media-card[data-media="${mediaType}"][data-id="${CSS.escape(String(mediaId))}"]`);
    if (!card) return;
    const blend = ui.scoreFor(item || { id: mediaId }, mediaType);
    const badge = card.querySelector('.rating-badge');
    if (badge) badge.outerHTML = ui.scoreBadge(blend, mediaType);
    ui.refreshSaveButtons();
  },

  /** Sync every visible bookmark button with the in-memory saved set. */
  refreshSaveButtons() {
    document.querySelectorAll('.save-btn[data-save-id]').forEach(btn => {
      const mediaType = btn.dataset.saveMedia;
      const id = btn.dataset.saveId;
      const isSaved = auth_isSignedIn() && saved_has(mediaType, id);
      const labels = saved_label(mediaType);
      btn.classList.toggle('is-saved', isSaved);
      btn.title = isSaved ? labels.remove : labels.add;
      btn.setAttribute('aria-label', btn.title);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isSaved ? 'currentColor' : 'none');
    });
  },

  /* ============================================================
   * Status / Loading
   * ============================================================ */
  showStatus(msg, isHTML = false) {
    const el = document.getElementById('status-msg');
    document.getElementById('results-grid').innerHTML = '';
    el.innerHTML = isHTML ? msg : `<p>${ui._esc(msg)}</p>`;
  },

  showConfigError(mediaType) {
    const cfg = MEDIA_TYPES[mediaType];
    document.getElementById('results-grid').innerHTML = '';
    document.getElementById('status-msg').innerHTML = `
      <p style="font-size:3rem;margin-bottom:var(--space-4)">${cfg.placeholderEmoji}</p>
      <p>To browse ${cfg.name.toLowerCase()}, you need a free TMDB API key.</p>
      <div class="config-hint">
        <p>1. Get a free API key at <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org/settings/api</a></p>
        <p>2. Open <code>js/config.js</code></p>
        <p>3. Add your key: <code>CONFIG.tmdb.apiKey = 'your-key-here'</code></p>
        <p>4. Refresh this page</p>
      </div>`;
  },

  showLoading() {
    document.getElementById('results-grid').innerHTML = '';
    document.getElementById('status-msg').innerHTML = `
      <div class="detail-loading" style="padding: var(--space-16);">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>`;
  },

  clearStatus() { document.getElementById('status-msg').innerHTML = ''; },

  /* --- Infinite scroll feedback --- */
  showScrollLoading() {
    document.getElementById('scroll-status').innerHTML =
      `<div class="scroll-spinner"><div class="spinner spinner-sm"></div><span>Loading more…</span></div>`;
  },
  showScrollEnd(count) {
    document.getElementById('scroll-status').innerHTML = count
      ? `<p class="scroll-end">That's all ${count} result${count > 1 ? 's' : ''}.</p>`
      : '';
  },
  clearScrollStatus() { document.getElementById('scroll-status').innerHTML = ''; },

  /* ============================================================
   * Filters
   * ============================================================ */
  renderFilters(mediaType, genreList) {
    const cfg = MEDIA_TYPES[mediaType];
    const bar = document.getElementById('filter-bar');
    let html = '';

    const select = (filter, label, opts, includeAll = true, allLabel = '') => `
      <select class="filter-select" data-filter="${filter}" aria-label="${label}">
        ${includeAll ? `<option value="">${allLabel}</option>` : ''}
        ${opts.map(o => `<option value="${ui._esc(o.id)}">${ui._esc(o.name)}</option>`).join('')}
      </select>`;

    cfg.filters.forEach(filter => {
      if (filter === 'genre') html += select('genre', 'Filter by genre', genreList || [], true, 'All Genres');
      else if (filter === 'language') html += select('language', 'Filter by language', cfg.languages || [], true, 'All Languages');
      else if (filter === 'platform') html += select('platform', 'Filter by platform', cfg.platforms || [], true, 'All Platforms');
      else if (filter === 'length') html += select('length', 'Filter by length', cfg.lengthOptions || [], true, 'Any Length');
      else if (filter === 'type') html += select('type', 'Filter by type', cfg.typeOptions || [], false);
      else if (filter === 'sort') html += select('sort', 'Sort by', cfg.sortOptions || [], false);
    });

    bar.innerHTML = html;
  },

  /* ============================================================
   * Detail Modal
   * ============================================================ */
  showDetailLoading() {
    const modal = document.getElementById('detail-modal');
    modal.classList.remove('hidden');
    document.getElementById('detail-content').innerHTML =
      `<div class="detail-loading"><div class="spinner"></div><p>Loading...</p></div>`;
    document.body.style.overflow = 'hidden';
  },

  renderDetail(detail, mediaType, reviews, userReview, baseline) {
    const cfg = MEDIA_TYPES[mediaType];
    const content = document.getElementById('detail-content');
    const community = ratings_computeAverages(reviews, cfg.ratingCategories);
    const blend = baseline_blend(baseline, community, cfg.ratingCategories);
    const isSaved = auth_isSignedIn() && saved_has(mediaType, detail.id);
    const labels = saved_label(mediaType);

    let html = '';

    /* --- Hero --- */
    html += `<div class="detail-hero">`;
    html += `<div class="detail-poster">`;
    html += detail.poster
      ? `<img src="${ui._esc(detail.poster)}" alt="${ui._esc(detail.title)}" referrerpolicy="no-referrer" />`
      : `<div class="media-poster-placeholder" style="aspect-ratio:2/3">${cfg.placeholderEmoji}</div>`;
    html += `</div>`;

    html += `<div class="detail-info">`;
    html += `<h3>${ui._esc(detail.title)}</h3>`;
    html += `<div class="detail-subtitle">`;
    if (detail.year) html += `<span>${ui._esc(detail.year)}</span>`;
    if (detail.runtime) html += `<span class="media-meta-dot"></span><span>${ui._esc(detail.runtime)}</span>`;
    if (baseline?.metacritic) html += `<span class="media-meta-dot"></span><span>Metacritic ${baseline.metacritic}</span>`;
    html += `</div>`;

    /* Action row: save + share */
    html += `<div class="detail-actions">`;
    html += `<button id="detail-save" class="btn btn-outline btn-sm ${isSaved ? 'is-saved' : ''}">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      <span>${ui._esc(isSaved ? labels.remove : labels.add)}</span></button>`;
    html += `<button id="detail-share" class="btn btn-ghost btn-sm">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      <span>Share</span></button>`;
    html += `</div>`;

    if (detail.genres?.length) {
      html += `<div class="detail-extra">`;
      detail.genres.slice(0, 5).forEach(g => html += `<span class="detail-tag">${ui._esc(g)}</span>`);
      html += `</div>`;
    }
    if (detail.description) html += `<p class="detail-description">${ui._esc(detail.description)}</p>`;
    if (detail.extraInfo) {
      html += `<div class="detail-extra" style="flex-direction:column;gap:var(--space-2);">`;
      for (const [label, value] of Object.entries(detail.extraInfo)) {
        html += `<div style="font-size:var(--text-sm);"><strong style="color:var(--theme-text-muted);">${ui._esc(label)}:</strong> ${ui._esc(value)}</div>`;
      }
      html += `</div>`;
    }
    html += `</div></div>`;

    /* --- Score block --- */
    html += ui._scoreBlock(blend, baseline, cfg, mediaType);

    /* --- Rating form / sign-in prompt --- */
    html += `<div class="rating-section">`;
    if (auth_isSignedIn()) {
      html += `<h4>${userReview ? 'Your Rating' : 'Rate This ' + cfg.singularName}</h4>`;
      html += `<div class="rating-sliders">`;
      cfg.ratingCategories.forEach(cat => {
        const val = (userReview?.scores?.[cat.key]) ?? 5;
        html += `
          <div class="slider-item">
            <div class="slider-header">
              <span class="slider-label">${ui._esc(cat.label)}</span>
              <span class="slider-value" data-val="${cat.key}">${val}</span>
            </div>
            <input type="range" class="slider-input" data-cat="${cat.key}" min="1" max="10" value="${val}" />
          </div>`;
      });
      html += `</div>`;
      html += `<div class="comment-field form-field">
        <label for="review-comment">Comment (optional)</label>
        <textarea id="review-comment" placeholder="Share your thoughts...">${userReview ? ui._esc(userReview.comment || '') : ''}</textarea>
      </div>`;
      html += `<button id="submit-review" class="btn btn-primary" style="margin-top:var(--space-4);">${userReview ? 'Update Review' : 'Submit Review'}</button>`;
      if (userReview) {
        html += `<button id="delete-review" class="btn btn-danger" style="margin-top:var(--space-2);margin-left:var(--space-2);">Delete My Review</button>`;
      }
    } else {
      html += `<div class="sign-in-prompt"><p>Sign in to rate and review this ${cfg.singularName.toLowerCase()}.</p><button id="prompt-sign-in" class="btn btn-primary">Sign In</button></div>`;
    }
    html += `</div>`;

    /* --- Community reviews --- */
    if (reviews.length) {
      html += `<div class="comments-section"><h4>Community Reviews (${reviews.length})</h4>`;
      [...reviews]
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .forEach(r => { html += ui._reviewHTML(r, cfg); });
      html += `</div>`;
    }

    content.innerHTML = html;
    content.scrollTop = 0;
    ui._attachSliders();
  },

  _scoreBlock(blend, baseline, cfg, mediaType) {
    let html = `<div class="community-rating">`;

    if (!blend) {
      html += `<div class="community-score">
        <span class="community-score-value" style="color:var(--theme-text-faint)">—</span>
        <span class="community-score-label">No rating yet</span></div>`;
      const why = (mediaType === 'games' && !CONFIG.rawg?.apiKey)
        ? `No external rating available (add a free RAWG key in <code>js/config.js</code> to import game ratings). Be the first to rate it.`
        : `No external rating available for this ${cfg.singularName.toLowerCase()}. Be the first to rate it!`;
      html += `<p class="score-note">${why}</p>`;
      return html + `</div>`;
    }

    const cls = baseline_scoreClass(blend.score);
    html += `<div class="community-score">
      <span class="community-score-value ${cls}">${blend.score.toFixed(1)}</span>
      <span class="community-score-label">OmniRate Score</span></div>`;

    /* Provenance — always say where the number came from. */
    html += `<div class="score-provenance">`;
    if (blend.hasBaseline) {
      const votes = blend.baseline.count
        ? ` · ${blend.baseline.count.toLocaleString()} vote${blend.baseline.count > 1 ? 's' : ''}`
        : '';
      html += `<span class="prov-chip">Base <strong>${blend.baseline.value.toFixed(1)}</strong> from ${ui._esc(blend.baseline.sourceLabel)}${votes}</span>`;
    }
    if (blend.hasCommunity) {
      html += `<span class="prov-chip prov-chip-accent">+ <strong>${blend.reviewCount}</strong> OmniRate review${blend.reviewCount > 1 ? 's' : ''}</span>`;
    }
    html += `</div>`;

    if (blend.hasBaseline && !blend.hasCommunity) {
      html += `<p class="score-note">This is the imported baseline. The score shifts as soon as anyone reviews it here.</p>`;
    } else if (blend.hasBaseline && blend.hasCommunity) {
      html += `<p class="score-note">Community reviews weighted against the baseline (which counts as ${blend.priorWeight} review${blend.priorWeight > 1 ? 's' : ''}).</p>`;
    }

    /* Category breakdown */
    html += `<div class="community-breakdown">`;
    cfg.ratingCategories.forEach(cat => {
      const val = blend.categories[cat.key] || 0;
      const pct = Math.max(0, Math.min(100, (val / 10) * 100));
      html += `
        <div class="breakdown-item">
          <span class="breakdown-label">${ui._esc(cat.label)}</span>
          <div class="breakdown-bar"><div class="breakdown-fill" style="width:${pct}%"></div></div>
          <span class="breakdown-score">${val.toFixed(1)}</span>
        </div>`;
    });
    html += `</div>`;

    return html + `</div>`;
  },

  _reviewHTML(r, cfg) {
    const time = ratings_formatDate(r.updatedAt || r.createdAt);
    const isOwn = auth_isSignedIn() && auth_getCurrentUser().uid === r.uid;
    let html = `<div class="comment">`;
    html += `<div class="comment-header">`;
    html += ui._avatarHTML(r.userName, r.userPhoto, 'comment-avatar');
    html += `<button class="comment-author link-btn" data-profile-uid="${ui._esc(r.uid)}">${ui._esc(r.userName)}</button>`;
    html += `<span class="comment-time">${time}</span>`;
    if (isOwn) html += `<button class="comment-delete-btn" data-review-uid="${ui._esc(r.uid)}" title="Delete your review">Delete</button>`;
    html += `</div>`;
    if (r.scores) {
      html += `<div class="comment-user-scores">`;
      cfg.ratingCategories.forEach(cat => {
        if (r.scores[cat.key] != null) {
          html += `<span class="comment-user-score">${ui._esc(cat.label)}: <strong>${r.scores[cat.key]}</strong></span>`;
        }
      });
      html += `</div>`;
    }
    if (r.comment) html += `<p class="comment-text" style="margin-top:var(--space-2);">${ui._esc(r.comment)}</p>`;
    return html + `</div>`;
  },

  _avatarHTML(name, photo, cls) {
    if (photo) {
      return `<img class="${cls} avatar-img" src="${ui._esc(photo)}" alt="" referrerpolicy="no-referrer" />`;
    }
    return `<span class="${cls}">${ui._esc(ratings_getInitials(name))}</span>`;
  },

  _attachSliders() {
    document.querySelectorAll('.slider-input').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const valEl = document.querySelector(`.slider-value[data-val="${e.target.dataset.cat}"]`);
        if (valEl) valEl.textContent = e.target.value;
      });
    });
  },

  /** Update the detail modal's save button after a toggle. */
  refreshDetailSave(mediaType, mediaId) {
    const btn = document.getElementById('detail-save');
    if (!btn) return;
    const isSaved = auth_isSignedIn() && saved_has(mediaType, mediaId);
    const labels = saved_label(mediaType);
    btn.classList.toggle('is-saved', isSaved);
    btn.querySelector('span').textContent = isSaved ? labels.remove : labels.add;
    btn.querySelector('svg').setAttribute('fill', isSaved ? 'currentColor' : 'none');
  },

  closeDetailModal() {
    document.getElementById('detail-modal').classList.add('hidden');
    document.body.style.overflow = '';
  },

  /* ============================================================
   * Panel views (saved / activity / users / profile)
   * ============================================================ */
  showPanel(html) {
    document.getElementById('browse-view').classList.add('hidden');
    const panel = document.getElementById('panel-view');
    panel.innerHTML = html;
    panel.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'auto' });
  },

  showBrowse() {
    document.getElementById('panel-view').classList.add('hidden');
    document.getElementById('panel-view').innerHTML = '';
    document.getElementById('browse-view').classList.remove('hidden');
  },

  panelLoading(title) {
    ui.showPanel(`
      <div class="panel-header"><h2 class="section-title">${ui._esc(title)}</h2></div>
      <div class="detail-loading" style="padding:var(--space-16)"><div class="spinner"></div><p>Loading…</p></div>`);
  },

  /* --- Saved view --- */
  renderSavedView(items) {
    let html = `<div class="panel-header">
      <h2 class="section-title">Saved</h2>
      <span class="result-count">${items.length} item${items.length === 1 ? '' : 's'}</span>
    </div>`;

    if (!items.length) {
      html += `<div class="empty-state">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        <p class="empty-title">Nothing saved yet</p>
        <p class="empty-sub">Tap the bookmark on any card to build your watchlist, reading list, listen-later and play-later piles.</p>
      </div>`;
      return ui.showPanel(html);
    }

    ['movies', 'books', 'music', 'games'].forEach(mt => {
      const group = items.filter(i => i.mediaType === mt);
      if (!group.length) return;
      const cfg = MEDIA_TYPES[mt];
      html += `<div class="saved-group" data-group-media="${mt}">
        <h3 class="saved-group-title"><span class="saved-group-dot" style="background:var(--brand-${mt})"></span>
          ${ui._esc(saved_label(mt).verb)} <span class="saved-group-count">${group.length}</span></h3>
        <div class="results-grid">`;
      group.forEach(s => {
        const blend = ui.scoreFor({ id: s.mediaId }, mt);
        html += `<div class="media-card" data-id="${ui._esc(s.mediaId)}" data-media="${mt}">
          <div class="media-poster-wrap">
            ${s.mediaPoster
              ? `<img class="media-poster" src="${ui._esc(s.mediaPoster)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
              : `<div class="media-poster-placeholder">${cfg.placeholderEmoji}</div>`}
            <button class="save-btn is-saved" data-save-id="${ui._esc(s.mediaId)}" data-save-media="${mt}" title="Remove">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
          <div class="media-info">
            <div class="media-title">${ui._esc(s.mediaTitle)}</div>
            <div class="media-meta">${s.mediaYear ? `<span>${ui._esc(s.mediaYear)}</span>` : ''}<span>Saved ${ratings_formatDate(s.addedAt)}</span></div>
            ${ui.scoreBadge(blend, mt)}
          </div>
        </div>`;
      });
      html += `</div></div>`;
    });

    ui.showPanel(html);
  },

  /* --- Activity feed --- */
  renderActivityView(reviews) {
    let html = `<div class="panel-header">
      <h2 class="section-title">Recent Activity</h2>
      <span class="result-count">site-wide</span>
    </div>`;

    if (!reviews.length) {
      html += `<div class="empty-state">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        <p class="empty-title">No activity yet</p>
        <p class="empty-sub">Every review posted on OmniRate shows up here, newest first.</p>
      </div>`;
      return ui.showPanel(html);
    }

    html += `<div class="activity-list">`;
    reviews.forEach(r => {
      const cfg = MEDIA_TYPES[r.mediaType] || {};
      const avg = ratings_reviewAverage(r, cfg.ratingCategories);
      html += `<div class="activity-row" data-media-id="${ui._esc(String(r.mediaId))}" data-media-type="${ui._esc(r.mediaType)}">
        <div class="activity-poster">
          ${r.mediaPoster
            ? `<img src="${ui._esc(r.mediaPoster)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
            : `<span class="poster-placeholder">${cfg.placeholderEmoji || '★'}</span>`}
        </div>
        <div class="activity-body">
          <div class="activity-line">
            ${ui._avatarHTML(r.userName, r.userPhoto, 'comment-avatar')}
            <button class="link-btn activity-user" data-profile-uid="${ui._esc(r.uid)}">${ui._esc(r.userName)}</button>
            <span class="activity-verb">rated</span>
            <strong class="activity-title">${ui._esc(r.mediaTitle)}</strong>
          </div>
          <div class="activity-meta">
            <span class="activity-score ${baseline_scoreClass(avg)}">${avg.toFixed(1)}</span>
            <span class="media-chip" style="border-color:var(--brand-${r.mediaType});color:var(--brand-${r.mediaType})">${ui._esc(cfg.name || r.mediaType)}</span>
            <span class="activity-time">${ratings_formatDate(r.updatedAt || r.createdAt)}</span>
          </div>
          ${r.comment ? `<p class="activity-comment">${ui._esc(r.comment)}</p>` : ''}
        </div>
      </div>`;
    });
    html += `</div>`;

    ui.showPanel(html);
  },

  /* --- Users directory (owner only) --- */
  renderUsersView(users, stats, { isAdmin }) {
    let html = `<div class="panel-header">
      <h2 class="section-title">${isAdmin ? 'Users' : 'Community'}</h2>
      <span class="result-count">${users.length} account${users.length === 1 ? '' : 's'}</span>
    </div>`;

    if (!isAdmin) {
      html += `<p class="panel-note">Email addresses are only visible to the site owner. Add your address to <code>CONFIG.admins</code> in <code>js/config.js</code> to see the full directory.</p>`;
    }

    if (!users.length) {
      html += `<div class="empty-state">
        <p class="empty-title">No accounts yet</p>
        <p class="empty-sub">Accounts appear here the first time someone signs in.</p>
      </div>`;
      return ui.showPanel(html);
    }

    const sorted = [...users].sort((a, b) => (stats[b.uid]?.total || 0) - (stats[a.uid]?.total || 0) || (b.createdAt || 0) - (a.createdAt || 0));

    html += `<div class="table-wrap"><table class="data-table">
      <thead><tr>
        <th>User</th>
        ${isAdmin ? '<th>Email</th><th>Sign-in</th>' : ''}
        <th class="num">Reviews</th>
        <th>Breakdown</th>
        <th>Joined</th>
        <th>Last active</th>
      </tr></thead><tbody>`;

    sorted.forEach(u => {
      const s = stats[u.uid] || { total: 0, byMedia: { movies: 0, books: 0, music: 0, games: 0 }, lastActive: 0 };
      html += `<tr class="user-row" data-profile-uid="${ui._esc(u.uid)}">
        <td><div class="cell-user">${ui._avatarHTML(u.name, u.photoURL, 'user-avatar')}<span>${ui._esc(u.name || 'Unnamed')}</span></div></td>
        ${isAdmin ? `<td class="cell-email">${ui._esc(u.email || '—')}</td><td>${ui._esc(u.provider || '—')}</td>` : ''}
        <td class="num"><strong>${s.total}</strong></td>
        <td><div class="media-dots">
          ${['movies', 'books', 'music', 'games'].map(mt => `
            <span class="media-dot-stat" title="${MEDIA_TYPES[mt].name}: ${s.byMedia[mt] || 0}">
              <span class="media-dot" style="background:var(--brand-${mt})"></span>${s.byMedia[mt] || 0}
            </span>`).join('')}
        </div></td>
        <td class="cell-dim">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
        <td class="cell-dim">${s.lastActive ? ratings_formatDate(s.lastActive) : (u.lastSeenAt ? ratings_formatDate(u.lastSeenAt) : '—')}</td>
      </tr>`;
    });

    html += `</tbody></table></div>
      <p class="panel-note">Click any row to see every review that account has left, across all four media types.</p>`;

    ui.showPanel(html);
  },

  /* --- Profile view --- */
  renderProfileView(profile, reviews, savedCount) {
    const isSelf = auth_isSignedIn() && auth_getCurrentUser().uid === profile.uid;
    const name = profile.name || 'Unnamed';
    const total = reviews.length;
    const byMedia = { movies: [], books: [], music: [], games: [] };
    reviews.forEach(r => { if (byMedia[r.mediaType]) byMedia[r.mediaType].push(r); });

    let html = `<div class="profile-head">
      ${ui._avatarHTML(name, profile.photoURL, 'profile-avatar')}
      <div class="profile-meta">
        <h2 class="profile-name">${ui._esc(name)}${isSelf ? '<span class="you-tag">you</span>' : ''}</h2>
        <p class="profile-sub">
          ${profile.createdAt ? `Joined ${new Date(profile.createdAt).toLocaleDateString()}` : 'Member'}
          ${isSelf && profile.email ? ` · ${ui._esc(profile.email)}` : ''}
        </p>
      </div>
    </div>`;

    /* Stats strip */
    html += `<div class="stat-strip">
      <div class="stat"><span class="stat-num">${total}</span><span class="stat-label">Reviews</span></div>
      ${['movies', 'books', 'music', 'games'].map(mt => `
        <div class="stat"><span class="stat-num" style="color:var(--brand-${mt})">${byMedia[mt].length}</span>
        <span class="stat-label">${MEDIA_TYPES[mt].name}</span></div>`).join('')}
      ${isSelf ? `<div class="stat"><span class="stat-num">${savedCount}</span><span class="stat-label">Saved</span></div>` : ''}
    </div>`;

    if (!total) {
      html += `<div class="empty-state">
        <p class="empty-title">No reviews yet</p>
        <p class="empty-sub">${isSelf ? 'Rate something and it will show up here.' : 'This account hasn\'t reviewed anything yet.'}</p>
      </div>`;
      return ui.showPanel(html);
    }

    /* Reviews grouped by media type — all four, as requested */
    ['movies', 'books', 'music', 'games'].forEach(mt => {
      const group = byMedia[mt];
      if (!group.length) return;
      const cfg = MEDIA_TYPES[mt];
      html += `<div class="saved-group">
        <h3 class="saved-group-title"><span class="saved-group-dot" style="background:var(--brand-${mt})"></span>
          ${cfg.name} <span class="saved-group-count">${group.length}</span></h3>
        <div class="my-reviews-list">`;
      group.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).forEach(r => {
        const avg = ratings_reviewAverage(r, cfg.ratingCategories);
        const scored = cfg.ratingCategories.filter(c => r.scores?.[c.key] != null);
        html += `<div class="my-review-card" data-media-type="${mt}" data-media-id="${ui._esc(String(r.mediaId))}">
          <div class="my-review-poster">
            ${r.mediaPoster
              ? `<img src="${ui._esc(r.mediaPoster)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
              : `<span class="poster-placeholder">${cfg.placeholderEmoji}</span>`}
          </div>
          <div class="my-review-info">
            <div class="my-review-meta"><span class="my-review-type">${cfg.name}</span> <span class="my-review-time">${ratings_formatDate(r.updatedAt || r.createdAt)}</span></div>
            <h3 class="my-review-title">${ui._esc(r.mediaTitle)}</h3>
            <div class="my-review-score"><span class="my-review-avg ${baseline_scoreClass(avg)}">${avg.toFixed(1)}</span><span class="my-review-avg-label">/ 10</span></div>
            <div class="my-review-cats">
              ${scored.map(c => `<span class="my-review-cat">${ui._esc(c.label)}: <strong>${r.scores[c.key]}</strong></span>`).join('')}
            </div>
            ${r.comment ? `<p class="my-review-comment">${ui._esc(r.comment)}</p>` : ''}
          </div>
        </div>`;
      });
      html += `</div></div>`;
    });

    ui.showPanel(html);
  },

  panelError(title, msg) {
    ui.showPanel(`<div class="panel-header"><h2 class="section-title">${ui._esc(title)}</h2></div>
      <div class="empty-state"><p class="empty-title">Something went wrong</p><p class="empty-sub">${ui._esc(msg)}</p></div>`);
  },

  /* ============================================================
   * Auth Modal
   * ============================================================ */
  showAuthModal(mode = 'signin') {
    const modal = document.getElementById('auth-modal');
    const form = document.getElementById('auth-form');

    form.reset();
    document.getElementById('auth-error').textContent = '';
    document.getElementById('google-error').textContent = '';

    const isSignup = mode === 'signup';
    document.getElementById('auth-title').textContent = isSignup ? 'Create Account' : 'Welcome Back';
    modal.querySelector('.modal-subtitle').textContent = isSignup ? 'Join OmniRate to rate and review' : 'Sign in to rate and review';
    document.getElementById('auth-name-field').classList.toggle('hidden', !isSignup);
    document.getElementById('auth-name').required = isSignup;
    document.getElementById('auth-submit').textContent = isSignup ? 'Sign Up' : 'Sign In';
    document.getElementById('auth-toggle-label').textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
    document.getElementById('auth-toggle').textContent = isSignup ? 'Sign In' : 'Sign Up';

    modal.classList.remove('hidden');
    modal.dataset.mode = mode;
    document.body.style.overflow = 'hidden';
  },

  closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
    document.body.style.overflow = '';
  },

  /* ============================================================
   * Header auth state
   * ============================================================ */
  updateAuthUI(user) {
    const btn = document.getElementById('auth-btn');
    const menu = document.getElementById('user-menu');
    const savedBtn = document.getElementById('nav-saved');
    const usersBtn = document.getElementById('nav-users');

    if (user) {
      btn.classList.add('hidden');
      menu.classList.remove('hidden');
      savedBtn.classList.remove('hidden');
      usersBtn.classList.toggle('hidden', !auth_isAdmin());
      document.getElementById('user-name').textContent = user.name || user.email || 'User';
      const avatar = document.getElementById('user-avatar');
      if (user.photoURL) {
        avatar.style.backgroundImage = `url("${user.photoURL}")`;
        avatar.classList.add('avatar-photo');
        avatar.textContent = '';
      } else {
        avatar.style.backgroundImage = '';
        avatar.classList.remove('avatar-photo');
        avatar.textContent = ratings_getInitials(user.name);
      }
    } else {
      btn.classList.remove('hidden');
      menu.classList.add('hidden');
      savedBtn.classList.add('hidden');
      usersBtn.classList.add('hidden');
    }
    ui.updateSavedCount();
  },

  updateSavedCount() {
    const el = document.getElementById('saved-count');
    if (!el) return;
    const n = auth_isSignedIn() ? saved_count() : 0;
    el.textContent = n;
    el.classList.toggle('hidden', n === 0);
  },

  setSectionTitle(title, count) {
    document.getElementById('section-title').textContent = title;
    document.getElementById('result-count').textContent = count ? `${count} results` : '';
  },

  setActiveNav(view) {
    document.getElementById('nav-activity').classList.toggle('active', view === 'activity');
    document.getElementById('nav-saved').classList.toggle('active', view === 'saved');
    document.getElementById('nav-users').classList.toggle('active', view === 'users');
  },

  /* ============================================================
   * Misc
   * ============================================================ */
  showDemoBanner() {
    if (document.querySelector('.demo-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'demo-banner';
    banner.innerHTML = 'Demo mode — accounts and ratings are saved in this browser only. Add your Firebase config to <code>js/config.js</code> for real accounts, Google sign-in and shared ratings.';
    document.body.prepend(banner);
  },

  toast(msg, kind = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast ${kind}`;
    clearTimeout(ui._toastTimer);
    ui._toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  },

  _esc(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  },
};
