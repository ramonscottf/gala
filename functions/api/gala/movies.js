import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import {
  computeShowEnd,
  formatMinutes12h,
  parseTimeToMinutes,
  checkOverlap,
  recommendShowing2Start,
} from './_movie_time.js';

// Default time anchors for the two showings (in minutes from midnight)
const SHOWING_DEFAULTS = {
  1: { dinner_time: '3:45 PM',  show_start: '4:30 PM' },
  2: { dinner_time: '6:45 PM',  show_start: '7:30 PM' },
};
const TURNOVER_MIN = 30;       // required cleanup gap between showings
const DEFAULT_TRAILERS_MIN = 5; // DEF intro video before each showing
const MESSAGING_MIN = 0;       // legacy field — pre-roll is now bundled into trailers
const SHOWING_2_FLOOR_MIN = 19 * 60 + 30; // 7:30 PM — secondary cannot start earlier than this

function enrichShowtime(st, movies) {
  const movie = st.movie_id ? movies.find(m => m.id === st.movie_id) : null;
  const trailerMin = (st.trailer_minutes != null) ? st.trailer_minutes : DEFAULT_TRAILERS_MIN;
  const endMin = movie && movie.runtime_minutes
    ? computeShowEnd(st.show_start, movie.runtime_minutes, trailerMin, MESSAGING_MIN)
    : null;
  return {
    ...st,
    movie_title: movie?.title || null,
    movie_poster: movie?.poster_url || null,
    movie_rating: movie?.rating || null,
    movie_runtime: movie?.runtime_minutes || null,
    show_end_minutes: endMin,
    show_end_label: endMin != null ? formatMinutes12h(endMin) : null,
  };
}

function detectOverlapsByTheater(showtimes) {
  const byTheater = {};
  for (const st of showtimes) {
    if (!byTheater[st.theater_id]) byTheater[st.theater_id] = {};
    byTheater[st.theater_id][st.showing_number] = st;
  }
  const conflicts = [];
  for (const [tid, byShow] of Object.entries(byTheater)) {
    const s1 = byShow[1];
    const s2 = byShow[2];
    if (!s1 || !s2 || !s1.movie_id || !s2.movie_id) continue;
    const s1End = s1.show_end_minutes;
    const s2Start = parseTimeToMinutes(s2.show_start);
    const result = checkOverlap(s1End, s2Start, TURNOVER_MIN);
    if (!result.ok || result.tight) {
      conflicts.push({
        theater_id: Number(tid),
        showing1_end: s1.show_end_label,
        showing2_start: s2.show_start,
        ok: result.ok,
        tight: !!result.tight,
        message: result.message,
      });
    }
  }
  return conflicts;
}

/**
 * For every theater that has a movie assigned to showing 1, compute the
 * recommended showing 2 start time. Returned as a map { theater_id: { ... } }
 * so the dashboard can prefill the showing-2 modal automatically.
 */
