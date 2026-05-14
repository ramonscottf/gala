// POST /api/gala/portal/[token]/pick
// Body: {
//   action: 'hold'|'release'|'finalize'|'unfinalize'|'set_dinner',
//   theater_id, showing_number, row_label, seat_num,
//   dinner_choice (set_dinner only)
// }
//
// hold: put a 15-minute hold on a seat (user is contemplating it)
// release: drop a hold
// finalize: convert a hold -> assignment (claims the seat)
// unfinalize: remove an assignment (un-click after Done)
// set_dinner: update dinner_choice on an existing assignment
//
// Enforces seat-count budget against token's available capacity.
//
// SHOWING_NUMBER (added May 11 2026 after Tanner Clinic incident):
// All four seat-keying tables — seat_assignments, seat_holds, vip_locks,
// seat_blocks — use (theater_id, showing_number, row_label, seat_num)
// as the unique key. A theater may host two showings (early ~4:30/5:00
// PM, late ~7:15/7:40 PM) of the same or different movies, and the
// system must keep them strictly separated. The client now sends
// showing_number in every body; we still resolve it defensively from
// the showtimes table when missing to be safe against stale cached JS
// bundles on a sponsor's phone.

import {
  resolveToken,
  getSeatsAvailableToPlace,
  cleanupExpiredHolds,
  getTierAccess,
  tierGateError,
  jsonError,
  jsonOk,
} from '../../_sponsor_portal.js';
import { getLoveseatPartner } from '../../_loveseat_pairs.js';

const HOLD_MINUTES = 15;

// Client should send showing_number alongside theater_id. For belt-and-
// suspenders compatibility (stale cached JS on a sponsor's phone), we
// accept missing showing_number and resolve it server-side: if the
// theater hosts exactly one showing, use that. If it hosts multiple,
// refuse — better a clean error than a silent write to the wrong show.
async function resolveShowingNumber(env, theater_id, providedShowingNumber) {
  if (providedShowingNumber != null && Number.isFinite(Number(providedShowingNumber))) {
    const n = Number(providedShowingNumber);
    const exists = await env.GALA_DB.prepare(
      `SELECT 1 FROM showtimes WHERE theater_id = ? AND showing_number = ? LIMIT 1`
    ).bind(theater_id, n).first();
    if (!exists) {
      return { ok: false, error: `No showtime for theater ${theater_id} showing ${n}` };
    }
    return { ok: true, showing_number: n };
  }
  const rows = await env.GALA_DB.prepare(
    `SELECT showing_number FROM showtimes WHERE theater_id = ?`
  ).bind(theater_id).all();
  const results = rows.results || [];
  if (results.length === 0) {
    return { ok: false, error: `No showtimes registered for theater ${theater_id}` };
  }
  if (results.length > 1) {
    return {
      ok: false,
      error: `Theater ${theater_id} has multiple showings — showing_number is required`,
    };
  }
  return { ok: true, showing_number: results[0].showing_number };
}

