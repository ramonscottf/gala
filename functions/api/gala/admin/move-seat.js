// POST /api/gala/admin/move-seat
// Admin-only. Moves an occupied seat to an open seat, OR swaps two
// occupied seats, in the SAME theater + showing. Built for the new
// admin seat-mover tool (/admin/seatmap) so an admin can relocate any
// sponsor without juggling per-sponsor tokens or hitting the orphan
// nudge that's meant for fresh self-service picking.
//
// Body: {
//   theater_id, showing_number,
//   from: { row_label, seat_num },
//   to:   { row_label, seat_num }
// }
//
// Behavior:
//   - `from` must be an occupied seat (the person/seat being moved).
//   - If `to` is OPEN: relocate the from-row to the to-coordinates
//     (same row keeps the assignment intact: sponsor_id, delegation_id,
//     guest_name, dinner_choice all ride along).
//   - If `to` is OCCUPIED: swap the two assignments (each keeps its own
//     sponsor/guest/dinner; only the seat coordinates trade).
//
// All four composite-key columns are bound on every write
// (theater_id, showing_number, row_label, seat_num) — composite-key-bug
// discipline. No orphan check (admin moves are deliberate arrangement).
// Every change logged to sponsor_actions_log when that table exists.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

async function getAssignment(env, t, sh, row, num) {
  return env.GALA_DB.prepare(
    `SELECT id, sponsor_id, delegation_id, guest_name, dinner_choice
       FROM seat_assignments
      WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?
      LIMIT 1`
  ).bind(t, sh, row, String(num)).first();
}

async function logAction(env, payload) {
  // Best-effort audit; table may not exist on every environment.
  try {
    await env.GALA_DB.prepare(
      `INSERT INTO sponsor_actions_log (sponsor_id, action, detail, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).bind(payload.sponsor_id || null, payload.action, JSON.stringify(payload.detail || {})).run();
  } catch (_) { /* no-op if table absent */ }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const t = Number(body.theater_id);
  const sh = Number(body.showing_number);
  const from = body.from || {};
  const to = body.to || {};
  const fr = String(from.row_label || '');
  const fn = String(from.seat_num || '');
  const tr = String(to.row_label || '');
  const tn = String(to.seat_num || '');

  if (!t || !sh || !fr || !fn || !tr || !tn) {
    return jsonError('theater_id, showing_number, from{row,seat}, to{row,seat} all required', 400);
  }
  if (fr === tr && fn === tn) {
    return jsonError('Source and destination are the same seat', 400);
  }

  const src = await getAssignment(env, t, sh, fr, fn);
  if (!src) return jsonError(`Seat ${fr}${fn} is not occupied — nothing to move`, 404);

  const dst = await getAssignment(env, t, sh, tr, tn);

  // Guard: no active hold by anyone on the destination (open case).
  if (!dst) {
    const held = await env.GALA_DB.prepare(
      `SELECT 1 FROM seat_holds
        WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?
          AND expires_at > datetime('now') LIMIT 1`
    ).bind(t, sh, tr, tn).first();
    if (held) return jsonError(`Seat ${tr}${tn} is currently being held by a sponsor — try another seat`, 409);
  }

  if (!dst) {
    // ── MOVE into an open seat ──
    const res = await env.GALA_DB.prepare(
      `UPDATE seat_assignments
          SET row_label = ?, seat_num = ?, updated_at = datetime('now'),
              assigned_by = 'admin-seatmap'
        WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?`
    ).bind(tr, tn, t, sh, fr, fn).run();
    if ((res.meta?.changes || 0) === 0) return jsonError('Move failed — source changed, refresh and retry', 409);

    await logAction(env, {
      sponsor_id: src.sponsor_id,
      action: 'admin_move_seat',
      detail: { theater_id: t, showing_number: sh, from: `${fr}${fn}`, to: `${tr}${tn}`, guest: src.guest_name },
    });
    return jsonOk({ ok: true, kind: 'move', from: `${fr}${fn}`, to: `${tr}${tn}`, guest_name: src.guest_name });
  }

  // ── SWAP two occupied seats ──
  // Two-phase via a temp parking coordinate to dodge the UNIQUE
  // (theater,showing,row,seat) constraint during the trade.
  const PARK_ROW = '__SWAP__';
  try {
    // src -> park
    await env.GALA_DB.prepare(
      `UPDATE seat_assignments SET row_label = ?, seat_num = ?
        WHERE id = ?`
    ).bind(PARK_ROW, `${fr}${fn}`, src.id).run();
    // dst -> src's old coords
    await env.GALA_DB.prepare(
      `UPDATE seat_assignments SET row_label = ?, seat_num = ?, updated_at = datetime('now'), assigned_by = 'admin-seatmap'
        WHERE id = ?`
    ).bind(fr, fn, dst.id).run();
    // park (src) -> dst's coords
    await env.GALA_DB.prepare(
      `UPDATE seat_assignments SET row_label = ?, seat_num = ?, updated_at = datetime('now'), assigned_by = 'admin-seatmap'
        WHERE id = ?`
    ).bind(tr, tn, src.id).run();
  } catch (e) {
    // Best-effort unpark so we never strand a row in __SWAP__.
    await env.GALA_DB.prepare(
      `UPDATE seat_assignments SET row_label = ?, seat_num = ? WHERE id = ? AND row_label = ?`
    ).bind(fr, fn, src.id, PARK_ROW).run().catch(() => {});
    return jsonError('Swap failed mid-flight — please refresh and verify those two seats', 500);
  }

  await logAction(env, {
    sponsor_id: src.sponsor_id,
    action: 'admin_swap_seat',
    detail: { theater_id: t, showing_number: sh, a: `${fr}${fn}`, b: `${tr}${tn}`, guest_a: src.guest_name, guest_b: dst.guest_name },
  });
  return jsonOk({
    ok: true, kind: 'swap',
    a: `${fr}${fn}`, b: `${tr}${tn}`,
    guest_a: src.guest_name, guest_b: dst.guest_name,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
