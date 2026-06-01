// GET /api/gala/admin/sponsor?id=N    → full dossier for one sponsor
// GET /api/gala/admin/sponsor?q=text  → search sponsors (id, company, counts)
//
// Admin-only. Powers the sponsor-centric side panel in the Seat Mover:
// when an admin taps a seat (or searches a company), they need the whole
// picture — every seat that sponsor holds across EVERY auditorium and
// showing, which seats belong to invited guests (delegations), the
// dinner on each, and how many of their purchased seats are placed.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

const DINNER = { frenchdip:'Hot French Dip', salad:'Chicken Salad', veggie:'Vegetarian', kids:'Kids Meal' };

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  const qRaw = (url.searchParams.get('q') || '').trim();
  const listAll = url.searchParams.get('all') === '1';

  // ── LIST ALL (alphabetical) ──
  if (!id && listAll) {
    const rows = await env.GALA_DB.prepare(
      `SELECT s.id, s.company, s.sponsorship_tier, s.seats_purchased,
              (SELECT COUNT(*) FROM seat_assignments a WHERE a.sponsor_id = s.id) AS placed
         FROM sponsors s
        WHERE s.archived_at IS NULL
        ORDER BY s.company COLLATE NOCASE`
    ).all();
    return jsonOk({
      results: (rows.results || []).map((r) => ({
        id: r.id, company: r.company, tier: r.sponsorship_tier,
        purchased: r.seats_purchased || 0, placed: r.placed || 0,
      })),
    }, 0);
  }

  // ── SEARCH ──
  if (!id && qRaw) {
    const like = `%${qRaw.replace(/[%_]/g, '')}%`;
    const rows = await env.GALA_DB.prepare(
      `SELECT s.id, s.company, s.sponsorship_tier, s.seats_purchased,
              (SELECT COUNT(*) FROM seat_assignments a WHERE a.sponsor_id = s.id) AS placed
         FROM sponsors s
        WHERE s.archived_at IS NULL
          AND (s.company LIKE ? COLLATE NOCASE
               OR (s.first_name || ' ' || s.last_name) LIKE ? COLLATE NOCASE)
        ORDER BY s.company LIMIT 12`
    ).bind(like, like).all();
    return jsonOk({
      results: (rows.results || []).map((r) => ({
        id: r.id, company: r.company, tier: r.sponsorship_tier,
        purchased: r.seats_purchased || 0, placed: r.placed || 0,
      })),
    }, 0);
  }

  if (!id) return jsonError('id or q required', 400);

  // ── DOSSIER ──
  const sponsor = await env.GALA_DB.prepare(
    `SELECT id, company, first_name, last_name, email, secondary_email, phone,
            sponsorship_tier, seats_purchased
       FROM sponsors WHERE id = ? LIMIT 1`
  ).bind(id).first();
  if (!sponsor) return jsonError('Sponsor not found', 404);

  // Every seat under this sponsor (their own + their guests'), enriched
  // with movie/showtime so the admin can read the context per auditorium.
  const seatRows = await env.GALA_DB.prepare(
    `SELECT sa.theater_id, sa.showing_number, sa.row_label, sa.seat_num,
            sa.dinner_choice, sa.delegation_id, sa.guest_name,
            m.title AS movie_title, st.show_start, st.dinner_time,
            d.delegate_name
       FROM seat_assignments sa
       LEFT JOIN showtimes st ON st.theater_id = sa.theater_id AND st.showing_number = sa.showing_number
       LEFT JOIN movies m ON m.id = st.movie_id
       LEFT JOIN sponsor_delegations d ON d.id = sa.delegation_id
      WHERE sa.sponsor_id = ?
      ORDER BY sa.theater_id, sa.showing_number, sa.row_label, CAST(sa.seat_num AS INTEGER)`
  ).bind(id).all();

  // Group by (theater, showing).
  const groups = new Map();
  for (const r of (seatRows.results || [])) {
    const key = `${r.theater_id}:${r.showing_number}`;
    if (!groups.has(key)) {
      groups.set(key, {
        theater_id: r.theater_id, showing_number: r.showing_number,
        movie_title: r.movie_title || 'Movie TBA',
        show_start: r.show_start || null, dinner_time: r.dinner_time || null,
        seats: [],
      });
    }
    groups.get(key).seats.push({
      seat: `${r.row_label}${r.seat_num}`, row: r.row_label, num: String(r.seat_num),
      dinner: r.dinner_choice || null,
      dinner_label: r.dinner_choice ? (DINNER[r.dinner_choice] || r.dinner_choice) : null,
      delegation_id: r.delegation_id || null,
      owner: r.delegation_id ? (r.delegate_name || 'Guest') : 'Sponsor',
    });
  }

  // Invited guests (delegations) + how many of each is placed.
  const delRows = await env.GALA_DB.prepare(
    `SELECT d.id, d.delegate_name, d.delegate_email, d.seats_allocated, d.status,
            (SELECT COUNT(*) FROM seat_assignments a WHERE a.delegation_id = d.id) AS placed
       FROM sponsor_delegations d
      WHERE d.parent_sponsor_id = ?
      ORDER BY d.delegate_name`
  ).bind(id).all();

  const seatRowsArr = seatRows.results || [];
  return jsonOk({
    sponsor: {
      id: sponsor.id, company: sponsor.company,
      contact: [sponsor.first_name, sponsor.last_name].filter(Boolean).join(' ') || null,
      email: sponsor.email || sponsor.secondary_email || null,
      phone: sponsor.phone || null,
      tier: sponsor.sponsorship_tier || null,
      purchased: sponsor.seats_purchased || 0,
    },
    placed: seatRowsArr.length,
    own_placed: seatRowsArr.filter((r) => !r.delegation_id).length,
    guest_placed: seatRowsArr.filter((r) => r.delegation_id).length,
    groups: Array.from(groups.values()),
    delegates: (delRows.results || []).map((d) => ({
      id: d.id, name: d.delegate_name, email: d.delegate_email,
      allocated: d.seats_allocated || 0, placed: d.placed || 0, status: d.status || 'pending',
    })),
  }, 0);
}
