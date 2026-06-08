// POST /api/gala/admin/move-seat
// Admin-only. Moves an occupied seat to an open seat, OR swaps two
// occupied seats. The destination can be the SAME room OR a DIFFERENT
// auditorium/showing (cross-room move) — for the gala-night seat mover so
// an admin can relocate any sponsor anywhere without juggling tokens or
// hitting the orphan nudge meant for fresh self-service picking.
//
// Body: {
//   theater_id, showing_number,            // SOURCE room (where `from` lives)
//   from: { row_label, seat_num },
//   to:   { row_label, seat_num,
//           theater_id?, showing_number? }  // DEST; default to source room
// }
//
// Behavior:
//   - `from` must be an occupied seat (the person/seat being moved).
//   - If `to` is OPEN: relocate the from-row to the to-coordinates AND
//     to-room (sponsor_id, delegation_id, guest_name, dinner_choice all
//     ride along; theater_id + showing_number update to the destination).
//   - If `to` is OCCUPIED: swap the two assignments (each keeps its own
//     sponsor/guest/dinner; only the seat coordinates + room trade).
//
// All FOUR composite-key columns (theater_id, showing_number, row_label,
// seat_num) are bound on every write — composite-key-bug discipline. No
// orphan check (admin moves are deliberate arrangement). Capacity is
// untouched: a move is a relocate (net zero), so no quota concern. Every
// change logged to sponsor_actions_log when that table exists.

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

  const t = Number(body.theater_id);      // source room
  const sh = Number(body.showing_number);
  const from = body.from || {};
  const to = body.to || {};
  const fr = String(from.row_label || '');
  const fn = String(from.seat_num || '');
  const tr = String(to.row_label || '');
  const tn = String(to.seat_num || '');
  // Destination room — defaults to the source room when omitted, so existing
  // same-room callers are unchanged.
  const dt = to.theater_id != null ? Number(to.theater_id) : t;
  const dsh = to.showing_number != null ? Number(to.showing_number) : sh;

  if (!t || !sh || !fr || !fn || !tr || !tn) {
    return jsonError('theater_id, showing_number, from{row,seat}, to{row,seat} all required', 400);
  }
  if (!dt || !dsh) {
    return jsonError('Destination theater_id/showing_number invalid', 400);
  }
  if (dt === t && dsh === sh && fr === tr && fn === tn) {
    return jsonError('Source and destination are the same seat', 400);
  }

  // Cross-room destinations must be a real showtime.
  if (dt !== t || dsh !== sh) {
    const showOk = await env.GALA_DB.prepare(
      `SELECT 1 FROM showtimes WHERE theater_id = ? AND showing_number = ? LIMIT 1`
    ).bind(dt, dsh).first();
    if (!showOk) return jsonError(`No showtime for auditorium ${dt} showing ${dsh}`, 400);
  }

  const src = await getAssignment(env, t, sh, fr, fn);
  if (!src) return jsonError(`Seat ${fr}${fn} is not occupied — nothing to move`, 404);

  const dst = await getAssignment(env, dt, dsh, tr, tn);

  // Guard: no active hold by anyone on the destination (open case).
  if (!dst) {
    const held = await env.GALA_DB.prepare(
      `SELECT 1 FROM seat_holds
        WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?
          AND expires_at > datetime('now') LIMIT 1`
    ).bind(dt, dsh, tr, tn).first();
    if (held) return jsonError(`Seat ${tr}${tn} is currently being held by a sponsor — try another seat`, 409);
  }

  if (!dst) {
    // ── MOVE into an open seat (possibly a different room) ──
    // SET binds all four composite-key columns to the destination; WHERE
    // re-asserts the source coords as an optimistic-concurrency guard.
    const res = await env.GALA_DB.prepare(
      `UPDATE seat_assignments
          SET theater_id = ?, showing_number = ?, row_label = ?, seat_num = ?,
              updated_at = datetime('now'), assigned_by = 'admin-seatmap'
        WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?`
    ).bind(dt, dsh, tr, tn, t, sh, fr, fn).run();
    if ((res.meta?.changes || 0) === 0) return jsonError('Move failed — source changed, refresh and retry', 409);

    await logAction(env, {
      sponsor_id: src.sponsor_id,
      action: 'admin_move_seat',
      detail: {
        from: { theater_id: t, showing_number: sh, seat: `${fr}${fn}` },
        to: { theater_id: dt, showing_number: dsh, seat: `${tr}${tn}` },
        guest: src.guest_name,
      },
    });
    return jsonOk({
      ok: true, kind: 'move',
      from: `${fr}${fn}`, to: `${tr}${tn}`,
      from_theater: t, to_theater: dt, from_showing: sh, to_showing: dsh,
      cross_room: dt !== t || dsh !== sh,
      guest_name: src.guest_name,
    });
  }

  // ── SWAP two occupied seats (possibly across rooms) ──
  // Two-phase via a temp parking coordinate to dodge the UNIQUE
  // (theater,showing,row,seat) constraint during the trade. Park keeps the
  // src in its OWN source room under a sentinel row + unique seat (its id),
  // so it can never collide with a real or destination seat.
  const PARK_ROW = '__SWAP__';
  try {
    // src -> park (sentinel row in source room, unique seat = its id)
    await env.GALA_DB.prepare(
      `UPDATE seat_assignments
          SET theater_id = ?, showing_number = ?, row_label = ?, seat_num = ?
        WHERE id = ?`
    ).bind(t, sh, PARK_ROW, String(src.id), src.id).run();
    // dst -> src's old room+coords
    await env.GALA_DB.prepare(
      `UPDATE seat_assignments
          SET theater_id = ?, showing_number = ?, row_label = ?, seat_num = ?,
              updated_at = datetime('now'), assigned_by = 'admin-seatmap'
        WHERE id = ?`
    ).bind(t, sh, fr, fn, dst.id).run();
    // park (src) -> dst's old room+coords
    await env.GALA_DB.prepare(
      `UPDATE seat_assignments
          SET theater_id = ?, showing_number = ?, row_label = ?, seat_num = ?,
              updated_at = datetime('now'), assigned_by = 'admin-seatmap'
        WHERE id = ?`
    ).bind(dt, dsh, tr, tn, src.id).run();
  } catch (e) {
    // Best-effort unpark so we never strand a row in __SWAP__.
    await env.GALA_DB.prepare(
      `UPDATE seat_assignments
          SET theater_id = ?, showing_number = ?, row_label = ?, seat_num = ?
        WHERE id = ? AND row_label = ?`
    ).bind(t, sh, fr, fn, src.id, PARK_ROW).run().catch(() => {});
    return jsonError('Swap failed mid-flight — please refresh and verify those two seats', 500);
  }

  await logAction(env, {
    sponsor_id: src.sponsor_id,
    action: 'admin_swap_seat',
    detail: {
      a: { theater_id: t, showing_number: sh, seat: `${fr}${fn}` },
      b: { theater_id: dt, showing_number: dsh, seat: `${tr}${tn}` },
      guest_a: src.guest_name, guest_b: dst.guest_name,
    },
  });
  return jsonOk({
    ok: true, kind: 'swap',
    a: `${fr}${fn}`, b: `${tr}${tn}`,
    a_theater: t, b_theater: dt, a_showing: sh, b_showing: dsh,
    cross_room: dt !== t || dsh !== sh,
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