// Orphan check — see top-of-file comments in the prior revision for full
// rationale. All queries scoped to (theater_id, showing_number) so the
// early and late showings of the same theater are independent universes.
async function checkOrphanCreation(env, theater_id, showing_number, row_label, claimingSeat) {
  const claiming = parseInt(claimingSeat, 10);
  const candidates = [claiming - 2, claiming + 2];
  const rs = await env.GALA_DB.prepare(
    `SELECT CAST(seat_num AS INTEGER) AS n FROM seat_assignments
        WHERE theater_id = ? AND showing_number = ? AND row_label = ?
          AND CAST(seat_num AS INTEGER) IN (?, ?)
      UNION
      SELECT CAST(seat_num AS INTEGER) AS n FROM seat_holds
        WHERE theater_id = ? AND showing_number = ? AND row_label = ?
          AND expires_at > datetime('now')
          AND CAST(seat_num AS INTEGER) IN (?, ?)`
  ).bind(
    theater_id, showing_number, row_label, candidates[0], candidates[1],
    theater_id, showing_number, row_label, candidates[0], candidates[1],
  ).all();
  const bracketed = new Set((rs.results || []).map(r => r.n));

  for (const bracket of candidates) {
    if (!bracketed.has(bracket)) continue;
    const gapSeat = (bracket + claiming) / 2;
    const gapOccupied = await env.GALA_DB.prepare(
      `SELECT 1 FROM seat_assignments
        WHERE theater_id = ? AND showing_number = ? AND row_label = ?
          AND CAST(seat_num AS INTEGER) = ?
       UNION
       SELECT 1 FROM seat_holds
        WHERE theater_id = ? AND showing_number = ? AND row_label = ?
          AND CAST(seat_num AS INTEGER) = ?
          AND expires_at > datetime('now')`
    ).bind(
      theater_id, showing_number, row_label, gapSeat,
      theater_id, showing_number, row_label, gapSeat,
    ).first();
    if (!gapOccupied) {
      return { ok: false, orphan: gapSeat };
    }
  }
  return { ok: true };
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const token = params.token;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  await cleanupExpiredHolds(env);

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid or expired link', 404);

  // Tier-window gate (May 14 2026, migration 010). Once a sponsor's tier
  // is open, they keep access forever — nothing closes. This check only
  // blocks pre-open actions. See _sponsor_portal.js > getTierAccess.
  const access = await getTierAccess(env, resolved);
  if (!access.open) return tierGateError(access);

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

  const showResolved = await resolveShowingNumber(env, theater_id, body.showing_number);
  if (!showResolved.ok) return jsonError(showResolved.error, 400);
  const showing_number = showResolved.showing_number;

  const sponsorId = resolved.kind === 'sponsor' ? resolved.record.id : resolved.record.parent_sponsor_id;
  const delegationId = resolved.kind === 'delegation' ? resolved.record.id : null;

  if (resolved.kind === 'delegation' && !resolved.record.accessed_at) {
    await env.GALA_DB.prepare(
      `UPDATE sponsor_delegations SET accessed_at = datetime('now'), status = 'active' WHERE id = ?`
    ).bind(resolved.record.id).run();
  }

  // ───── SET_DINNER ─────
  // Phase 5.8 — menu set after Kara's update on May 10 2026. Mirror this
  // set in DinnerPicker.jsx, DinnerSheet.jsx, dinner.js server enum, and
  // admin/seating.html.
  if (action === 'set_dinner') {
    const VALID = new Set(['frenchdip','salad','veggie','kids']);
    const raw = body.dinner_choice;
    const dinner = (raw == null || raw === '') ? null : String(raw);
    if (dinner !== null && !VALID.has(dinner)) {
      return jsonError(`Invalid dinner_choice: ${dinner}`, 400);
    }
    const cond = resolved.kind === 'sponsor' ? `sponsor_id = ?` : `delegation_id = ?`;
    const val = resolved.record.id;
    const result = await env.GALA_DB.prepare(
      `UPDATE seat_assignments
          SET dinner_choice = ?, updated_at = datetime('now')
        WHERE theater_id = ? AND showing_number = ?
          AND row_label = ? AND seat_num = ?
          AND ${cond}`
    ).bind(dinner, theater_id, showing_number, row_label, seat_num, val).run();

    if ((result.meta?.changes || 0) === 0) {
      return jsonError('Seat is not in this token\'s block', 404);
    }
    return jsonOk({ ok: true, action: 'set_dinner', dinner_choice: dinner });
  }

  // ───── RELEASE ─────
  if (action === 'release') {
    const partnerSeat = await getLoveseatPartner(env, request, theater_id, row_label, seat_num);
    await env.GALA_DB.prepare(
      `DELETE FROM seat_holds
        WHERE theater_id = ? AND showing_number = ?
          AND row_label = ? AND seat_num = ?
          AND held_by_token = ?`
    ).bind(theater_id, showing_number, row_label, seat_num, token).run();
    if (partnerSeat) {
      await env.GALA_DB.prepare(
        `DELETE FROM seat_holds
          WHERE theater_id = ? AND showing_number = ?
            AND row_label = ? AND seat_num = ?
            AND held_by_token = ?`
      ).bind(theater_id, showing_number, row_label, partnerSeat, token).run();
    }
    return jsonOk({ ok: true, action: 'released', paired: !!partnerSeat });
  }

  // ───── UNFINALIZE ─────
  if (action === 'unfinalize') {
    const cond = resolved.kind === 'sponsor'
      ? `sponsor_id = ? AND delegation_id IS NULL`
      : `delegation_id = ?`;
    const val = resolved.kind === 'sponsor' ? resolved.record.id : resolved.record.id;

    const partnerSeat = await getLoveseatPartner(env, request, theater_id, row_label, seat_num);
    const seatsToUnfinalize = partnerSeat ? [seat_num, partnerSeat] : [seat_num];

    let totalRemoved = 0;
    for (const s of seatsToUnfinalize) {
      const result = await env.GALA_DB.prepare(
        `DELETE FROM seat_assignments
          WHERE theater_id = ? AND showing_number = ?
            AND row_label = ? AND seat_num = ?
            AND ${cond}`
      ).bind(theater_id, showing_number, row_label, s, val).run();
      totalRemoved += result.meta.changes || 0;
    }

    return jsonOk({
      ok: true,
      action: 'unfinalized',
      removed: totalRemoved,
      paired: !!partnerSeat,
    });
  }

  // For HOLD and FINALIZE, seat must not already be assigned AT THIS SHOWING.
  const existing = await env.GALA_DB.prepare(
    `SELECT sponsor_id, delegation_id FROM seat_assignments
      WHERE theater_id = ? AND showing_number = ?
        AND row_label = ? AND seat_num = ?`
  ).bind(theater_id, showing_number, row_label, seat_num).first();
  if (existing) return jsonError('Seat already taken', 409);

  const heldByOther = await env.GALA_DB.prepare(
    `SELECT held_by_token FROM seat_holds
      WHERE theater_id = ? AND showing_number = ?
        AND row_label = ? AND seat_num = ?
        AND expires_at > datetime('now') AND held_by_token != ?`
  ).bind(theater_id, showing_number, row_label, seat_num, token).first();
  if (heldByOther) return jsonError('Seat is currently held by another sponsor', 409);

  // ───── HOLD ─────
  if (action === 'hold') {
    const partnerSeat = await getLoveseatPartner(env, request, theater_id, row_label, seat_num);
    const seatsToHold = partnerSeat
      ? [{ row: row_label, num: seat_num }, { row: row_label, num: partnerSeat }]
      : [{ row: row_label, num: seat_num }];

    for (const s of seatsToHold) {
      const orphanCheck = await checkOrphanCreation(env, theater_id, showing_number, row_label, s.num);
      if (!orphanCheck.ok) {
        return jsonError(
          `That selection would leave seat ${orphanCheck.orphan} alone in row ${row_label}. Please choose a different seat so no single seat is left empty.`,
          409,
        );
      }
    }

    if (partnerSeat) {
      const partnerExisting = await env.GALA_DB.prepare(
        `SELECT sponsor_id, delegation_id FROM seat_assignments
          WHERE theater_id = ? AND showing_number = ?
            AND row_label = ? AND seat_num = ?`
      ).bind(theater_id, showing_number, row_label, partnerSeat).first();
      if (partnerExisting) return jsonError('Partner half of this loveseat is already taken', 409);
      const partnerHeldByOther = await env.GALA_DB.prepare(
        `SELECT held_by_token FROM seat_holds
          WHERE theater_id = ? AND showing_number = ?
            AND row_label = ? AND seat_num = ?
            AND expires_at > datetime('now') AND held_by_token != ?`
      ).bind(theater_id, showing_number, row_label, partnerSeat, token).first();
      if (partnerHeldByOther) return jsonError('Partner half of this loveseat is held by another sponsor', 409);
    }

    const math = await getSeatsAvailableToPlace(env, resolved);
    const myHolds = await env.GALA_DB.prepare(
      `SELECT COUNT(*) AS n FROM seat_holds
        WHERE held_by_token = ? AND expires_at > datetime('now')`
    ).bind(token).first();
    const myHoldCount = myHolds.n || 0;
    let newHoldCount = 0;
    for (const s of seatsToHold) {
      const exists = await env.GALA_DB.prepare(
        `SELECT 1 FROM seat_holds
          WHERE theater_id = ? AND showing_number = ?
            AND row_label = ? AND seat_num = ?
            AND held_by_token = ? AND expires_at > datetime('now')`
      ).bind(theater_id, showing_number, row_label, s.num, token).first();
      if (!exists) newHoldCount += 1;
    }
    const quota = math.total - math.delegated;
    if (myHoldCount + newHoldCount + math.placed > quota) {
      return jsonError(`You've already selected your full ${quota} seats`, 400);
    }

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
    for (const s of seatsToHold) {
      await env.GALA_DB.prepare(
        `INSERT INTO seat_holds
           (theater_id, showing_number, row_label, seat_num,
            sponsor_id, delegation_id, held_by_token, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(theater_id, showing_number, row_label, seat_num)
         DO UPDATE SET held_by_token = excluded.held_by_token,
                       sponsor_id = excluded.sponsor_id,
                       delegation_id = excluded.delegation_id,
                       expires_at = excluded.expires_at,
                       held_at = datetime('now')`
      ).bind(
        theater_id, showing_number, s.row, s.num,
        sponsorId, delegationId, token, expiresAt,
      ).run();
    }

    return jsonOk({
      ok: true,
      action: 'held',
      expires_at: expiresAt,
      paired: !!partnerSeat,
      partner_seat: partnerSeat || undefined,
    });
  }

  // ───── FINALIZE ─────
  if (action === 'finalize') {
    const partnerSeat = await getLoveseatPartner(env, request, theater_id, row_label, seat_num);
    const seatsToFinalize = partnerSeat
      ? [{ row: row_label, num: seat_num }, { row: row_label, num: partnerSeat }]
      : [{ row: row_label, num: seat_num }];

    if (partnerSeat) {
      const partnerExisting = await env.GALA_DB.prepare(
        `SELECT sponsor_id, delegation_id FROM seat_assignments
          WHERE theater_id = ? AND showing_number = ?
            AND row_label = ? AND seat_num = ?`
      ).bind(theater_id, showing_number, row_label, partnerSeat).first();
      if (partnerExisting) {
        const sameSponsor = Number(partnerExisting.sponsor_id) === Number(sponsorId);
        const sameDelegation =
          (partnerExisting.delegation_id == null && delegationId == null) ||
          Number(partnerExisting.delegation_id) === Number(delegationId);
        if (!(sameSponsor && sameDelegation)) {
          return jsonError('Partner half of this loveseat is already taken', 409);
        }
      }
    }

    for (const s of seatsToFinalize) {
      const orphanCheck = await checkOrphanCreation(env, theater_id, showing_number, row_label, s.num);
      if (!orphanCheck.ok) {
        return jsonError(
          `That selection would leave seat ${orphanCheck.orphan} alone in row ${row_label}. Please choose a different seat so no single seat is left empty.`,
          409,
        );
      }
    }

    const math = await getSeatsAvailableToPlace(env, resolved);
    const myPlaced = math.placed;
    const myQuota = math.total - math.delegated;
    let newFinalCount = 0;
    for (const s of seatsToFinalize) {
      const exists = await env.GALA_DB.prepare(
        `SELECT 1 FROM seat_assignments
          WHERE theater_id = ? AND showing_number = ?
            AND row_label = ? AND seat_num = ?
            AND sponsor_id = ?
            AND ((delegation_id IS NULL AND ? IS NULL) OR delegation_id = ?)`
      ).bind(
        theater_id, showing_number, row_label, s.num,
        sponsorId, delegationId, delegationId,
      ).first();
      if (!exists) newFinalCount += 1;
    }
    if (myPlaced + newFinalCount > myQuota) {
      return jsonError(`You've already placed your full ${myQuota} seats`, 400);
    }

    const guestName = resolved.kind === 'sponsor'
      ? `${resolved.record.company}${resolved.record.first_name ? ' (' + resolved.record.first_name + ' ' + (resolved.record.last_name || '') + ')' : ''}`
      : `${resolved.record.parent_company} / ${resolved.record.delegate_name}`;

    // Atomic quota-guarded INSERT. The INSERT WHERE re-evaluates the
    // count subquery against committed state per write, so parallel
    // /pick calls can't over-place. See May 11 2026 Logan-delegation
    // race-fix commit for context.
    const scopeCountSql = resolved.kind === 'sponsor'
      ? `(SELECT COUNT(*) FROM seat_assignments WHERE sponsor_id = ? AND delegation_id IS NULL)`
      : `(SELECT COUNT(*) FROM seat_assignments WHERE delegation_id = ?)`;
    const scopeCountBind = resolved.kind === 'sponsor' ? sponsorId : delegationId;

    let alreadyFinalized = true;
    let quotaBlocked = false;
    for (const s of seatsToFinalize) {
      try {
        const result = await env.GALA_DB.prepare(
          `INSERT INTO seat_assignments
             (theater_id, showing_number, row_label, seat_num,
              guest_name, sponsor_id, delegation_id,
              finalized_at, assigned_by)
           SELECT ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'portal'
             FROM (SELECT 1)
            WHERE ${scopeCountSql} < ?`
        ).bind(
          theater_id, showing_number, s.row, s.num,
          guestName, sponsorId, delegationId,
          scopeCountBind, myQuota,
        ).run();
        const changes = result.meta?.changes || 0;
        if (changes > 0) {
          alreadyFinalized = false;
        } else {
          const existingRow = await env.GALA_DB.prepare(
            `SELECT sponsor_id, delegation_id FROM seat_assignments
              WHERE theater_id = ? AND showing_number = ?
                AND row_label = ? AND seat_num = ?`
          ).bind(theater_id, showing_number, s.row, s.num).first();
          if (!existingRow) {
            quotaBlocked = true;
            break;
          }
          const sameSponsor = Number(existingRow.sponsor_id) === Number(sponsorId);
          const sameDelegation =
            (existingRow.delegation_id == null && delegationId == null) ||
            Number(existingRow.delegation_id) === Number(delegationId);
          if (!(sameSponsor && sameDelegation)) {
            return jsonError('Seat already taken', 409);
          }
        }
      } catch (err) {
        const raced = await env.GALA_DB.prepare(
          `SELECT sponsor_id, delegation_id FROM seat_assignments
            WHERE theater_id = ? AND showing_number = ?
              AND row_label = ? AND seat_num = ?`
        ).bind(theater_id, showing_number, s.row, s.num).first();
        if (raced) {
          const sameSponsor = Number(raced.sponsor_id) === Number(sponsorId);
          const sameDelegation =
            (raced.delegation_id == null && delegationId == null) ||
            Number(raced.delegation_id) === Number(delegationId);
          if (!(sameSponsor && sameDelegation)) {
            return jsonError('Seat already taken', 409);
          }
        } else {
          throw err;
        }
      }
    }

    if (quotaBlocked) {
      return jsonError(`You've already placed your full ${myQuota} seats`, 400);
    }

    for (const s of seatsToFinalize) {
      await env.GALA_DB.prepare(
        `DELETE FROM seat_holds
          WHERE theater_id = ? AND showing_number = ?
            AND row_label = ? AND seat_num = ?`
      ).bind(theater_id, showing_number, s.row, s.num).run();
    }

    return jsonOk({
      ok: true,
      action: 'finalized',
      paired: !!partnerSeat,
      partner_seat: partnerSeat || undefined,
      ...(alreadyFinalized ? { already_finalized: true } : {}),
    });
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
