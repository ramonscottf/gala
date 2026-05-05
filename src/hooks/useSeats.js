// useSeats — real-data wrapper of the design's useSeats hook.
//
// Shape consumed by the lifted wizards:
//   assigned[showingId][theaterId] = [{id, guestName?}]   // showingId = 'early'|'late'
//   allSelfIds: Set<string>      // every seat ID belonging to this token
//   totalAssigned: number
//   place(showingId, theaterId, seatIds[])  // POSTs each as 'finalize'
//   unplace(theaterId, seatIds[])           // POSTs each as 'unfinalize'
//
// Built from the API's myAssignments + myHolds arrays (rebuild on every
// portal refresh so re-fetched state is the source of truth).
//
// Note: The /pick endpoint is single-seat per request with an action verb.
// Batches happen client-side via Promise.all — the server checks each one
// against the seat budget so a partial batch is not catastrophic.

import { useCallback, useMemo, useState } from 'react';
import { config } from '../config.js';
import { SHOWING_NUMBER_TO_ID, SHOWING_ID_TO_NUMBER } from './usePortal.js';

function buildAssigned(myAssignments, myHolds, showtimes) {
  // Index showtimes by theaterId → list of showing_number values that play
  // there. A theater could (in principle) host both showings; the assignment
  // row itself doesn't store showing_number, so we join via showtimes.
  const showingsByTheater = {};
  (showtimes || []).forEach((s) => {
    if (!showingsByTheater[s.theater_id]) showingsByTheater[s.theater_id] = new Set();
    showingsByTheater[s.theater_id].add(s.showing_number);
  });

  const out = {};
  const push = (showingNumber, theaterId, id, guestName) => {
    const showingId = SHOWING_NUMBER_TO_ID[showingNumber] || `s${showingNumber}`;
    if (!out[showingId]) out[showingId] = {};
    if (!out[showingId][theaterId]) out[showingId][theaterId] = [];
    out[showingId][theaterId].push({ id, guestName });
  };

  const place = (row) => {
    const id = `${row.row_label}-${row.seat_num}`;
    const numbers = showingsByTheater[row.theater_id] || new Set([1]);
    // If a theater hosts multiple showings, we associate the seat with the
    // first showing the showtimes table lists for it. Realistically each
    // theater plays one showing per night so this is a no-op.
    const showingNumber = [...numbers][0];
    push(showingNumber, row.theater_id, id, row.guest_name);
  };
  (myAssignments || []).forEach(place);
  (myHolds || []).forEach(place);
  return out;
}

export function useSeats(portal, token, refresh) {
  const showtimes = portal?.showtimes || [];
  const myAssignments = portal?.myAssignments || [];
  const myHolds = portal?.myHolds || [];

  const assigned = useMemo(
    () => buildAssigned(myAssignments, myHolds, showtimes),
    [myAssignments, myHolds, showtimes]
  );

  const allSelfIds = useMemo(() => {
    const s = new Set();
    Object.values(assigned).forEach((byTheater) =>
      Object.values(byTheater).forEach((arr) => arr.forEach((a) => s.add(a.id)))
    );
    return s;
  }, [assigned]);

  const [pending, setPending] = useState(false);
  const [pickError, setPickError] = useState(null);

  const callPick = useCallback(
    async (action, theaterId, ids) => {
      const calls = ids.map((id) => {
        const dash = id.indexOf('-');
        const row_label = id.slice(0, dash);
        const seat_num = id.slice(dash + 1);
        return fetch(`${config.apiBase}/api/gala/portal/${token}/pick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, theater_id: theaterId, row_label, seat_num }),
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
        // Dedupe: every seat in an at-capacity batch returns the same
        // "You've already placed your full N seats" message. Showing it
        // N times is just noise.
        const unique = [...new Set(failed)];
        const err = new Error(unique.join('; '));
        // Tag the at-capacity case so the UI can show a friendly dialog
        // instead of the raw server text.
        if (unique.length === 1 && /already placed your full/i.test(unique[0])) {
          err.code = 'AT_CAPACITY';
        }
        throw err;
      }
    },
    [token]
  );

  const place = useCallback(
    async (showingId, theaterId, seatIds) => {
      // showingId is 'early'|'late' for symmetry with the design — not sent to
      // the API (the API stores assignments per (theater, row, seat) and the
      // showing is derivable via the showtimes table). Keeping the parameter
      // so the lifted components don't need restructuring.
      void SHOWING_ID_TO_NUMBER[showingId];
      setPending(true);
      setPickError(null);
      try {
        await callPick('finalize', theaterId, seatIds);
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
    async (theaterId, seatIds) => {
      setPending(true);
      setPickError(null);
      try {
        await callPick('unfinalize', theaterId, seatIds);
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
