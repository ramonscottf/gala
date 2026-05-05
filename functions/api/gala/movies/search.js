// Movie metadata search: TMDB primary, OMDb fallback (key-less for low volume)
// GET /api/gala/movies/search?q=paddington          → search results
// GET /api/gala/movies/search?tmdb_id=123           → full details for one movie
//
// Auth: requires gala session cookie (admin-only)
// Configure secrets:
//   wrangler pages secret put TMDB_API_KEY  (recommended)
//   wrangler pages secret put OMDB_API_KEY  (optional fallback)

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
const OMDB_BASE = 'https://www.omdbapi.com';

function tmdbPoster(path, size = 'w500') {
  return path ? `${TMDB_IMG}/${size}${path}` : null;
}

async function tmdbSearch(env, q) {
  const url = new URL(`${TMDB_BASE}/search/movie`);
  url.searchParams.set('api_key', env.TMDB_API_KEY);
  url.searchParams.set('query', q);
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('page', '1');

  const res = await fetch(url.toString(), { cf: { cacheTtl: 600 } });
  if (!res.ok) throw new Error(`TMDB search ${res.status}`);
  const data = await res.json();

  return (data.results || []).slice(0, 12).map((m) => ({
    tmdb_id: m.id,
    title: m.title,
    original_title: m.original_title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    release_date: m.release_date || null,
    synopsis: m.overview || null,
    poster_url: tmdbPoster(m.poster_path),
    backdrop_url: tmdbPoster(m.backdrop_path, 'w1280'),
    vote_average: m.vote_average || null,
    source: 'tmdb',
  }));
}

async function tmdbDetails(env, id) {
  const url = new URL(`${TMDB_BASE}/movie/${id}`);
  url.searchParams.set('api_key', env.TMDB_API_KEY);
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('append_to_response', 'release_dates,videos');

  const res = await fetch(url.toString(), { cf: { cacheTtl: 600 } });
  if (!res.ok) throw new Error(`TMDB details ${res.status}`);
  const m = await res.json();

  // US MPAA rating
  let rating = null;
  const us = (m.release_dates?.results || []).find((r) => r.iso_3166_1 === 'US');
  if (us?.release_dates?.length) {
    const cert = us.release_dates.find((d) => d.certification);
    if (cert) rating = cert.certification;
  }

  // YouTube trailer
  let trailer_url = null;
  const trailer = (m.videos?.results || []).find(
    (v) => v.site === 'YouTube' && v.type === 'Trailer'
  );
  if (trailer) trailer_url = `https://www.youtube.com/watch?v=${trailer.key}`;

  return {
    tmdb_id: m.id,
    title: m.title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    release_date: m.release_date || null,
    runtime_minutes: m.runtime || null,
    synopsis: m.overview || null,
    poster_url: tmdbPoster(m.poster_path),
    backdrop_url: tmdbPoster(m.backdrop_path, 'w1280'),
    rating,
    trailer_url,
    source: 'tmdb',
  };
}

async function omdbSearch(env, q) {
  const url = new URL(OMDB_BASE);
  if (env.OMDB_API_KEY) url.searchParams.set('apikey', env.OMDB_API_KEY);
  url.searchParams.set('s', q);
  url.searchParams.set('type', 'movie');

  const res = await fetch(url.toString(), { cf: { cacheTtl: 600 } });
  if (!res.ok) throw new Error(`OMDb search ${res.status}`);
  const data = await res.json();
  if (data.Response !== 'True') return [];

  return (data.Search || []).slice(0, 12).map((m) => ({
    imdb_id: m.imdbID,
    title: m.Title,
    year: m.Year ? Number(String(m.Year).slice(0, 4)) : null,
    poster_url: m.Poster && m.Poster !== 'N/A' ? m.Poster : null,
    source: 'omdb',
  }));
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const tmdbId = url.searchParams.get('tmdb_id');

  // Detail lookup
  if (tmdbId) {
    if (!env.TMDB_API_KEY) return jsonError('TMDB_API_KEY not configured', 503);
    try {
      const details = await tmdbDetails(env, tmdbId);
      return jsonOk({ movie: details }, 600);
    } catch (e) {
      return jsonError(`TMDB lookup failed: ${e.message}`, 502);
    }
  }

  // Search
  if (!q) return jsonError('q (query) or tmdb_id required', 400);
  if (q.length < 2) return jsonOk({ results: [] }, 60);

  try {
    if (env.TMDB_API_KEY) {
      const results = await tmdbSearch(env, q);
      return jsonOk({ results, source: 'tmdb' }, 600);
    }
    // Fallback to OMDb (works without key for very limited free tier)
    const results = await omdbSearch(env, q);
    return jsonOk({
      results,
      source: 'omdb',
      note: 'Configure TMDB_API_KEY for richer metadata.',
    }, 600);
  } catch (e) {
    return jsonError(`Metadata search failed: ${e.message}`, 502);
  }
}
