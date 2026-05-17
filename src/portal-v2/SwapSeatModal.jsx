// SwapSeatModal — change one specific seat to a different open seat
// in the SAME showing + auditorium.
//
// Models how AMC, Cineplex, and the better cinema apps handle the
// post-purchase "actually, I'd rather sit in K3" use case: you tap
// a seat, you get a focused map of THAT showing in THAT auditorium,
// your current seat is highlighted as the source, you pick an open
// seat, hit confirm. One transaction, two API calls under the hood
// (unfinalize old, finalize new).
//
// Why not extend SeatPickSheet? SeatPickSheet is a wizard for picking
// many seats from scratch across the whole venue. Swap is a single-
// seat focused tool — different mental model, simpler UI. Reusing
// the SeatMap component from SeatEngine gives us the visual
// consistency without the wizard overhead.
//
// Failure handling: place-new runs after unplace-old. If place-new
// fails (race condition — someone grabbed the target seat in the
// brief window), we attempt to re-place the original seat to leave
// the user where they started. Surface a clear error either way.

import { useEffect, useMemo, useState } from 'react';
import { SeatMap, adaptTheater, seatById } from '../portal/SeatEngine.jsx';
import { SHOWING_NUMBER_TO_ID } from '../hooks/usePortal.js';
import { ShowingAuditoriumPills } from './TicketGroupModal.jsx';

export function SwapSeatModal({
  currentSeat,        // { row, num, seatLabel, theater_id, showing_number, movie_title, poster_url, ... }
  theaterLayouts,
  portal,
  seats,              // useSeats hook
  onClose,
  onRefresh,
  onCommitted,        // optional: parent reaction (e.g. close parent modal)
}) {
  const [target, setTarget] = useState(null); // seatId like "K-3"
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
    const t = (theaterLayouts?.theaters || []).find(
      (x) => x.id === currentSeat.theater_id
    );
    return t ? adaptTheater(t) : null;
  }, [theaterLayouts, currentSeat.theater_id]);

  // Build the "occupied by others" set — every assignment in this
  // theater + showing that isn't the user's current seat. Includes
  // both other sponsors' assignments AND the user's OTHER seats in
  // the same showing (a user shouldn't be able to swap onto another
  // of their own held seats).
  const otherTaken = useMemo(() => {
    const s = new Set();
    const showingNum = currentSeat.showing_number;
    const currentSeatId = `${currentSeat.row}-${currentSeat.num}`;
    (portal?.allAssignments || []).forEach((a) => {
      if (
        a.theater_id === currentSeat.theater_id &&
        (a.showing_number || 1) === showingNum
      ) {
        const id = `${a.row_label}-${a.seat_num}`;
        if (id !== currentSeatId) s.add(id);
      }
    });
    return s;
  }, [portal, currentSeat]);

  // The user's current seat — render it specially. Pass as `assignedSelf`
  // so SeatMap colors it with the self color (indigoLight). We override
  // the visual with a CSS class wrapped around the map to give it the
  // "swap source" gold ring treatment.
  const currentSeatId = `${currentSeat.row}-${currentSeat.num}`;
  const selfSet = useMemo(() => new Set([currentSeatId]), [currentSeatId]);

  // `selected` Set drives the target seat highlight (the chosen new
  // seat). Single-select only.
  const selectedSet = useMemo(() => (target ? new Set([target]) : new Set()), [
    target,
  ]);

  // Click handler enforces single-target. If user clicks their current
  // seat, ignore (can't swap to where you already are). If user clicks
  // an already-taken seat, ignore. Otherwise: that's the new target.
  function onSeatTap(seatId) {
    if (pending) return;
    if (seatId === currentSeatId) return;
    if (otherTaken.has(seatId)) return;
    // Verify seat exists in the adapted theater (not a render glitch)
    if (theater && !seatById(theater, seatId)) return;
    setTarget((cur) => (cur === seatId ? null : seatId));
  }

  async function commit() {
    if (!target || pending) return;
    setPending(true);
    setErr(null);
    const showingNum = currentSeat.showing_number;
    const showingId = SHOWING_NUMBER_TO_ID[showingNum];
    const theaterId = currentSeat.theater_id;

    try {
      // Step 1: release the current seat. Frees a slot in capacity.
      await seats.unplace(showingId, theaterId, [currentSeatId]);
      // Step 2: place the target. Capacity is now back to where it
      // was before the swap, so this should succeed unless the seat
      // got grabbed in the brief window.
      try {
        await seats.place(showingId, theaterId, [target]);
      } catch (placeErr) {
        // Race: target was taken between our unplace and our place.
        // Try to recover by re-placing the original seat. If THAT
        // also fails (capacity issue?), surface both errors.
        try {
          await seats.place(showingId, theaterId, [currentSeatId]);
          throw new Error(
            `That seat got taken just now. Your original seat ${currentSeat.seatLabel} is still yours. Try a different seat.`
          );
        } catch (recoverErr) {
          throw new Error(
            `Could not place ${target.replace('-', '')} (${placeErr.message}). And we could not put you back in ${currentSeat.seatLabel} either — please refresh and try again.`
          );
        }
      }
      if (onRefresh) await onRefresh();
      if (onCommitted) onCommitted({ from: currentSeatId, to: target });
      onClose();
    } catch (e) {
      setErr(e.message);
      setPending(false);
    }
  }

  const targetLabel = target ? target.replace('-', '') : null;

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
            <div className="p2-modal-eyebrow">Change seat</div>
            <div className="p2-modal-title">
              Moving from{' '}
              <span style={{ fontStyle: 'italic', color: 'var(--p2-gold)' }}>
                {currentSeat.seatLabel}
              </span>
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
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
            {currentSeat.poster_url && (
              <img
                src={currentSeat.poster_url}
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
                {currentSeat.movie_title}
              </div>
              <div style={{ marginTop: 6 }}>
                <ShowingAuditoriumPills
                  showingNumber={currentSeat.showing_number}
                  auditoriumId={currentSeat.theater_id}
                />
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="p2-swap-legend">
            <span className="p2-swap-legend-item">
              <span className="p2-swap-dot is-source" />
              Your seat
            </span>
            <span className="p2-swap-legend-item">
              <span className="p2-swap-dot is-target" />
              New seat
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

          {/* Seat map */}
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
                assignedSelf={selfSet}
                assignedOther={otherTaken}
                selected={selectedSet}
                onSelect={(id) => onSeatTap(id)}
              />
            ) : (
              <div style={{ padding: 24, color: 'var(--p2-muted)', textAlign: 'center' }}>
                Could not load auditorium layout.
              </div>
            )}
          </div>

          {/* From → To header */}
          <div className="p2-swap-direction">
            <div className="p2-swap-direction-cell">
              <div className="p2-swap-direction-label">From</div>
              <div className="p2-swap-direction-seat">{currentSeat.seatLabel}</div>
            </div>
            <div className="p2-swap-arrow" aria-hidden="true">
              →
            </div>
            <div className="p2-swap-direction-cell">
              <div className="p2-swap-direction-label">To</div>
              <div className={`p2-swap-direction-seat ${target ? '' : 'placeholder'}`}>
                {targetLabel || 'Tap a seat'}
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
            disabled={!target || pending}
            onClick={commit}
          >
            {pending
              ? 'Moving…'
              : target
              ? `Move to ${targetLabel} →`
              : 'Pick a seat above'}
          </button>
        </div>
      </div>
    </div>
  );
}
