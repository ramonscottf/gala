// TicketCardV2 — V2 IA, Phase 6 (the seat-row redesign)
//
// Replaces V1's TicketCard inside TicketsTabV2. Three shape changes:
//
//   1. NO card-level Manage button. NO chevron. Rows are always
//      visible. The card just headers the showing (poster + title +
//      time). All actions live per-row.
//
//   2. New per-row layout — three zones:
//        [BIG SEAT TILE] [name + dinner-pill dropdown] [action button]
//      Big seat tile is a 56×56 square with the row letter and seat
//      number stacked. Center column has a name on top and the dinner
//      pill (tappable, opens DinnerSheet) below. Right column has a
//      state-aware action button.
//
//   3. Action button has two states:
//        - Sponsor-self seat ('You'): "Invite" (indigo, opens
//          SeatInviteSheet so the host can hand this seat to a guest)
//        - Guest-assigned seat: "Manage" (light pill, opens
//          DelegateManage via onOpenDelegation)
//
// Open seats (placed but no one assigned) aren't a thing in current
// data — every placed seat is owned by either the sponsor or a
// delegation. Unplaced seats live in the "Place X more seats" CTA at
// the page top, not inside this card.

import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { PosterMini, seatLabel as fmtSeat, assignmentOwner } from '../Mobile.jsx';
import { dinnerLabel } from './DinnerPicker.jsx';
import { DINNER_LOCK_DAYS } from './SeatDetailSheet.jsx';

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
const DINNER_TINT = {
  brisket: 'rgba(244,185,66,0.18)',
  turkey: 'rgba(168,177,255,0.18)',
  veggie: 'rgba(127,207,160,0.18)',
  kids: 'rgba(215,40,70,0.18)',
  glutenfree: 'rgba(255,255,255,0.10)',
};

export default function TicketCardV2({
  ticket,
  delegationsById = {},
  daysOut,
  guest = false, // mirrors V1's `guest` prop — guest-section ticket cards
  onPickDinner, // (seat) => void  — opens DinnerSheet
  onInviteSeat, // (seat) => void  — opens SeatInviteSheet
  onManageGuest, // (delegation) => void — opens DelegateManage for the seat's delegation
}) {
  const rows = ticket.assignmentRows || [];
  const dinnerLocked = daysOut != null && daysOut <= DINNER_LOCK_DAYS;

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
      {/* Showing header — poster, title, time. NO Manage button, NO chevron. */}
      <div
        style={{
          padding: 14,
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0,1fr)',
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
              fontSize: 15,
              fontWeight: 800,
              color: 'var(--ink-on-ground)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ticket.movieTitle}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 11,
              color: 'var(--mute)',
            }}
          >
            {ticket.theaterName}
          </div>
        </div>
      </div>

      {/* Per-seat rows — always visible. */}
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
            delegationsById={delegationsById}
            dinnerLocked={dinnerLocked}
            daysOut={daysOut}
            onPickDinner={onPickDinner}
            onInviteSeat={onInviteSeat}
            onManageGuest={onManageGuest}
          />
        ))}
      </div>
    </article>
  );
}

