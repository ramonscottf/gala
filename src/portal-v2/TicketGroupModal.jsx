// TicketGroupModal — when a sponsor has multiple seats for the same
// showing (e.g. 3 Star Wars Late seats), the home page collapses them
// to a single ticket card. Tapping that card opens this modal, which
// lays out all seats in the group with per-seat actions plus a
// "text my seats" action covering the whole group.

import { useState } from 'react';
import { config } from '../config.js';

function formatShowing(s) {
  return s === 1 ? 'Early showing · 4:30 PM' : s === 2 ? 'Late showing · 7:15 PM' : '';
}

export function TicketGroupModal({
  group,
  portal,
  token,
  onClose,
  onRefresh,
  onOpenSeat,
  onEditSeats,
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [smsNote, setSmsNote] = useState(null);

  const identity = portal?.identity || {};
  const canTextSelf = identity.kind === 'sponsor' && !!identity.phone;
  const delegations = portal?.childDelegations || [];

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
          <div style={{ minWidth: 0 }}>
            <div className="p2-modal-eyebrow">Group ticket</div>
            <div className="p2-modal-title">{group.movie_title}</div>
          </div>
          <button className="p2-modal-close" onClick={onClose} type="button" aria-label="Close">
            ×
          </button>
        </div>

        <div className="p2-modal-body">
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', marginBottom: 18 }}>
            {group.poster_url && (
              <img
                src={group.poster_url}
                alt={`${group.movie_title} poster`}
                style={{
                  width: 96,
                  aspectRatio: '2 / 3',
                  objectFit: 'cover',
                  borderRadius: 10,
                  border: '1px solid var(--p2-rule)',
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--p2-gold)',
                  fontWeight: 800,
                }}
              >
                {formatShowing(group.showing_number)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="p2-chip">Auditorium {group.theater_id}</span>
                <span className="p2-chip">
                  {group.seats.length} {group.seats.length === 1 ? 'seat' : 'seats'}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--p2-gold)',
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            Seats in this group
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.seats.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpenSeat(s)}
                className="p2-group-seat-row"
              >
                <span
                  style={{
                    fontFamily: 'Fraunces, Georgia, serif',
                    fontSize: 22,
                    color: 'var(--p2-gold)',
                    fontWeight: 600,
                    minWidth: 56,
                  }}
                >
                  {s.seatLabel}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: 'rgba(255,255,255,0.88)',
                    minWidth: 0,
                  }}
                >
                  {s.guest_name ? s.guest_name : 'Yours (no delegate)'}
                </span>
                <span style={{ color: 'var(--p2-subtle)', fontSize: 18 }}>→</span>
              </button>
            ))}
          </div>

          {canTextSelf && (
            <div style={{ marginTop: 22 }}>
              <button
                className="p2-btn ghost sm"
                type="button"
                disabled={busy}
                onClick={textMySeats}
              >
                📱 Text all my seats to me
              </button>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--p2-subtle)' }}>
                Sends every confirmed seat (across all groups) to {identity.phone}.
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
          <button type="button" className="p2-btn ghost sm" onClick={onClose}>
            Close
          </button>
          <button type="button" className="p2-btn primary sm" onClick={onEditSeats}>
            Edit my seats →
          </button>
        </div>
      </div>
    </div>
  );
}
