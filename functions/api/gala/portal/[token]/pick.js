// POST /api/gala/portal/[token]/pick
// Body: { action: 'hold'|'release'|'finalize'|'unfinalize', theater_id, row_label, seat_num }
//
// hold: put a 15-minute hold on a seat (user is contemplating it)
// release: drop a hold
// finalize: convert a hold -> assignment (claims the seat)
// unfinalize: remove an assignment (un-click after Done)
//
// Enforces seat-count budget against token's available capacity.

import {
  resolveToken,
  getSeatsAvailableToPlace,
  cleanupExpiredHolds,
  jsonError,
  jsonOk,
} from '../../_sponsor_portal.js';

const HOLD_MINUTES = 15;

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const token = params.token;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  await cleanupExpiredHolds(env);

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid or expired link', 404);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const action = body.action;
  const theater_id = Number(body.theater_id);
  const row_label = String(body.row_label || '');
  const seat_num = String(body.seat_num || '');

  if (!['hold','release','finalize','unfinalize','set_dinner'].includes(action)) {
    return jsonError('Invalid action', 400);
  }
  if (!theater_id || !row_label || !seat_num) {
    return jsonError('theater_id, row_label, and seat_num required', 400);
  }

  const sponsorId = resolved.kind === 'sponsor' ? resolved.record.id : resolved.record.parent_sponsor_id;
  const delegationId = resolved.kind === 'delegation' ? resolved.record.id : null;

  // Update delegation accessed_at if applicable
  if (resolved.kind === 'delegation' && !resolved.record.accessed_at) {
    await env.GALA_DB.prepare(
      `UPDATE sponsor_delegations SET accessed_at = datetime('now'), status = 'active' WHERE id = ?`
    ).bind(resolved.record.id).run();
  }

  // ───── SET_DINNER (update dinner_choice on a seat owned by this token) ─────
  if (action === 'set_dinner') {
    const VALID = new Set(['brisket','turkey','veggie','kids','glutenfree']);
    const raw = body.dinner_choice;
    const dinner = (raw == null || raw === '') ? null : String(raw);
    if (dinner !== null && !VALID.has(dinner)) {
      return jsonError(`Invalid dinner_choice: ${dinner}`, 400);
    }
    const cond = resolved.kind === 'sponsor'
      ? `sponsor_id = ? AND delegation_id IS NULL`
      : `delegation_id = ?`;
    const val = resolved.record.id;
    const result = await env.GALA_DB.prepare(
      `UPDATE seat_assignments
          SET dinner_choice = ?, updated_at = datetime('now')
        WHERE theater_id = ? AND row_label = ? AND seat_num = ?
          AND ${cond}`
    ).bind(dinner, theater_id, row_label, seat_num, val).run();

    if ((result.meta?.changes || 0) === 0) {
      return jsonError('Seat is not assigned to this token', 404);
    }
    return jsonOk({ ok: true, action: 'set_dinner', dinner_choice: dinner });
  }

  // ───── RELEASE hold ─────
  if (action === 'release') {
    await env.GALA_DB.prepare(
      `DELETE FROM seat_holds
        WHERE theater_id = ? AND row_label = ? AND seat_num = ?
          AND held_by_token = ?`
    ).bind(theater_id, row_label, seat_num, token).run();
    return jsonOk({ ok: true, action: 'released' });
  }

  // ───── UNFINALIZE (un-claim a previously-assigned seat) ─────
  if (action === 'unfinalize') {
    // Can only unfinalize seats belonging to THIS token's scope
    const cond = resolved.kind === 'sponsor'
      ? `sponsor_id = ? AND delegation_id IS NULL`
      : `delegation_id = ?`;
    const val = resolved.kind === 'sponsor' ? resolved.record.id : resolved.record.id;

    const result = await env.GALA_DB.prepare(
      `DELETE FROM seat_assignments
        WHERE theater_id = ? AND row_label = ? AND seat_num = ?
          AND ${cond}`
    ).bind(theater_id, row_label, seat_num, val).run();

    return jsonOk({ ok: true, action: 'unfinalized', removed: result.meta.changes });
  }

  // For HOLD and FINALIZE, seat must not already be assigned
  const existing = await env.GALA_DB.prepare(
    `SELECT sponsor_id, delegation_id FROM seat_assignments
      WHERE theater_id = ? AND row_label = ? AND seat_num = ?`
  ).bind(theater_id, row_label, seat_num).first();
  if (existing) {
    return jsonError('Seat already taken', 409);
  }

  // Seat must not be held by someone else (our own hold is fine)
  const heldByOther = await env.GALA_DB.prepare(
    `SELECT held_by_token FROM seat_holds
      WHERE theater_id = ? AND row_label = ? AND seat_num = ?
        AND expires_at > datetime('now') AND held_by_token != ?`
  ).bind(theater_id, row_label, seat_num, token).first();
  if (heldByOther) {
    return jsonError('Seat is currently held by another sponsor', 409);
  }

  // ───── HOLD ─────
  if (action === 'hold') {
    // Enforce seat budget (hold count + finalized count should not exceed available seats)
    const math = await getSeatsAvailableToPlace(env, resolved);
    const myHolds = await env.GALA_DB.prepare(
      `SELECT COUNT(*) AS n FROM seat_holds
        WHERE held_by_token = ? AND expires_at > datetime('now')`
    ).bind(token).first();
    const myHoldCount = myHolds.n || 0;
    if (myHoldCount + math.placed >= math.total - math.delegated) {
      return jsonError(`You've already selected your full ${math.total - math.delegated} seats`, 400);
    }

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
    await env.GALA_DB.prepare(
      `INSERT INTO seat_holds (theater_id, row_label, seat_num, sponsor_id, delegation_id, held_by_token, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(theater_id, row_label, seat_num)
       DO UPDATE SET held_by_token = excluded.held_by_token,
                     sponsor_id = excluded.sponsor_id,
                     delegation_id = excluded.delegation_id,
                     expires_at = excluded.expires_at,
                     held_at = datetime('now')`
    ).bind(theater_id, row_label, seat_num, sponsorId, delegationId, token, expiresAt).run();

    return jsonOk({ ok: true, action: 'held', expires_at: expiresAt });
  }

  // ───── FINALIZE ─────
  if (action === 'finalize') {
    const math = await getSeatsAvailableToPlace(env, resolved);
    const myPlaced = math.placed;
    const myQuota = math.total - math.delegated;
    if (myPlaced >= myQuota) {
      return jsonError(`You've already placed your full ${myQuota} seats`, 400);
    }

    // Compose guest_name (for the chart display)
    const guestName = resolved.kind === 'sponsor'
      ? `${resolved.record.company}${resolved.record.first_name ? ' (' + resolved.record.first_name + ' ' + (resolved.record.last_name || '') + ')' : ''}`
      : `${resolved.record.parent_company} / ${resolved.record.delegate_name}`;

    await env.GALA_DB.prepare(
      `INSERT INTO seat_assignments
         (theater_id, row_label, seat_num, guest_name, sponsor_id, delegation_id, finalized_at, assigned_by)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'portal')`
    ).bind(theater_id, row_label, seat_num, guestName, sponsorId, delegationId).run();

    // Clear hold if it exists
    await env.GALA_DB.prepare(
      `DELETE FROM seat_holds
        WHERE theater_id = ? AND row_label = ? AND seat_num = ?`
    ).bind(theater_id, row_label, seat_num).run();

    return jsonOk({ ok: true, action: 'finalized' });
  }

  return jsonError('Unhandled action', 400);
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
