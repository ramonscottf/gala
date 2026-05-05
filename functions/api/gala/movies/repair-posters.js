// POST /api/gala/movies/repair-posters
//
// Phase 1.9 H3 — one-time admin script (idempotent, safe to re-run).
// Loops every active movie with a tmdb_id and a NULL or non-TMDB
// poster_url, fetches the canonical TMDB record, and persists
// `https://image.tmdb.org/t/p/w500{poster_path}` into poster_url.
//
// Run AFTER the 2026-05-04-poster-thumbnail-split.sql migration. The
// migration moves the custom assets.daviskids.org PNGs into
// thumbnail_url and nulls poster_url for those rows; this endpoint
// fills the gap with real TMDB posters so the portal's rich movie
// cards + MovieDetailSheet hero render legit movie marketing.
//
// Requires admin auth (verifyGalaAuth — same gate as movies.js admin
// CRUD). TMDB_API_KEY pulled from env, never hardcoded.
//
// No-params POST. Returns { ok, repaired: [{id, title, status, ...}] }
// so an admin can verify per-row what happened.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);
  if (!env.GALA_DB) return jsonError('Database not configured', 503);
  if (!env.TMDB_API_KEY) return jsonError('TMDB_API_KEY not set on this Worker', 503);

  const movies = await env.GALA_DB.prepare(
    `SELECT id, title, tmdb_id, poster_url
       FROM movies
      WHERE tmdb_id IS NOT NULL AND active = 1
      ORDER BY title`
  ).all();

  const repaired = [];
  for (const m of movies.results || []) {
    if (m.poster_url && /^https?:\/\/image\.tmdb\.org/i.test(m.poster_url)) {
      repaired.push({ id: m.id, title: m.title, status: 'already_tmdb' });
      continue;
    }
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/movie/${encodeURIComponent(m.tmdb_id)}?api_key=${env.TMDB_API_KEY}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) {
        repaired.push({
          id: m.id,
          title: m.title,
          status: 'tmdb_fail',
          http: res.status,
        });
        continue;
      }
      const data = await res.json();
      if (!data.poster_path) {
        repaired.push({ id: m.id, title: m.title, status: 'no_poster_path' });
        continue;
      }
      const url = `https://image.tmdb.org/t/p/w500${data.poster_path}`;
      await env.GALA_DB.prepare('UPDATE movies SET poster_url = ? WHERE id = ?')
        .bind(url, m.id)
        .run();
      repaired.push({ id: m.id, title: m.title, status: 'updated', url });
    } catch (e) {
      repaired.push({ id: m.id, title: m.title, status: 'error', error: String(e) });
    }
  }

  return jsonOk({ ok: true, repaired });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Gala-Dash-Secret',
    },
  });
}
