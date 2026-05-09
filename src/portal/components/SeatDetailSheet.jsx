// SeatDetailSheet — V2 IA, Phase 2
//
// One bottom-sheet that handles ALL per-seat actions, replacing the
// scattered surfaces from V1:
//   - TicketManage sheet (per-showing, multi-seat assignment grid)
//   - DelegateManage sheet (per-delegation: resend / copy / reclaim)
//   - Inline DinnerPicker dropdown buried in expanded ticket cards
//   - The home "Text my seats to me" button (kept; just moved to header)
//
// Opens from any seat-row tap in the new TicketsTabV2. Shows everything
// for ONE seat — who's in it, dinner, and the right-shaped actions
// based on current ownership state:
//
//   Yours (sponsor placed it for self):
//     - Reassign (open SeatAssignSheet style picker)
//     - Dinner chips (full editable, sponsor controls)
//     - "Make this seat open again" (unplace)
//
//   Confirmed (a delegate placed this seat for themselves):
//     - Show their name + contact
//     - Dinner chips (host can override; delegate's own portal can also
//       set). Last write wins per the existing rule.
//     - Send reminder (refires the SMS+email if dinner missing)
//     - Copy their portal link
//     - Reassign (moves the seat to a different delegation or back to
//       self) — uses /assign endpoint
//
//   Invited (sponsor pre-assigned this seat to a named delegate but
//   delegate hasn't confirmed):
//     - Same as Confirmed but with INVITED pill
//     - Send reminder = original delegation invite resend
//
//   Open (placed but no one assigned):
//     - "Assign to..." opens a guest picker
//     - Dinner chips also editable for sponsor; sponsor can set in
//       advance for an "anyone" seat
//     - Make open / unplace
//
// Lock-aware: when daysUntilGala() <= DINNER_LOCK_DAYS, dinner chips
// render read-only with a lock icon and "Email Sherry to change."
// Movies/seat-assignments stay editable.

import { useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { DINNER_OPTIONS, dinnerLabel } from './DinnerPicker.jsx';

// Dinner lock — dinners freeze 7 days before gala. Match the constant
// in TicketsTabV2 for consistency. Source of truth for the rule lives
// here + in the Tickets tab banner; both compute against GALA_DATE.
export const DINNER_LOCK_DAYS = 7;

const DINNER_EMOJI = {
  brisket: '🍖',
  turkey: '🥪',
  veggie: '🥗',
  kids: '🧒',
  glutenfree: '🌾',
};

const DINNER_SHORT = {
  brisket: 'Brisket',
  turkey: 'Turkey',
  veggie: 'Veggie',
  kids: 'Kids',
  glutenfree: 'GF',
};

function StatusPill({ kind }) {
  // Same pill scheme as TicketsTabV2 — yours / confirmed / invited / open.
  // Kept inline so this component is self-contained for future extraction.
  const map = {
    yours: { bg: 'rgba(168,177,255,0.15)', fg: BRAND.indigoLight, br: 'rgba(168,177,255,0.4)', label: 'YOURS', dashed: false },
    confirmed: { bg: 'rgba(99,201,118,0.14)', fg: '#63c976', br: 'rgba(99,201,118,0.4)', label: 'CONFIRMED', dashed: false },
    invited: { bg: 'rgba(168,177,255,0.08)', fg: BRAND.indigoLight, br: 'rgba(168,177,255,0.4)', label: 'INVITED', dashed: true },
    open: { bg: 'rgba(255,255,255,0.04)', fg: 'rgba(255,255,255,0.55)', br: 'rgba(255,255,255,0.18)', label: 'OPEN', dashed: true },
  };
  const s = map[kind] || map.open;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1.3,
        padding: '4px 10px',
        borderRadius: 99,
        background: s.bg,
        color: s.fg,
        border: `1px ${s.dashed ? 'dashed' : 'solid'} ${s.br}`,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  );
}

