// MoveGroupModal — move all seats in a group to a different contiguous
// N-seat block in the same showing + auditorium.
//
// Powered by autoPickBlock from SeatEngine: suggests the best
// contiguous block of the same size (centered, premium-preferring),
// shows it as the target on the map, lets the user tap a different
// starting anchor if they want a different spot. On confirm: release
// the old block, place the new block, refresh.
//
// Deliberately scoped to same showing + same auditorium. Moving a
// group across showings/auditoriums is a "release + new pick" two-
// step that we don't need to compress into one modal. Most "move my
// group" intents are "we'd rather sit closer to the screen, same
// movie."

import { useEffect, useMemo, useState } from 'react';
import { SeatMap, adaptTheater, autoPickBlock, seatById } from '../portal/SeatEngine.jsx';
import { SHOWING_NUMBER_TO_ID } from '../hooks/usePortal.js';
import { ShowingAuditoriumPills } from './TicketGroupModal.jsx';

export function MoveGroupModal({
  group,           // { seats: [...], theater_id, showing_number, movie_title, poster_url }
  theaterLayouts,
  portal,
  seats,           // useSeats hook
  onClose,
  onRefresh,
  onCommitted,
}) {
  const N = group.seats.length;
  const [target, setTarget] = useState([]); // [seatId, ...] of new block
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  const theater = useMemo(() => {
    const t = (theaterLayouts?.theaters || []).find((x) => x.id === group.theater_id);
    return t ? adaptTheater(t) : null;
  }, [theaterLayouts, group.theater_id]);

  // Build the "occupied by everyone else" set. CRITICAL: exclude the
  // group's own seats — they need to register as "available" to the
  // picker since we're about to release them as part of the move.
  const ownIds = useMemo(
    () => new Set(group.seats.map((s) => `${s.row}-${s.num}`)),
    [group.seats]
  );
  const otherTaken = useMemo(() => {
    const out = new Set();
    const showingNum = group.showing_number;
    (portal?.allAssignments || []).forEach((a) => {
      if (a.theater_id === group.theater_id && (a.showing_number || 1) === showingNum) {
        const id = `${a.row_label}-${a.seat_num}`;
        if (!ownIds.has(id)) out.add(id);
      }
    });
    return out;
  }, [portal, group, ownIds]);

  // Auto-suggest a contiguous block on open. User can change it by
  // tapping anywhere on the map.
  useEffect(() => {
    if (!theater) return;
    // Include the group's current seats in "taken" for auto-pick? No —
    // we want the auto-picker to consider the user's own seats as
    // available (we're moving them). Otherwise the picker thinks the
    // user's own row is occupied and skips it.
    const suggestion = autoPickBlock(theater, N, otherTaken, {
      allowAccessible: false,
      preferPremium: true,
    });
    if (suggestion.length === N) {
      // Filter out the original block from the suggestion — moving to
      // exactly the same seats is a no-op.
      const isSameAsCurrent = suggestion.every((id) => ownIds.has(id));
      if (!isSameAsCurrent) {
        setTarget(suggestion);
      }
    }
  }, [theater, N, otherTaken, ownIds]);

  // Click on a seat: try to anchor a new contiguous block starting at
  // that seat's row, going rightward N seats. If that block has
  // conflicts (gaps in the row's seat layout, taken seats, off the
  // end), shift left until we find one that fits. If nothing fits in
  // that row, ignore the tap.
  function onSeatTap(seatId) {
    if (pending || !theater) return;
    const seat = seatById(theater, seatId);
    if (!seat) return;
    // Find the row and column index in the adapted seat structure
    let rowIdx = -1;
    let colIdx = -1;
    for (let r = 0; r < theater.rows.length; r++) {
      const cells = theater.rows[r].seats;
      for (let c = 0; c < cells.length; c++) {
        if (cells[c] && cells[c].id === seatId) {
          rowIdx = r;
          colIdx = c;
          break;
        }
      }
      if (rowIdx !== -1) break;
    }
    if (rowIdx === -1) return;

    // Try N contiguous starting at colIdx, then shift left until we
    // either fit or fall off the start.
    const cells = theater.rows[rowIdx].seats;
    const isFree = (id) => !otherTaken.has(id);
    for (let start = colIdx; start >= 0; start--) {
      if (start + N > cells.length) continue;
      const slice = cells.slice(start, start + N);
      if (slice.some((c) => !c)) continue;
      if (slice.some((c) => !isFree(c.id))) continue;
      setTarget(slice.map((c) => c.id));
      return;
    }
    // Couldn't anchor at-or-before tapped column. Try shifting right
    // from the tap point as a fallback.
    for (let start = colIdx + 1; start + N <= cells.length; start++) {
      const slice = cells.slice(start, start + N);
      if (slice.some((c) => !c)) continue;
      if (slice.some((c) => !isFree(c.id))) continue;
      setTarget(slice.map((c) => c.id));
      return;
    }
    // Nothing fits in this row — silently ignore the tap.
  }

  // Override the SeatMap's interaction: it normally toggles single
  // seats. We use it for the visual but route taps through onSeatTap.
  // The selected Set drives the gold highlights.
  const targetSet = useMemo(() => new Set(target), [target]);

  async function commit() {
    if (target.length !== N || pending) return;
    setPending(true);
    setErr(null);
    const showingId = SHOWING_NUMBER_TO_ID[group.showing_number];
    const theaterId = group.theater_id;
    const oldIds = group.seats.map((s) => `${s.row}-${s.num}`);

    try {
      // Step 1: release the old block. Frees N slots.
      await seats.unplace(showingId, theaterId, oldIds);
      // Step 2: place the new block. Capacity is back to where we
      // started so this should succeed unless someone grabbed seats
      // in the brief window.
      try {
        await seats.place(showingId, theaterId, target);
      } catch (placeErr) {
        // Race: try to put the user back where they were.
        try {
          await seats.place(showingId, theaterId, oldIds);
          throw new Error(
            `One of those seats got taken just now. Your original block (${oldIds.map((s) => s.replace('-', '')).join(', ')}) is still yours. Try a different spot.`
          );
        } catch (recoverErr) {
          throw new Error(
            `Could not place the new block (${placeErr.message}). And we could not restore your original seats either — please refresh and try again.`
          );
        }
      }
      if (onRefresh) await onRefresh();
      if (onCommitted) onCommitted({ from: oldIds, to: target });
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
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
            {group.poster_url && (
              <img
                src={group.poster_url}
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
                {group.movie_title}
              </div>
              <div style={{ marginTop: 6 }}>
                <ShowingAuditoriumPills
                  showingNumber={group.showing_number}
                  auditoriumId={group.theater_id}
                />
              </div>
            </div>
          </div>

          <p style={{ fontSize: 13, color: 'var(--p2-muted)', marginTop: 0, marginBottom: 14 }}>
            We picked the best contiguous block of {N} seats. Tap anywhere on the map to anchor
            the block somewhere else — we'll keep all {N} seats together.
          </p>

          <div className="p2-swap-legend">
            <span className="p2-swap-legend-item">
              <span className="p2-swap-dot is-source" />
              Your current seats
            </span>
            <span className="p2-swap-legend-item">
              <span className="p2-swap-dot is-target" />
              New block
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
                onSelect={(id) => onSeatTap(id)}
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
            </div>
          </div>

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
              ? `Move ${N} seats here →`
              : 'Pick a spot above'}
          </button>
        </div>
      </div>
    </div>
  );
}
