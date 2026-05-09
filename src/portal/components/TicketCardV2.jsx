// TicketCardV2 — V2 R8 (the layout the user keeps gravitating to)
//
// Showing card with the V1-flavored expanded body (always-visible
// bordered tile + middle name/dinner-pill + right-side state badge),
// but cleaned up:
//
//   - Subline under the title is now: 'Dinner 4:00 · Movie 4:30 ·
//     Auditorium 7' (was 'Kara Toone guest seats')
//   - Tiny SEAT label above the seat code, and the seat code itself
//     is the bigger affordance underneath
//   - Tiny DINNER label centered over the dinner pill
//   - Right side states by row context:
//        sponsor row, sponsor's own ticket   →  no name, no badge
//                                              (just the dinner pill)
//        guest row, sponsor's own ticket     →  name on top, GUEST
//                                              tag below (gold)
//        guest row, guest-ticket section     →  'Guest: <name>' over
//                                              dinner pill, GUEST tag
//                                              on the right
//   - View button:
//        sponsor ticket   → onViewTicket (TicketDetailSheet, big poster
//                           ticket with QR + Wallet)
//        guest ticket     → onManageGuest (DelegateManage sheet — the
//                           Remind / Resend / Copy link / Reclaim card)
//
// "+ Invite" stays on sponsor cards (group-level handoff). The chevron
// dropdown on guest cards expands the seat list inline so the host
// can change dinners or reclaim individual seats without opening
// Manage. Sponsor cards always show the rows expanded since that's
// the primary surface the host edits.

import { useState, useMemo } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { PosterMini, seatLabel as fmtSeat, assignmentOwner } from '../Mobile.jsx';
import { DINNER_LOCK_DAYS } from './SeatDetailSheet.jsx';

const DINNER_EMOJI = {
  brisket: '🍖',
  turkey: '🥪',
  veggie: '🥗',
  kids: '🧒',
  glutenfree: '🌾',
};
const DINNER_LABEL = {
  brisket: 'Brisket',
  turkey: 'Turkey',
  veggie: 'Veggie',
  kids: 'Kids meal',
  glutenfree: 'Gluten-free',
};

export default function TicketCardV2({
  ticket,
  guest = false,
  onViewTicket,    // sponsor cards: opens TicketDetailSheet
  onManageGuest,   // guest cards: opens DelegateManage
  onPickDinner,    // (seat) => void — opens DinnerSheet for the row
  onInviteSeat,    // (seat) => void — opens DelegateForm with single-seat lock
  onInviteGroup,   // (ticket) => void — opens HandBlockSheet for the group
}) {
  const rows = ticket.assignmentRows || [];
  // Guest cards collapse rows by default (host can chevron-expand);
  // sponsor cards always show rows since editing dinners is the
  // primary host action there.
  const [expanded, setExpanded] = useState(!guest);

  // Subline: 'Dinner 4:00 · Movie 4:30 · Auditorium 7'. Falls back
  // gracefully if any field is missing on the ticket.
  const subline = useMemo(() => {
    const parts = [];
    if (ticket.dinnerTime) parts.push(`Dinner ${ticket.dinnerTime}`);
    if (ticket.showTime) parts.push(`Movie ${ticket.showTime}`);
    if (ticket.theaterName) parts.push(ticket.theaterName);
    return parts.join(' · ');
  }, [ticket.dinnerTime, ticket.showTime, ticket.theaterName]);

  // For guest cards, "View" routes to Manage. For sponsor cards,
  // "View" routes to the big TicketDetailSheet.
  const handleView = () => {
    if (guest) {
      if (onManageGuest) onManageGuest(ticket);
    } else {
      if (onViewTicket) onViewTicket(ticket);
    }
  };

  return (
    <article
      data-testid={guest ? 'guest-ticket-card-v2' : 'ticket-card-v2'}
      style={{
        borderRadius: 14,
        background: 'var(--surface)',
        border: `1px solid var(--rule)`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: 14,
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0,1fr) auto',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <PosterMini
          poster={ticket.posterUrl}
          color={ticket.color}
          label={ticket.movieShort}
          size={48}
          showLabel={false}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: 1.5,
              color: guest ? 'var(--accent-italic)' : 'var(--accent-text)',
              textTransform: 'uppercase',
            }}
          >
            {guest ? 'Guest ticket' : ticket.showLabel || 'Showing'} · {ticket.showTime}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--ink-on-ground)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: -0.2,
            }}
          >
            {ticket.movieTitle}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 11,
              color: 'var(--mute)',
              lineHeight: 1.35,
            }}
          >
            {subline}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={handleView}
            data-testid={guest ? 'ticket-manage' : 'ticket-view'}
            style={primaryPill}
          >
            {guest ? 'Manage' : 'View'}
          </button>
          {guest && (
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label="Toggle seat list"
              style={chevronBtn(expanded)}
            >
              ▾
            </button>
          )}
        </div>
      </div>

      {expanded && rows.length > 0 && (
        <div
          style={{
            padding: '0 12px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {rows.map((row) => (
            <SeatRow
              key={row.seat_id}
              row={row}
              ticket={ticket}
              guest={guest}
              onPickDinner={onPickDinner}
              onInviteSeat={onInviteSeat}
            />
          ))}
        </div>
      )}

      {/* Sponsor cards keep the secondary "+ Invite" hand-off action
          at the bottom (group-level handoff via HandBlockSheet). Only
          rendered when there are still un-delegated seats to give. */}
      {!guest && onInviteGroup && rows.some((r) => !r.delegation_id) && (
        <div style={{ padding: '0 12px 14px' }}>
          <button
            onClick={() => onInviteGroup(ticket)}
            data-testid="ticket-invite-group"
            style={secondaryPill}
          >
            + Invite a guest to these seats
          </button>
        </div>
      )}
    </article>
  );
}

