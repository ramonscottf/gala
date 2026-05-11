// TicketCard — V2 R9 (clean three-column row layout)
//
// User feedback (paraphrased): "Three columns: SEAT, DINNER, GUEST.
// All caps small headers. Same font and weight on the values. Pills
// only on the seat and the meal. No pills around plain words. Make
// the your-seat section also collapse with a chevron, same as guest."
//
// New row anatomy:
//
//   ┌─ SEAT ─────── DINNER ─────────── GUEST ──────────┐
//   │ [G11]         [🥖 French Dip]      Charles Foster │   guest row
//   │ [G14]         [— select dinner —] [+ Invite]      │   sponsor row
//   └──────────────────────────────────────────────────┘
//
// - Three uppercase 9px tracked headers (SEAT / DINNER / GUEST) in
//   the same muted-white tone, all matching style.
// - Three columns of values, all in the same font weight (700) and
//   roughly the same size; the seat code is in the tabular-nums
//   serif because it's a code, but its weight matches the rest.
// - Pills around: the seat code, the dinner choice, and the
//   sponsor-row Invite affordance. Plain text for the guest name.
// - Both sponsor and guest cards default to collapsed with a
//   chevron toggle in the header row. Expand to see this 3-col layout.
// - Sponsor cards keep their bottom-of-card "+ Invite a guest to
//   these seats" CTA inside the expanded body (group-level handoff
//   via HandBlockSheet).

import { useState, useMemo } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { PosterMini, seatLabel as fmtSeat, assignmentOwner } from '../Portal.jsx';

// Phase 5.8 — Kara's revised menu. Keys match server enum in
// functions/api/gala/dinner.js and validator in pick.js. Four
// options only; turkey removed.
const DINNER_EMOJI = {
  frenchdip: '🥖',
  salad: '🥗',
  veggie: '🌱',
  kids: '🧒',
};
const DINNER_LABEL = {
  frenchdip: 'French Dip',
  salad: 'Chicken Salad',
  veggie: 'Vegetarian',
  kids: 'Kids Meal',
};

