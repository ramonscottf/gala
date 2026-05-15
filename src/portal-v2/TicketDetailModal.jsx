// TicketDetailModal — clean website-style modal for a single seat ticket.
//
// Shows the seat, the showing, the auditorium, and any assigned guest.
// Lets the user:
//   - Open the seat picker focused on this seat's showing (Edit seat)
//   - Assign / reassign the seat to one of their delegations
//   - Clear the assignment (revert to "yours")
//   - Unplace the seat entirely (releases it back to the open pool)
//   - Text themselves the full confirmation (sponsor-only, kind=self)
//
// All actions go through existing API endpoints — no new server code.

import { useState } from 'react';
import { config } from '../config.js';

function formatShowing(s) {
  return s === 1 ? 'Early showing · 4:30 PM' : s === 2 ? 'Late showing · 7:15 PM' : '';
}

export function TicketDetailModal({ ticket, portal, token, onClose, onRefresh, onEditSeats }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [smsNote, setSmsNote] = useState(null);
  const [assignTo, setAssignTo] = useState(ticket.raw?.delegation_id || '');

  const delegations = portal?.childDelegations || [];
  const identity = portal?.identity || {};
  const canTextSelf = identity.kind === 'sponsor' && !!identity.phone;

  async function unplace() {
    if (!confirm(`Release seat ${ticket.seatLabel}? It goes back to the open pool.`)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unfinalize',
          theater_id: ticket.theater_id,
          showing_number: ticket.showing_number,
          row_label: ticket.row,
          seat_num: ticket.num,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (onRefresh) await onRefresh();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theater_id: ticket.theater_id,
          seat_ids: [`${ticket.row}-${ticket.num}`],
          delegation_id: assignTo === '' ? null : Number(assignTo),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (onRefresh) await onRefresh();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function textMySeats() {
    setBusy(true);
    setErr(null);
    setSmsNote(null);
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'self' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setSmsNote(`Sent to ${j.to || identity.phone}.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="p2-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="p2-modal stripped">
        <div className="p2-modal-header">
          <div>
            <div className="p2-modal-eyebrow">Your seat</div>
            <div className="p2-modal-title">
              <span style={{ color: 'var(--p2-gold)' }}>{ticket.seatLabel}</span>
              {' · '}
              {ticket.movie_title}
            </div>
          </div>
          <button
            className="p2-modal-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p2-modal-body">
          {ticket.poster_url && (
            <div
              style={{
                display: 'flex',
                gap: 18,
                alignItems: 'flex-start',
                marginBottom: 18,
              }}
            >
              <img
                src={ticket.poster_url}
                alt={`${ticket.movie_title} poster`}
                style={{
                  width: 110,
                  aspectRatio: '2 / 3',
                  objectFit: 'cover',
                  borderRadius: 10,
                  border: '1px solid var(--p2-rule)',
                  flexShrink: 0,
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--p2-gold)',
                      fontWeight: 800,
                    }}
                  >
                    {formatShowing(ticket.showing_number)}
                  </div>
                  <div
                    style={{
                      fontFamily: 'Fraunces, Georgia, serif',
                      fontSize: 22,
                      marginTop: 6,
                      lineHeight: 1.1,
                    }}
                  >
                    {ticket.movie_title}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="p2-chip">
                    Auditorium {ticket.auditorium}
                  </span>
                  <span className="p2-chip">
                    Row {ticket.row} · Seat {ticket.num}
                  </span>
                </div>
              </div>
            </div>
          )}

          {delegations.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--p2-gold)',
                  fontWeight: 800,
                  marginBottom: 10,
                }}
              >
                Who's sitting here?
              </div>
              <select
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--p2-rule)',
                  color: '#fff',
                  borderRadius: 12,
                  padding: '12px 14px',
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              >
                <option value="">Mine (no delegate)</option>
                {delegations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.guest_name || d.guest_email || `Guest #${d.id}`}
                  </option>
                ))}
              </select>
              <button
                className="p2-btn sm primary"
                type="button"
                disabled={busy}
                onClick={saveAssignment}
                style={{ marginTop: 12 }}
              >
                {busy ? 'Saving…' : 'Save assignment'}
              </button>
            </div>
          )}

          {canTextSelf && (
            <div style={{ marginTop: 22 }}>
              <button
                className="p2-btn ghost sm"
                type="button"
                disabled={busy}
                onClick={textMySeats}
              >
                📱 Text my seats to me
              </button>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--p2-subtle)' }}>
                Sends a full confirmation to {identity.phone}.
              </div>
            </div>
          )}

          {smsNote && (
            <div className="p2-notice success" style={{ marginTop: 18 }}>
              <p>{smsNote}</p>
            </div>
          )}

          {err && (
            <div className="p2-notice red" style={{ marginTop: 18 }}>
              <p>{err}</p>
            </div>
          )}
        </div>

        <div className="p2-modal-footer">
          <button
            type="button"
            className="p2-btn ghost sm"
            disabled={busy}
            onClick={unplace}
          >
            Release this seat
          </button>
          <button
            type="button"
            className="p2-btn primary"
            onClick={onEditSeats}
          >
            Edit my seats →
          </button>
        </div>
      </div>
    </div>
  );
}
