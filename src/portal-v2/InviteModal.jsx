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
  theaterId = null,        // Mode B: the single theater all seatPills live in
  assignableSeats = null,  // Hybrid Mode A: placed-but-unassigned seat objects
  apiBase = config.apiBase,
  onClose,
  onCreated,
  onSuccess,               // optional: parent toast callback (kind, message)
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // After the delegation is created, assign any seats the user kept
  // selected. keptSeats is normalized by DelegateForm to an array of
  // { theaterId, seatId } so we never key on the bare label (which
  // repeats across auditoriums). Group by theaterId — /assign takes
  // one theater_id + a seat_ids[] per call.
  async function assignKeptSeats(delegation, keptSeats) {
    if (!delegation?.id || !Array.isArray(keptSeats) || keptSeats.length === 0) return;
    const byTheater = new Map();
    for (const s of keptSeats) {
      if (s?.theaterId == null || !s?.seatId) continue;
      if (!byTheater.has(s.theaterId)) byTheater.set(s.theaterId, []);
      byTheater.get(s.theaterId).push(s.seatId);
    }
    for (const [tid, seatIds] of byTheater) {
      try {
        await fetch(`${apiBase}/api/gala/portal/${token}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            theater_id: tid,
            seat_ids: seatIds,
            delegation_id: delegation.id,
          }),
        });
      } catch {
        // Soft-fail: the delegation was created and the invite fired.
        // The seat assignment is convenience; the sponsor can re-assign
        // from the seat detail if a call dropped.
      }
    }
  }

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
            theaterId={theaterId}
            assignableSeats={assignableSeats}
            onCreated={async (d, keptSeats) => {
              await assignKeptSeats(d, keptSeats);
              if (onCreated) await onCreated(d);
              if (onSuccess) {
                const name = d?.delegate_name || d?.name || 'guest';
                const n = Array.isArray(keptSeats) ? keptSeats.length : 0;
                onSuccess(
                  'success',
                  n > 0
                    ? `Invite sent to ${name} — ${n} seat${n === 1 ? '' : 's'} assigned.`
                    : `Invite sent to ${name}.`
                );
              }
              onClose();
            }}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
