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

// ─────────────────────────────────────────────────────────────────────────────
// ORPHAN-SEAT VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
// A row should never be left with a single empty seat sandwiched between two
// occupied seats. We enforce this on the sponsor portal (hold + finalize) only.
// Admin endpoints bypass pick.js, so admin can still place orphans manually.
//
// When a sponsor tries to claim seat N in row R, simulate the post-claim state
// of the row: every seat that's either finalized in seat_assignments, held in
// seat_holds (by anyone), or is N itself counts as "occupied." Then walk the
// occupied set looking for any 1-wide gap between two occupied seats. If we
// find one, reject with a useful error.
//
// Edge cases:
//   - Filling an existing orphan is fine (5,7 occupied, claim 6 → no orphan).
//   - Two-wide gaps are fine (5,8 occupied, claim 6 → 7 is still adjacent
//     to free space).
//   - End-of-row empties don't count — only gaps between two occupied seats.
//   - Seat numbers in D1 are TEXT but always numeric strings; we cast to INT.
async function checkOrphanCreation(env, theater_id, row_label, claimingSeat) {
  // Get every seat in this row that's either already finalized OR currently
  // held (by anyone — including the requesting sponsor's earlier holds).
  // Cast seat_num to integer for proper numeric ordering.
  const rs = await env.GALA_DB.prepare(
    `SELECT CAST(seat_num AS INTEGER) AS n FROM seat_assignments
        WHERE theater_id = ? AND row_label = ?
      UNION
      SELECT CAST(seat_num AS INTEGER) AS n FROM seat_holds
        WHERE theater_id = ? AND row_label = ? AND expires_at > datetime('now')`
  ).bind(theater_id, row_label, theater_id, row_label).all();

  const occupied = new Set((rs.results || []).map(r => r.n));
  const claiming = parseInt(claimingSeat, 10);
  occupied.add(claiming); // simulate post-claim state

  // Walk from min to max and find any single-seat gap between two occupied.
  const sorted = [...occupied].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] - sorted[i] === 2) {
      // Exactly one seat between sorted[i] and sorted[i+1] is empty.
      const orphan = sorted[i] + 1;
      return { ok: false, orphan };
    }
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────

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

  // ───── SET_DINNER (update dinner_choice on a seat in this token's block) ─────
  // Sponsors can set dinner on ANY seat in their block — direct (delegation_id IS
  // NULL) or any sub-delegation's seats. This lets a host fill in dinner choices
  // for guests who haven't done it themselves (e.g. Aaron picked seats but never
  // chose meals). Delegates remain scoped to their own seats only.
  if (action === 'set_dinner') {
    const VALID = new Set(['brisket','turkey','veggie','kids','glutenfree']);
    const raw = body.dinner_choice;
    const dinner = (raw == null || raw === '') ? null : String(raw);
    if (dinner !== null && !VALID.has(dinner)) {
      return jsonError(`Invalid dinner_choice: ${dinner}`, 400);
    }
    const cond = resolved.kind === 'sponsor'
      ? `sponsor_id = ?`  // any seat in this sponsor's block, owned or delegated
      : `delegation_id = ?`;
    const val = resolved.record.id;
    const result = await env.GALA_DB.prepare(
      `UPDATE seat_assignments
          SET dinner_choice = ?, updated_at = datetime('now')
        WHERE theater_id = ? AND row_label = ? AND seat_num = ?
          AND ${cond}`
    ).bind(dinner, theater_id, row_label, seat_num, val).run();

    if ((result.meta?.changes || 0) === 0) {
      return jsonError('Seat is not in this token\'s block', 404);
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
    // Enforce no-orphan rule: this hold must not create a single empty seat
    // wedged between two occupied seats elsewhere in the row.
    const orphanCheck = await checkOrphanCreation(env, theater_id, row_label, seat_num);
    if (!orphanCheck.ok) {
      return jsonError(
        `That selection would leave seat ${orphanCheck.orphan} alone in row ${row_label}. Please choose a different seat so no single seat is left empty.`,
        409,
      );
    }

    // Enforce seat budget. The user is allowed to hold up to their quota
    // (total - delegated). Holding exactly N seats when quota is N is the
    // GOAL state, not an error — error only when adding THIS hold would
    // push the total OVER quota. Off-by-one fix May 5 2026: was using
    // '>=' on the BEFORE-this-hold count, which wrongly rejected the
    // user's last legitimate seat (e.g. quota 2: pick seat 1 succeeds,
    // then pick seat 2 saw myHoldCount=1, math.placed=0 and 1+0 >= 2
    // fired despite this hold being legal).
    const math = await getSeatsAvailableToPlace(env, resolved);
    const myHolds = await env.GALA_DB.prepare(
      `SELECT COUNT(*) AS n FROM seat_holds
        WHERE held_by_token = ? AND expires_at > datetime('now')`
    ).bind(token).first();
    const myHoldCount = myHolds.n || 0;
    const quota = math.total - math.delegated;
    // Count *after* adding this hold = myHoldCount + 1 + placed.
    if (myHoldCount + 1 + math.placed > quota) {
      return jsonError(`You've already selected your full ${quota} seats`, 400);
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
    // Re-check the orphan rule at finalize time. The row state can change
    // between hold and finalize (other sponsors hold/release/finalize seats
    // in this row), so the hold-time check isn't sufficient on its own.
    const orphanCheck = await checkOrphanCreation(env, theater_id, row_label, seat_num);
    if (!orphanCheck.ok) {
      return jsonError(
        `That selection would leave seat ${orphanCheck.orphan} alone in row ${row_label}. Please choose a different seat so no single seat is left empty.`,
        409,
      );
    }

    const math = await getSeatsAvailableToPlace(env, resolved);
    const myPlaced = math.placed;
    const myQuota = math.total - math.delegated;
    // After-this-finalize count = myPlaced + 1. Reject only when adding
    // this seat would push us OVER quota. (Same off-by-one fix as the
    // hold path above; protects against over-finalize when the SPA
    // races multiple parallel finalize calls or a stale SPA sends an
    // out-of-quota request.)
    if (myPlaced + 1 > myQuota) {
      return jsonError(`You've already placed your full ${myQuota} seats`, 400);
    }

    // Compose guest_name (for the chart display)
    const guestName = resolved.kind === 'sponsor'
      ? `${resolved.record.company}${resolved.record.first_name ? ' (' + resolved.record.first_name + ' ' + (resolved.record.last_name || '') + ')' : ''}`
      : `${resolved.record.parent_company} / ${resolved.record.delegate_name}`;

    try {
      await env.GALA_DB.prepare(
        `INSERT INTO seat_assignments
           (theater_id, row_label, seat_num, guest_name, sponsor_id, delegation_id, finalized_at, assigned_by)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'portal')`
      ).bind(theater_id, row_label, seat_num, guestName, sponsorId, delegationId).run();
    } catch (err) {
      // A true two-client race can pass the pre-insert availability check in
      // both requests, then lose at the DB unique constraint. Convert that
      // expected race into a stable response instead of leaking a 500.
      const raced = await env.GALA_DB.prepare(
        `SELECT sponsor_id, delegation_id FROM seat_assignments
          WHERE theater_id = ? AND row_label = ? AND seat_num = ?`
      ).bind(theater_id, row_label, seat_num).first();
      if (raced) {
        const sameSponsor = Number(raced.sponsor_id) === Number(sponsorId);
        const sameDelegation =
          (raced.delegation_id == null && delegationId == null) ||
          Number(raced.delegation_id) === Number(delegationId);
        if (sameSponsor && sameDelegation) {
          return jsonOk({ ok: true, action: 'finalized', already_finalized: true });
        }
        return jsonError('Seat already taken', 409);
      }
      throw err;
    }

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
