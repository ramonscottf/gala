// GET /api/gala/admin/showtimes
// Admin-only. Returns every showtime with its movie title + real per-
// auditorium start time, so the seat-mover picker/header can label rooms
// "Aud 1 · The Breadwinner · 5:00 PM" instead of bare numbers. Times differ
// by auditorium (Aud 8 = 4:50, Aud 10 = 4:30, etc.), so we use the actual
// show_start, never a generic per-showing label.
//
// Read-only.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const rows = await env.GALA_DB.prepare(
    `SELECT st.theater_id, st.showing_number, st.show_start, st.dinner_time,
            m.title AS movie_title, m.poster_url
       FROM showtimes st
       LEFT JOIN movies m ON m.id = st.movie_id
      ORDER BY st.showing_number, st.theater_id`
  ).all();

  return jsonOk({
    showtimes: (rows.results || []).map((r) => ({
      theater_id: r.theater_id,
      showing_number: r.showing_number,
      show_start: r.show_start || null,
      dinner_time: r.dinner_time || null,
      movie_title: r.movie_title || 'TBD',
      poster_url: r.poster_url || null,
    })),
  }, 0);
}
