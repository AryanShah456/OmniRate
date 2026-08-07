/* ============================================================
 * API Layer — Unified interface for all 4 media types
 * ============================================================
 * Each media API exposes:
 *   { getNewest, search, getDetails, getGenres, getImageUrl }
 *
 * Normalized item format:
 *   { id, title, poster, year, genre, description }
 *
 * Normalized detail format:
 *   { id, title, poster, year, genres[], description, runtime,
 *     apiRating, releaseDate, extraInfo: { label: value } }
 * ============================================================ */

// ----- Shared helpers -----
const IMG_PLACEHOLDER = '';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_SMALL = 'https://image.tmdb.org/t/p/w300';

/* ============================================================
 * TMDB — Movies
 * Requires API key in CONFIG.tmdb.apiKey
 * ============================================================ */
const tmdbApi = {
  isConfigured() { return !!(CONFIG.tmdb && CONFIG.tmdb.apiKey); },
  getKey() { return CONFIG.tmdb?.apiKey || ''; },

  async fetchJSON(path, params = {}) {
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    url.searchParams.set('api_key', this.getKey());
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
    return res.json();
  },

  async getNewest(page = 1, filters = {}) {
    const params = {
      sort_by: 'primary_release_date.desc',
      'primary_release_date.lte': new Date().toISOString().split('T')[0],
      page,
      include_adult: false,
      'vote_count.gte': 5,
    };
    if (filters.genre) params.with_genres = filters.genre;
    if (filters.language) params.with_original_language = filters.language;
    if (filters.length) {
      if (filters.length === 'short') params['with_runtime.lte'] = '90';
      else if (filters.length === 'medium') { params['with_runtime.gte'] = '90'; params['with_runtime.lte'] = '120'; }
      else if (filters.length === 'long') params['with_runtime.gte'] = '120';
    }
    if (filters.sort === 'rating') {
      params.sort_by = 'vote_average.desc';
      params['vote_count.gte'] = 100;
    } else if (filters.sort === 'popularity') {
      params.sort_by = 'popularity.desc';
    }
    const data = await this.fetchJSON('/discover/movie', params);
    return { items: data.results.map(this.normalizeItem), totalPages: data.total_pages };
  },

  async search(query, page = 1, filters = {}) {
    const data = await this.fetchJSON('/search/movie', { query, page });
    return { items: data.results.map(this.normalizeItem), totalPages: data.total_pages };
  },

  normalizeItem(m) {
    return {
      id: String(m.id),
      title: m.title || m.original_title || 'Untitled',
      poster: m.poster_path ? `${TMDB_IMG_SMALL}${m.poster_path}` : IMG_PLACEHOLDER,
      year: m.release_date ? m.release_date.split('-')[0] : '',
      genre: '',
      description: m.overview || '',
      // TMDB ships vote_average with the list payload, so every card gets a
      // baseline score with zero extra requests.
      baseline: baseline_fromListItem('movies', m),
    };
  },

  async getDetails(id) {
    const m = await this.fetchJSON(`/movie/${id}`, { append_to_response: 'credits' });
    const genres = (m.genres || []).map(g => g.name);
    const cast = (m.credits?.cast || []).slice(0, 8).map(c => c.name);
    const director = (m.credits?.crew || []).find(c => c.job === 'Director')?.name || '';
    return {
      id: String(m.id),
      title: m.title || m.original_title || 'Untitled',
      poster: m.poster_path ? `${TMDB_IMG_BASE}${m.poster_path}` : IMG_PLACEHOLDER,
      year: m.release_date ? m.release_date.split('-')[0] : '',
      genres,
      description: m.overview || '',
      runtime: m.runtime ? `${m.runtime} min` : '',
      apiRating: m.vote_average ? m.vote_average.toFixed(1) : null,
      apiRatingCount: m.vote_count || 0,
      releaseDate: m.release_date || '',
      extraInfo: {
        ...(director && { Director: director }),
        ...(cast.length && { Cast: cast.join(', ') }),
        ...(m.original_language && { Language: m.original_language.toUpperCase() }),
      },
    };
  },

  async getGenres() {
    const data = await this.fetchJSON('/genre/movie/list');
    return (data.genres || []).map(g => ({ id: String(g.id), name: g.name }));
  },

  getImageUrl(path) {
    return path ? `${TMDB_IMG_BASE}${path}` : IMG_PLACEHOLDER;
  },
};

