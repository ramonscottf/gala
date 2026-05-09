// BulkAssignSheet — V2 IA, Phase 2
//
// One bottom sheet that takes N selected seats and assigns them to a
// guest. Existing guests appear at the top with "+N →" indicating how
// many additional seats this would add to their pile. "+ New guest"
// at the bottom collects name/phone/email and creates a fresh
// delegation.
//
// This is the cleaner version of "pick seats → invite guest" — V1
// forced the user to first invite a guest with a count, then have
// THAT guest pick which seats they wanted. V2 lets the host pick
// the specific seats first (multi-select in TicketsTabV2), then
// hand them to a guest. Both flows still work — V2 is the more
// natural mental model for "I want to give Aaron exactly D17 and D18."
//
// Implementation: this calls /assign for each selected seat, with the
// target delegation_id. The endpoint already supports moving sponsor-
// owned seats to a delegation (and between delegations).

import { useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';

function Avatar({ name, size = 32 }) {
  const initials = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        background: 'rgba(168,177,255,0.16)',
        color: BRAND.indigoLight,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: size * 0.32,
        flexShrink: 0,
        border: `1px solid rgba(168,177,255,0.25)`,
      }}
    >
      {initials || '?'}
    </div>
  );
}

export default function BulkAssignSheet({
  seats, // selected seat objects [{ theater_id, row_label, seat_num, key, ... }]
  delegations, // existing delegations from data.delegations
  token,
  apiBase = '',
  onClose,
  onRefresh,
}) {
  const [step, setStep] = useState('pick'); // 'pick' | 'newguest' | 'sending'
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  if (!seats || seats.length === 0) {
    return null;
  }

  const seatLabels = seats
    .map((s) => `${s.row_label}${s.seat_num}`)
    .slice(0, 6)
    .join(' · ');
  const moreCount = seats.length > 6 ? seats.length - 6 : 0;
  const showings = [...new Set(seats.map((s) => s.showing?.label).filter(Boolean))];
  const showingLine = showings.length === 1 ? showings[0] : `${showings.length} showings`;

  // Assign seats to an existing delegation
  const assignToExisting = async (delegationId) => {
    setPending(true);
    setError(null);
    try {
      // /assign accepts a single seat per call; fan out for N seats
      const results = await Promise.allSettled(
        seats.map((s) =>
          fetch(`${apiBase}/api/gala/portal/${token}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              theater_id: s.theater_id,
              row_label: s.row_label,
              seat_num: String(s.seat_num),
              delegation_id: delegationId,
            }),
          })
        )
      );
      const failed = results.filter((r) => r.status === 'rejected' || (r.value && !r.value.ok));
      if (failed.length > 0) {
        throw new Error(`${failed.length} seat${failed.length === 1 ? '' : 's'} couldn't be assigned`);
      }
      if (onRefresh) await onRefresh();
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not assign');
      setPending(false);
    }
  };

  // Create new delegation, then assign all selected seats to it
  const createAndAssign = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError('Phone or email required');
      return;
    }
    setPending(true);
    setError(null);
    try {
      // Step 1: create the delegation with seats_allocated = N
      const createRes = await fetch(`${apiBase}/api/gala/portal/${token}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delegate_name: name.trim(),
          delegate_phone: phone.trim() || null,
          delegate_email: email.trim() || null,
          seats_allocated: seats.length,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.ok) {
        throw new Error(createData.error || `Failed to create guest (${createRes.status})`);
      }
      const newDelegationId = createData.delegation?.id;
      if (!newDelegationId) {
        throw new Error('Server did not return a delegation id');
      }
      // Step 2: assign all selected seats to the new delegation
      await Promise.allSettled(
        seats.map((s) =>
          fetch(`${apiBase}/api/gala/portal/${token}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              theater_id: s.theater_id,
              row_label: s.row_label,
              seat_num: String(s.seat_num),
              delegation_id: newDelegationId,
            }),
          })
        )
      );
      if (onRefresh) await onRefresh();
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not create guest');
      setPending(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -0.4,
          }}
        >
          Send {seats.length} seat{seats.length === 1 ? '' : 's'} to…
        </div>
        <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>
          {seatLabels}
          {moreCount > 0 && ` · +${moreCount} more`}
          {' · '}
          {showingLine}
        </div>
      </div>

      {step === 'pick' && (
        <>
          {(delegations && delegations.length > 0) && (
            <>
              <SectionLabel>EXISTING GUESTS</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {delegations.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => assignToExisting(d.id)}
                    disabled={pending}
                    style={{
                      all: 'unset',
                      cursor: pending ? 'not-allowed' : 'pointer',
                      boxSizing: 'border-box',
                      width: '100%',
                      padding: '11px 13px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${BRAND.rule}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      opacity: pending ? 0.5 : 1,
                    }}
                  >
                    <Avatar name={d.delegateName} />
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
                      <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>
                        {d.phone || d.email || 'no contact'} · {d.seatsAllocated} seats now
                      </div>
                    </div>
                    <span style={{ color: BRAND.indigoLight, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      +{seats.length} →
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          <SectionLabel>OR INVITE SOMEONE NEW</SectionLabel>
          <button
            onClick={() => setStep('newguest')}
            disabled={pending}
            style={{
              all: 'unset',
              cursor: pending ? 'not-allowed' : 'pointer',
              boxSizing: 'border-box',
              width: '100%',
              padding: '14px',
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

          <div style={{ marginTop: 14, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5, textAlign: 'center', fontStyle: 'italic' }}>
            They'll get a text & email with these specific seats. They can pick their own dinner — or you can pick for them on the seat detail screen.
          </div>
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
            disabled={pending}
            style={inputStyle}
          />
          <input
            type="tel"
            placeholder="Phone (preferred)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={pending}
            style={inputStyle}
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            style={inputStyle}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={() => setStep('pick')}
              disabled={pending}
              style={{
                all: 'unset',
                cursor: pending ? 'not-allowed' : 'pointer',
                boxSizing: 'border-box',
                padding: '11px 18px',
                borderRadius: 99,
                background: 'transparent',
                border: `1px solid ${BRAND.rule}`,
                color: 'var(--ink-on-ground)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Back
            </button>
            <button
              onClick={createAndAssign}
              disabled={pending || !name.trim() || (!phone.trim() && !email.trim())}
              style={{
                all: 'unset',
                cursor: pending ? 'not-allowed' : 'pointer',
                boxSizing: 'border-box',
                flex: 1,
                padding: '11px 18px',
                borderRadius: 99,
                background: 'linear-gradient(135deg,#a8b1ff,#6f75d8)',
                color: BRAND.navyDeep,
                fontSize: 13,
                fontWeight: 800,
                textAlign: 'center',
                opacity: pending || !name.trim() || (!phone.trim() && !email.trim()) ? 0.5 : 1,
              }}
            >
              {pending ? 'Sending…' : `Send ${seats.length} seat${seats.length === 1 ? '' : 's'} to ${name.trim() || 'guest'}`}
            </button>
          </div>
        </>
      )}

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 12,
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
    </>
  );
}

const inputStyle = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${BRAND.rule}`,
  color: '#fff',
  fontSize: 14,
  marginBottom: 8,
  outline: 'none',
};

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1.4,
        color: 'rgba(255,255,255,0.55)',
        margin: '8px 0 8px',
      }}
    >
      {children}
    </div>
  );
}