function Avatar({ name, size = 38 }) {
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

export default function SeatDetailSheet({
  seat,
  showing,
  daysOut,
  token,
  apiBase = '',
  onClose,
  onRefresh,
  onChangeAssignee, // (seat) => void — opens reassign picker
  onUnplace, // optional — provided when the seat is sponsor-owned
}) {
  const [pending, setPending] = useState(null); // 'dinner' | 'reminder' | 'unplace' | null
  const [error, setError] = useState(null);
  const [reminded, setReminded] = useState(false);

  if (!seat) return null;

  const dinnerLocked = daysOut != null && daysOut <= DINNER_LOCK_DAYS;
  const ownerKind = seat.ownerKind; // 'yours' | 'confirmed' | 'invited' | 'open'
  const seatLabel = `${seat.row_label}${seat.seat_num}`;

  // Dinner picker — set_dinner POST. The server already accepts a
  // sponsor token setting dinner on any seat in their block (changed
  // earlier this session in pick.js:115), so the host always has
  // override authority pre-lock.
  const setDinner = async (value) => {
    if (dinnerLocked) return;
    setPending('dinner');
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_dinner',
          theater_id: seat.theater_id,
          row_label: seat.row_label,
          seat_num: String(seat.seat_num),
          dinner_choice: value,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (onRefresh) await onRefresh();
    } catch (e) {
      setError(e.message || 'Could not set dinner');
    } finally {
      setPending(null);
    }
  };

  // Send reminder — only meaningful for invited/confirmed seats with
  // a delegation. If dinner is missing, fires remind_dinners; otherwise
  // fires the standard resend.
  const sendReminder = async () => {
    if (!seat.delegation_id) return;
    setPending('reminder');
    setError(null);
    try {
      const action = seat.dinner_choice ? 'resend' : 'remind_dinners';
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, delegation_id: seat.delegation_id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setReminded(true);
      setTimeout(() => setReminded(false), 3500);
    } catch (e) {
      setError(e.message || 'Could not send reminder');
    } finally {
      setPending(null);
    }
  };

  const copyLink = async () => {
    if (!seat.delegation_token) return;
    try {
      await navigator.clipboard.writeText(
        `https://gala.daviskids.org/sponsor/${seat.delegation_token}`
      );
      setError('Link copied');
      setTimeout(() => setError(null), 2000);
    } catch {
      setError('Copy failed — long-press the link instead');
    }
  };

  const unplace = async () => {
    if (!onUnplace) return;
    if (!confirm('Make this seat open again? Anyone assigned to it will be cleared.')) return;
    setPending('unplace');
    try {
      await onUnplace(seat);
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not unplace');
      setPending(null);
    }
  };

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -0.4,
            }}
          >
            Seat {seatLabel}
          </div>
          {showing && (
            <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
              {showing.label} · {showing.movieTitle} · {showing.theaterName}
            </div>
          )}
        </div>
        <StatusPill kind={ownerKind} />
      </div>

      {/* WHO'S SITTING HERE */}
      <SectionLabel>WHO'S SITTING HERE</SectionLabel>
      <button
        onClick={() => onChangeAssignee?.(seat)}
        style={{
          all: 'unset',
          cursor: onChangeAssignee ? 'pointer' : 'default',
          width: '100%',
          boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${BRAND.rule}`,
          borderRadius: 12,
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
        }}
      >
        {ownerKind === 'open' ? (
          <>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 99,
                border: `1.5px dashed rgba(255,255,255,0.25)`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.55)',
                fontSize: 18,
              }}
            >
              ?
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-on-ground)', fontStyle: 'italic' }}>
                No one yet
              </div>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>
                Tap to assign
              </div>
            </div>
            <span style={{ color: BRAND.indigoLight, fontSize: 11, fontWeight: 700 }}>Assign ›</span>
          </>
        ) : (
          <>
            <Avatar name={seat.ownerName || (ownerKind === 'yours' ? 'You' : '?')} />
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
                {ownerKind === 'yours' ? 'You' : seat.ownerName}
              </div>
              {(seat.ownerPhone || seat.ownerEmail) && (
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
                  {[seat.ownerPhone, seat.ownerEmail].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            {onChangeAssignee && (
              <span style={{ color: BRAND.indigoLight, fontSize: 11, fontWeight: 700 }}>Change ›</span>
            )}
          </>
        )}
      </button>

      {/* DINNER */}
      <SectionLabel>
        DINNER
        {dinnerLocked && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1.2,
              padding: '2px 8px',
              borderRadius: 99,
              background: 'rgba(99,201,118,0.10)',
              color: '#63c976',
              border: `1px solid rgba(99,201,118,0.3)`,
            }}
          >
            🔒 LOCKED
          </span>
        )}
      </SectionLabel>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 10,
          opacity: dinnerLocked ? 0.7 : 1,
        }}
      >
        {DINNER_OPTIONS.map((opt) => {
          const active = seat.dinner_choice === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => !dinnerLocked && !active && setDinner(opt.value)}
              disabled={dinnerLocked || pending === 'dinner'}
              style={{
                all: 'unset',
                cursor: dinnerLocked ? 'default' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
                padding: '8px 13px',
                borderRadius: 99,
                background: active
                  ? 'rgba(168,177,255,0.18)'
                  : 'rgba(255,255,255,0.04)',
                color: active ? BRAND.indigoLight : 'var(--ink-on-ground)',
                border: `1px solid ${active ? 'rgba(168,177,255,0.4)' : BRAND.rule}`,
                whiteSpace: 'nowrap',
                opacity: pending === 'dinner' && !active ? 0.5 : 1,
              }}
            >
              {DINNER_EMOJI[opt.value]} {DINNER_SHORT[opt.value]}
            </button>
          );
        })}
        {seat.dinner_choice && !dinnerLocked && (
          <button
            onClick={() => setDinner(null)}
            disabled={pending === 'dinner'}
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              padding: '8px 12px',
              borderRadius: 99,
              background: 'transparent',
              color: 'rgba(255,255,255,0.5)',
              border: `1px dashed rgba(255,255,255,0.2)`,
            }}
          >
            Clear
          </button>
        )}
      </div>
      {!dinnerLocked && !seat.dinner_choice && ownerKind === 'confirmed' && (
        <div style={{ fontSize: 11, color: 'var(--mute)', fontStyle: 'italic', marginBottom: 14, lineHeight: 1.4 }}>
          {seat.ownerName?.split(' ')[0] || 'Your guest'} hasn't picked yet. Tap one to choose for them, or send a reminder below.
        </div>
      )}
      {dinnerLocked && (
        <div style={{ fontSize: 11, color: 'var(--mute)', fontStyle: 'italic', marginBottom: 14, lineHeight: 1.4 }}>
          Dinners are locked. Email <a href="mailto:smiggin@dsdmail.net" style={{ color: BRAND.indigoLight }}>smiggin@dsdmail.net</a> for changes.
        </div>
      )}

      {/* SECONDARY ACTIONS — reminder + copy link, only for guest seats */}
      {(ownerKind === 'confirmed' || ownerKind === 'invited') && seat.delegation_id && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={sendReminder}
            disabled={pending === 'reminder' || reminded}
            style={{
              all: 'unset',
              cursor: pending || reminded ? 'default' : 'pointer',
              flex: 1,
              boxSizing: 'border-box',
              padding: '11px 12px',
              borderRadius: 12,
              border: reminded ? `1px solid rgba(99,201,118,0.5)` : `1px solid ${BRAND.rule}`,
              background: reminded ? 'rgba(99,201,118,0.10)' : 'rgba(255,255,255,0.04)',
              color: reminded ? '#63c976' : 'var(--ink-on-ground)',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              transition: 'all .2s',
            }}
          >
            {reminded
              ? '✓ Reminder sent'
              : pending === 'reminder'
                ? 'Sending…'
                : seat.dinner_choice
                  ? '📩 Resend invite'
                  : '📩 Remind to pick dinner'}
          </button>
          {seat.delegation_token && (
            <button
              onClick={copyLink}
              style={{
                all: 'unset',
                cursor: 'pointer',
                flex: 1,
                boxSizing: 'border-box',
                padding: '11px 12px',
                borderRadius: 12,
                border: `1px solid ${BRAND.rule}`,
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--ink-on-ground)',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              🔗 Copy their link
            </button>
          )}
        </div>
      )}

      {/* DESTRUCTIVE — make seat open */}
      {onUnplace && (
        <button
          onClick={unplace}
          disabled={pending === 'unplace'}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            marginTop: 14,
            padding: '12px',
            borderRadius: 12,
            border: `1px solid rgba(215,40,70,0.35)`,
            background: 'transparent',
            color: BRAND.red,
            fontSize: 12,
            fontWeight: 700,
            textAlign: 'center',
            opacity: pending === 'unplace' ? 0.5 : 1,
          }}
        >
          {pending === 'unplace' ? 'Removing…' : '🗑 Make this seat open again'}
        </button>
      )}

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 10,
            background: error === 'Link copied' ? 'rgba(99,201,118,0.10)' : 'rgba(215,40,70,0.12)',
            color: error === 'Link copied' ? '#63c976' : '#ff8da4',
            fontSize: 12,
            border: `1px solid ${error === 'Link copied' ? 'rgba(99,201,118,0.30)' : 'rgba(215,40,70,0.30)'}`,
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1.4,
        color: 'rgba(255,255,255,0.55)',
        margin: '14px 0 6px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {children}
    </div>
  );
}
