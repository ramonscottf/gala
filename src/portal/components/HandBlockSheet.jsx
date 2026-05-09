// HandBlockSheet — V2 IA, Phase 4 (post-pick handoff)
//
// Opens from PostPickSheet when V2 is enabled and the user taps
// "Hand the block to a guest." Takes all seats in `placed.seatIds`
// and assigns them — in one go — to a single delegation.
//
// Two paths inside this sheet:
//   1. Existing guest — tap a delegation card → fan out /assign for
//      every just-placed seat with that delegation_id
//   2. + New guest — opens DelegateForm via onInviteNew (parent's
//      setInviteOpen with seat-binding metadata so the new delegation
//      gets all the just-placed seats assigned post-create)
//
// Differs from AssignTheseSheet (per-seat dropdown grid) in that it's
// a single-tap bulk operation: the user already decided "all of these
// go to one person." Mental model: "I picked Aaron's seats, now I'm
// handing them off to him."

import { useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { Avatar } from '../Mobile.jsx';

export default function HandBlockSheet({
  placed,
  delegations = [],
  token,
  apiBase = '',
  onSaved,
  onClose,
  onInviteNew,
}) {
  const [pending, setPending] = useState(null); // delegation_id being processed | null
  const [error, setError] = useState(null);

  if (!placed) return null;
  const seatIds = placed.seatIds || [];
  const N = seatIds.length;

  const assignAllTo = async (delegationId) => {
    setPending(delegationId);
    setError(null);
    try {
      // /assign accepts one seat per call — fan out for every seat
      const results = await Promise.allSettled(
        seatIds.map((sid) => {
          const [row, num] = sid.split('-');
          return fetch(`${apiBase}/api/gala/portal/${token}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              theater_id: placed.theaterId,
              row_label: row,
              seat_num: num,
              delegation_id: delegationId,
            }),
          });
        })
      );
      const failed = results.filter(
        (r) => r.status === 'rejected' || (r.value && !r.value.ok)
      );
      if (failed.length > 0) {
        throw new Error(
          `${failed.length} of ${N} seat${failed.length === 1 ? '' : 's'} couldn't be assigned`
        );
      }
      if (onSaved) await onSaved();
    } catch (e) {
      setError(e.message || 'Could not assign');
      setPending(null);
    }
  };

  const handleNew = () => {
    // Hand off to parent — DelegateForm will create the new delegation
    // and then chain assigns onto every just-placed seat. The parent
    // already has this chain wired (see Mobile.jsx onCreated path).
    if (onInviteNew) onInviteNew(placed);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header — compact summary of what's about to be handed off */}
      <div
        style={{
          padding: 14,
          borderRadius: 14,
          background: 'rgba(168,177,255,0.08)',
          border: `1px solid rgba(168,177,255,0.25)`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1.5,
            color: BRAND.indigoLight,
            marginBottom: 4,
          }}
        >
          HAND THESE TO ONE GUEST
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--ink-on-ground)',
            lineHeight: 1.2,
          }}
        >
          {N} seat{N === 1 ? '' : 's'} in {placed.movieTitle}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--mute)',
            marginTop: 4,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {placed.theaterName} ·{' '}
          {[...seatIds].sort().map((s) => s.replace('-', '')).join(', ')}
        </div>
      </div>

      {/* New-guest path (always shown — primary CTA at the top) */}
      <button
        onClick={handleNew}
        disabled={!!pending}
        style={{
          all: 'unset',
          cursor: pending ? 'not-allowed' : 'pointer',
          boxSizing: 'border-box',
          padding: 14,
          borderRadius: 14,
          background: 'rgba(168,177,255,0.06)',
          border: `1.5px dashed rgba(168,177,255,0.4)`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          opacity: pending ? 0.5 : 1,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'rgba(168,177,255,0.18)',
            color: BRAND.indigoLight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          +
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--ink-on-ground)',
            }}
          >
            Invite a new guest
          </div>
          <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>
            They'll get a text & email with these specific seats
          </div>
        </div>
        <span style={{ color: BRAND.indigoLight, fontSize: 12, fontWeight: 700 }}>
          New →
        </span>
      </button>

      {/* Existing guests */}
      {delegations.length > 0 && (
        <>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.6,
              color: 'var(--mute)',
              textTransform: 'uppercase',
              marginTop: 4,
            }}
          >
            Or add to an existing guest
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {delegations.map((d) => {
              const isPending = pending === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => assignAllTo(d.id)}
                  disabled={!!pending}
                  style={{
                    all: 'unset',
                    cursor: pending ? 'not-allowed' : 'pointer',
                    boxSizing: 'border-box',
                    padding: 14,
                    borderRadius: 14,
                    background: 'var(--surface)',
                    border: `1px solid ${
                      isPending ? BRAND.indigoLight : 'var(--rule)'
                    }`,
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 14,
                    alignItems: 'center',
                    opacity: pending && !isPending ? 0.4 : 1,
                  }}
                >
                  <Avatar name={d.delegateName} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--ink-on-ground)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {d.delegateName}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--mute)',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {d.phone || d.email || 'no contact'} · already has{' '}
                      {d.seatsAllocated} seat{d.seatsAllocated === 1 ? '' : 's'}
                    </div>
                  </div>
                  <span
                    style={{
                      color: BRAND.indigoLight,
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {isPending ? 'Assigning…' : `+${N} →`}
                  </span>
                </button>
              );
            })}
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

      {/* Skip — back to PostPickSheet */}
      <button
        onClick={onClose}
        disabled={!!pending}
        style={{
          all: 'unset',
          cursor: pending ? 'not-allowed' : 'pointer',
          boxSizing: 'border-box',
          padding: 12,
          borderRadius: 12,
          background: 'transparent',
          border: `1px solid var(--rule)`,
          color: 'var(--ink-on-ground)',
          fontSize: 13,
          fontWeight: 600,
          textAlign: 'center',
          marginTop: 4,
          opacity: pending ? 0.5 : 1,
        }}
      >
        Back
      </button>
    </div>
  );
}