export default function TicketCard({
  ticket,
  guest = false,
  isFinalized = false,    // Phase 5.3 — sponsor finalize state
  onViewTicket,    // sponsor cards: opens TicketDetailSheet
  onManageGuest,   // guest cards: opens DelegateManage
  onPickDinner,    // (seat) => void — opens DinnerSheet
  onInviteSeat,    // (seat) => void — opens DelegateForm w/ single-seat lock
  onInviteGroup,   // (ticket) => void — opens HandBlockSheet for the group
  onSelectMeals,   // (ticket) => void — opens batch dinner picker
  onFinalizeFromCard, // (ticket) => void — fires /finalize, triggers celebration
  // Phase 5.14 — Home-tab parity on Tickets tab. Per-card Edit/View
  // pills + inline red/yellow picker matching HomeTab's TicketHeroCard.
  // Optional; falls back to legacy chevron-only behavior when omitted.
  onEditSeats,     // (ticket) => void — opens TicketManage / seat picker
  onEditMeals,     // (ticket) => void — opens batch dinner editor
}) {
  const rows = ticket.assignmentRows || [];
  // R9 — sponsor cards now collapse like guest cards. Default closed
  // for both contexts; chevron toggles the seat list.
  const [expanded, setExpanded] = useState(false);
  // Phase 5.14 — inline Edit picker (mirrors HomeTab TicketHeroCard).
  const [editOpen, setEditOpen] = useState(false);

  // Subline: 'Dinner 4:00 · Movie 4:30 · Auditorium 7'
  const subline = useMemo(() => {
    const parts = [];
    if (ticket.dinnerTime) parts.push(`Dinner ${ticket.dinnerTime}`);
    if (ticket.showTime) parts.push(`Movie ${ticket.showTime}`);
    if (ticket.theaterName) parts.push(ticket.theaterName);
    return parts.join(' · ');
  }, [ticket.dinnerTime, ticket.showTime, ticket.theaterName]);

  // View routes by context
  const handlePrimary = () => {
    if (guest) {
      if (onManageGuest) onManageGuest(ticket);
    } else {
      if (onViewTicket) onViewTicket(ticket);
    }
  };

  const hasGiveable = !guest && rows.some((r) => !r.delegation_id);

  // Phase 5.3 — state machine for the bottom CTA on sponsor cards.
  //
  //   missingMeals  → indigo "Select meals" pill (opens batch picker)
  //   readyToFinalize → red "Finalize seats" + subtext (fires /finalize)
  //   isFinalized → indigo "View ticket" pill (opens read-only sheet)
  //
  // Guest cards keep their header Manage pill — they don't have this
  // state machine because guests don't fire /finalize themselves.
  const missingMealCount = useMemo(
    () => rows.filter((r) => !r.dinner_choice).length,
    [rows]
  );
  const showSelectMealsCta = !guest && !isFinalized && missingMealCount > 0;
  const showFinalizeCta = !guest && !isFinalized && missingMealCount === 0 && rows.length > 0;
  const showViewCta = !guest && isFinalized;

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
          {/* Phase 5.3 — the View/Manage pill that lived in the header
              has moved into the bottom CTA region (see below). For guest
              tickets we keep the Manage pill since guests don't have a
              meal-pick → finalize → view flow; their entry point stays
              header-level. */}
          {guest && (
            <button
              onClick={handlePrimary}
              data-testid="ticket-manage"
              style={primaryPill}
            >
              Manage
            </button>
          )}
          {/* Phase 5.14 — Home-tab parity: per-card Edit + View pills
              on sponsor cards. Edit toggles an inline red/yellow picker
              (Edit seats / Edit meals); View opens TicketDetailSheet.
              Does NOT replace the existing Finalize seats CTA below —
              this is additive surface for editing already-placed seats.
              Both pills only render when their callbacks are wired. */}
          {!guest && (typeof onEditSeats === 'function' || typeof onEditMeals === 'function') && (
            <button
              type="button"
              onClick={() => setEditOpen((v) => !v)}
              aria-expanded={editOpen}
              data-testid="ticket-edit-toggle"
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 99,
                background: editOpen ? 'rgba(168,177,255,0.18)' : 'rgba(255,255,255,0.06)',
                color: editOpen ? BRAND.indigoLight : 'var(--ink-on-ground)',
                fontSize: 11,
                fontWeight: 700,
                border: `1px solid ${editOpen ? 'rgba(168,177,255,0.32)' : 'var(--rule)'}`,
              }}
            >
              {editOpen ? 'Close' : 'Edit'}
            </button>
          )}
          {!guest && onViewTicket && (
            <button
              type="button"
              onClick={() => onViewTicket(ticket)}
              data-testid="ticket-view-pill"
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '6px 13px',
                borderRadius: 99,
                background: 'rgba(168,177,255,0.18)',
                color: BRAND.indigoLight,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              View
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label="Toggle seat list"
            style={chevronBtn(expanded)}
          >
            ▾
          </button>
        </div>
      </div>

      {/* Phase 5.14 — inline Edit picker. Mirrors HomeTab TicketHeroCard.
          Red 'Edit seats' (always shown when onEditSeats wired) + yellow
          'Edit meals' (only when onEditMeals wired and seats exist). Sits
          between the header and the expanded seat list / Finalize CTA so
          it reads as a secondary action set, not a primary one. */}
      {editOpen && !guest && (
        <div
          style={{
            padding: '0 14px 12px',
            display: 'flex',
            gap: 8,
            borderTop: `1px solid var(--rule)`,
            paddingTop: 12,
            background: 'rgba(0,0,0,0.12)',
          }}
        >
          {typeof onEditSeats === 'function' && (
            <button
              type="button"
              onClick={() => {
                setEditOpen(false);
                onEditSeats(ticket);
              }}
              data-testid="ticket-edit-seats"
              style={{
                all: 'unset',
                cursor: 'pointer',
                flex: 1,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'linear-gradient(135deg,#CB262C,#a01f24)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              🪑 Edit seats
            </button>
          )}
          {typeof onEditMeals === 'function' && rows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setEditOpen(false);
                onEditMeals(ticket);
              }}
              data-testid="ticket-edit-meals"
              style={{
                all: 'unset',
                cursor: 'pointer',
                flex: 1,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'linear-gradient(135deg,#ffc24d,#f5a623)',
                color: BRAND.navyDeep,
                fontSize: 13,
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              🍽️ Edit meals
            </button>
          )}
        </div>
      )}

      {expanded && rows.length > 0 && (
        <div
          style={{
            padding: '0 16px 12px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Column headers — three small uppercase 9px headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '64px minmax(0,1fr) auto',
              gap: 12,
              padding: '6px 0',
              borderBottom: `1px solid var(--rule)`,
            }}
          >
            <span style={colHeader}>SEAT</span>
            <span style={colHeader}>DINNER</span>
            <span style={{ ...colHeader, textAlign: 'right' }}>GUEST</span>
          </div>

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

          {/* Sponsor cards keep the group-level "+ Invite a guest to
              these seats" CTA at the bottom of the expanded body. */}
          {hasGiveable && onInviteGroup && (
            <button
              onClick={() => onInviteGroup(ticket)}
              data-testid="ticket-invite-group"
              style={{
                ...secondaryPill,
                marginTop: 10,
              }}
            >
              + Invite a guest to these seats
            </button>
          )}
        </div>
      )}

      {/* Phase 5.3 — state-aware CTA always visible (whether the card
          is collapsed or expanded). The user shouldn't have to crack
          open the seat list to know what to do next. Three states:
            missingMeals      → indigo "Select meals"
            readyToFinalize   → red "Finalize seats" + QR subtext
            isFinalized       → indigo "View ticket"
          Each only appears for sponsor cards (guest cards keep their
          header Manage pill). */}
      {(showSelectMealsCta || showFinalizeCta || showViewCta) && (
        <div
          style={{
            padding: '0 16px 14px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {showSelectMealsCta && (
            <button
              onClick={() => onSelectMeals && onSelectMeals(ticket)}
              data-testid="ticket-select-meals"
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                width: '100%',
                padding: '12px 16px',
                borderRadius: 99,
                background: 'linear-gradient(135deg,#4a7df0,#2858d6)',
                color: BRAND.navyDeep,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 0.2,
                textAlign: 'center',
              }}
            >
              Select meals
              {missingMealCount < rows.length && (
                <span style={{ opacity: 0.7, fontWeight: 600, marginLeft: 6 }}>
                  · {missingMealCount} left
                </span>
              )}
            </button>
          )}
          {showFinalizeCta && (
            <>
              <button
                onClick={() => onFinalizeFromCard && onFinalizeFromCard(ticket)}
                data-testid="ticket-finalize"
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  width: '100%',
                  padding: '16px 18px',
                  borderRadius: 14,
                  background: 'linear-gradient(135deg,#CB262C,#a01f24)',
                  color: '#fff',
                  fontSize: 17,
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  textAlign: 'center',
                  boxShadow: '0 8px 22px -10px rgba(215,40,70,0.6)',
                }}
              >
                Finalize seats
              </button>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: 'var(--mute)',
                  textAlign: 'center',
                  fontStyle: 'italic',
                }}
              >
                Send me my QR code
              </div>
            </>
          )}
          {showViewCta && onViewTicket && (
            <button
              onClick={() => onViewTicket(ticket)}
              data-testid="ticket-view"
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                width: '100%',
                padding: '12px 16px',
                borderRadius: 99,
                background: 'linear-gradient(135deg,#4a7df0,#2858d6)',
                color: BRAND.navyDeep,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 0.2,
                textAlign: 'center',
              }}
            >
              View ticket
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function SeatRow({ row, ticket, guest, onPickDinner, onInviteSeat }) {
  const isGuestRow = !!row.delegation_id;
  const seatId = row.seat_id || `${row.row_label}-${row.seat_num}`;
  const label = fmtSeat(seatId); // 'G11' from 'G-11'
  const dinner = row.dinner_choice || null;

  const guestName = isGuestRow
    ? assignmentOwner(row, ticket.delegationName || ticket.guestName)
    : null;

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
        gridTemplateColumns: '64px minmax(0,1fr) auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: `1px solid var(--rule)`,
      }}
    >
      {/* SEAT — pill */}
      <SeatPill label={label} />

      {/* DINNER — pill, tappable */}
      <DinnerPill
        dinner={dinner}
        onClick={() => onPickDinner && onPickDinner(seat)}
      />

      {/* GUEST — plain text name (guest row) OR Invite pill (sponsor row) */}
      {isGuestRow ? (
        <span style={guestNameText}>{guestName}</span>
      ) : (
        <button
          onClick={() => onInviteSeat && onInviteSeat(seat, ticket)}
          data-testid="seat-row-invite"
          style={invitePill}
        >
          + Invite
        </button>
      )}
    </div>
  );
}

