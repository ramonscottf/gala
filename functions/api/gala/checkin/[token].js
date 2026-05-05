// GET  /api/gala/checkin/[token]  — lookup group details + seats (admin or public for QR scan)
// POST /api/gala/checkin/[token]  — mark group as checked in (admin only)

import { verifyGalaAuth } from '../_auth.js';
import { resolveToken, jsonError, jsonOk } from '../_sponsor_portal.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const token = params.token;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid check-in code', 404);

  const scopeId = resolved.record.id;
  const myAssignmentsQ = resolved.kind === 'sponsor'
    ? `SELECT * FROM seat_assignments WHERE sponsor_id = ? AND delegation_id IS NULL ORDER BY theater_id, row_label, seat_num`
    : `SELECT * FROM seat_assignments WHERE delegation_id = ? ORDER BY theater_id, row_label, seat_num`;
  const seats = await env.GALA_DB.prepare(myAssignmentsQ).bind(scopeId).all();
  const seatList = seats.results || [];

  const name = resolved.kind === 'sponsor'
    ? ([resolved.record.first_name, resolved.record.last_name].filter(Boolean).join(' ').trim() || resolved.record.company)
    : resolved.record.delegate_name;
  const company = resolved.kind === 'sponsor' ? resolved.record.company : resolved.record.parent_company;
  const tier = resolved.kind === 'sponsor' ? resolved.record.sponsorship_tier : resolved.record.parent_tier;

  // Compute checked-in count
  const checkedInCount = seatList.filter(s => s.checked_in).length;

  return jsonOk({
    kind: resolved.kind,
    name,
    company,
    tier,
    seatCount: seatList.length,
    checkedInCount,
    seats: seatList.map(s => ({
      theater_id: s.theater_id,
      row_label: s.row_label,
      seat_num: s.seat_num,
      guest_name: s.guest_name,
      checked_in: !!s.checked_in,
      checked_in_at: s.checked_in_at,
    })),
  });
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const token = params.token;
  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid token', 404);

  let body;
  try { body = await request.json(); }
  catch { body = {}; }
  const { action = 'checkin' } = body; // or 'uncheckin'

  const cond = resolved.kind === 'sponsor'
    ? `sponsor_id = ? AND delegation_id IS NULL`
    : `delegation_id = ?`;
  const scopeId = resolved.record.id;

  if (action === 'checkin') {
    const r = await env.GALA_DB.prepare(
      `UPDATE seat_assignments SET checked_in = 1, checked_in_at = datetime('now')
        WHERE ${cond} AND checked_in = 0`
    ).bind(scopeId).run();
    return jsonOk({ ok: true, action: 'checkin', rowsUpdated: r.meta.changes });
  }

  if (action === 'uncheckin') {
    const r = await env.GALA_DB.prepare(
      `UPDATE seat_assignments SET checked_in = 0, checked_in_at = NULL
        WHERE ${cond}`
    ).bind(scopeId).run();
    return jsonOk({ ok: true, action: 'uncheckin', rowsUpdated: r.meta.changes });
  }

  return jsonError('Unknown action', 400);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