function buildShowing2Recommendations(showtimes) {
  const byTheater = {};
  for (const st of showtimes) {
    if (!byTheater[st.theater_id]) byTheater[st.theater_id] = {};
    byTheater[st.theater_id][st.showing_number] = st;
  }
  const out = {};
  for (const [tid, byShow] of Object.entries(byTheater)) {
    const s1 = byShow[1];
    if (!s1 || !s1.movie_id || s1.show_end_minutes == null) continue;
    const rec = recommendShowing2Start(s1.show_end_minutes, TURNOVER_MIN, SHOWING_2_FLOOR_MIN);
    if (rec) out[tid] = rec;
  }
  return out;
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const movies = await env.GALA_DB.prepare(
    'SELECT * FROM movies WHERE active = 1 ORDER BY title'
  ).all();

  const showtimes = await env.GALA_DB.prepare(
    'SELECT * FROM showtimes ORDER BY showing_number, theater_id'
  ).all();

  const movieList = movies.results || [];
  const enriched = (showtimes.results || []).map(s => enrichShowtime(s, movieList));
  const conflicts = detectOverlapsByTheater(enriched);
  const showing2_recommendations = buildShowing2Recommendations(enriched);

  return jsonOk({
    movies: movieList,
    showtimes: enriched,
    conflicts,
    showing_defaults: SHOWING_DEFAULTS,
    turnover_minutes: TURNOVER_MIN,
    default_trailers_minutes: DEFAULT_TRAILERS_MIN,
    messaging_minutes: MESSAGING_MIN,
    showing_2_floor_label: formatMinutes12h(SHOWING_2_FLOOR_MIN),
    showing_2_floor_minutes: SHOWING_2_FLOOR_MIN,
    showing2_recommendations,
  }, 60);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  let body;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const { action } = body;

  // ─── Add movie ────────────────────────────────────────────────────
  if (action === 'add_movie') {
    const {
      title, year, runtime_minutes, trailer_url,
      poster_url, thumbnail_url, synopsis, tmdb_id, backdrop_url, rating, release_date,
      stream_uid, trailer_duration_seconds,
    } = body;
    if (!title) return jsonError('title required', 400);

    if (tmdb_id) {
      const existing = await env.GALA_DB.prepare(
        'SELECT id FROM movies WHERE tmdb_id = ? LIMIT 1'
      ).bind(tmdb_id).first();
      if (existing) {
        return jsonOk({ ok: true, id: existing.id, deduped: true });
      }
    }

    // H3 — poster_url MUST be the canonical TMDB URL
    // (image.tmdb.org/t/p/w500/{poster_path}) so rich movie cards +
    // MovieDetailSheet hero render legit posters. thumbnail_url is
    // optional, populated only when admin uploads a local override
    // for filter-chip use.
    const result = await env.GALA_DB.prepare(`
      INSERT INTO movies
        (title, year, runtime_minutes, trailer_url, poster_url, thumbnail_url, synopsis, tmdb_id, backdrop_url, rating, release_date, stream_uid, trailer_duration_seconds, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      title,
      year || (release_date ? Number(release_date.slice(0, 4)) : 2026),
      runtime_minutes || null,
      trailer_url || null,
      poster_url || null,
      thumbnail_url || null,
      synopsis || null,
      tmdb_id || null,
      backdrop_url || null,
      rating || null,
      release_date || null,
      stream_uid || null,
      trailer_duration_seconds || null,
    ).run();

    return jsonOk({ ok: true, id: result.meta?.last_row_id });
  }

  // ─── Update movie ────────────────────────────────────────────────
  if (action === 'update_movie') {
    const { id } = body;
    if (!id) return jsonError('id required', 400);

    // H3 — thumbnail_url joins the editable column list. Admin can
    // upload a local PNG override without clobbering poster_url.
    const fields = [
      'title', 'year', 'runtime_minutes', 'trailer_url', 'poster_url',
      'thumbnail_url',
      'synopsis', 'tmdb_id', 'backdrop_url', 'rating', 'release_date',
      'stream_uid', 'trailer_duration_seconds', 'active',
    ];
    const sets = [];
    const params = [];
    for (const f of fields) {
      if (body[f] !== undefined) {
        sets.push(`${f} = ?`);
        params.push(f === 'active' ? (body[f] ? 1 : 0) : body[f]);
      }
    }
    if (!sets.length) return jsonError('No fields to update', 400);
    params.push(id);

    await env.GALA_DB.prepare(
      `UPDATE movies SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...params).run();
    return jsonOk({ ok: true });
  }

  // ─── Delete movie (soft) ─────────────────────────────────────────
  if (action === 'delete_movie') {
    const { id } = body;
    if (!id) return jsonError('id required', 400);
    await env.GALA_DB.prepare(
      'UPDATE showtimes SET movie_id = NULL WHERE movie_id = ?'
    ).bind(id).run();
    await env.GALA_DB.prepare(
      'UPDATE movies SET active = 0 WHERE id = ?'
    ).bind(id).run();
    return jsonOk({ ok: true });
  }

  // ─── Set / upsert showtime ───────────────────────────────────────
  if (action === 'set_showtime') {
    const { theater_id, movie_id, showing_number, dinner_time, show_start, capacity, trailer_minutes } = body;
    if (!theater_id || !showing_number) {
      return jsonError('theater_id and showing_number required', 400);
    }

    const existing = await env.GALA_DB.prepare(
      'SELECT id FROM showtimes WHERE theater_id = ? AND showing_number = ? LIMIT 1'
    ).bind(theater_id, showing_number).first();

    if (existing) {
      const sets = [];
      const params = [];
      if (movie_id !== undefined) { sets.push('movie_id = ?'); params.push(movie_id || null); }
      if (dinner_time !== undefined) { sets.push('dinner_time = ?'); params.push(dinner_time); }
      if (show_start !== undefined) { sets.push('show_start = ?'); params.push(show_start); }
      if (capacity !== undefined) { sets.push('capacity = ?'); params.push(capacity); }
      if (trailer_minutes !== undefined) { sets.push('trailer_minutes = ?'); params.push(trailer_minutes); }
      if (sets.length) {
        params.push(existing.id);
        await env.GALA_DB.prepare(
          `UPDATE showtimes SET ${sets.join(', ')} WHERE id = ?`
        ).bind(...params).run();
      }
      return jsonOk({ ok: true, id: existing.id, updated: true });
    }

    const result = await env.GALA_DB.prepare(`
      INSERT INTO showtimes (theater_id, movie_id, showing_number, dinner_time, show_start, capacity, trailer_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      theater_id,
      movie_id || null,
      showing_number,
      dinner_time || null,
      show_start || null,
      capacity || null,
      trailer_minutes != null ? trailer_minutes : DEFAULT_TRAILERS_MIN,
    ).run();
    return jsonOk({ ok: true, id: result.meta?.last_row_id, created: true });
  }

  // ─── Clear showtime ──────────────────────────────────────────────
  if (action === 'clear_showtime') {
    const { theater_id, showing_number } = body;
    if (!theater_id || !showing_number) {
      return jsonError('theater_id and showing_number required', 400);
    }
    await env.GALA_DB.prepare(
      'UPDATE showtimes SET movie_id = NULL WHERE theater_id = ? AND showing_number = ?'
    ).bind(theater_id, showing_number).run();
    return jsonOk({ ok: true });
  }

  return jsonError('Unknown action', 400);
}
