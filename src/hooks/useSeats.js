// useSeats — real-data wrapper of the design's useSeats hook.
//
// Shape consumed by the lifted wizards:
//   assigned[showingId][theaterId] = [{id, guestName?}]   // showingId = 'early'|'late'
//   allSelfIds: Set<string>      // every seat ID belonging to this token
//                                // ID is "showingNumber:row-seat" (showing-scoped)
//   totalAssigned: number
//   place(showingId, theaterId, seatIds[])  // POSTs each as 'finalize'
//   unplace(showingId, theaterId, seatIds[])           // POSTs each as 'unfinalize'
//
// Built from the API's myAssignments + myHolds arrays (rebuild on every
// portal refresh so re-fetched state is the source of truth).
//
// Showing-aware (fixed May 11 2026): the seat row itself stores
// showing_number, so we group by (showing_number, theater_id) instead
// of assuming each theater hosts one showing. The Tanner Clinic incident
// showed this assumption was wrong — Aud 8 hosts both early and late
// Star Wars, and the old code was collapsing every late placement to
// the early showing on write.

import { useCallback, useMemo, useState } from 'react';
import { config } from '../config.js';
import { SHOWING_NUMBER_TO_ID, SHOWING_ID_TO_NUMBER } from './usePortal.js';

function buildAssigned(myAssignments, myHolds) {
  const out = {};
  const push = (showingNumber, theaterId, id, guestName) => {
    const showingId = SHOWING_NUMBER_TO_ID[showingNumber] || `s${showingNumber}`;
    if (!out[showingId]) out[showingId] = {};
    if (!out[showingId][theaterId]) out[showingId][theaterId] = [];
    out[showingId][theaterId].push({ id, guestName });
  };

  const place = (row) => {
    const id = `${row.row_label}-${row.seat_num}`;
    // showing_number is on every assignment + hold row directly — read
    // it from there instead of guessing from theater_id.
    const showingNumber = Number(row.showing_number) || 1;
    push(showingNumber, row.theater_id, id, row.guest_name);
  };
  (myAssignments || []).forEach(place);
  (myHolds || []).forEach(place);
  return out;
}

