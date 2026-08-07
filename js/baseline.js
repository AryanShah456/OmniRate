/* ============================================================
 * Baseline Ratings
 * ============================================================
 * Every item on OmniRate has a score BEFORE anyone reviews it, imported
 * from the source that already tracks ratings for that medium:
 *
 *   Movies → TMDB          vote_average (0-10)   • full coverage
 *   Books  → Open Library  ratings_average (0-5) • partial coverage
 *   Games  → RAWG          rating (0-5) + Metacritic • needs a free key
 *   Music  → MusicBrainz   rating (0-5)          • sparse coverage
 *
 * Everything is normalised to a 0-10 scale. Where no external rating
 * exists we return null and the UI shows "—" — we never invent a number.
 *
 * Community reviews are then blended on top of the baseline using a
 * Bayesian prior: the baseline counts as CONFIG.baselineWeight pseudo-
 * reviews, so the score starts at the external value and slides toward
 * the community as real reviews arrive.
 *
 *   blended = (base * W + sum(community)) / (W + n)
 *
 * Public API:
 *   baseline_fromListItem(mediaType, rawApiObject) → {value,count,source}|null
 *   baseline_fetch(mediaType, detail)              → Promise<baseline|null>
 *   baseline_blend(baseline, communityAvg, cats)   → blended score object
 * ============================================================ */

/* --- Which media types can show a baseline straight off the list payload?
 * Movies and books ship ratings inside the same response that builds the
 * grid, so cards get a score for free. Games and music need a second
 * request per item, so their baseline is fetched only when the detail
 * modal opens (RAWG allows this comfortably; MusicBrainz rate-limits to
 * ~1 request/second, so hammering it per card is not an option). */
const BASELINE_ON_CARDS = { movies: true, books: true, music: false, games: false };

const _baselineCache = new Map(); // `${mediaType}:${id}` → baseline | null

function _baselineKey(mediaType, id) { return `${mediaType}:${id}`; }

function _clampScore(n) {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
}

/** Build a baseline object, or null if the numbers aren't usable. */
function _mkBaseline(value, count, source, sourceLabel) {
  const v = _clampScore(value);
  if (v === null || v <= 0) return null;
  return {
    value: v,
    count: Number(count) || 0,
    source,
    sourceLabel: sourceLabel || source,
  };
}

/* ============================================================
 * Extract a baseline from data we already have (no extra request)
 * ============================================================ */
function baseline_fromListItem(mediaType, raw) {
  if (!raw) return null;

  if (mediaType === 'movies') {
    // TMDB vote_average is already 0-10.
    if (!raw.vote_average) return null;
    return _mkBaseline(raw.vote_average, raw.vote_count, 'tmdb', 'TMDB');
  }

  if (mediaType === 'books') {
    // Open Library ratings_average is 0-5.
    if (!raw.ratings_average) return null;
    return _mkBaseline(raw.ratings_average * 2, raw.ratings_count, 'openlibrary', 'Open Library');
  }

  return null;
}

/**
 * Remember a baseline we already derived (e.g. from a list payload) so the
 * detail view skips the network round-trip.
 *
 * Only non-null values are cached: a book with no rating in the search
 * response might still have one on the dedicated ratings endpoint, so an
 * absent value must not be treated as a confirmed "no rating".
 */
function baseline_prime(mediaType, id, baseline) {
  if (id == null || !baseline) return;
  _baselineCache.set(_baselineKey(mediaType, id), baseline);
}

function baseline_peek(mediaType, id) {
  return _baselineCache.get(_baselineKey(mediaType, id)) ?? null;
}

/* ============================================================
 * Fetch a baseline for a single item (used by the detail modal)
 * ============================================================ */
async function baseline_fetch(mediaType, detail) {
  if (!detail || detail.id == null) return null;
  const key = _baselineKey(mediaType, detail.id);
  if (_baselineCache.has(key)) return _baselineCache.get(key);

  let result = null;
  try {
    if (mediaType === 'movies') {
      // Already on the detail payload as apiRating (TMDB, 0-10).
      result = detail.apiRating
        ? _mkBaseline(parseFloat(detail.apiRating), detail.apiRatingCount, 'tmdb', 'TMDB')
        : null;
    } else if (mediaType === 'books') {
      result = await _fetchBookBaseline(detail.id);
    } else if (mediaType === 'games') {
      result = await _fetchGameBaseline(detail);
    } else if (mediaType === 'music') {
      result = await _fetchMusicBaseline(detail);
    }
  } catch (e) {
    console.warn('[OmniRate] baseline lookup failed for', mediaType, detail.id, e);
    result = null;
  }

  _baselineCache.set(key, result);
  return result;
}

