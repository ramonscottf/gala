// MoveGroupModal — move all seats in a group to new seats the guest
// picks themselves. The destination can be the SAME auditorium (move to
// better seats for the same movie) OR a DIFFERENT movie / auditorium /
// showtime, chosen from the "Move to" selector.
//
// Free seat selection: nothing is pre-chosen. The guest taps the exact
// open seats they want (tap again to deselect), up to the group size N;
// at capacity a fresh tap rolls the oldest pick off so it never feels
// stuck. On confirm: release the old seats in their original location,
// place the newly-picked seats in the chosen destination, refresh.
//
// Cross-auditorium is purely a release-here + place-there: the backend
// /pick finalize counts capacity as a global total across all
// auditoriums (no per-theater lock) and the dinner choice rides along
// with each seat, so a move nets zero against quota.

import { useEffect, useMemo, useState } from 'react';
import { SeatMap, adaptTheater } from '../portal/SeatEngine.jsx';
import { SHOWING_NUMBER_TO_ID } from '../hooks/usePortal.js';
import { ShowingAuditoriumPills } from './TicketGroupModal.jsx';
import { OnBehalfBanner, NotifyToggle } from './OnBehalfControls.jsx';

export function MoveGroupModal({
  group,           // { seats: [...], theater_id, showing_number, movie_title, poster_url }
  theaterLayouts,
  portal,
  seats,           // useSeats hook
  onClose,
  onRefresh,
  onCommitted,
  onSuccess,       // optional: parent toast callback (kind, message)
  // Phase C — when set, scopes the move to a child delegation's seats
  // and shows the on-behalf banner + notify toggle. Shape matches
  // SwapSeatModal: { delegationId, delegateName, token }.
  behalfOf = null,
}) {
  const N = group.seats.length;
  const [target, setTarget] = useState([]); // [seatId, ...] of new block
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState(null);
  const [notify, setNotify] = useState(true);
  // Destination the group is moving INTO. Defaults to the group's current
  // location so the modal opens exactly as before; the "Move to" selector
  // lets the user retarget to a different movie/auditorium/showtime, and the
  // seat map, taken-set and auto-pick all follow the chosen destination.
  const [destKey, setDestKey] = useState(`${group.theater_id}:${group.showing_number}`);
  const [destTheaterId, destShowingNumber] = useMemo(() => {
    const [t, s] = destKey.split(':');
    return [Number(t), Number(s)];
  }, [destKey]);
  const isSameLocation =
    destTheaterId === group.theater_id && destShowingNumber === group.showing_number;

  // Pickable destinations: every real showtime that has a seat layout we can
  // render and a movie to show. Current location is included and pre-selected.
  const destinations = useMemo(() => {
    const layouts = new Set((theaterLayouts?.theaters || []).map((t) => t.id));
    return (portal?.showtimes || [])
      .filter((s) => layouts.has(s.theater_id) && s.movie_title)
      .map((s) => ({
        key: `${s.theater_id}:${s.showing_number}`,
        theater_id: s.theater_id,
        showing_number: s.showing_number,
        movie_title: s.movie_title,
        poster_url: s.poster_url,
      }))
      .sort((a, b) => a.showing_number - b.showing_number || a.theater_id - b.theater_id);
  }, [portal, theaterLayouts]);
  const selected = useMemo(
    () =>
      destinations.find((d) => d.key === destKey) || {
        theater_id: destTheaterId,
        showing_number: destShowingNumber,
        movie_title: group.movie_title,
        poster_url: group.poster_url,
      },
    [destinations, destKey, destTheaterId, destShowingNumber, group]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  const theater = useMemo(() => {
    const t = (theaterLayouts?.theaters || []).find((x) => x.id === destTheaterId);
    return t ? adaptTheater(t) : null;
  }, [theaterLayouts, destTheaterId]);

  // Build the "occupied by everyone else" set. CRITICAL: exclude the
  // group's own seats — they need to register as "available" to the
  // picker since we're about to release them as part of the move.
  const ownIds = useMemo(
    () => new Set(group.seats.map((s) => `${s.row}-${s.num}`)),
    [group.seats]
  );
  const otherTaken = useMemo(() => {
    const out = new Set();
    (portal?.allAssignments || []).forEach((a) => {
      if (a.theater_id === destTheaterId && (a.showing_number || 1) === destShowingNumber) {
        const id = `${a.row_label}-${a.seat_num}`;
        // The group's own seats only free up in their ORIGINAL location, so
        // treat them as "available to reuse" only when the destination is
        // unchanged. In a different auditorium a same-labelled seat (e.g. E1)
        // belongs to whoever holds it there — never silently free it.
        if (isSameLocation && ownIds.has(id)) return;
        out.add(id);
      }
    });
    return out;
  }, [portal, destTheaterId, destShowingNumber, isSameLocation, ownIds]);

  // Nothing is pre-selected — the guest picks their own seats. Clear any
  // in-progress selection whenever the destination changes so a stale pick
  // from another auditorium can't carry over.
  useEffect(() => {
    setTarget([]);
  }, [destKey]);

  // Free seat selection — the guest taps the exact seats they want, just
  // like the normal seat picker. SeatMap calls onSelect(ids, action) where
  // ids is the tapped seat (or both halves of a loveseat) and action is
  // 'add' or 'remove'. Taken seats never reach here — SeatMap blocks them.
  // We hold up to N seats; once full, a fresh tap rolls the oldest pick off
  // so it never feels stuck. Tap a selected seat to deselect it.
  function handleSelect(ids, action) {
    if (pending) return;
    setTarget((prev) => {
      let next = prev.slice();
      for (const id of ids) {
        if (action === 'remove') {
          next = next.filter((x) => x !== id);
        } else if (!next.includes(id)) {
          next.push(id);
          if (next.length > N) next = next.slice(next.length - N);
        }
      }
      return next;
    });
  }

  // Drives the gold highlight for the seats the guest has picked.
  const targetSet = useMemo(() => new Set(target), [target]);

  async function commit() {
    if (target.length !== N || pending) return;
    setPending(true);
    setErr(null);
    const origShowingId = SHOWING_NUMBER_TO_ID[group.showing_number];
    const origTheaterId = group.theater_id;
    const destShowingId = SHOWING_NUMBER_TO_ID[destShowingNumber];
    const oldIds = group.seats.map((s) => `${s.row}-${s.num}`);

    const extras = behalfOf?.delegationId
      ? { onBehalfOfDelegationId: behalfOf.delegationId, notifySent: notify }
      : null;

    try {
      // Step 1: release the old block in its ORIGINAL auditorium/showing.
      // Frees N slots against the (global) quota.
      await seats.unplace(origShowingId, origTheaterId, oldIds, extras);
      // Step 2: place the new block in the DESTINATION auditorium/showing.
      // Quota is back to where we started so this succeeds unless someone
      // grabbed a destination seat in the brief window.
      try {
        await seats.place(destShowingId, destTheaterId, target, extras);
      } catch (placeErr) {
        // Race: put the user back exactly where they were (original spot).
        try {
          await seats.place(origShowingId, origTheaterId, oldIds, extras);
          throw new Error(
            `One of those seats got taken just now. Your original block (${oldIds.map((s) => s.replace('-', '')).join(', ')}) is still yours. Try a different spot.`
          );
        } catch (recoverErr) {
          throw new Error(
            `Could not place the new block (${placeErr.message}). And we could not restore your original seats either — please refresh and try again.`
          );
        }
      }
      // Push updated tickets to delegate if on-behalf + notify.
      if (behalfOf?.delegationId && notify && behalfOf?.token) {
        try {
          await fetch(`/api/gala/portal/${behalfOf.token}/delegate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'push_tickets',
              delegation_id: behalfOf.delegationId,
            }),
          });
        } catch (e) {
          console.warn('push_tickets failed after on-behalf move', e);
        }
      }
      if (onRefresh) await onRefresh();
      if (onCommitted) onCommitted({ from: oldIds, to: target });
      if (onSuccess) {
        const where = isSameLocation ? '' : ` to ${selected.movie_title}`;
        onSuccess('success', `Moved ${N} ${N === 1 ? 'seat' : 'seats'}${where}.`);
      }
      onClose();
    } catch (e) {
      setErr(e.message);
      setPending(false);
    }
  }

  const oldLabels = group.seats.map((s) => s.seatLabel).join(', ');
  const newLabels = target.map((id) => id.replace('-', '')).join(', ');

  return (
    <div
      className="p2-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="p2-modal stripped p2-swap-modal">
        <div className="p2-modal-header">
          <div style={{ minWidth: 0 }}>
            <div className="p2-modal-eyebrow">Move group</div>
            <div className="p2-modal-title">
              Move all {N} seats together
            </div>
          </div>
          <button
            className="p2-modal-close"
            onClick={onClose}
            disabled={pending}
            type="button"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p2-modal-body">
          {behalfOf && <OnBehalfBanner name={behalfOf.delegateName} />}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
            {selected.poster_url && (
              <img
                src={selected.poster_url}
                alt=""
                style={{
                  width: 60,
                  aspectRatio: '2 / 3',
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '1px solid var(--p2-rule)',
                  flexShrink: 0,
                }}
                aria-hidden="true"
              />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {selected.movie_title}
              </div>
              <div style={{ marginTop: 6 }}>
                <ShowingAuditoriumPills
                  showingNumber={selected.showing_number}
                  auditoriumId={selected.theater_id}
                />
              </div>
            </div>
          </div>

          {destinations.length > 1 && (
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                  color: 'var(--p2-muted)',
                  marginBottom: 6,
                }}
              >
                Move to
              </span>
              <select
                className="p2-select"
                value={destKey}
                disabled={pending}
                onChange={(e) => setDestKey(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--p2-field, #0e1530)',
                  color: '#fff',
                  border: '1px solid var(--p2-rule)',
                  fontSize: 14,
                  appearance: 'auto',
                }}
              >
                {destinations.map((d) => (
                  <option key={d.key} value={d.key}>
                    Auditorium {d.theater_id} · {d.movie_title} · {d.showing_number === 1 ? 'Early 4:30 PM' : 'Late 7:15 PM'}
                    {d.theater_id === group.theater_id && d.showing_number === group.showing_number ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <p style={{ fontSize: 13, color: 'var(--p2-muted)', marginTop: 0, marginBottom: 14 }}>
            {destinations.length > 1
              ? `Choose the movie & auditorium above, then tap the map to pick your ${N} ${N === 1 ? 'seat' : 'seats'}. Tap a seat again to deselect.`
              : `Tap the map to pick your ${N} ${N === 1 ? 'seat' : 'seats'}. Tap a seat again to deselect.`}
          </p>

          <div className="p2-swap-legend">
            <span className="p2-swap-legend-item">
              <span className="p2-swap-dot is-source" />
              Your current seats
            </span>
            <span className="p2-swap-legend-item">
              <span className="p2-swap-dot is-target" />
              Selected
            </span>
            <span className="p2-swap-legend-item">
              <span className="p2-swap-dot is-open" />
              Open
            </span>
            <span className="p2-swap-legend-item">
              <span className="p2-swap-dot is-taken" />
              Taken
            </span>
          </div>

          <div className="p2-swap-map-wrap">
            {theater ? (
              <SeatMap
                theater={theater}
                theme="dark"
                scale={14}
                showLetters
                showSeatNumbers
                allowZoom={false}
                allowLasso={false}
                assignedSelf={ownIds}
                assignedOther={otherTaken}
                selected={targetSet}
                onSelect={handleSelect}
              />
            ) : (
              <div style={{ padding: 24, color: 'var(--p2-muted)', textAlign: 'center' }}>
                Could not load auditorium layout.
              </div>
            )}
          </div>

          <div className="p2-swap-direction">
            <div className="p2-swap-direction-cell">
              <div className="p2-swap-direction-label">From</div>
              <div className="p2-swap-direction-seat" style={{ fontSize: 18 }}>
                {oldLabels}
              </div>
              {!isSameLocation && (
                <div style={{ fontSize: 11, color: 'var(--p2-muted)', marginTop: 2 }}>
                  Auditorium {group.theater_id}
                </div>
              )}
            </div>
            <div className="p2-swap-arrow" aria-hidden="true">→</div>
            <div className="p2-swap-direction-cell">
              <div className="p2-swap-direction-label">To</div>
              <div
                className={`p2-swap-direction-seat ${target.length ? '' : 'placeholder'}`}
                style={{ fontSize: target.length ? 18 : 14 }}
              >
                {newLabels || 'Tap a seat to anchor'}
              </div>
              {!isSameLocation && target.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--p2-muted)', marginTop: 2 }}>
                  Auditorium {destTheaterId}
                </div>
              )}
            </div>
          </div>

          {behalfOf && (
            <NotifyToggle name={behalfOf.delegateName} on={notify} onChange={setNotify} />
          )}

          {err && (
            <div className="p2-notice red" style={{ marginTop: 12 }}>
              <p>{err}</p>
            </div>
          )}
        </div>

        <div className="p2-modal-footer">
          <button
            type="button"
            className="p2-btn ghost sm"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="p2-btn primary sm"
            disabled={target.length !== N || pending}
            onClick={commit}
          >
            {pending
              ? 'Moving…'
              : target.length === N
              ? `Move ${N} ${N === 1 ? 'seat' : 'seats'} here →`
              : `Select ${target.length}/${N} seats`}
          </button>
        </div>
      </div>
    </div>
  );
}