/* ============================================================
 * Open Library — Books
 * No API key required, free and open
 * ============================================================ */
const booksApi = {
  isConfigured() { return true; },

  // Explicitly request the rating fields — search.json omits them otherwise,
  // and they're what gives every book card a baseline score for free.
  FIELDS: 'key,title,cover_i,first_publish_year,subject,ratings_average,ratings_count',

  async fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open Library error: ${res.status}`);
    return res.json();
  },

  async getNewest(page = 1, filters = {}) {
    const subject = filters.genre || 'Fiction';
    const offset = (page - 1) * 20;
    const currentYear = new Date().getFullYear();
    // Restrict to a realistic recent-year range — unfiltered "sort=new" surfaces
    // spam entries with bogus future publish years (e.g. 2098).
    const q = `subject:${subject} AND first_publish_year:[${currentYear - 8} TO ${currentYear}]`;
    const data = await this.fetchJSON(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&sort=new&limit=20&offset=${offset}&fields=${this.FIELDS}`);
    return { items: (data.docs || []).map(this.normalizeSearchItem), totalPages: Math.min(Math.ceil((data.numFound || 0) / 20), 5) };
  },

  async search(query, page = 1, filters = {}) {
    const offset = (page - 1) * 20;
    const data = await this.fetchJSON(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&offset=${offset}&fields=${this.FIELDS}`);
    return { items: (data.docs || []).slice(0, 20).map(this.normalizeSearchItem), totalPages: Math.min(Math.ceil((data.numFound || 0) / 20), 10) };
  },

  normalizeSubjectItem(w) {
    const coverId = w.cover_id;
    return {
      id: w.key,
      title: w.title || 'Untitled',
      poster: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : IMG_PLACEHOLDER,
      year: w.first_publish_year ? String(w.first_publish_year) : '',
      genre: (w.subject || []).slice(0, 2).join(', '),
      description: '',
    };
  },

  normalizeSearchItem(d) {
    const coverId = d.cover_i;
    return {
      id: d.key,
      title: d.title || 'Untitled',
      poster: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : IMG_PLACEHOLDER,
      year: d.first_publish_year ? String(d.first_publish_year) : '',
      genre: (d.subject || []).slice(0, 2).join(', '),
      description: '',
      baseline: baseline_fromListItem('books', d),
    };
  },

  async getDetails(id) {
    const workId = id.replace('/works/', '');
    const data = await this.fetchJSON(`https://openlibrary.org/works/${workId}.json`);
    const coverId = (data.covers || [])[0];
    const description = typeof data.description === 'object' ? data.description.value : data.description;
    const authors = (data.authors || []).map(a => a.author?.name || '').filter(Boolean);
    const subjects = data.subjects || [];
    return {
      id: id,
      title: data.title || 'Untitled',
      poster: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : IMG_PLACEHOLDER,
      year: '',
      genres: subjects.slice(0, 5),
      description: description || 'No description available.',
      runtime: '',
      apiRating: null,
      releaseDate: '',
      extraInfo: {
        ...(authors.length && { Author: authors.join(', ') }),
      },
    };
  },

  async getGenres() {
    return [
      { id: 'Fiction', name: 'Fiction' },
      { id: 'Science Fiction', name: 'Science Fiction' },
      { id: 'Fantasy', name: 'Fantasy' },
      { id: 'Mystery', name: 'Mystery & Thriller' },
      { id: 'Romance', name: 'Romance' },
      { id: 'Biography', name: 'Biography' },
      { id: 'History', name: 'History' },
      { id: 'Science', name: 'Science' },
      { id: 'Horror', name: 'Horror' },
      { id: 'Young Adult', name: 'Young Adult' },
    ];
  },

  getImageUrl(path) { return path; },
};

/* ============================================================
 * iTunes Search + RSS — Music
 * No API key required
 * ============================================================ */
