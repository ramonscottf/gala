// TicketDetailSheet — V2 R5 (per-group ticket view)
//
// One bottom sheet showing a single showing-group as a real ticket:
// poster, eyebrow, title, theater, date, time, full seat list with
// dinner pills, QR for THIS sponsor's whole portal, and Apple/Google
// Wallet save buttons (placeholder for now — wire-up tomorrow).
//
// Replaces the page-level QR card. Each TicketCardV2 has a "View
// ticket" button that opens this sheet. The QR data is the same as
// the page-level one was — one QR per sponsor token, used mostly for
// troubleshooting/lookup at the door, not as a primary scan target.
//
// Dinner pills inside this sheet are tappable (route to onPickDinner)
// for sponsor-self seats. Guest seats show their dinner read-only;
// host edits via the "Manage" button on the row in TicketsTabV2.
//
// Apple/Google Wallet buttons are scaffolded with disabled "Coming
// soon" state. Tomorrow's pkpass + JWT work plugs in here without
// changing this component's shape.

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

  // Date — pulled from the showing if available, otherwise the gala
  // is always Wednesday June 10 2026, so default to that.
  const dateStr = 'Wednesday · June 10, 2026';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* TICKET CARD — the visual centerpiece. Big poster header,
          perforated edge, then seat list, then QR. The whole thing
          reads like a movie ticket. */}
      <div
        style={{
          borderRadius: 16,
          background: 'var(--surface)',
          border: `1px solid var(--rule)`,
          overflow: 'hidden',
          boxShadow: '0 12px 32px -8px rgba(0,0,0,0.4)',
        }}
      >
        {/* Poster band — full-width hero image with title overlay */}
        <div
          style={{
            position: 'relative',
            height: 180,
            background: ticket.posterUrl
              ? `linear-gradient(180deg, rgba(11,18,51,0.10) 0%, rgba(11,18,51,0.85) 80%, ${BRAND.surface || 'rgba(13,15,36,0.95)'} 100%), url(${ticket.posterUrl}) center 30% / cover`
              : `linear-gradient(160deg, ${ticket.color || BRAND.navyMid}, ${BRAND.navyDeep})`,
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

        {/* Date / theater band */}
        <div
          style={{
            padding: '14px 16px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            borderBottom: `1px dashed var(--rule)`,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1.3,
                color: 'var(--mute)',
              }}
            >
              DATE
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--ink-on-ground)',
                marginTop: 2,
              }}
            >
              {dateStr}
            </div>
            <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 1 }}>
              Doors 3:15 PM
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1.3,
                color: 'var(--mute)',
              }}
            >
              THEATER
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--ink-on-ground)',
                marginTop: 2,
              }}
            >
              Megaplex Centerville
            </div>
            <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 1 }}>
              {ticket.theaterName}
            </div>
          </div>
        </div>

        {/* Seat list — uses the same SeatRow shape as TicketCardV2
            but slightly more compact since this is a focused view. */}
        <div
          style={{
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1.3,
              color: 'var(--mute)',
              marginBottom: 4,
            }}
          >
            SEATS · {rows.length} TOTAL
          </div>
          {rows.map((row) => (
            <DetailSeatRow
              key={row.seat_id}
              row={row}
              ticket={ticket}
              guest={guest}
              dinnerLocked={dinnerLocked}
              onPickDinner={onPickDinner}
              onInviteSeat={onInviteSeat}
              onManageGuest={onManageGuest}
            />
          ))}
        </div>

        {/* Perforated divider — the visual "tear here" between the
            ticket info and the QR */}
        <div
          style={{
            position: 'relative',
            height: 1,
            background: `repeating-linear-gradient(to right, var(--rule) 0 6px, transparent 6px 12px)`,
            margin: '0 14px',
          }}
        />

        {/* QR band — single QR for the whole sponsor portal */}
        <div
          style={{
            padding: '18px 16px 20px',
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
                color: 'var(--ink-on-ground)',
                marginTop: 2,
                lineHeight: 1.2,
              }}
            >
              Show this at the door
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--mute)',
                marginTop: 4,
                lineHeight: 1.4,
              }}
            >
              One QR for your whole party. Save it to your phone with the buttons below.
            </div>
          </div>
        </div>
      </div>

      {/* SAVE TO PHONE — Apple Wallet + Google Wallet placeholders.
          The wallet wiring (pkpass server-side + Google JWT) lands
          tomorrow. UI is in place so the deliverable is the same. */}
      <div
        style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
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
            background: 'rgba(0,0,0,0.5)',
            border: `1px solid var(--rule)`,
            color: 'rgba(255,255,255,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            opacity: 0.55,
            position: 'relative',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, color: 'rgba(255,255,255,0.6)' }}>
            Add to
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.2, color: '#fff' }}>
             Apple Wallet
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
              background: 'rgba(244,185,66,0.12)',
              padding: '2px 5px',
              borderRadius: 99,
              border: `1px solid rgba(244,185,66,0.3)`,
            }}
          >
            SOON
          </div>
        </button>
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
            background: '#fff',
            border: `1px solid var(--rule)`,
            color: '#202124',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            opacity: 0.55,
            position: 'relative',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, color: '#5f6368' }}>
            Add to
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.2, color: '#202124' }}>
            Google Wallet
          </div>
          <div
            style={{
              position: 'absolute',
              top: 6,
              right: 8,
              fontSize: 8,
              fontWeight: 800,
              letterSpacing: 1,
              color: BRAND.goldDeep || '#d99a1f',
              background: 'rgba(244,185,66,0.18)',
              padding: '2px 5px',
              borderRadius: 99,
              border: `1px solid rgba(244,185,66,0.4)`,
            }}
          >
            SOON
          </div>
        </button>
      </div>

      <div
        style={{
          fontSize: 10,
          color: 'var(--mute)',
          textAlign: 'center',
          marginTop: 10,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}
      >
        Wallet support is coming. For now, screenshot this ticket or take a photo.
      </div>
    </div>
  );
}

