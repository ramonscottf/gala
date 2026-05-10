// TicketDetailSheet — V2 R7 (clean drop-down rows)
//
// Replaces R5's card-in-card seat tile layout. User feedback:
// "card within a card. Don't like that. The you needs to go. Don't
// list guest names unless it's a guest. Make it one line. The seat
// number stacked is unnecessary. Just a drop down to have all the
// info below. Clean. Elegant."
//
// New row pattern — collapsed by default:
//   ┌────────────────────────────────────────────────┐
//   │ G12   🥗 Veggie                            ▾   │   sponsor-self
//   ├────────────────────────────────────────────────┤
//   │ G14   Charles · 🍖 Brisket                 ▾   │   guest row (name only here)
//   └────────────────────────────────────────────────┘
//
// Tap the row → expands inline with action buttons (Pick dinner /
// Invite or Manage). No nested bordered tiles. Single-line summary.
// Seat number lives inline as "G12", not stacked. "You" is gone —
// sponsor-owned rows show only the dinner choice (because it's
// already implicit from context — this is YOUR ticket). Guest rows
// show the guest name because that's the new info per row.
//
// Wallet buttons stay below the QR. Date/theater band stays.
// Poster header band stays.

import { useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { PosterMini, seatLabel as fmtSeat, assignmentOwner } from '../Portal.jsx';
import { DINNER_LOCK_DAYS } from '../../brand/tokens.js';

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

export default function TicketDetailSheet({
  ticket,
  daysOut,
  token,
  apiBase = '',
  guest = false,
  onPickDinner,
  onInviteSeat,
  onManageGuest,
  onClose,
}) {
  if (!ticket) return null;

  const rows = ticket.assignmentRows || [];
  const dinnerLocked = daysOut != null && daysOut <= DINNER_LOCK_DAYS;
  const qrSrc = `${apiBase}/api/gala/qr?t=${encodeURIComponent(token || '')}&size=400`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Poster header band */}
      <div
        style={{
          position: 'relative',
          height: 180,
          borderRadius: 16,
          overflow: 'hidden',
          background: ticket.posterUrl
            ? `linear-gradient(180deg, rgba(11,18,51,0.10) 0%, rgba(11,18,51,0.85) 80%, rgba(15,22,57,0.95) 100%), url(${ticket.posterUrl}) center 30% / cover`
            : `linear-gradient(160deg, ${ticket.color || '#1f2a5e'}, #0b1233)`,
          display: 'flex',
          alignItems: 'flex-end',
          padding: 16,
          color: '#fff',
        }}
      >
        <div style={{ width: '100%' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: 1.6,
              color: BRAND.gold,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            {guest ? 'Guest ticket' : ticket.showLabel || 'Showing'} · {ticket.showTime}
          </div>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -0.4,
              textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            }}
          >
            {ticket.movieTitle}
          </div>
        </div>
      </div>

      {/* Date / theater */}
      <div
        style={{
          marginTop: 14,
          padding: '14px 4px 16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          borderBottom: `1px dashed rgba(255,255,255,0.10)`,
        }}
      >
        <div>
          <div style={metaLabel}>DATE</div>
          <div style={metaValue}>Wednesday · June 10, 2026</div>
          <div style={metaSub}>Doors 3:15 PM</div>
        </div>
        <div>
          <div style={metaLabel}>THEATER</div>
          <div style={metaValue}>Megaplex Centerville</div>
          <div style={metaSub}>{ticket.theaterName}</div>
        </div>
      </div>

      {/* Seat list — flat rows, no inner cards. Each row is a tappable
          accordion: collapsed shows seat + dinner (+ guest name if
          guest), expanded reveals action buttons. */}
      <div style={{ marginTop: 14 }}>
        <div style={{ ...metaLabel, marginBottom: 8 }}>
          SEATS · {rows.length} TOTAL
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((row, i) => (
            <SeatRow
              key={row.seat_id}
              row={row}
              ticket={ticket}
              guest={guest}
              dinnerLocked={dinnerLocked}
              onPickDinner={onPickDinner}
              onInviteSeat={onInviteSeat}
              onManageGuest={onManageGuest}
              isLast={i === rows.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Perforated divider */}
      <div
        style={{
          height: 1,
          background: `repeating-linear-gradient(to right, rgba(255,255,255,0.10) 0 6px, transparent 6px 12px)`,
          margin: '18px 0 0',
        }}
      />

      {/* QR band */}
      <div
        style={{
          padding: '18px 0 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 10,
            background: '#fff',
            padding: 6,
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          <img
            src={qrSrc}
            alt="Check-in QR"
            width="84"
            height="84"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1.4,
              color: BRAND.gold,
            }}
          >
            CHECK-IN
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
              marginTop: 2,
              lineHeight: 1.2,
            }}
          >
            Show this at the door
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.65)',
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            One QR for your whole party.
          </div>
        </div>
      </div>

      {/* Wallet buttons */}
      <div
        style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <WalletButton tone="black" label="Apple Wallet" />
        <WalletButton tone="white" label="Google Wallet" />
      </div>

      <div
        style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.55)',
          textAlign: 'center',
          marginTop: 10,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}
      >
        Wallet support is coming. For now, screenshot this ticket.
      </div>
    </div>
  );
}