const musicApi = {
  isConfigured() { return true; },

  async fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`iTunes error: ${res.status}`);
    return res.json();
  },

  async getNewest(page = 1, filters = {}) {
    const genreMap = {
      Pop: '14', Rock: '21', Hip_Hop: '18', Country: '6',
      Electronic: '7', R_B: '15', Alternative: '20', Jazz: '11',
      Classical: '5', Latin: '12',
    };
    const entityType = filters.type === 'song' ? 'song' : 'album';
    // iTunes' sort=recent is not strictly chronological, so fetch a larger
    // batch and sort client-side by actual releaseDate to surface genuinely
    // new albums first.
    const params = new URLSearchParams({
      term: 'a',
      entity: entityType,
      limit: '200',
      sort: 'recent',
    });
    if (filters.genre && genreMap[filters.genre]) {
      params.set('genreId', genreMap[filters.genre]);
    }
    const data = await this.fetchJSON(`https://itunes.apple.com/search?${params}`);
    const sorted = (data.results || []).slice().sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
    const pageItems = sorted.slice((page - 1) * 20, page * 20);
    return { items: pageItems.map(this.normalizeSearchItem), totalPages: Math.min(Math.ceil(sorted.length / 20), 10) };
  },

  async search(query, page = 1, filters = {}) {
    const entityType = filters.type === 'song' ? 'song' : 'album';
    const params = new URLSearchParams({
      term: query,
      entity: entityType,
      limit: '20',
      offset: String((page - 1) * 20),
    });
    const data = await this.fetchJSON(`https://itunes.apple.com/search?${params}`);
    return { items: (data.results || []).map(this.normalizeSearchItem), totalPages: Math.ceil((data.resultCount || 0) / 20) };
  },

  normalizeRSSItem(a) {
    return {
      id: a.id,
      title: a.name,
      poster: a.artworkUrl100 ? a.artworkUrl100.replace('100x100', '300x300') : IMG_PLACEHOLDER,
      year: a.releaseDate ? a.releaseDate.split('-')[0] : '',
      genre: a.genres?.[0]?.name || '',
      description: `${a.artistName} — ${a.genres?.map(g => g.name).join(', ') || 'Music'}`,
    };
  },

  normalizeSearchItem(a) {
    return {
      id: String(a.trackId || a.collectionId),
      title: a.trackName || a.collectionName || 'Untitled',
      poster: a.artworkUrl100 ? a.artworkUrl100.replace('100x100', '300x300') : IMG_PLACEHOLDER,
      year: a.releaseDate ? a.releaseDate.split('-')[0] : '',
      genre: a.primaryGenreName || '',
      description: `${a.artistName}`,
      // iTunes returns no rating data. Music baselines come from MusicBrainz,
      // which rate-limits to ~1 req/sec — far too slow to enrich a whole grid,
      // so it's looked up when the detail modal opens instead.
      baseline: null,
    };
  },

  async getDetails(id) {
    // Lookup works for both albums (collectionId) and songs (trackId)
    const data = await this.fetchJSON(`https://itunes.apple.com/lookup?id=${id}`);
    const item = (data.results || []).find(r => r.collectionId == id || r.trackId == id);
    if (!item) throw new Error('Not found');

    const isTrack = item.wrapperType === 'track';
    const tracks = (data.results || []).filter(r => r.wrapperType === 'track' && r.collectionId == id);
    const trackList = tracks.slice(0, 10).map(t => `${t.trackName} (${(t.trackTimeMillis / 60000).toFixed(1)} min)`);

    return {
      id: String(isTrack ? item.trackId : (item.collectionId || item.trackId)),
      title: isTrack ? (item.trackName || 'Untitled') : (item.collectionName || item.trackName || 'Untitled'),
      poster: item.artworkUrl100 ? item.artworkUrl100.replace('100x100', '500x500') : IMG_PLACEHOLDER,
      year: item.releaseDate ? item.releaseDate.split('-')[0] : '',
      genres: item.primaryGenreName ? [item.primaryGenreName] : [],
      description: isTrack
        ? `Song by ${item.artistName}.${item.collectionName ? ` From the album "${item.collectionName}".` : ''}`
        : `Album by ${item.artistName}. ${tracks.length} tracks included.`,
      runtime: isTrack && item.trackTimeMillis ? `${(item.trackTimeMillis / 60000).toFixed(1)} min` : (tracks.length ? `${tracks.length} tracks` : ''),
      apiRating: null,
      releaseDate: item.releaseDate || '',
      extraInfo: {
        Artist: item.artistName,
        ...(item.collectionPrice && { Price: `$${item.collectionPrice}` }),
        ...(item.country && { Country: item.country }),
        ...(trackList.length && { 'Top Tracks': trackList.join('; ') }),
        ...(isTrack && item.collectionName && { Album: item.collectionName }),
      },
    };
  },

  async getGenres() {
    return [
      { id: 'Pop', name: 'Pop' },
      { id: 'Rock', name: 'Rock' },
      { id: 'Hip_Hop', name: 'Hip-Hop' },
      { id: 'Country', name: 'Country' },
      { id: 'Electronic', name: 'Electronic' },
      { id: 'R_B', name: 'R&B' },
      { id: 'Alternative', name: 'Alternative' },
      { id: 'Jazz', name: 'Jazz' },
      { id: 'Classical', name: 'Classical' },
      { id: 'Latin', name: 'Latin' },
    ];
  },

  getImageUrl(path) { return path; },
};

