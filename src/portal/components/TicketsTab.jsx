// TicketsTab — V2 IA, REVISION 2
//
// REVISION 2 (May 2026): the original V2 flat seat-row list was the
// wrong mental model. People think in tickets-per-showing, not
// individual seats. Reverted to V1's TicketCard pattern with three
// V2 additions:
//   1. Lock-aware dinner banner at the top (gentle/warning/urgent/locked)
//   2. Folded the GUESTS tab content INTO Tickets — a "Your guests"
//      section below tickets, with delegation cards that open the
//      restored DelegateManage sheet (Resend / Copy link / Reclaim /
//      Remind to pick dinners).
//   3. Status pills on delegation cards (CONFIRMED / ACCESSED / INVITED)
//
// What stays from V1 (the user explicitly asked for these back):
//   - Card per showing (poster + title + time + Manage/View buttons)
//   - Drop-down expansion for per-seat detail
//   - DelegateManage sheet for "manage invite"
//   - DelegateForm (the original invite popup) for new guests
//
// What's new from V2 R1 that survives:
//   - Lock banner at the top
//   - "Remind all" bulk action (when in warning state)
//   - missingDinnerCount surfaced in the lock banner

import { useMemo } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { Avatar } from '../Portal.jsx';
import TicketCard from './TicketCard.jsx';
import { DINNER_LOCK_DAYS } from '../../brand/tokens.js';

