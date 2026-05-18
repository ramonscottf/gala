// TicketDetailModal — clean website-style modal for a single seat ticket.
//
// Shows the seat, the showing, the auditorium, the meal selection,
// and any assigned guest. Lets the user:
//   - Open the seat picker focused on this seat's showing (Edit seat)
//   - Assign / reassign the seat to one of their delegations
//   - Clear the assignment (revert to "yours")
//   - Unplace the seat entirely (releases it back to the open pool)
//   - Pick or change a meal for this seat
//   - Text themselves the full confirmation (sponsor-only, kind=self)
//
// All actions go through existing API endpoints — no new server code.

import { useState } from 'react';
import { config } from '../config.js';
import { ShowingAuditoriumPills } from './TicketGroupModal.jsx';
import { DinnerModal, dinnerEmojiFor, dinnerLabelFor } from './DinnerModal.jsx';

export function TicketDetailModal({
  ticket,
  portal,
  token,
  onClose,
  onRefresh,
  onEditSeats,
  onChangeSeat,
  onReleaseSeat,
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [smsNote, setSmsNote] = useState(null);
  const [assignTo, setAssignTo] = useState(ticket.raw?.delegation_id || '');
  const [dinnerOpen, setDinnerOpen] = useState(false);

  const delegations = portal?.childDelegations || [];
  const identity = portal?.identity || {};
  const canTextSelf = identity.kind === 'sponsor' && !!identity.phone;
  const dinner = ticket.raw?.dinner_choice;

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
                <div
                  style={{
                    fontFamily: 'Fraunces, Georgia, serif',
                    fontSize: 22,
                    lineHeight: 1.1,
                  }}
                >
                  {ticket.movie_title}
                </div>
                <ShowingAuditoriumPills
                  showingNumber={ticket.showing_number}
                  auditoriumId={ticket.auditorium}
                />
                <div style={{ fontSize: 13, color: 'var(--p2-muted)' }}>
                  Row {ticket.row} · Seat {ticket.num}
                </div>
              </div>
            </div>
          )}

          {/* Dinner row — always present so the user knows the meal is
              part of the ticket experience. Tap opens DinnerModal. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid var(--p2-rule)',
              background: 'rgba(255,255,255,0.04)',
              marginTop: 4,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--p2-gold)',
                  fontWeight: 800,
                }}
              >
                Dinner
              </div>
              <div style={{ marginTop: 4, fontSize: 14, color: 'rgba(255,255,255,0.92)' }}>
                {dinner ? dinnerLabelFor(dinner) : 'Not picked yet'}
              </div>
            </div>
            <button
              type="button"
              className={`p2-dinner-pill${dinner ? '' : ' empty'}`}
              onClick={() => setDinnerOpen(true)}
            >
              {dinner ? (
                <>
                  <span className="p2-dinner-pill-emoji">{dinnerEmojiFor(dinner)}</span>
                  <span>Change</span>
                </>
              ) : (
                <>
                  <span className="p2-dinner-pill-emoji">🍽️</span>
                  <span>Pick dinner</span>
                </>
              )}
            </button>
          </div>

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
                    {d.delegateName || d.guest_name || d.email || d.guest_email || `Guest #${d.id}`}
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
            className="p2-btn ghost-danger sm"
            disabled={busy}
            onClick={() => onReleaseSeat && onReleaseSeat(ticket)}
          >
            Release this seat
          </button>
          <button
            type="button"
            className="p2-btn primary"
            onClick={() => onChangeSeat && onChangeSeat(ticket)}
            disabled={!onChangeSeat}
          >
            ↻ Change this seat
          </button>
        </div>
      </div>

      {dinnerOpen && (
        <DinnerModal
          seat={ticket}
          token={token}
          onClose={() => setDinnerOpen(false)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