/* --- Books: Open Library ratings endpoint ------------------------------- */
async function _fetchBookBaseline(workKey) {
  // workKey looks like "/works/OL45804W"
  const id = String(workKey).replace(/^\/?works\//, '').replace(/^\//, '');
  if (!id) return null;
  const res = await fetch(`https://openlibrary.org/works/${encodeURIComponent(id)}/ratings.json`);
  if (!res.ok) return null;
  const data = await res.json();
  const avg = data?.summary?.average;
  const count = data?.summary?.count;
  if (!avg || !count) return null;
  return _mkBaseline(avg * 2, count, 'openlibrary', 'Open Library');
}

/* --- Games: RAWG lookup by title (optional key) ------------------------- */
async function _fetchGameBaseline(detail) {
  const key = CONFIG.rawg?.apiKey;
  if (!key) return null;

  const params = new URLSearchParams({
    key,
    search: detail.title,
    search_precise: 'true',
    page_size: '5',
  });
  const res = await fetch(`https://api.rawg.io/api/games?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const results = data?.results || [];
  if (!results.length) return null;

  // Prefer an exact title match; otherwise take RAWG's best guess.
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const target = norm(detail.title);
  const hit = results.find(g => norm(g.name) === target) || results[0];

  const baseline = _mkBaseline(hit.rating * 2, hit.ratings_count, 'rawg', 'RAWG');
  if (baseline && hit.metacritic) baseline.metacritic = hit.metacritic;
  return baseline;
}

/* --- Music: MusicBrainz release-group rating ---------------------------- */
async function _fetchMusicBaseline(detail) {
  const artist = detail.extraInfo?.Artist;
  const title = detail.title;
  if (!artist || !title) return null;

  // Strip the noise iTunes appends: "(Deluxe Edition)", "- Single", etc.
  const clean = title
    .replace(/\s*[\(\[][^\)\]]*(deluxe|remaster|edition|version|expanded|anniversary)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*-\s*(single|ep)$/i, '')
    .trim();

  const esc = (s) => String(s).replace(/["\\]/g, ' ').trim();
  const query = `releasegroup:"${esc(clean)}" AND artist:"${esc(artist)}"`;
  const searchUrl = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;

  const sRes = await fetch(searchUrl);
  if (!sRes.ok) return null;
  const sData = await sRes.json();
  const group = (sData['release-groups'] || [])[0];
  if (!group?.id) return null;

  const rRes = await fetch(`https://musicbrainz.org/ws/2/release-group/${group.id}?inc=ratings&fmt=json`);
  if (!rRes.ok) return null;
  const rData = await rRes.json();
  const value = rData?.rating?.value;          // 0-5
  const votes = rData?.rating?.['votes-count'];
  if (!value) return null;
  return _mkBaseline(value * 2, votes, 'musicbrainz', 'MusicBrainz');
}

/* ============================================================
 * Blending: external baseline + community reviews
 * ============================================================
 * communityAvg is the object from ratings_computeAverages(), or null.
 * Returns null only when there is neither a baseline nor a review.
 *
 *   { score, reviewCount, baseline, hasBaseline, hasCommunity,
 *     categories: { key: blendedValue } }
 * ============================================================ */
function baseline_blend(baseline, communityAvg, categories) {
  const W = _priorWeight();
  const hasBaseline = !!(baseline && baseline.value > 0);
  const n = communityAvg?.count || 0;
  const hasCommunity = n > 0;

  if (!hasBaseline && !hasCommunity) return null;

  let score;
  if (!hasCommunity) {
    score = baseline.value;
  } else if (!hasBaseline) {
    score = communityAvg.overall;
  } else {
    score = (baseline.value * W + communityAvg.overall * n) / (W + n);
  }

  // Per-category blend uses the same baseline as the prior for each
  // category — it's the only external signal we have, and it keeps a
  // single 9/10 on one category from dominating the breakdown.
  const cats = {};
  (categories || []).forEach(c => {
    const catAvg = communityAvg?.averages?.[c.key] ?? 0;
    const catN = communityAvg?.counts?.[c.key] ?? (catAvg > 0 ? n : 0);
    if (!hasBaseline) {
      cats[c.key] = catAvg;
    } else if (!catN) {
      cats[c.key] = baseline.value;
    } else {
      cats[c.key] = (baseline.value * W + catAvg * catN) / (W + catN);
    }
  });

  return {
    score: _clampScore(score),
    reviewCount: n,
    baseline: hasBaseline ? baseline : null,
    hasBaseline,
    hasCommunity,
    priorWeight: W,
    categories: cats,
  };
}

function _priorWeight() {
  const w = Number(CONFIG?.baselineWeight);
  return isFinite(w) && w > 0 ? w : 2;
}

/** Colour bucket for a 0-10 score. */
function baseline_scoreClass(score) {
  if (score == null) return 'no-rating';
  if (score >= 7.5) return 'score-high';
  if (score >= 5) return 'score-mid';
  return 'score-low';
}

/* Exported for the test harness (node) as well as the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { baseline_blend, baseline_fromListItem, baseline_scoreClass };
}
