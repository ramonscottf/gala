// GiftSeatModal — focused "give this seat to a guest" picker.
//
// Tap "🎁 Gift" on a seat row → opens this modal. Shows:
//   - Existing delegations (tap to assign this seat to that guest)
//   - "Invite someone new" at the bottom (opens InviteModal preselected)
//   - "Take it back" if the seat is currently assigned to a delegate
//
// Single tap on a delegate row commits the assignment via POST
// /api/gala/portal/{token}/assign. Refreshes portal on success.
//
// This replaces the buried "Assigned to" dropdown inside
// TicketDetailModal — the dropdown was hard to discover and required
// extra taps. A standalone Gift action surfaces it as a primary
// per-seat affordance.

import { useEffect, useState } from 'react';
import { config } from '../config.js';

function initialsOf(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('');
}

export function GiftSeatModal({
  seat,           // seat object from group.seats — has raw.delegation_id if already assigned
  portal,
  token,
  onClose,
  onRefresh,
  onInviteNew,    // callback to open InviteModal preselected with this seat
}) {
  const delegations = portal?.childDelegations || [];
  const currentAssignment = seat.raw?.delegation_id || null;
  const [pending, setPending] = useState(null); // delegation_id being saved or 'clear'
  const [err, setErr] = useState(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  async function assignTo(delegationId) {
    if (pending) return;
    setPending(delegationId || 'clear');
    setErr(null);
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theater_id: seat.theater_id,
          row_label: seat.row,
          seat_num: seat.num,
          showing_number: seat.showing_number || 1,
          delegation_id: delegationId,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (onRefresh) await onRefresh();
      onClose();
    } catch (e) {
      setErr(e.message);
      setPending(null);
    }
  }

  const seatLabel = seat.seatLabel || `${seat.row}${seat.num}`;

  return (
    <div
      className="p2-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="p2-modal stripped" style={{ maxWidth: 460 }}>
        <div className="p2-modal-header">
          <div style={{ minWidth: 0 }}>
            <div className="p2-modal-eyebrow">Gift seat</div>
            <div className="p2-modal-title">
              Who gets{' '}
              <span style={{ fontStyle: 'italic', color: 'var(--p2-gold)' }}>{seatLabel}</span>
              ?
            </div>
          </div>
          <button
            className="p2-modal-close"
            onClick={onClose}
            disabled={!!pending}
            type="button"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p2-modal-body">
          {delegations.length > 0 ? (
            <>
              <div className="p2-deleg-section-title" style={{ marginBottom: 10 }}>
                Your guests
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {delegations.map((d) => {
                  const isCurrent = d.id === currentAssignment;
                  const isSaving = pending === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={`p2-gift-row${isCurrent ? ' current' : ''}`}
                      onClick={() => !isCurrent && assignTo(d.id)}
                      disabled={isCurrent || !!pending}
                    >
                      <div className="p2-avatar" style={{ width: 40, height: 40, fontSize: 13 }}>
                        {initialsOf(d.delegateName)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                          {d.delegateName}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--p2-subtle)', marginTop: 2 }}>
                          {[d.phone, d.email].filter(Boolean).join(' · ') || 'no contact info'}
                        </div>
                      </div>
                      {isCurrent ? (
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--p2-gold)' }}>
                          CURRENT
                        </span>
                      ) : isSaving ? (
                        <span style={{ fontSize: 12, color: 'var(--p2-subtle)' }}>Saving…</span>
                      ) : (
                        <span style={{ fontSize: 18, color: 'var(--p2-subtle)' }}>→</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--p2-muted)', margin: 0 }}>
              You haven't invited anyone yet. Send your first invite below.
            </p>
          )}

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="p2-btn ghost"
              onClick={() => {
                onClose();
                if (onInviteNew) onInviteNew(seat);
              }}
              disabled={!!pending}
            >
              + Invite someone new
            </button>
            {currentAssignment && (
              <button
                type="button"
                className="p2-btn ghost-danger sm"
                onClick={() => assignTo(null)}
                disabled={!!pending}
              >
                {pending === 'clear' ? 'Taking back…' : '↶ Take this seat back'}
              </button>
            )}
          </div>

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
            disabled={!!pending}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