export function useSeats(portal, token, refresh) {
  const myAssignments = portal?.myAssignments || [];
  const myHolds = portal?.myHolds || [];

  const assigned = useMemo(
    () => buildAssigned(myAssignments, myHolds),
    [myAssignments, myHolds]
  );

  const allSelfIds = useMemo(() => {
    const s = new Set();
    // IDs are namespaced by showing so a sponsor with seats in Aud 8 at
    // both early and late showings doesn't collapse to a single set.
    Object.entries(assigned).forEach(([showingId, byTheater]) =>
      Object.values(byTheater).forEach((arr) =>
        arr.forEach((a) => s.add(`${showingId}:${a.id}`))
      )
    );
    return s;
  }, [assigned]);

  const [pending, setPending] = useState(false);
  const [pickError, setPickError] = useState(null);

  const callPick = useCallback(
    async (action, showingId, theaterId, ids, extras = null) => {
      const showing_number = SHOWING_ID_TO_NUMBER[showingId];
      // Build the full batch's seat list once so every parallel POST can
      // pass it as `inflight`. The server's per-seat orphan check treats
      // these as already-occupied, eliminating the race where the E3
      // check and the E4 check each say the other would be orphaned
      // because neither is in the DB yet. Bug fix May 18 2026 (Aud 4 E
      // row breadwinner case — Scott reported "leave seat 3 alone …
      // leave seat 4 alone" while batch-placing E3+E4 with E1,E2,E5,E6
      // already taken by other sponsors).
      const inflight = ids.map((id) => {
        const dash = id.indexOf('-');
        return { row: id.slice(0, dash), num: id.slice(dash + 1) };
      });
      const calls = ids.map((id) => {
        const dash = id.indexOf('-');
        const row_label = id.slice(0, dash);
        const seat_num = id.slice(dash + 1);
        // Phase C — on-behalf editing: callers (SwapSeatModal etc.) can
        // pass {onBehalfOfDelegationId, notifySent} to scope the write
        // to a child delegation owned by the calling sponsor. The
        // server-side resolveWriteScope() handles auth + audit.
        const body = {
          action,
          theater_id: theaterId,
          showing_number,
          row_label,
          seat_num,
          inflight,
        };
        if (extras?.onBehalfOfDelegationId) {
          body.on_behalf_of_delegation_id = extras.onBehalfOfDelegationId;
        }
        if (extras?.notifySent != null) {
          body.notify_sent = !!extras.notifySent;
        }
        return fetch(`${config.apiBase}/api/gala/portal/${token}/pick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      });
      const responses = await Promise.all(calls);
      const failed = [];
      for (const r of responses) {
        if (!r.ok) {
          let msg;
          try {
            const j = await r.json();
            msg = j.error || `HTTP ${r.status}`;
          } catch {
            msg = `HTTP ${r.status}`;
          }
          failed.push(msg);
        }
      }
      if (failed.length) {
        const unique = [...new Set(failed)];
        const err = new Error(unique.join('; '));
        if (unique.length === 1 && /already placed your full/i.test(unique[0])) {
          err.code = 'AT_CAPACITY';
        }
        throw err;
      }
    },
    [token]
  );

  const place = useCallback(
    async (showingId, theaterId, seatIds, extras = null) => {
      // showingId is required — it determines which showing's seat we
      // write. Was previously voided here (legacy bug fixed May 11 2026).
      setPending(true);
      setPickError(null);
      try {
        await callPick('finalize', showingId, theaterId, seatIds, extras);
        await refresh();
      } catch (e) {
        setPickError(e);
        throw e;
      } finally {
        setPending(false);
      }
    },
    [callPick, refresh]
  );

  const unplace = useCallback(
    async (showingId, theaterId, seatIds, extras = null) => {
      setPending(true);
      setPickError(null);
      try {
        await callPick('unfinalize', showingId, theaterId, seatIds, extras);
        await refresh();
      } catch (e) {
        setPickError(e);
        throw e;
      } finally {
        setPending(false);
      }
    },
    [callPick, refresh]
  );

  return {
    assigned,
    allSelfIds,
    totalAssigned: allSelfIds.size,
    place,
    unplace,
    pending,
    pickError,
  };
}

/**
 * Check whether a proposed batch of seat IDs would CREATE a new single-empty
 * seat sandwiched between two occupied seats in the same row. Returns
 * either { ok: true } or { ok: false, row, orphan, theaterId }.
 *
 * Matches the server-side checkOrphanCreation in pick.js: for each seat in
 * the BATCH, look at ±2 in the same row. If a bracket seat exists and the
 * gap seat (bracket+claiming)/2 is empty, the batch would orphan that gap.
 *
 * IMPORTANT: pre-existing orphans elsewhere in the theater (left by other
 * sponsors) MUST NOT block this batch. Only the seats this batch is
 * claiming get checked. Bug fix May 18 2026 — Blake Branham / Big West Oil
 * hit this when an unrelated row already had a sandwiched single seat.
 *
 * Pre-flight only — the server has its own check in pick.js as a backstop.
 * Same row only — gaps at row ends are fine.
 */
export function checkBatchOrphans(portal, theaterId, batchSeatIds) {
  if (!portal || !batchSeatIds?.length) return { ok: true };

  // Build the post-commit "taken" set so within-batch checks see batch peers.
  const taken = new Set();
  const collect = (arr) => {
    (arr || []).forEach((r) => {
      if (r.theater_id !== theaterId) return;
      taken.add(`${r.row_label}-${r.seat_num}`);
    });
  };
  collect(portal.myAssignments);
  collect(portal.myHolds);
  collect(portal.allAssignments);
  collect(portal.otherHolds);
  batchSeatIds.forEach((id) => taken.add(id));

  // For each seat THIS BATCH claims, check ±2 in its row only. If a bracket
  // is taken and the gap between is empty, the batch created that orphan.
  for (const id of batchSeatIds) {
    const dash = id.indexOf('-');
    const row = id.slice(0, dash);
    const claiming = parseInt(id.slice(dash + 1), 10);
    if (!Number.isFinite(claiming)) continue;
    for (const bracket of [claiming - 2, claiming + 2]) {
      if (bracket < 1) continue;
      if (!taken.has(`${row}-${bracket}`)) continue;
      const gapSeat = (bracket + claiming) / 2;
      if (!taken.has(`${row}-${gapSeat}`)) {
        return { ok: false, row, orphan: gapSeat, theaterId };
      }
    }
  }
  return { ok: true };
}

/**
 * Build the 'otherTaken' Set for a given theater — every seat in that theater
 * occupied by someone else (allAssignments + otherHolds) minus the user's own.
 * Used as the SeatMap `assignedOther` prop.
 */
export function otherTakenForTheater(portal, theaterId) {
  const out = new Set();
  if (!portal) return out;
  const myKeys = new Set(
    (portal.myAssignments || [])
      .concat(portal.myHolds || [])
      .filter((r) => r.theater_id === theaterId)
      .map((r) => `${r.row_label}-${r.seat_num}`)
  );
  (portal.allAssignments || [])
    .concat(portal.otherHolds || [])
    .forEach((r) => {
      if (r.theater_id !== theaterId) return;
      const id = `${r.row_label}-${r.seat_num}`;
      if (myKeys.has(id)) return;
      out.add(id);
    });
  return out;
}