function SeatRow({
  row,
  ticket,
  guest,
  dinnerLocked,
  onPickDinner,
  onInviteSeat,
  onManageGuest,
  isLast,
}) {
  const [open, setOpen] = useState(false);
  const isGuestRow = !!row.delegation_id;
  const seatId = row.seat_id || `${row.row_label}-${row.seat_num}`;
  const label = fmtSeat(seatId); // 'G12' from 'G-12'
  const dinner = row.dinner_choice || null;

  // Build the seat object handlers expect
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

  // What goes between the seat code and the dinner pill on the
  // collapsed line. Per spec: nothing for sponsor-self ("the You
  // needs to go"); the guest's name when this seat is delegated.
  const guestName = isGuestRow
    ? assignmentOwner(row, ticket.delegationName || ticket.guestName)
    : null;

  // Dinner summary string for the collapsed line
  const dinnerEmoji = dinner ? DINNER_EMOJI[dinner] : '🍽️';
  const dinnerText = dinner ? DINNER_SHORT[dinner] : 'No dinner picked';
  const dinnerColor = dinner ? '#fff' : 'rgba(255,255,255,0.55)';

  return (
    <div
      style={{
        borderBottom: isLast ? 'none' : `1px solid rgba(255,255,255,0.08)`,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 4px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Seat code — inline, NOT stacked */}
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 16,
            fontWeight: 700,
            color: BRAND.indigoLight,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 40,
            flexShrink: 0,
          }}
        >
          {label}
        </span>

        {/* Middle line: name (guests only) + dinner */}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {guestName && (
            <>
              <span style={{ fontWeight: 700 }}>{guestName}</span>
              <span style={{ color: 'rgba(255,255,255,0.30)' }}>·</span>
            </>
          )}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: dinnerColor,
              fontWeight: dinner ? 600 : 500,
              fontStyle: dinner ? 'normal' : 'italic',
            }}
          >
            <span aria-hidden style={{ fontSize: 14 }}>
              {dinnerLocked ? '🔒' : dinnerEmoji}
            </span>
            {dinnerText}
          </span>
        </span>

        {/* Chevron */}
        <span
          aria-hidden
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: 14,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.18s ease',
            flexShrink: 0,
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '0 4px 12px',
          }}
        >
          {!dinnerLocked && (
            <button
              onClick={() => onPickDinner && onPickDinner(seat)}
              style={pillBtn('soft')}
            >
              {dinner ? 'Change dinner' : 'Pick dinner'}
            </button>
          )}
          {/* Phase 5.3 — TicketDetailSheet is the "look at my ticket"
              view. All invite/manage actions live on the Tickets-tab
              card now. The dinner picker stays accessible here because
              dinners remain editable until the 7-day lock and people
              expect to pick dinner from a ticket they're already
              looking at. (Q9 in the spec: sheet stays interactive for
              dinners; only invite controls move out.) */}
        </div>
      )}
    </div>
  );
}

function WalletButton({ tone, label }) {
  const dark = tone === 'black';
  return (
    <button
      disabled
      aria-disabled="true"
      title="Coming soon"
      style={{
        all: 'unset',
        cursor: 'not-allowed',
        boxSizing: 'border-box',
        padding: '12px',
        borderRadius: 12,
        background: dark ? 'rgba(0,0,0,0.5)' : '#fff',
        border: `1px solid rgba(255,255,255,0.10)`,
        color: dark ? '#fff' : '#202124',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        opacity: 0.55,
        position: 'relative',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.3,
          color: dark ? 'rgba(255,255,255,0.6)' : '#5f6368',
        }}
      >
        Add to
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 0.2,
          color: dark ? '#fff' : '#202124',
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          fontSize: 8,
          fontWeight: 800,
          letterSpacing: 1,
          color: BRAND.gold,
          background: 'rgba(244,185,66,0.18)',
          padding: '2px 5px',
          borderRadius: 99,
          border: `1px solid rgba(244,185,66,0.4)`,
        }}
      >
        SOON
      </div>
    </button>
  );
}

const metaLabel = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 1.3,
  color: 'rgba(255,255,255,0.55)',
};
const metaValue = {
  fontSize: 13,
  fontWeight: 700,
  color: '#fff',
  marginTop: 2,
};
const metaSub = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.55)',
  marginTop: 1,
};

function pillBtn(kind) {
  const base = {
    all: 'unset',
    cursor: 'pointer',
    boxSizing: 'border-box',
    padding: '8px 14px',
    borderRadius: 99,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.2,
    whiteSpace: 'nowrap',
  };
  if (kind === 'indigo') {
    return {
      ...base,
      background: 'rgba(168,177,255,0.18)',
      color: BRAND.indigoLight,
      border: `1px solid rgba(168,177,255,0.4)`,
    };
  }
  return {
    ...base,
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    border: `1px solid rgba(255,255,255,0.12)`,
  };
}