// DetailSeatRow — same shape as TicketCardV2's SeatRow but rendered
// inline inside the detail sheet. Kept here (not extracted) because
// the detail view has slightly different padding/sizing tuned for
// the focused sheet context.
function DetailSeatRow({
  row,
  ticket,
  guest,
  dinnerLocked,
  onPickDinner,
  onInviteSeat,
  onManageGuest,
}) {
  // Same logic as TicketCardV2: delegation_id is the only reliable
  // signal of a guest. directGuest from V1's classifier misfires on
  // sponsor-self seats labeled with the company name.
  const isGuestRow = !!row.delegation_id;
  const ownerName = isGuestRow
    ? assignmentOwner(row, ticket.delegationName || ticket.guestName)
    : 'You';

  const seatId = row.seat_id || `${row.row_label}-${row.seat_num}`;
  const label = fmtSeat(seatId);
  const m = label.match(/^([A-Za-z]+)(\d+)$/);
  const tileTop = m ? m[1] : label;
  const tileBot = m ? m[2] : '';

  const dinner = row.dinner_choice || null;
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

  const handleAction = () => {
    if (isGuestRow) {
      // Guest rows route to DelegateManage via onManageGuest.
      // The sheet host wires this to setDelegationSheet.
      if (onManageGuest && row.delegation_id) {
        onManageGuest({ id: row.delegation_id });
      }
    } else {
      if (onInviteSeat) onInviteSeat(seat);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '52px minmax(0,1fr) auto',
        gap: 10,
        alignItems: 'center',
        background: 'rgba(0,0,0,0.14)',
        border: `1px solid var(--rule)`,
        borderRadius: 10,
        padding: 9,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 10,
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
        <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1 }}>{tileTop}</div>
        {tileBot && (
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1, marginTop: 1 }}>
            {tileBot}
          </div>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--ink-on-ground)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 5,
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
      {/* For guest-section ticket cards we don't need the per-row
          action since the whole card is "guest-managed" — host can
          tap any guest row in the main TicketsTab to manage the
          delegation. Inside this detail sheet, still render the
          action button so the user can manage from here too. */}
      <button
        onClick={handleAction}
        style={{
          all: 'unset',
          cursor: 'pointer',
          padding: '7px 13px',
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
      <span>{locked && !has ? 'No dinner' : text}</span>
      {!locked && (
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginLeft: 1 }}>
          ▾
        </span>
      )}
    </button>
  );
}