function SeatRow({ row, ticket, guest, onPickDinner, onInviteSeat }) {
  const isGuestRow = !!row.delegation_id;
  const seatId = row.seat_id || `${row.row_label}-${row.seat_num}`;
  const label = fmtSeat(seatId); // 'E11' from 'E-11'
  const dinner = row.dinner_choice || null;

  // Per-context right-side state:
  //   guest row, guest section card → middle has 'Guest: <name>',
  //     right has 'GUEST' badge
  //   guest row, sponsor section card → middle has the guest name
  //     stacked with a 'guest' subline
  //   sponsor row, sponsor section card → middle has just the dinner
  //     pill (no name), no right badge
  const guestName = isGuestRow
    ? assignmentOwner(row, ticket.delegationName || ticket.guestName)
    : null;
  const showMiddleName = isGuestRow; // sponsor-self rows hide the name
  const middleNamePrefix = guest ? 'Guest: ' : '';
  const showRightBadge = isGuestRow; // both contexts: a delegation row gets a GUEST tag

  const seat = {
    theaterId: ticket.theaterId,
    row_label: row.row_label,
    seat_num: row.seat_num,
    label,
    dinner_choice: dinner,
    delegation_id: row.delegation_id || null,
    showing: {
      label: ticket.showLabel,
      movieTitle: ticket.movieTitle,
      theaterName: ticket.theaterName,
    },
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0,1fr) auto',
        gap: 12,
        alignItems: 'center',
        background: 'rgba(0,0,0,0.18)',
        border: `1px solid var(--rule)`,
        borderRadius: 12,
        padding: '10px 12px',
      }}
    >
      {/* Seat — tiny SEAT label above, code below */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 44 }}>
        <span style={tinyLabel}>SEAT</span>
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 17,
            fontWeight: 700,
            color: BRAND.indigoLight,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {label}
        </span>
      </div>

      {/* Middle column — name (if guest row) over the dinner pill,
          with a tiny DINNER label centered over the pill. */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {showMiddleName && guestName && (
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
            {middleNamePrefix}{guestName}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
          <span style={{ ...tinyLabel, marginLeft: 2 }}>DINNER</span>
          <DinnerPill
            dinner={dinner}
            onClick={() => onPickDinner && onPickDinner(seat)}
          />
        </div>
      </div>

      {/* Right column — GUEST tag + secondary action button */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        {showRightBadge && (
          <span style={guestTag}>GUEST</span>
        )}
        {!isGuestRow && (
          <button
            onClick={() => onInviteSeat && onInviteSeat(seat)}
            data-testid="seat-row-invite"
            style={miniInvitePill}
          >
            + Invite
          </button>
        )}
      </div>
    </div>
  );
}

function DinnerPill({ dinner, onClick }) {
  const has = !!dinner;
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px 5px 6px',
        borderRadius: 99,
        background: 'rgba(255,255,255,0.04)',
        border: `1px ${has ? 'solid' : 'dashed'} ${has ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.18)'}`,
        fontSize: 11,
        fontWeight: 600,
        color: has ? '#fff' : 'rgba(255,255,255,0.55)',
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 6,
          background: has ? 'rgba(255,255,255,0.06)' : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {has ? DINNER_EMOJI[dinner] : '—'}
      </span>
      <span>{has ? DINNER_LABEL[dinner] : 'select dinner'}</span>
      {has ? null : (
        <span aria-hidden style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginLeft: 1 }}>—</span>
      )}
    </button>
  );
}

const tinyLabel = {
  fontSize: 8,
  fontWeight: 800,
  letterSpacing: 1.2,
  color: 'rgba(255,255,255,0.45)',
  textTransform: 'uppercase',
  lineHeight: 1,
};

const primaryPill = {
  all: 'unset',
  cursor: 'pointer',
  boxSizing: 'border-box',
  padding: '8px 16px',
  borderRadius: 99,
  background: 'linear-gradient(135deg,#a8b1ff,#6f75d8)',
  color: BRAND.navyDeep,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.3,
  textAlign: 'center',
};

const secondaryPill = {
  all: 'unset',
  cursor: 'pointer',
  boxSizing: 'border-box',
  width: '100%',
  padding: '10px 14px',
  borderRadius: 99,
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--ink-on-ground)',
  border: `1px dashed rgba(168,177,255,0.3)`,
  fontSize: 12,
  fontWeight: 700,
  textAlign: 'center',
};

const miniInvitePill = {
  all: 'unset',
  cursor: 'pointer',
  padding: '5px 11px',
  borderRadius: 99,
  background: 'rgba(168,177,255,0.16)',
  color: BRAND.indigoLight,
  border: `1px solid rgba(168,177,255,0.32)`,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.3,
};

const guestTag = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: 1.4,
  color: BRAND.gold,
  background: 'rgba(244,185,66,0.10)',
  padding: '3px 8px',
  borderRadius: 99,
  border: `1px solid rgba(244,185,66,0.3)`,
};

function chevronBtn(open) {
  return {
    all: 'unset',
    cursor: 'pointer',
    width: 32,
    height: 32,
    borderRadius: 99,
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid var(--rule)`,
    color: 'var(--ink-on-ground)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 0.18s ease',
  };
}