/* ============================================================
 * FreeToGame — Video Games (free-to-play)
 * No API key needed — CORS supported
 * https://www.freetogame.com/api-doc
 * ============================================================ */
const gamesApi = {
  isConfigured() { return true; },

  async fetchJSON(endpoint, params = {}) {
    const url = new URL(`https://www.freetogame.com/api${endpoint}`);
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FreeToGame error: ${res.status}`);
    return res.json();
  },

  async getNewest(page = 1, filters = {}) {
    const params = { 'sort-by': 'release-date' };
    if (filters.genre) params.category = filters.genre;
    if (filters.platform) params.platform = filters.platform;
    const data = await this.fetchJSON('/games', params);
    // Client-side pagination (API returns all results at once)
    const start = (page - 1) * 20;
    const items = data.slice(start, start + 20);
    // If sort by rating requested, re-sort client-side (we don't have ratings, use popularity/relevance)
    if (filters.sort === 'rating') {
      // No rating data from FreeToGame; sort by release-date as fallback
      params['sort-by'] = 'release-date';
    }
    return { items: items.map(this.normalizeItem), totalPages: Math.min(Math.ceil(data.length / 20), 10) };
  },

  async search(query, page = 1, filters = {}) {
    const params = {};
    if (filters.genre) params.category = filters.genre;
    if (filters.platform) params.platform = filters.platform;
    const data = await this.fetchJSON('/games', params);
    // Client-side search filtering
    const q = query.toLowerCase();
    const filtered = data.filter(g => 
      g.title.toLowerCase().includes(q) || 
      (g.short_description || '').toLowerCase().includes(q) ||
      (g.genre || '').toLowerCase().includes(q)
    );
    const start = (page - 1) * 20;
    const items = filtered.slice(start, start + 20);
    return { items: items.map(this.normalizeItem), totalPages: Math.min(Math.ceil(filtered.length / 20), 10) };
  },

  normalizeItem(g) {
    return {
      id: String(g.id),
      title: g.title || 'Untitled',
      poster: g.thumbnail || IMG_PLACEHOLDER,
      year: g.release_date ? g.release_date.split('-')[0] : '',
      genre: g.genre || '',
      description: g.short_description || '',
      // FreeToGame has no ratings. Baselines come from RAWG (optional key),
      // matched by title when the detail modal opens.
      baseline: null,
    };
  },

  async getDetails(id) {
    const g = await this.fetchJSON('/game', { id });
    const genres = g.genre ? [g.genre] : [];
    const screenshots = (g.screenshots || []).slice(0, 4).map(s => s.image);
    return {
      id: String(g.id),
      title: g.title || 'Untitled',
      poster: g.thumbnail || IMG_PLACEHOLDER,
      year: g.release_date ? g.release_date.split('-')[0] : '',
      genres,
      description: g.description || g.short_description || 'No description available.',
      runtime: '',
      apiRating: null,
      releaseDate: g.release_date || '',
      extraInfo: {
        ...(g.developer && { Developer: g.developer }),
        ...(g.publisher && { Publisher: g.publisher }),
        ...(g.platform && { Platform: g.platform }),
        ...(g.status && { Status: g.status }),
        ...(g.genre && { Genre: g.genre }),
      },
    };
  },

  async getGenres() {
    return [
      { id: 'Shooter', name: 'Shooter' },
      { id: 'MMORPG', name: 'MMORPG' },
      { id: 'Strategy', name: 'Strategy' },
      { id: 'MOBA', name: 'MOBA' },
      { id: 'Racing', name: 'Racing' },
      { id: 'Sports', name: 'Sports' },
      { id: 'Card', name: 'Card' },
      { id: 'Social', name: 'Social' },
      { id: 'Fighting', name: 'Fighting' },
      { id: 'MMO', name: 'MMO' },
    ];
  },

  getImageUrl(path) { return path; },
};

/* ============================================================
 * Media Type Registry
 * ============================================================ */
const MEDIA_TYPES = {
  movies: {
    name: 'Movies',
    singularName: 'Movie',
    api: tmdbApi,
    placeholderEmoji: '🎬',
    ratingCategories: [
      { key: 'cast', label: 'Cast' },
      { key: 'cinematography', label: 'Cinematography' },
      { key: 'script', label: 'Script' },
      { key: 'acting', label: 'Acting' },
      { key: 'length', label: 'Length' },
      { key: 'pacing', label: 'Pacing' },
    ],
    filters: ['genre', 'language', 'length', 'sort'],
    sortOptions: [
      { id: 'newest', name: 'Newest First' },
      { id: 'rating', name: 'Top Rated' },
      { id: 'popularity', name: 'Most Popular' },
    ],
    lengthOptions: [
      { id: 'short', name: 'Short (< 90 min)' },
      { id: 'medium', name: 'Medium (90-120 min)' },
      { id: 'long', name: 'Long (> 120 min)' },
    ],
    languages: [
      { id: 'en', name: 'English' }, { id: 'ja', name: 'Japanese' },
      { id: 'ko', name: 'Korean' }, { id: 'zh', name: 'Chinese' },
      { id: 'fr', name: 'French' }, { id: 'es', name: 'Spanish' },
      { id: 'de', name: 'German' }, { id: 'hi', name: 'Hindi' },
      { id: 'it', name: 'Italian' }, { id: 'pt', name: 'Portuguese' },
    ],
  },
  books: {
    name: 'Books',
    singularName: 'Book',
    api: booksApi,
    placeholderEmoji: '📚',
    ratingCategories: [
      { key: 'prose', label: 'Prose & Writing' },
      { key: 'characters', label: 'Characters' },
      { key: 'pacing', label: 'Pacing' },
      { key: 'worldbuilding', label: 'Worldbuilding' },
      { key: 'ending', label: 'Ending' },
      { key: 'cover', label: 'Cover Art' },
    ],
    filters: ['genre', 'language', 'sort'],
    sortOptions: [
      { id: 'newest', name: 'Newest First' },
      { id: 'relevance', name: 'Most Relevant' },
    ],
    languages: [
      { id: 'en', name: 'English' }, { id: 'fr', name: 'French' },
      { id: 'es', name: 'Spanish' }, { id: 'de', name: 'German' },
      { id: 'it', name: 'Italian' }, { id: 'ja', name: 'Japanese' },
      { id: 'zh', name: 'Chinese' }, { id: 'pt', name: 'Portuguese' },
      { id: 'ru', name: 'Russian' }, { id: 'ar', name: 'Arabic' },
    ],
  },
  music: {
    name: 'Music',
    singularName: 'Release',
    api: musicApi,
    placeholderEmoji: '🎵',
    ratingCategories: [
      { key: 'lyrics', label: 'Lyrics' },
      { key: 'production', label: 'Production' },
      { key: 'vocals', label: 'Vocals' },
      { key: 'replay', label: 'Replay Value' },
      { key: 'cohesion', label: 'Cohesion' },
      { key: 'originality', label: 'Originality' },
    ],
    filters: ['type', 'genre', 'sort'],
    typeOptions: [
      { id: 'album', name: 'Albums' },
      { id: 'song', name: 'Songs' },
    ],
    sortOptions: [
      { id: 'newest', name: 'Newest First' },
      { id: 'popular', name: 'Most Popular' },
    ],
    languages: [],
  },
  games: {
    name: 'Games',
    singularName: 'Game',
    api: gamesApi,
    placeholderEmoji: '🎮',
    ratingCategories: [
      { key: 'gameplay', label: 'Gameplay' },
      { key: 'story', label: 'Story' },
      { key: 'graphics', label: 'Graphics' },
      { key: 'soundtrack', label: 'Soundtrack' },
      { key: 'replayability', label: 'Replayability' },
      { key: 'length', label: 'Length' },
    ],
    filters: ['genre', 'platform', 'sort'],
    sortOptions: [
      { id: 'newest', name: 'Newest First' },
      { id: 'rating', name: 'Top Rated' },
    ],
    platforms: [
      { id: '4', name: 'PC' },
      { id: '187', name: 'PlayStation 5' },
      { id: '18', name: 'PlayStation 4' },
      { id: '1', name: 'Xbox One' },
      { id: '7', name: 'Nintendo Switch' },
    ],
    languages: [],
  },
};
