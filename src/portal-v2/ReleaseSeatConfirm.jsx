// ReleaseSeatConfirm — confirmation step before releasing seats.
//
// Used by both the per-seat "Release this seat" overflow action and
// the group-level "Release whole group" action. Same component handles
// both — the parent supplies the seats array; UI adapts copy based on
// count.
//
// Confirms once (clear message about what's being released), one
// destructive button, one escape hatch. No double-confirm — the
// confirmation IS the second step (the first being the overflow tap
// or the menu choice).
//
// On confirm: parent runs seats.unplace() for each seat, refreshes.
// On cancel: closes, no change. Esc and backdrop click also cancel
// to make the destructive path easy to back out of.

import { useEffect, useState } from 'react';

export function ReleaseSeatConfirm({
  seats,         // [{ seatLabel, theater_id, row, num, showing_number, movie_title }]
  onConfirm,     // async () => void  — parent does the API calls
  onClose,
}) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  async function go() {
    if (pending) return;
    setPending(true);
    setErr(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setErr(e.message || 'Could not release. Try again.');
      setPending(false);
    }
  }

  const n = seats.length;
  const movieTitle = seats[0]?.movie_title;
  const sameMovie = seats.every((s) => s.movie_title === movieTitle);
  const seatList = seats.map((s) => s.seatLabel).join(', ');

  return (
    <div
      className="p2-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="p2-modal stripped" style={{ maxWidth: 440 }}>
        <div className="p2-modal-header">
          <div style={{ minWidth: 0 }}>
            <div className="p2-modal-eyebrow">Release {n === 1 ? 'seat' : 'seats'}</div>
            <div className="p2-modal-title">
              {n === 1 ? (
                <>
                  Release{' '}
                  <span style={{ fontStyle: 'italic', color: 'var(--p2-gold)' }}>
                    {seats[0].seatLabel}
                  </span>
                  ?
                </>
              ) : (
                <>
                  Release{' '}
                  <span style={{ fontStyle: 'italic', color: 'var(--p2-gold)' }}>{n} seats</span>
                  ?
                </>
              )}
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
          <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--p2-muted)', margin: 0 }}>
            {n === 1 ? (
              <>
                This will free up <strong style={{ color: '#fff' }}>{seats[0].seatLabel}</strong>
                {sameMovie && movieTitle ? (
                  <> in {movieTitle}</>
                ) : null}
                . The seat returns to your allocation — you can pick it again or someone else
                can.
              </>
            ) : (
              <>
                This will free up <strong style={{ color: '#fff' }}>{seatList}</strong>
                {sameMovie && movieTitle ? (
                  <> in {movieTitle}</>
                ) : null}
                . The seats return to your allocation — you can pick new ones, or another
                sponsor could grab them if they go fast.
              </>
            )}
          </p>
          {seats.some((s) => s.dinner_choice) && (
            <p style={{ fontSize: 13, color: 'var(--p2-subtle)', marginTop: 10, marginBottom: 0 }}>
              Meal {n === 1 ? 'choice' : 'choices'} on{' '}
              {n === 1 ? 'this seat' : 'these seats'} will be cleared.
            </p>
          )}

          {err && (
            <div className="p2-notice red" style={{ marginTop: 14 }}>
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
            Keep {n === 1 ? 'it' : 'them'}
          </button>
          <button
            type="button"
            className="p2-btn danger sm"
            onClick={go}
            disabled={pending}
          >
            {pending
              ? 'Releasing…'
              : n === 1
              ? `Release ${seats[0].seatLabel}`
              : `Release ${n} seats`}
          </button>
        </div>
      </div>
    </div>
  );
}
