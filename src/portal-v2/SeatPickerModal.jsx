// SeatPickerModal — v2 chrome around the existing SeatPickSheet body.
//
// We deliberately reuse SeatPickSheet from src/portal/components/ because
// it already encapsulates the three-step staged flow (movie → time → seats)
// and the seat-map interactions. What we change is the WRAPPER — instead
// of a bottom sheet glued to an iOS-app shell, the picker now lives in a
// proper page-style modal that feels like part of the gala website.
//
// SeatPickSheet's `variant` prop: 'sheet' uses compact spacing for the
// old bottom-sheet shell; 'modal' uses the airier centered-modal layout.
// We use 'modal' on every viewport — even on phones, our modal stretches
// to (almost) full width, so the spacious layout reads better than the
// compact one.

import { useEffect } from 'react';
import SeatPickSheet from '../portal/components/SeatPickSheet.jsx';
import { FlowErrorProvider } from '../portal/components/FlowError.jsx';
import { config } from '../config.js';

export function SeatPickerModal({
  portal,
  token,
  theaterLayouts,
  seats,
  onClose,
  onRefresh,
  onOpenMovieDetail,
  onCommitted,
}) {
  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape to close.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="p2-modal-backdrop" onClick={onBackdrop} role="dialog" aria-modal="true">
      <div className="p2-modal wide stripped">
        <div className="p2-modal-header">
          <div>
            <div className="p2-modal-eyebrow">Seat selection</div>
            <div className="p2-modal-title">
              Pick your <span style={{ fontStyle: 'italic', color: 'var(--p2-gold)' }}>seats</span>
            </div>
          </div>
          <button
            className="p2-modal-close"
            onClick={onClose}
            type="button"
            aria-label="Close seat picker"
          >
            ×
          </button>
        </div>
        <div className="p2-modal-body">
          <FlowErrorProvider>
            <SeatPickSheet
              portal={portal}
              token={token}
              theaterLayouts={theaterLayouts}
              seats={seats}
              apiBase={config.apiBase}
              variant="modal"
              onRefresh={onRefresh}
              onMovieDetail={onOpenMovieDetail}
              onClose={onClose}
              onCommitted={async (placed) => {
                // Seats committed. Refresh the portal so the page
                // behind the modal shows the freshly placed tickets,
                // then let the parent handle the celebration moment
                // (full-screen glow overlay) before deciding to close
                // this modal. The parent owns the celebration because
                // the celebration spans the entire viewport, not just
                // this modal.
                if (onRefresh) await onRefresh();
                if (onCommitted) onCommitted(placed);
                else onClose();
              }}
            />
          </FlowErrorProvider>
        </div>
      </div>
    </div>
  );
}
