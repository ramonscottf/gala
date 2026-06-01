// GET /api/gala/admin/seatmap?theater_id=N&showing_number=M
// Admin-only. One call that feeds the /admin/seatmap tool: every
// assignment for the theater+showing, enriched with sponsor company +
// tier so the map can color/label by sponsor and the side list can
// group by company. Also returns active holds so the map can show
// "someone's picking this right now".
//
// Read-only. Layout geometry comes from the static
// /data/theater-layouts.json (the tool fetches that directly).

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const url = new URL(request.url);
  const t = Number(url.searchParams.get('theater_id'));
  const sh = Number(url.searchParams.get('showing_number'));
  if (!t || !sh) return jsonError('theater_id and showing_number required', 400);

  const rows = await env.GALA_DB.prepare(
    `SELECT sa.row_label, sa.seat_num, sa.sponsor_id, sa.delegation_id,
            sa.guest_name, sa.dinner_choice,
            s.company AS sponsor_company, s.sponsorship_tier
       FROM seat_assignments sa
       LEFT JOIN sponsors s ON s.id = sa.sponsor_id
      WHERE sa.theater_id = ? AND sa.showing_number = ?
      ORDER BY sa.row_label, CAST(sa.seat_num AS INTEGER)`
  ).bind(t, sh).all();

  const holds = await env.GALA_DB.prepare(
    `SELECT row_label, seat_num FROM seat_holds
      WHERE theater_id = ? AND showing_number = ? AND expires_at > datetime('now')`
  ).bind(t, sh).all();

  return jsonOk({
    theater_id: t,
    showing_number: sh,
    assignments: (rows.results || []).map((r) => ({
      seat: `${r.row_label}${r.seat_num}`,
      row: r.row_label,
      num: String(r.seat_num),
      sponsor_id: r.sponsor_id,
      delegation_id: r.delegation_id,
      company: r.sponsor_company || null,
      tier: r.sponsorship_tier || null,
      guest_name: r.guest_name || null,
      dinner: r.dinner_choice || null,
    })),
    holds: (holds.results || []).map((h) => `${h.row_label}${h.seat_num}`),
  }, 0);
}