function SeatPill({ label }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 12px',
        borderRadius: 99,
        background: 'rgba(168,177,255,0.12)',
        color: BRAND.indigoLight,
        border: `1px solid rgba(168,177,255,0.28)`,
        fontFamily: FONT_DISPLAY,
        fontSize: 14,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: 0.2,
        width: 'fit-content',
      }}
    >
      {label}
    </span>
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
        padding: '6px 12px 6px 8px',
        borderRadius: 99,
        background: 'rgba(255,255,255,0.05)',
        border: `1px ${has ? 'solid' : 'dashed'} rgba(255,255,255,${has ? 0.16 : 0.20})`,
        fontSize: 12,
        fontWeight: 700,
        color: has ? '#fff' : 'rgba(255,255,255,0.65)',
        width: 'fit-content',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
        {has ? DINNER_EMOJI[dinner] : '—'}
      </span>
      <span>{has ? DINNER_LABEL[dinner] : 'select dinner'}</span>
      {!has && (
        <span aria-hidden style={{ color: 'rgba(255,255,255,0.40)', fontSize: 11 }}>—</span>
      )}
    </button>
  );
}

const colHeader = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 1.4,
  color: 'rgba(255,255,255,0.50)',
  textTransform: 'uppercase',
};

const guestNameText = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ink-on-ground)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  textAlign: 'right',
  // Same font/weight as everything else in the row — no pill, no badge.
};

const invitePill = {
  all: 'unset',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 12px',
  borderRadius: 99,
  background: 'rgba(168,177,255,0.16)',
  color: BRAND.indigoLight,
  border: `1px solid rgba(168,177,255,0.32)`,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.2,
  whiteSpace: 'nowrap',
};

const primaryPill = {
  all: 'unset',
  cursor: 'pointer',
  boxSizing: 'border-box',
  padding: '8px 16px',
  borderRadius: 99,
  background: 'linear-gradient(135deg,#4a7df0,#2858d6)',
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