function LockBanner({ daysOut, missingDinnerCount, onRemindAll, onPickForAll }) {
  if (daysOut == null) return null;
  const T = DINNER_LOCK_DAYS;

  const lockDate = (() => {
    const now = new Date();
    const lock = new Date(now.getTime() + (daysOut - T) * 24 * 60 * 60 * 1000);
    return lock.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  if (daysOut <= T) {
    return (
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 12,
          marginBottom: 14,
          background: 'rgba(99,201,118,0.10)',
          border: `1px solid rgba(99,201,118,0.30)`,
          color: '#63c976',
          fontSize: 12,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          lineHeight: 1.4,
        }}
      >
        🔒 Dinners locked. Email{' '}
        <a href="mailto:smiggin@dsdmail.net" style={{ color: '#63c976', textDecoration: 'underline' }}>
          Sherry
        </a>{' '}
        for changes.
      </div>
    );
  }

  if (daysOut <= T + 2) {
    return (
      <div
        role="alert"
        style={{
          padding: '12px 14px',
          borderRadius: 12,
          marginBottom: 14,
          background: 'rgba(215,40,70,0.12)',
          border: `1px solid rgba(215,40,70,0.45)`,
          color: '#ff8da4',
          fontSize: 12,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          lineHeight: 1.4,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          🚨 Dinners lock {daysOut - T === 1 ? 'TOMORROW' : `in ${daysOut - T} days`}
          {missingDinnerCount > 0 && ` · ${missingDinnerCount} still missing`}
        </div>
        {missingDinnerCount > 0 && onPickForAll && (
          <button
            onClick={onPickForAll}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '5px 11px',
              borderRadius: 99,
              background: 'rgba(215,40,70,0.7)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Pick for all
          </button>
        )}
      </div>
    );
  }

  if (daysOut <= T + 7) {
    return (
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 12,
          marginBottom: 14,
          background: 'rgba(244,185,66,0.10)',
          border: `1px solid rgba(244,185,66,0.35)`,
          color: BRAND.gold,
          fontSize: 12,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          lineHeight: 1.4,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          🍽️ Dinners lock in {daysOut - T} days
          {missingDinnerCount > 0 &&
            ` · ${missingDinnerCount} guest${missingDinnerCount === 1 ? '' : 's'} still picking`}
        </div>
        {missingDinnerCount > 0 && onRemindAll && (
          <button
            onClick={onRemindAll}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '5px 11px',
              borderRadius: 99,
              background: 'rgba(244,185,66,0.5)',
              color: BRAND.navyDeep,
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Remind all
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        marginBottom: 14,
        background: 'rgba(168,177,255,0.06)',
        border: `1px solid rgba(168,177,255,0.20)`,
        color: BRAND.indigoLight,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1.4,
      }}
    >
      🍽️ Dinners lock 7 days before gala (around {lockDate})
    </div>
  );
}

// R10 — derives the real lifecycle from seat math, not from the
// delegation row's status field which lags behind seat finalization.
// Charles can have placed===allocated and dinner_choice set on every
// seat, but sponsor_delegations.status often still reads 'pending'.
// Use seatsPlaced/seatsAllocated as the truth source.
function DelegationStatusPill({ delegation, hasMissingDinner }) {
  const placed = delegation?.seatsPlaced || 0;
  const allocated = delegation?.seatsAllocated || 0;
  const fullyPlaced = allocated > 0 && placed >= allocated;
  const kind = fullyPlaced && !hasMissingDinner
    ? 'confirmed'
    : placed > 0 || delegation?.status === 'active'
      ? 'accessed'
      : 'invited';
  const map = {
    confirmed: { bg: 'rgba(99,201,118,0.14)', fg: '#63c976', br: 'rgba(99,201,118,0.4)', label: 'CONFIRMED', dashed: false },
    accessed: { bg: 'rgba(168,177,255,0.15)', fg: BRAND.indigoLight, br: 'rgba(168,177,255,0.4)', label: placed > 0 && !fullyPlaced ? 'IN PROGRESS' : 'ACCESSED', dashed: false },
    invited: { bg: 'rgba(168,177,255,0.08)', fg: BRAND.indigoLight, br: 'rgba(168,177,255,0.4)', label: 'INVITED', dashed: true },
  };
  const s = map[kind];
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 1.2,
        padding: '3px 8px',
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

export default function TicketsTab({
  data,
  daysOut,
  token,
  apiBase,
  onRefresh,
  onOpenTicket,
  onOpenDelegation,
  onPlaceSeats,
  onInviteGuest,
  // V2 R5 — per-group callbacks
  onViewTicket,    // (ticket) => void  — opens TicketDetailSheet
  onInviteGroup,   // (ticket) => void  — opens HandBlockSheet
  // V2 R8 — per-row callbacks (back from R5; TicketCard expanded
  // body again has inline seat rows for sponsor cards + chevron-
  // expand for guest cards)
  onPickDinner,    // (seat) => void  — opens DinnerSheet
  onInviteSeat,    // (seat) => void  — opens DelegateForm w/ single-seat lock
}) {
  const { tickets = [], guestTickets = [], delegations = [], blockSize = 0, seatMath } = data || {};

  const placed = tickets.reduce((n, t) => n + (t.seats?.length || 0), 0);
  const guestPlaced = guestTickets.reduce((n, t) => n + (t.seats?.length || 0), 0);
  const personalQuota = Math.max(0, blockSize - (seatMath?.delegated ?? 0));
  const stillOpen = Math.max(0, personalQuota - placed);

  const delegationById = useMemo(
    () => Object.fromEntries(delegations.map((d) => [d.id, d])),
    [delegations]
  );

  const missingDinnerCount = useMemo(() => {
    let n = 0;
    for (const d of delegations) n += d.seatsMissingDinner || 0;
    return n;
  }, [delegations]);

  const totalAllocated = delegations.reduce((n, d) => n + (d.seatsAllocated || 0), 0);
  const availableToGive = seatMath?.available ?? Math.max(0, blockSize - totalAllocated);

  const remindAll = async () => {
    const ids = [
      ...new Set(
        delegations.filter((d) => (d.seatsMissingDinner || 0) > 0).map((d) => d.id)
      ),
    ];
    if (ids.length === 0) return;
    await Promise.allSettled(
      ids.map((delegation_id) =>
        fetch(`${apiBase || ''}/api/gala/portal/${token}/delegate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remind_dinners', delegation_id }),
        })
      )
    );
    if (onRefresh) await onRefresh();
  };

  const pickForAll = () => {
    alert(
      `${missingDinnerCount} seats still need dinners. Open the guest cards below — tap "View" to manage their dinners. The kitchen defaults to brisket if you don't pick.`
    );
  };

  return (
    <div className="scroll-container" style={{ flex: 1, paddingBottom: 130 }}>
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 12px) 56px 0 22px' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1.5,
            color: BRAND.red,
            marginBottom: 6,
          }}
        >
          — TICKETS
        </div>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 36,
            fontWeight: 700,
            margin: '10px 0 6px',
            letterSpacing: -0.6,
            lineHeight: 1,
          }}
        >
          All <i style={{ color: 'var(--accent-italic)', fontWeight: 500 }}>{blockSize} seats.</i>
        </h1>
        <div style={{ fontSize: 13, color: 'var(--mute)' }}>
          {placed} yours · {guestPlaced} guest seats · {stillOpen} still open
        </div>
      </div>

      <div style={{ padding: '14px 18px 0' }}>
        <LockBanner
          daysOut={daysOut}
          missingDinnerCount={missingDinnerCount}
          onRemindAll={remindAll}
          onPickForAll={pickForAll}
        />
      </div>

      {/* V2 R5 — page-level QR card removed. The QR now lives inside
          TicketDetailSheet, one per showing ticket (same QR data —
          one per sponsor token — but visually attached to each
          ticket so it reads as part of the ticket artifact). */}

      <div style={{ padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            onViewTicket={onViewTicket}
            onInviteGroup={onInviteGroup}
            onPickDinner={onPickDinner}
            onInviteSeat={onInviteSeat}
          />
        ))}
        {tickets.length === 0 && (
          <div
            style={{
              padding: '28px 16px',
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--mute)',
              border: `1.5px dashed ${BRAND.rule}`,
              borderRadius: 14,
              lineHeight: 1.5,
            }}
          >
            No seats placed yet.
            {onPlaceSeats && (
              <>
                <br />
                <button
                  onClick={onPlaceSeats}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    marginTop: 12,
                    padding: '8px 18px',
                    borderRadius: 99,
                    background: 'linear-gradient(135deg,#d72846,#b32d4e)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Place your seats →
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {guestTickets.length > 0 && (
        <div style={{ padding: '18px 18px 0' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: 1.5,
              color: 'var(--accent-italic)',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Guest seats
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {guestTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                guest
                onManageGuest={(t) => {
                  // R8 — guest "View" button opens DelegateManage (the
                  // KT card with Remind / Resend / Copy link / Reclaim).
                  // Look up the delegation by id and hand it to the
                  // existing onOpenDelegation prop.
                  const d = delegationById[t.delegationId];
                  if (d && onOpenDelegation) onOpenDelegation(d);
                }}
                onPickDinner={onPickDinner}
              />
            ))}
          </div>
        </div>
      )}

      {onPlaceSeats && tickets.length > 0 && (
        <div style={{ padding: '18px 18px 0' }}>
          <button
            onClick={onPlaceSeats}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              width: '100%',
              padding: '12px',
              borderRadius: 12,
              background: 'transparent',
              border: `1.5px dashed ${BRAND.rule}`,
              color: 'var(--accent-italic)',
              fontSize: 13,
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            + Place {stillOpen > 0 ? `${stillOpen} more seat${stillOpen === 1 ? '' : 's'}` : 'another showing'}
          </button>
        </div>
      )}

      {/* GUESTS section folded into Tickets */}
      <div style={{ padding: '24px 18px 0' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: 1.5,
            color: BRAND.red,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          — Guests
        </div>
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 26,
            fontWeight: 700,
            margin: '0 0 6px',
            letterSpacing: -0.4,
            lineHeight: 1.05,
          }}
        >
          Your{' '}
          <i style={{ color: 'var(--accent-italic)', fontWeight: 500 }}>
            guest{delegations.length === 1 ? '' : 's'}.
          </i>
        </h2>
        <div style={{ fontSize: 12, color: 'var(--mute)' }}>
          {delegations.length} invited · {guestPlaced} of {totalAllocated} seats placed
          {availableToGive > 0 && (
            <span style={{ color: 'var(--accent-italic)' }}>
              {' '}· {availableToGive} still yours to give
            </span>
          )}
        </div>

        <button
          onClick={onInviteGuest}
          disabled={availableToGive <= 0}
          style={{
            all: 'unset',
            cursor: availableToGive > 0 ? 'pointer' : 'not-allowed',
            boxSizing: 'border-box',
            width: '100%',
            marginTop: 14,
            padding: '14px',
            borderRadius: 14,
            border: `1.5px dashed ${availableToGive > 0 ? 'rgba(168,177,255,0.4)' : BRAND.rule}`,
            background: availableToGive > 0 ? 'rgba(168,177,255,0.06)' : 'transparent',
            color: availableToGive > 0 ? BRAND.indigoLight : 'var(--mute)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          + {availableToGive > 0 ? 'Invite a guest' : 'No seats left to give'}
        </button>

        {delegations.length > 0 && (
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {delegations.map((d) => {
              const hasMissingDinner = (d.seatsMissingDinner || 0) > 0;
              return (
                <button
                  key={d.id}
                  onClick={() => onOpenDelegation?.(d)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    width: '100%',
                    padding: '14px',
                    borderRadius: 14,
                    background: 'var(--surface)',
                    border: `1px solid var(--rule)`,
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 14,
                    alignItems: 'center',
                  }}
                >
                  <Avatar name={d.delegateName} size={44} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--ink-on-ground)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {d.delegateName}
                    </div>
                    {(d.phone || d.email) && (
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
                        {d.phone || d.email}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--accent-italic)',
                        marginTop: 4,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {d.seatsPlaced} of {d.seatsAllocated} placed
                      {hasMissingDinner && (
                        <span style={{ color: BRAND.gold, marginLeft: 6, fontWeight: 700 }}>
                          · ⚠️ {d.seatsMissingDinner} dinner{d.seatsMissingDinner === 1 ? '' : 's'} missing
                        </span>
                      )}
                    </div>
                  </div>
                  <DelegationStatusPill delegation={d} hasMissingDinner={hasMissingDinner} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
