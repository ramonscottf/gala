// /api/gala/salad-gf/status
// GET (admin only) — progress of the gluten-free salad poll for the admin tab.
// Returns recipient-level rows + kitchen-relevant totals.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const { results } = await env.GALA_DB.prepare(
    `SELECT token, recipient_type, name, email, phone, salad_seats, gf_count, responded
       FROM salad_gf_poll
      ORDER BY responded ASC, recipient_type ASC, name COLLATE NOCASE ASC`
  ).all();
  const rows = results || [];

  const total = rows.length;
  const responded = rows.filter(r => r.responded).length;
  const totalSeats = rows.reduce((a, r) => a + (r.salad_seats || 0), 0);
  const gfSeats = rows.reduce((a, r) => a + (r.responded ? (r.gf_count || 0) : 0), 0);
  const regSeats = rows.reduce((a, r) => a + (r.responded ? ((r.salad_seats || 0) - (r.gf_count || 0)) : 0), 0);
  const awaitingSeats = rows.reduce((a, r) => a + (r.responded ? 0 : (r.salad_seats || 0)), 0);

  return jsonOk({
    total, responded, awaiting: total - responded,
    totalSeats, gfSeats, regSeats, awaitingSeats,
    recipients: rows.map(r => ({
      type: r.recipient_type, name: r.name, email: r.email, phone: r.phone,
      salad_seats: r.salad_seats, gf_count: r.gf_count, responded: !!r.responded,
    })),
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
