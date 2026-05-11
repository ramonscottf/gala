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
//   │ G12   🌱 Vegetarian                        ▾   │   sponsor-self
//   ├────────────────────────────────────────────────┤
//   │ G14   Charles · 🥖 French Dip              ▾   │   guest row (name only here)
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
import { formatRottenBadge } from '../movieScores.js';

// Phase 5.8 — Kara's revised menu. Mirrors DinnerSheet.jsx tiles +
// DinnerPicker.jsx DINNER_OPTIONS + server enum in dinner.js. Four
// options; turkey removed; brisket→frenchdip, glutenfree→salad.
const DINNER_EMOJI = {
  frenchdip: '🥖',
  salad: '🥗',
  veggie: '🌱',
  kids: '🧒',
};
const DINNER_SHORT = {
  frenchdip: 'French Dip',
  salad: 'Salad',
  veggie: 'Veggie',
  kids: 'Kids',
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
      {/* ─── HERO BAND — matches MovieDetailSheet ─────────────────
          Phase 5.9 rebuild. The ticket sheet now mirrors the
          movie-detail-sheet hero so a sponsor's ticket for "Paddington
          2" visually echoes the same Paddington 2 page they read about
          on the home tab. Backdrop is its own absolutely-positioned
          layer with WebKit + standard masks giving a feathered fade
          at top (into the modal edge) and bottom (into the title
          row), so the photo never cuts off with a hard edge. */}
      <div
        style={{
          position: 'relative',
          height: 200,
          background: BRAND.navyDeep,
          overflow: 'hidden',
          marginLeft: -22,
          marginRight: -22,
          marginTop: -18,
        }}
      >
        {ticket.backdropUrl ? (
          <>
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background: `url(${ticket.backdropUrl}) center/cover no-repeat`,
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent 0%, #000 18%, #000 70%, transparent 100%)',
                maskImage:
                  'linear-gradient(to bottom, transparent 0%, #000 18%, #000 70%, transparent 100%)',
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(180deg, rgba(15,22,57,0.55) 0%, rgba(15,22,57,0.25) 35%, rgba(15,22,57,0.55) 75%, rgba(15,22,57,0.98) 100%)',
              }}
            />
          </>
        ) : ticket.posterUrl ? (
          // Fall back to a softly blurred poster when no backdrop is
          // available — better than flat navy and still in the spirit
          // of the cinematic hero.
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: `url(${ticket.posterUrl}) center/cover no-repeat`,
              filter: 'blur(28px) brightness(0.55)',
              transform: 'scale(1.12)',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
            }}
          />
        )}
        {/* Showing chip floats over the hero, mirroring the small
            gold "EARLY · 4:30 PM" tag in the original sheet but in
            the MovieDetailSheet's pill register. */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 18,
            zIndex: 1,
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: 1.6,
            color: BRAND.gold,
            textTransform: 'uppercase',
            background: 'rgba(0,0,0,0.45)',
            padding: '5px 10px',
            borderRadius: 99,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          {(guest ? 'Guest ticket' : ticket.showLabel || 'Showing')}
          {ticket.showTime ? ` · ${ticket.showTime}` : ''}
        </div>
      </div>

      {/* ─── TITLE BLOCK — overlapping poster + title + meta pills
          Same grid as MovieDetailSheet: 100px poster column +
          flex title column. Negative margin pulls the poster up to
          straddle the hero's bottom edge. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: ticket.posterUrl ? '100px minmax(0, 1fr)' : '1fr',
          gap: 16,
          alignItems: 'start',
          marginTop: -72,
          marginBottom: 18,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {ticket.posterUrl && (
          <div
            style={{
              width: 100,
              aspectRatio: '2 / 3',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.26)',
              boxShadow:
                '0 18px 40px rgba(0,0,0,0.65), 0 4px 12px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06) inset',
              border: `1px solid rgba(255,255,255,0.10)`,
              overflow: 'hidden',
            }}
          >
            <img
              src={ticket.posterUrl}
              alt={`${ticket.movieTitle} poster`}
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        )}
        <div style={{ minWidth: 0, paddingTop: 84 }}>
          <h2
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 24,
              fontWeight: 700,
              margin: '0 0 8px',
              lineHeight: 1.15,
              letterSpacing: -0.4,
              color: '#fff',
            }}
          >
            {ticket.movieTitle}
            {ticket.year ? (
              <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
                {' '}({ticket.year})
              </span>
            ) : null}
          </h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ticket.rating && (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: '#fff',
                  color: BRAND.ink,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 0.6,
                }}
              >
                {ticket.rating}
              </span>
            )}
            {ticket.runtime && (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.10)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {ticket.runtime} min
              </span>
            )}
            {formatRottenBadge(ticket, { audience: true }) && (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: 'rgba(220,68,52,0.18)',
                  color: '#ff8a78',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 11, lineHeight: 1 }}>🍅</span>
                {formatRottenBadge(ticket, { audience: true })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── DETAILS BAND — Q2 (c): same date/theater two-column
          layout the user already knew, but the right column now
          carries dinner-time alongside theater so all three
          "things you need to know walking in" sit together. */}
      <div
        style={{
          padding: '14px 0 16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          borderTop: `1px dashed rgba(255,255,255,0.10)`,
          borderBottom: `1px dashed rgba(255,255,255,0.10)`,
        }}
      >
        <div>
          <div style={metaLabel}>DATE</div>
          <div style={metaValue}>Wednesday · June 10, 2026</div>
          <div style={metaSub}>
            {ticket.dinnerTime ? `Dinner ${ticket.dinnerTime}` : 'Doors 4:00 PM'}
          </div>
        </div>
        <div>
          <div style={metaLabel}>THEATER</div>
          <div style={metaValue}>Megaplex Centerville</div>
          <div style={metaSub}>{ticket.theaterName}</div>
        </div>
      </div>

      {/* ─── QR — DOMINANT. The whole reason this sheet exists. ───
          Centered, large (200px), prominent label below. This was
          the small footer in the old layout; it's the focal point
          now. */}
      <div
        style={{
          marginTop: 22,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: 18,
            background: '#fff',
            padding: 12,
            boxSizing: 'border-box',
            boxShadow:
              '0 18px 40px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.30)',
          }}
        >
          <img
            src={qrSrc}
            alt="Check-in QR"
            width="176"
            height="176"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.4,
              color: BRAND.gold,
            }}
          >
            CHECK-IN
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#fff',
              marginTop: 4,
              lineHeight: 1.2,
            }}
          >
            Show this at the door
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.65)',
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            One QR for your whole party.
          </div>
        </div>
      </div>

      {/* Wallet buttons — kept below QR for now, soon-tagged */}
      <div
        style={{
          marginTop: 18,
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
          marginTop: 8,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}
      >
        Wallet support is coming. For now, screenshot this ticket.
      </div>

      {/* ─── SEATS — collapsed-by-default list. No longer the main
          attraction. Tap a row to reveal that seat's meal + change/
          pick-dinner button. SeatRow already does collapsed-by-
          default with an inline expand and a "Change/Pick dinner"
          button — we just place it after the QR with reduced
          visual weight. */}
      <div style={{ marginTop: 22 }}>
        <div style={{ ...metaLabel, marginBottom: 6 }}>
          SEATS · {rows.length} TOTAL
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.45)',
            marginBottom: 8,
            fontStyle: 'italic',
          }}
        >
          Tap a seat to see or change its meal.
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
