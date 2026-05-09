// TicketsTabV2 — V2 IA, Phase 2
//
// Replaces TicketsTab + GroupTab from V1. One screen lists every seat
// in the sponsor's block as a tappable row with a status pill on the
// right (YOURS / CONFIRMED / INVITED / OPEN). Tap a seat → SeatDetailSheet.
//
// Multi-select mode: tap "Select" in the header → checkboxes appear.
// Selected seats can be sent to ONE guest in one action (BulkAssignSheet).
//
// Lock-aware: a banner at the top reflects how close we are to dinners
// locking (T-30+ gentle / T-14 to T-7 warning / T-7 to T-1 urgent /
// after T-7 locked-green).
//
// Architecture note: V2 reads the same portal data shape as V1 (data.tickets
// + data.guestTickets + data.delegations). The pivot is purely UI — we
// flatten everything into a single seat-row list keyed by (theater_id,
// row_label, seat_num) with computed ownership state per row.

import { useMemo, useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { dinnerLabel, DINNER_OPTIONS } from './DinnerPicker.jsx';
import { DINNER_LOCK_DAYS } from './SeatDetailSheet.jsx';

const DINNER_EMOJI = {
  brisket: '🍖',
  turkey: '🥪',
  veggie: '🥗',
  kids: '🧒',
  glutenfree: '🌾',
};

function StatusPill({ kind, size = 'md' }) {
  const map = {
    yours: { bg: 'rgba(168,177,255,0.15)', fg: BRAND.indigoLight, br: 'rgba(168,177,255,0.4)', label: 'YOURS', dashed: false },
    confirmed: { bg: 'rgba(99,201,118,0.14)', fg: '#63c976', br: 'rgba(99,201,118,0.4)', label: 'CONFIRMED', dashed: false },
    invited: { bg: 'rgba(168,177,255,0.08)', fg: BRAND.indigoLight, br: 'rgba(168,177,255,0.4)', label: 'INVITED', dashed: true },
    open: { bg: 'rgba(255,255,255,0.04)', fg: 'rgba(255,255,255,0.55)', br: 'rgba(255,255,255,0.18)', label: 'OPEN', dashed: true },
  };
  const s = map[kind] || map.open;
  const fontPx = size === 'sm' ? 9 : 10;
  const padY = size === 'sm' ? 3 : 4;
  return (
    <span
      style={{
        fontSize: fontPx,
        fontWeight: 800,
        letterSpacing: 1.2,
        padding: `${padY}px 8px`,
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

// LockBanner — four states by daysOut.
function LockBanner({ daysOut, missingDinnerCount, onRemindAll, onPickForAll }) {
  if (daysOut == null) return null;

  const T = DINNER_LOCK_DAYS; // 7
  const lockDate = (() => {
    // Compute the lock date by subtracting T days from gala. We do it
    // by deriving "daysOut - 7 days from now" backwards. For display only.
    const now = new Date();
    const lock = new Date(now.getTime() + (daysOut - T) * 24 * 60 * 60 * 1000);
    return lock.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  // STATE A — locked (we're past T-7)
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
        🔒 Dinners locked. Email <a href="mailto:smiggin@dsdmail.net" style={{ color: '#63c976', textDecoration: 'underline' }}>Sherry</a> for changes.
      </div>
    );
  }

  // STATE D — urgent (T-1 to T+0 days away from lock = daysOut between T+1 and T+2)
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

  // STATE C — warning (T+3 to T+7)
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
          {missingDinnerCount > 0 && ` · ${missingDinnerCount} guest${missingDinnerCount === 1 ? '' : 's'} still picking`}
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

  // STATE B — gentle (T+8 onward, i.e. more than a week before lock)
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

// SeatRow — one tappable row. Variants:
//   - Normal mode: tap → opens SeatDetailSheet
//   - Select mode: tap → toggles selection
function SeatRow({
  seat,
  daysOut,
  selectMode,
  selected,
  urgentDinner,
  onTap,
}) {
  const dinnerStr = seat.dinner_choice
    ? `${DINNER_EMOJI[seat.dinner_choice] || '🍽️'} ${dinnerLabel(seat.dinner_choice)}`
    : null;

  const seatBg = selected
    ? 'rgba(168,177,255,0.16)'
    : urgentDinner === 'critical'
      ? 'rgba(215,40,70,0.05)'
      : urgentDinner === 'warn'
        ? 'rgba(244,185,66,0.04)'
        : 'rgba(255,255,255,0.03)';
  const seatBr = selected
    ? BRAND.indigoLight
    : urgentDinner === 'critical'
      ? 'rgba(215,40,70,0.45)'
      : urgentDinner === 'warn'
        ? 'rgba(244,185,66,0.35)'
        : 'rgba(255,255,255,0.08)';
  const seatNumBg = urgentDinner === 'critical'
    ? 'rgba(215,40,70,0.18)'
    : urgentDinner === 'warn'
      ? 'rgba(244,185,66,0.18)'
      : 'rgba(168,177,255,0.16)';
  const seatNumColor = urgentDinner === 'critical'
    ? '#ff8da4'
    : urgentDinner === 'warn'
      ? BRAND.gold
      : BRAND.indigoLight;

  return (
    <button
      onClick={() => onTap?.(seat)}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        width: '100%',
        background: seatBg,
        border: `1px solid ${seatBr}`,
        borderRadius: 12,
        padding: '11px 13px',
        marginBottom: 6,
        display: 'grid',
        gridTemplateColumns: selectMode ? '24px 46px 1fr auto' : '46px 1fr auto',
        gap: 12,
        alignItems: 'center',
        transition: 'background .15s, border-color .15s',
      }}
    >
      {selectMode && (
        <div
          aria-hidden="true"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: selected ? BRAND.indigoLight : 'transparent',
            border: `1.5px solid ${selected ? BRAND.indigoLight : 'rgba(255,255,255,0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: BRAND.navyDeep,
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          {selected ? '✓' : ''}
        </div>
      )}
      <div
        style={{
          background: seatNumBg,
          color: seatNumColor,
          fontSize: 12,
          fontWeight: 800,
          padding: '7px 0',
          borderRadius: 7,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {seat.row_label}{seat.seat_num}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: seat.ownerKind === 'open' ? 'rgba(255,255,255,0.45)' : 'var(--ink-on-ground)',
            fontStyle: seat.ownerKind === 'open' ? 'italic' : 'normal',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {seat.ownerKind === 'yours' ? 'You'
            : seat.ownerKind === 'open' ? 'No one yet'
            : seat.ownerName || 'Guest'}
        </div>
        <div
          style={{
            fontSize: 11,
            marginTop: 2,
            color: urgentDinner === 'critical'
              ? '#ff8da4'
              : urgentDinner === 'warn'
                ? BRAND.gold
                : 'var(--mute)',
            fontWeight: urgentDinner ? 600 : 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {dinnerStr ||
            (seat.ownerKind === 'open' ? 'Tap to assign'
              : urgentDinner === 'critical' ? '🚨 PICK NOW or kitchen sets brisket'
              : urgentDinner === 'warn' ? '⚠️ No dinner — pick or remind'
              : 'No dinner picked yet')}
        </div>
      </div>
      <StatusPill kind={seat.ownerKind} size="sm" />
    </button>
  );
}

// Build the flat seat list from portal data. Returns:
//   [{ key, theater_id, row_label, seat_num, ownerKind, ownerName, ...
//      delegation_id, delegation_token, dinner_choice, showing }]
function buildSeatList(data) {
  const tickets = data?.tickets || [];
  const guestTickets = data?.guestTickets || [];
  const delegationsById = Object.fromEntries(
    (data?.delegations || []).map((d) => [d.id, d])
  );

  const out = [];

  // Sponsor's own + holds (ownerKind: 'yours')
  for (const t of tickets) {
    const showing = {
      label: t.showLabel || '',
      movieTitle: t.movieTitle || '',
      movieShort: t.movieShort || '',
      theaterName: t.theaterName || `Theater ${t.theaterId}`,
      theaterId: t.theaterId,
      showingNumber: t.showingNumber,
    };
    for (const row of (t.assignmentRows || [])) {
      // V1's per-row managedBySponsor === false flags delegate-owned
      // seats; in V2 we treat those as the guest's row (they show up
      // in guestTickets too — but tickets carries them when the
      // sponsor's myAssignments query happens to include them, which
      // it doesn't in current API for sponsors). For safety we still
      // skip delegate-owned rows here so they're not double-counted.
      if (row.managedBySponsor === false) continue;
      out.push({
        key: `${row.theater_id}-${row.row_label}-${row.seat_num}`,
        theater_id: row.theater_id,
        row_label: row.row_label,
        seat_num: row.seat_num,
        ownerKind: 'yours',
        ownerName: 'You',
        ownerPhone: null,
        ownerEmail: null,
        delegation_id: null,
        delegation_token: null,
        dinner_choice: row.dinner_choice || null,
        status: row.status || 'claimed',
        showing,
      });
    }
  }

  // Guest seats (ownerKind: 'confirmed' if delegation has activity, else 'invited')
  for (const t of guestTickets) {
    const showing = {
      label: t.showLabel || '',
      movieTitle: t.movieTitle || '',
      movieShort: t.movieShort || '',
      theaterName: t.theaterName || `Theater ${t.theaterId}`,
      theaterId: t.theaterId,
      showingNumber: t.showingNumber,
    };
    for (const row of (t.assignmentRows || [])) {
      const deleg = delegationsById[row.delegation_id];
      // If delegation status is 'pending' (no portal access yet) the
      // delegate hasn't taken any action — but they DID place these
      // seats, which means the status on the delegation should
      // already be 'active' or 'finalized'. If somehow it's still
      // pending, treat as 'invited' rather than 'confirmed'.
      const ownerKind = deleg?.status === 'pending' ? 'invited' : 'confirmed';
      out.push({
        key: `${row.theater_id}-${row.row_label}-${row.seat_num}`,
        theater_id: row.theater_id,
        row_label: row.row_label,
        seat_num: row.seat_num,
        ownerKind,
        ownerName: row.delegationName || row.ownerName || deleg?.delegateName || 'Guest',
        ownerPhone: deleg?.phone || null,
        ownerEmail: deleg?.email || null,
        delegation_id: row.delegation_id,
        delegation_token: deleg?.token || null,
        dinner_choice: row.dinner_choice || null,
        status: 'claimed',
        showing,
      });
    }
  }

  // Sort: by showing number, then by row, then by seat
  out.sort((a, b) => {
    const sa = a.showing?.showingNumber || 0;
    const sb = b.showing?.showingNumber || 0;
    if (sa !== sb) return sa - sb;
    const ra = a.row_label || '';
    const rb = b.row_label || '';
    if (ra !== rb) return ra.localeCompare(rb);
    return Number(a.seat_num) - Number(b.seat_num);
  });

  return out;
}

// Group seats by showing for section dividers
function groupByShowing(seats) {
  const groups = new Map();
  for (const s of seats) {
    const key = `${s.theater_id}-${s.showing?.showingNumber || 0}`;
    if (!groups.has(key)) {
      groups.set(key, { ...s.showing, seats: [] });
    }
    groups.get(key).seats.push(s);
  }
  return [...groups.values()];
}

// Compute urgency tier for a missing-dinner seat:
//   'critical' if daysOut <= T+2 (lock tomorrow / day-of)
//   'warn' if daysOut <= T+7 (last 2 weeks before lock)
//   null otherwise (>2 weeks from lock OR dinner is set)
function dinnerUrgency(seat, daysOut) {
  if (seat.dinner_choice) return null;
  if (seat.ownerKind === 'open') return null; // No assignee = no missing dinner
  if (daysOut == null) return null;
  if (daysOut <= DINNER_LOCK_DAYS + 2) return 'critical';
  if (daysOut <= DINNER_LOCK_DAYS + 7) return 'warn';
  return null;
}

export default function TicketsTabV2({
  data,
  daysOut,
  token,
  apiBase,
  onRefresh,
  onOpenSeat,
  onPlaceSeats,
  onMultiSelectAssign, // (seats[]) => void — opens BulkAssignSheet
  onTextMyseats,
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());

  const seats = useMemo(() => buildSeatList(data), [data]);
  const showings = useMemo(() => groupByShowing(seats), [seats]);

  const counts = useMemo(() => {
    let yours = 0, confirmed = 0, invited = 0, open = 0;
    for (const s of seats) {
      if (s.ownerKind === 'yours') yours++;
      else if (s.ownerKind === 'confirmed') confirmed++;
      else if (s.ownerKind === 'invited') invited++;
      else open++;
    }
    return { yours, confirmed, invited, open, totalGuestSeats: confirmed + invited };
  }, [seats]);

  const missingDinnerCount = useMemo(
    () => seats.filter((s) => !s.dinner_choice && s.ownerKind !== 'open').length,
    [seats]
  );

  const blockSize = data?.blockSize || 0;
  const stillOpen = Math.max(0, blockSize - seats.length);

  const toggleSelected = (seat) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(seat.key)) next.delete(seat.key);
      else next.add(seat.key);
      return next;
    });
  };

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelectedKeys(new Set());
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedKeys(new Set());
  };

  const sendSelected = () => {
    const selectedSeats = seats.filter((s) => selectedKeys.has(s.key));
    if (selectedSeats.length === 0) return;
    onMultiSelectAssign?.(selectedSeats);
  };

  const handleTap = (seat) => {
    if (selectMode) toggleSelected(seat);
    else onOpenSeat?.(seat);
  };

  // Bulk reminders — fires remind_dinners on every delegation that has a
  // missing-dinner seat. Server already deduplicates per-delegation.
  const remindAll = async () => {
    const delegationsToRemind = [
      ...new Set(
        seats
          .filter((s) => !s.dinner_choice && s.delegation_id)
          .map((s) => s.delegation_id)
      ),
    ];
    if (delegationsToRemind.length === 0) return;
    await Promise.allSettled(
      delegationsToRemind.map((delegation_id) =>
        fetch(`${apiBase || ''}/api/gala/portal/${token}/delegate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remind_dinners', delegation_id }),
        })
      )
    );
    if (onRefresh) await onRefresh();
  };

  // Pick-for-all — opens a placeholder dialog. Phase 2.1 will replace
  // this with a sheet listing every undecided seat with dinner chips.
  // For now, alert the host that they can tap each red row to fill in.
  const pickForAll = () => {
    alert(`${missingDinnerCount} seats still need dinners. Tap any red row to pick — the kitchen will default to brisket if you don't.`);
  };

  return (
    <div className="scroll-container" style={{ flex: 1, paddingBottom: 130 }}>
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 12px) 18px 0' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 12,
          }}
        >
          <div>
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
                fontSize: 32,
                fontWeight: 700,
                margin: '0 0 4px',
                letterSpacing: -0.6,
                lineHeight: 1,
              }}
            >
              All <i style={{ color: 'var(--accent-italic)', fontWeight: 500 }}>{blockSize} seats.</i>
            </h1>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>
              {counts.yours} yours · {counts.totalGuestSeats} to guests · {stillOpen} still open
            </div>
          </div>
          {!selectMode && onTextMyseats && counts.yours > 0 && (
            <button
              onClick={onTextMyseats}
              title="Text my seats to me"
              style={{
                all: 'unset',
                cursor: 'pointer',
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${BRAND.rule}`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
              }}
            >
              📩
            </button>
          )}
        </div>

        <LockBanner
          daysOut={daysOut}
          missingDinnerCount={missingDinnerCount}
          onRemindAll={remindAll}
          onPickForAll={pickForAll}
        />

        {/* Select-mode toggle row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {!selectMode ? (
            <>
              <button
                onClick={enterSelectMode}
                disabled={seats.length === 0}
                style={{
                  all: 'unset',
                  cursor: seats.length === 0 ? 'not-allowed' : 'pointer',
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 99,
                  background: 'rgba(168,177,255,0.08)',
                  border: `1px solid rgba(168,177,255,0.25)`,
                  color: BRAND.indigoLight,
                  fontSize: 12,
                  fontWeight: 700,
                  textAlign: 'center',
                  opacity: seats.length === 0 ? 0.4 : 1,
                }}
              >
                ☑ Select multiple
              </button>
              {stillOpen > 0 && onPlaceSeats && (
                <button
                  onClick={onPlaceSeats}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 99,
                    background: 'rgba(215,40,70,0.10)',
                    border: `1px solid rgba(215,40,70,0.35)`,
                    color: BRAND.red,
                    fontSize: 12,
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                >
                  + Place {stillOpen} more
                </button>
              )}
            </>
          ) : (
            <>
              <div
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 99,
                  background: 'rgba(168,177,255,0.10)',
                  color: BRAND.indigoLight,
                  fontSize: 12,
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                {selectedKeys.size} selected
              </div>
              <button
                onClick={exitSelectMode}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '8px 16px',
                  borderRadius: 99,
                  background: 'transparent',
                  border: `1px solid ${BRAND.rule}`,
                  color: 'var(--ink-on-ground)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>

      {/* Per-showing sections */}
      <div style={{ padding: '0 18px' }}>
        {showings.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
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
        ) : (
          showings.map((g, i) => (
            <div key={i}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 1.4,
                  color: 'var(--mute)',
                  padding: i === 0 ? '0 0 8px' : '14px 0 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ flex: 1, height: 1, background: BRAND.rule }} />
                <span>
                  {g.label?.toUpperCase()} · {g.movieShort?.toUpperCase()} · {g.theaterName}
                </span>
                <span style={{ flex: 1, height: 1, background: BRAND.rule }} />
              </div>
              {g.seats.map((s) => (
                <SeatRow
                  key={s.key}
                  seat={s}
                  daysOut={daysOut}
                  selectMode={selectMode}
                  selected={selectedKeys.has(s.key)}
                  urgentDinner={dinnerUrgency(s, daysOut)}
                  onTap={handleTap}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Sticky bottom action bar — appears when seats are selected */}
      {selectMode && selectedKeys.size > 0 && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 80, // sit above the tab bar
            zIndex: 15,
            padding: '0 18px',
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <button
            onClick={sendSelected}
            style={{
              all: 'unset',
              cursor: 'pointer',
              pointerEvents: 'auto',
              maxWidth: 380,
              width: '100%',
              boxSizing: 'border-box',
              padding: '14px 22px',
              borderRadius: 99,
              background: 'linear-gradient(135deg,#a8b1ff,#6f75d8)',
              color: BRAND.navyDeep,
              fontSize: 14,
              fontWeight: 800,
              textAlign: 'center',
              boxShadow: '0 12px 28px -10px rgba(168,177,255,0.5), 0 0 0 1px rgba(255,255,255,0.1) inset',
            }}
          >
            Send {selectedKeys.size} seat{selectedKeys.size === 1 ? '' : 's'} to a guest →
          </button>
        </div>
      )}
    </div>
  );
}
