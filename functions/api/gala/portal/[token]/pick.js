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
import { getLoveseatPartner } from '../../_loveseat_pairs.js';

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
  // Only block when the CLAIMING SEAT ITSELF creates a 1-wide gap by being
  // placed adjacent to another occupied seat with exactly one empty seat
  // between them. A distant pair of occupied seats elsewhere in the row
  // isn't our problem — that's whoever bracketed it. (Bug seen May 11
  // 2026: Scott held A13 + A15 leaving A14 open, which blocked Sherry
  // from confirming her unrelated seats elsewhere in the same row.)
  //
  // Concretely, only N-2 and N+2 can become orphans when we place N:
  //   - N-2 becomes an orphan iff N is occupied (it is, post-claim) AND
  //     N-1 is empty AND N-2 itself is empty AND (N-3 is occupied OR
  //     edge-of-row doesn't matter, we use the same N±2 occupied rule).
  // Actually simpler: the only NEW orphan a claim of N can create is at
  // N-1 (bracketed by N-2 occupied and N occupied) or N+1 (bracketed by
  // N occupied and N+2 occupied). Any pre-existing orphans in the row
  // are pre-existing — not our fault.
  const claiming = parseInt(claimingSeat, 10);
  const candidates = [claiming - 2, claiming + 2]; // seats that could be the "other bracket"
  const rs = await env.GALA_DB.prepare(
    `SELECT CAST(seat_num AS INTEGER) AS n FROM seat_assignments
        WHERE theater_id = ? AND row_label = ?
          AND CAST(seat_num AS INTEGER) IN (?, ?)
      UNION
      SELECT CAST(seat_num AS INTEGER) AS n FROM seat_holds
        WHERE theater_id = ? AND row_label = ? AND expires_at > datetime('now')
          AND CAST(seat_num AS INTEGER) IN (?, ?)`
  ).bind(
    theater_id, row_label, candidates[0], candidates[1],
    theater_id, row_label, candidates[0], candidates[1],
  ).all();
  const bracketed = new Set((rs.results || []).map(r => r.n));

  // For each bracket candidate (N-2 / N+2): if it's occupied, the gap seat
  // (N-1 / N+1 respectively) is the orphan we'd be creating. Verify the
  // gap seat is itself empty before flagging — if it's occupied too, no
  // orphan was created.
  for (const bracket of candidates) {
    if (!bracketed.has(bracket)) continue;
    const gapSeat = (bracket + claiming) / 2; // the single seat between
    const gapOccupied = await env.GALA_DB.prepare(
      `SELECT 1 FROM seat_assignments
        WHERE theater_id = ? AND row_label = ? AND CAST(seat_num AS INTEGER) = ?
       UNION
       SELECT 1 FROM seat_holds
        WHERE theater_id = ? AND row_label = ? AND CAST(seat_num AS INTEGER) = ?
          AND expires_at > datetime('now')`
    ).bind(theater_id, row_label, gapSeat, theater_id, row_label, gapSeat).first();
    if (!gapOccupied) {
      return { ok: false, orphan: gapSeat };
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
    // Phase 5.8 — menu set after Kara's update on May 10 2026.
    // 'veggie' and 'kids' keep their IDs; 'frenchdip' replaces
    // 'brisket', 'salad' replaces 'glutenfree' (the GF option is
    // now a distinct grilled-chicken salad), 'turkey' is gone.
    // Mirror this set in DinnerPicker.jsx (DINNER_OPTIONS),
    // DinnerSheet.jsx (DINNER_TILES), dinner.js (server enum),
    // and admin/seating.html (admin tile list). Any in-flight
    // dinner_choice values with the old keys would fail this
    // validator — there were none in production at the time of
    // this change (we wiped seat_assignments to 0 earlier the
    // same day).
    const VALID = new Set(['frenchdip','salad','veggie','kids']);
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
    // Phase 5.2 — atomic pair release. If this is one half of a paired
    // loveseat, drop the partner's hold too. Idempotent.
    const partnerSeat = await getLoveseatPartner(env, request, theater_id, row_label, seat_num);
    await env.GALA_DB.prepare(
      `DELETE FROM seat_holds
        WHERE theater_id = ? AND row_label = ? AND seat_num = ?
          AND held_by_token = ?`
    ).bind(theater_id, row_label, seat_num, token).run();
    if (partnerSeat) {
      await env.GALA_DB.prepare(
        `DELETE FROM seat_holds
          WHERE theater_id = ? AND row_label = ? AND seat_num = ?
            AND held_by_token = ?`
      ).bind(theater_id, row_label, partnerSeat, token).run();
    }
    return jsonOk({ ok: true, action: 'released', paired: !!partnerSeat });
  }

  // ───── UNFINALIZE (un-claim a previously-assigned seat) ─────
  if (action === 'unfinalize') {
    // Can only unfinalize seats belonging to THIS token's scope
    const cond = resolved.kind === 'sponsor'
      ? `sponsor_id = ? AND delegation_id IS NULL`
      : `delegation_id = ?`;
    const val = resolved.kind === 'sponsor' ? resolved.record.id : resolved.record.id;

    // Phase 5.2 — atomic pair unfinalize. Same partner-aware logic.
    const partnerSeat = await getLoveseatPartner(env, request, theater_id, row_label, seat_num);
    const seatsToUnfinalize = partnerSeat
      ? [seat_num, partnerSeat]
      : [seat_num];

    let totalRemoved = 0;
    for (const s of seatsToUnfinalize) {
      const result = await env.GALA_DB.prepare(
        `DELETE FROM seat_assignments
          WHERE theater_id = ? AND row_label = ? AND seat_num = ?
            AND ${cond}`
      ).bind(theater_id, row_label, s, val).run();
      totalRemoved += result.meta.changes || 0;
    }

    return jsonOk({
      ok: true,
      action: 'unfinalized',
      removed: totalRemoved,
      paired: !!partnerSeat,
    });
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
    // Phase 5.2 — paired-loveseat atomic hold. Look up the partner half
    // (null for non-loveseats / standalone loveseats). When present,
    // both halves get the same hold in a single atomic write — so
    // whether the client tapped the LEFT or RIGHT cushion, the result
    // is the pair held together. The client also fires two /pick calls
    // in parallel (it expanded the tap to both halves before sending),
    // which collapse via ON CONFLICT — but the server side enforces
    // the rule independently so a misbehaving caller still can't split
    // the pair.
    const partnerSeat = await getLoveseatPartner(env, request, theater_id, row_label, seat_num);
    const seatsToHold = partnerSeat
      ? [{ row: row_label, num: seat_num }, { row: row_label, num: partnerSeat }]
      : [{ row: row_label, num: seat_num }];

    // Enforce no-orphan rule on every seat we're about to claim. The
    // partner half is already adjacent so it can't itself create an
    // orphan, but we still pass it through the same check for safety
    // against future layouts where loveseat-pairs land at row edges.
    for (const s of seatsToHold) {
      const orphanCheck = await checkOrphanCreation(env, theater_id, row_label, s.num);
      if (!orphanCheck.ok) {
        return jsonError(
          `That selection would leave seat ${orphanCheck.orphan} alone in row ${row_label}. Please choose a different seat so no single seat is left empty.`,
          409,
        );
      }
    }

    // Verify the partner half (if any) isn't held by someone else.
    // Skipping our own holds — re-holding is fine. The earlier check
    // (line ~173) already vetted the primary seat.
    if (partnerSeat) {
      const partnerExisting = await env.GALA_DB.prepare(
        `SELECT sponsor_id, delegation_id FROM seat_assignments
          WHERE theater_id = ? AND row_label = ? AND seat_num = ?`
      ).bind(theater_id, row_label, partnerSeat).first();
      if (partnerExisting) {
        return jsonError('Partner half of this loveseat is already taken', 409);
      }
      const partnerHeldByOther = await env.GALA_DB.prepare(
        `SELECT held_by_token FROM seat_holds
          WHERE theater_id = ? AND row_label = ? AND seat_num = ?
            AND expires_at > datetime('now') AND held_by_token != ?`
      ).bind(theater_id, row_label, partnerSeat, token).first();
      if (partnerHeldByOther) {
        return jsonError('Partner half of this loveseat is held by another sponsor', 409);
      }
    }

    // Enforce seat budget. Each row we're about to write counts as 1
    // against quota; for a loveseat-pair that's 2. Off-by-one fix May 5
    // 2026 still applies: count *after* adding these holds must not
    // exceed quota.
    //
    // Edge case: if the user already holds the partner (this is a
    // re-hold via the client's parallel-fire), the partner row will
    // ON CONFLICT into the same hold — we'd be over-counting. Resolve
    // by counting only NEW holds (seats we don't already hold).
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
          WHERE theater_id = ? AND row_label = ? AND seat_num = ?
            AND held_by_token = ? AND expires_at > datetime('now')`
      ).bind(theater_id, row_label, s.num, token).first();
      if (!exists) newHoldCount += 1;
    }
    const quota = math.total - math.delegated;
    if (myHoldCount + newHoldCount + math.placed > quota) {
      return jsonError(`You've already selected your full ${quota} seats`, 400);
    }

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
    for (const s of seatsToHold) {
      await env.GALA_DB.prepare(
        `INSERT INTO seat_holds (theater_id, row_label, seat_num, sponsor_id, delegation_id, held_by_token, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(theater_id, row_label, seat_num)
         DO UPDATE SET held_by_token = excluded.held_by_token,
                       sponsor_id = excluded.sponsor_id,
                       delegation_id = excluded.delegation_id,
                       expires_at = excluded.expires_at,
                       held_at = datetime('now')`
      ).bind(theater_id, s.row, s.num, sponsorId, delegationId, token, expiresAt).run();
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
    // Phase 5.2 — paired-loveseat atomic finalize. Same pattern as
    // HOLD: both halves move together. The client may also send two
    // /pick finalize calls in parallel (one per half), which collapse
    // here via the already_finalized short-circuit.
    const partnerSeat = await getLoveseatPartner(env, request, theater_id, row_label, seat_num);
    const seatsToFinalize = partnerSeat
      ? [{ row: row_label, num: seat_num }, { row: row_label, num: partnerSeat }]
      : [{ row: row_label, num: seat_num }];

    // If there's a partner, also pre-check it for already-taken state
    // (the primary seat was checked at line ~163 already).
    if (partnerSeat) {
      const partnerExisting = await env.GALA_DB.prepare(
        `SELECT sponsor_id, delegation_id FROM seat_assignments
          WHERE theater_id = ? AND row_label = ? AND seat_num = ?`
      ).bind(theater_id, row_label, partnerSeat).first();
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

    // Re-check orphan rule for every seat (state can shift between
    // hold and finalize as other sponsors move).
    for (const s of seatsToFinalize) {
      const orphanCheck = await checkOrphanCreation(env, theater_id, row_label, s.num);
      if (!orphanCheck.ok) {
        return jsonError(
          `That selection would leave seat ${orphanCheck.orphan} alone in row ${row_label}. Please choose a different seat so no single seat is left empty.`,
          409,
        );
      }
    }

    // Quota check — count NEW finalizations only. If the partner is
    // already finalized to this same caller (parallel client fire),
    // we'd double-count without this filter.
    //
    // NOTE: This pre-flight check is advisory — the *atomic* enforcement
    // lives in the guarded INSERT below, which re-evaluates the count
    // subquery against committed state per write. The pre-flight gives
    // a friendly error in the common case (single-request over-pick);
    // the INSERT guard catches the parallel-fire race where two requests
    // both pass the read-then-write check (bug seen May 11 2026: Logan
    // selected 4+ seats against a 2-seat delegation cap because the
    // client fans out parallel /pick calls).
    const math = await getSeatsAvailableToPlace(env, resolved);
    const myPlaced = math.placed;
    const myQuota = math.total - math.delegated;
    let newFinalCount = 0;
    for (const s of seatsToFinalize) {
      const exists = await env.GALA_DB.prepare(
        `SELECT 1 FROM seat_assignments
          WHERE theater_id = ? AND row_label = ? AND seat_num = ?
            AND sponsor_id = ?
            AND ((delegation_id IS NULL AND ? IS NULL) OR delegation_id = ?)`
      ).bind(theater_id, row_label, s.num, sponsorId, delegationId, delegationId).first();
      if (!exists) newFinalCount += 1;
    }
    if (myPlaced + newFinalCount > myQuota) {
      return jsonError(`You've already placed your full ${myQuota} seats`, 400);
    }

    // Compose guest_name (matches pick.js's existing format and the
    // recompose contract used by /assign).
    const guestName = resolved.kind === 'sponsor'
      ? `${resolved.record.company}${resolved.record.first_name ? ' (' + resolved.record.first_name + ' ' + (resolved.record.last_name || '') + ')' : ''}`
      : `${resolved.record.parent_company} / ${resolved.record.delegate_name}`;

    // Atomic quota-guarded INSERT. Each INSERT re-evaluates the count
    // subquery against committed state (D1 serializes writes through a
    // single Durable Object actor, giving us SQLite snapshot isolation
    // per write). If the count would push us past quota, the WHERE
    // evaluates false and INSERT writes zero rows — we then return 400.
    //
    // The count subquery scope must match getSeatsAvailableToPlace:
    //   sponsor token   → COUNT WHERE sponsor_id = ? AND delegation_id IS NULL
    //   delegation token → COUNT WHERE delegation_id = ?
    // myQuota stays as the static cap (total - sibling delegation grants).
    //
    // SQLite parser ambiguity workaround: `INSERT ... SELECT ... WHERE ...`
    // requires a FROM clause for the WHERE to be unambiguous. We use
    // `FROM (SELECT 1)` as a dummy single-row source.
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
             (theater_id, row_label, seat_num, guest_name, sponsor_id, delegation_id, finalized_at, assigned_by)
           SELECT ?, ?, ?, ?, ?, ?, datetime('now'), 'portal'
             FROM (SELECT 1)
            WHERE ${scopeCountSql} < ?`
        ).bind(
          theater_id, s.row, s.num, guestName, sponsorId, delegationId,
          scopeCountBind, myQuota,
        ).run();
        const changes = result.meta?.changes || 0;
        if (changes > 0) {
          alreadyFinalized = false;
        } else {
          // Zero rows written — either the WHERE guard blocked (over quota)
          // or the seat already exists (and was owned by us, since
          // pre-checks would have caught other-owner). Distinguish by
          // checking if the row exists.
          const existing = await env.GALA_DB.prepare(
            `SELECT sponsor_id, delegation_id FROM seat_assignments
              WHERE theater_id = ? AND row_label = ? AND seat_num = ?`
          ).bind(theater_id, s.row, s.num).first();
          if (!existing) {
            // No row + zero changes = quota guard fired.
            quotaBlocked = true;
            break;
          }
          // Row exists. If it's ours, this is a parallel-fire repeat
          // (alreadyFinalized stays true). If it's not ours, return 409.
          const sameSponsor = Number(existing.sponsor_id) === Number(sponsorId);
          const sameDelegation =
            (existing.delegation_id == null && delegationId == null) ||
            Number(existing.delegation_id) === Number(delegationId);
          if (!(sameSponsor && sameDelegation)) {
            return jsonError('Seat already taken', 409);
          }
        }
      } catch (err) {
        // Race-resilient: a partner row pre-existing AND owned by THIS
        // caller is fine (parallel client fire); other-owner is a real
        // collision the primary-seat check would have already caught.
        const raced = await env.GALA_DB.prepare(
          `SELECT sponsor_id, delegation_id FROM seat_assignments
            WHERE theater_id = ? AND row_label = ? AND seat_num = ?`
        ).bind(theater_id, s.row, s.num).first();
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

    // Clear holds for every finalized seat — including the partner.
    for (const s of seatsToFinalize) {
      await env.GALA_DB.prepare(
        `DELETE FROM seat_holds
          WHERE theater_id = ? AND row_label = ? AND seat_num = ?`
      ).bind(theater_id, s.row, s.num).run();
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
