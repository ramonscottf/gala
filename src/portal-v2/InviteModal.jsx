// InviteModal — v2 chrome around the existing DelegateForm.
//
// DelegateForm has two modes:
//   - Mode A (quota counter): no seatPills passed → "Invite a guest"
//     style, sponsor specifies how many seats they're handing off
//   - Mode B (pills): seatPills array passed → invite is locked to
//     specific seat IDs, sponsor can check/uncheck additional seats
//     from their block
// preselectedPills controls which pills start checked in Mode B.
//
// Open paths:
//   - From the Group section "Invite a guest" CTA → Mode A
//   - From a placed-but-unassigned seat row → Mode B with that one
//     seat preselected, full block visible as additional checkable
//     pills
//
// Reuse, don't rebuild — DelegateForm has years of edge-case handling
// (quota math, validation, send-from-server). We wrap it in v2 chrome
// and let it handle the form internals.

import { useEffect } from 'react';
import { config } from '../config.js';
import { DelegateForm } from '../portal/Portal.jsx';

export function InviteModal({
  token,
  available,
  seatPills = null,        // Mode B if provided
  preselectedPills = null, // which pills start checked in Mode B
  onClose,
  onCreated,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Title varies by mode and which seats are being invited.
  const title = (() => {
    if (preselectedPills && preselectedPills.length > 0) {
      const labels = preselectedPills.map((s) => s.replace('-', '')).join(', ');
      return `Invite for ${labels}`;
    }
    if (seatPills && seatPills.length > 0) {
      const labels = seatPills.map((s) => s.replace('-', '')).join(', ');
      return `Invite for ${labels}`;
    }
    return 'Invite a guest';
  })();

  return (
    <div
      className="p2-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="p2-modal stripped p2-legacy-form-host">
        <div className="p2-modal-header">
          <div style={{ minWidth: 0 }}>
            <div className="p2-modal-eyebrow">Invite a guest</div>
            <div className="p2-modal-title">{title}</div>
          </div>
          <button className="p2-modal-close" onClick={onClose} type="button" aria-label="Close">
            ×
          </button>
        </div>

        <div className="p2-modal-body">
          <DelegateForm
            token={token}
            apiBase={config.apiBase}
            available={available}
            seatPills={seatPills}
            preselectedPills={preselectedPills}
            onCreated={async (d) => {
              if (onCreated) await onCreated(d);
              onClose();
            }}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
