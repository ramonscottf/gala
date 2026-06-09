// GET /api/gala/admin/directory
// Admin-only. The whole event in one call: every seat assignment with full
// identity (sponsor company / delegate / guest), dinner, check-in state, and
// the showing's movie + time. Powers the Seat Mover's directory search and
// the "tonight at a glance" overview cards (Phase 4).
//
// Read-only. ~500 rows max (sold-out building), single indexed-join query —
// cheap enough to refetch after every move so counts stay live.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const rs = await env.GALA_DB.prepare(
    `SELECT sa.theater_id, sa.showing_number, sa.row_label, sa.seat_num,
            sa.sponsor_id, sa.delegation_id, sa.guest_name, sa.dinner_choice,
            sa.checked_in,
            s.company AS sponsor_company, s.sponsorship_tier,
            d.delegate_name, ps.company AS parent_company,
            st.show_start, m.title AS movie_title
       FROM seat_assignments sa
       LEFT JOIN sponsors s  ON s.id  = sa.sponsor_id
       LEFT JOIN sponsor_delegations d ON d.id = sa.delegation_id
       LEFT JOIN sponsors ps ON ps.id = d.parent_sponsor_id
       LEFT JOIN showtimes st ON st.theater_id = sa.theater_id
                             AND st.showing_number = sa.showing_number
       LEFT JOIN movies m ON m.id = st.movie_id
      ORDER BY sa.theater_id, sa.showing_number,
               sa.row_label, CAST(sa.seat_num AS INTEGER)`
  ).all();

  return jsonOk({
    rows: (rs.results || []).map((r) => ({
      theater_id: r.theater_id,
      showing_number: r.showing_number,
      row: r.row_label,
      num: String(r.seat_num),
      seat: `${r.row_label}${r.seat_num}`,
      sponsor_id: r.sponsor_id,
      delegation_id: r.delegation_id,
      guest_name: r.guest_name || null,
      delegate_name: r.delegate_name || null,
      company: r.sponsor_company || null,
      parent_company: r.parent_company || null,
      tier: r.sponsorship_tier || null,
      dinner: r.dinner_choice || null,
      checked_in: r.checked_in ? 1 : 0,
      movie: r.movie_title || null,
      show_start: r.show_start || null,
    })),
  }, 0);
}