function SeatRow({
  row,
  ticket,
  guest,
  delegationsById,
  dinnerLocked,
  daysOut,
  onPickDinner,
  onInviteSeat,
  onManageGuest,
}) {
  // Decide who's in the seat using V1's pre-computed ownerKind.
  // 'sponsor' = sponsor placed for themselves (no delegation, no
  // distinct guest_name); 'guest' = assigned to a delegation or has
  // a directGuestName that differs from the sponsor's own name.
  // V1 builds this in addRow at Mobile.jsx:2403; trust it as the
  // single source of truth so V2 doesn't drift.
  const isGuestRow = row.ownerKind === 'guest';
  const ownerName = isGuestRow
    ? assignmentOwner(row, ticket.delegationName || ticket.guestName)
    : 'You';

  const seatId = row.seat_id || `${row.row_label}-${row.seat_num}`;
  const label = fmtSeat(seatId);

  // Seat tile parses the row letter (G) from the seat number (G15)
  // so we can stack them as G / 15.
  const m = label.match(/^([A-Za-z]+)(\d+)$/);
  const tileTop = m ? m[1] : label;
  const tileBot = m ? m[2] : '';

  const dinner = row.dinner_choice || null;

  // Build the seat object passed to handlers
  const seat = {
    theaterId: ticket.theaterId,
    row_label: row.row_label,
    seat_num: row.seat_num,
    label,
    dinner_choice: dinner,
    ownerName: isGuestRow ? ownerName : 'You',
    delegation_id: row.delegation_id || null,
    showing: {
      label: ticket.showLabel,
      movieTitle: ticket.movieTitle,
      theaterName: ticket.theaterName,
    },
  };

  const delegation = row.delegation_id ? delegationsById[row.delegation_id] : null;

  // Clicking the right-side action button:
  //   - sponsor-self → onInviteSeat (open SeatInviteSheet)
  //   - guest        → onManageGuest with delegation (open DelegateManage)
  //   - guest-section ticket card → also onManageGuest (handled by parent)
  const handleAction = () => {
    if (isGuestRow) {
      if (delegation && onManageGuest) onManageGuest(delegation);
    } else {
      if (onInviteSeat) onInviteSeat(seat);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '56px minmax(0,1fr) auto',
        gap: 10,
        alignItems: 'center',
        background: 'rgba(0,0,0,0.14)',
        border: `1px solid var(--rule)`,
        borderRadius: 12,
        padding: 10,
      }}
    >
      {/* BIG seat tile — letter on top, number on bottom */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: 'rgba(168,177,255,0.16)',
          color: 'var(--accent-italic)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{tileTop}</div>
        {tileBot && (
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1, marginTop: 2 }}>
            {tileBot}
          </div>
        )}
      </div>

      {/* Center: name + dinner pill */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--ink-on-ground)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 6,
          }}
        >
          {ownerName}
        </div>
        <DinnerPill
          dinner={dinner}
          locked={dinnerLocked}
          onClick={() => !dinnerLocked && onPickDinner && onPickDinner(seat)}
        />
      </div>

      {/* Right: state-aware action button */}
      <button
        onClick={handleAction}
        data-testid={isGuestRow ? 'seat-row-manage' : 'seat-row-invite'}
        style={{
          all: 'unset',
          cursor: 'pointer',
          padding: '8px 14px',
          borderRadius: 99,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.3,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          ...(isGuestRow
            ? {
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--ink-on-ground)',
                border: `1px solid var(--rule)`,
              }
            : {
                background: 'rgba(168,177,255,0.18)',
                color: BRAND.indigoLight,
                border: `1px solid rgba(168,177,255,0.4)`,
              }),
        }}
      >
        {isGuestRow ? 'Manage' : '+ Invite'}
      </button>
    </div>
  );
}

function DinnerPill({ dinner, locked, onClick }) {
  const has = !!dinner;
  const tint = has ? DINNER_TINT[dinner] : 'rgba(255,255,255,0.06)';
  const emoji = has ? DINNER_EMOJI[dinner] : '🍽️';
  const text = has ? DINNER_SHORT[dinner] : 'Pick dinner';

  return (
    <button
      onClick={locked ? undefined : onClick}
      disabled={locked}
      style={{
        all: 'unset',
        cursor: locked ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px 5px 6px',
        borderRadius: 99,
        background: 'rgba(255,255,255,0.04)',
        border: `1px ${has ? 'solid' : 'dashed'} ${has ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.16)'}`,
        fontSize: 11,
        fontWeight: 600,
        color: has ? '#fff' : 'rgba(255,255,255,0.55)',
        opacity: locked ? 0.7 : 1,
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 6,
          background: tint,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {locked ? '🔒' : emoji}
      </span>
      <span>
        {locked && !has ? 'No dinner' : text}
      </span>
      {!locked && (
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginLeft: 1 }}>
          ▾
        </span>
      )}
    </button>
  );
}
