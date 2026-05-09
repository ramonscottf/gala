// SeatInviteSheet — V2 IA, Phase 6 (per-seat invite)
//
// Opens from the per-seat "+ Invite" / "Reassign" button on TicketCardV2.
// Hands ONE specific seat to a guest. Two paths inside the sheet:
//
//   1. Add to existing guest — tap a delegation card → POST /assign
//      with that delegation_id for the single seat
//   2. Invite new guest — name/phone/email form → POST /delegate to
//      create the delegation, then chained /assign for the single seat
//      (uses the parent's onDelegationCreated chain via setInviteOpen
//      with seat-binding metadata)
//
// Differs from HandBlockSheet (which handles N just-placed seats from
// the post-pick handoff): SeatInviteSheet is always a single seat,
// invoked from the Tickets tab on a placed seat the sponsor wants to
// hand off. Both share the same backend endpoints; the UX shape is
// different because the entry context is different.

import { useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { Avatar } from '../Mobile.jsx';

export default function SeatInviteSheet({
  seat, // { theaterId, row_label, seat_num, label e.g. "G15", showing }
  delegations = [],
  token,
  apiBase = '',
  onSaved,
  onClose,
  onInviteNew,
}) {
  const [step, setStep] = useState('pick'); // 'pick' | 'newguest'
  const [pending, setPending] = useState(null); // delegation_id | 'new' | null
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  if (!seat) return null;
  const seatLabel = seat.label || `${seat.row_label}${seat.seat_num}`;

  const assignToExisting = async (delegationId) => {
    setPending(delegationId);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theater_id: seat.theaterId,
          row_label: seat.row_label,
          seat_num: String(seat.seat_num),
          delegation_id: delegationId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (onSaved) await onSaved();
    } catch (e) {
      setError(e.message || 'Could not assign');
      setPending(null);
    }
  };

  const handleNewGuestSubmit = () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError('Phone or email required');
      return;
    }
    // Hand off to parent via onInviteNew — the parent already has the
    // DelegateForm / onDelegationCreated chain wired with seat-binding
    // (extended for multi-seat in HandBlockSheet, but single-seat is
    // the original case)
    if (onInviteNew) {
      onInviteNew({
        seat,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ marginBottom: 4 }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -0.4,
          }}
        >
          Invite for seat {seatLabel}
        </div>
        {seat.showing && (
          <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>
            {seat.showing.label} · {seat.showing.movieTitle} · {seat.showing.theaterName}
          </div>
        )}
      </div>

      {step === 'pick' && (
        <>
          {delegations.length > 0 && (
            <>
              <SectionLabel>EXISTING GUESTS</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {delegations.map((d) => {
                  const isPending = pending === d.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => assignToExisting(d.id)}
                      disabled={!!pending}
                      style={{
                        all: 'unset',
                        cursor: pending ? 'not-allowed' : 'pointer',
                        boxSizing: 'border-box',
                        padding: 12,
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isPending ? BRAND.indigoLight : 'var(--rule)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        opacity: pending && !isPending ? 0.4 : 1,
                      }}
                    >
                      <Avatar name={d.delegateName} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: 'var(--ink-on-ground)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {d.delegateName}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 2 }}>
                          {d.phone || d.email || 'no contact'} · already has{' '}
                          {d.seatsAllocated} seat{d.seatsAllocated === 1 ? '' : 's'}
                        </div>
                      </div>
                      <span
                        style={{
                          color: BRAND.indigoLight,
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {isPending ? 'Assigning…' : '+1 →'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <SectionLabel style={{ marginTop: delegations.length > 0 ? 14 : 0 }}>
            {delegations.length > 0 ? 'OR INVITE SOMEONE NEW' : 'INVITE A NEW GUEST'}
          </SectionLabel>
          <button
            onClick={() => setStep('newguest')}
            disabled={!!pending}
            style={{
              all: 'unset',
              cursor: pending ? 'not-allowed' : 'pointer',
              boxSizing: 'border-box',
              padding: 13,
              borderRadius: 12,
              background: 'rgba(168,177,255,0.06)',
              border: `1.5px dashed rgba(168,177,255,0.4)`,
              color: BRAND.indigoLight,
              fontSize: 13,
              fontWeight: 600,
              textAlign: 'center',
              opacity: pending ? 0.5 : 1,
            }}
          >
            + New guest
          </button>
        </>
      )}

      {step === 'newguest' && (
        <>
          <SectionLabel>GUEST INFO</SectionLabel>
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!!pending}
            style={inputStyle}
            autoFocus
          />
          <input
            type="tel"
            placeholder="Phone (preferred)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!!pending}
            style={inputStyle}
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!pending}
            style={inputStyle}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setStep('pick')}
              disabled={!!pending}
              style={{
                all: 'unset',
                cursor: pending ? 'not-allowed' : 'pointer',
                boxSizing: 'border-box',
                padding: '11px 18px',
                borderRadius: 99,
                background: 'transparent',
                border: `1px solid var(--rule)`,
                color: 'var(--ink-on-ground)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Back
            </button>
            <button
              onClick={handleNewGuestSubmit}
              disabled={!!pending || !name.trim() || (!phone.trim() && !email.trim())}
              style={{
                all: 'unset',
                cursor:
                  pending || !name.trim() || (!phone.trim() && !email.trim())
                    ? 'not-allowed'
                    : 'pointer',
                boxSizing: 'border-box',
                flex: 1,
                padding: '11px 18px',
                borderRadius: 99,
                background: 'linear-gradient(135deg,#a8b1ff,#6f75d8)',
                color: BRAND.navyDeep,
                fontSize: 13,
                fontWeight: 800,
                textAlign: 'center',
                opacity:
                  pending || !name.trim() || (!phone.trim() && !email.trim())
                    ? 0.5
                    : 1,
              }}
            >
              {pending === 'new' ? 'Sending…' : `Send invite for ${seatLabel} →`}
            </button>
          </div>
        </>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(215,40,70,0.12)',
            color: '#ff8da4',
            fontSize: 12,
            border: `1px solid rgba(215,40,70,0.30)`,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid var(--rule)`,
  color: '#fff',
  fontSize: 14,
  marginBottom: 6,
  outline: 'none',
};

function SectionLabel({ children, style }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 1.4,
        color: 'rgba(255,255,255,0.55)',
        marginBottom: 4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
