// PostPickOverview — V2 R12 (counters folded into the showing card)
//
// User feedback: "It should just be 3/3 then the two buttons. The
// 3/3 2/3 etc should be in the movie pill on the left side in
// yellow then the two buttons."
//
// Changes from R11:
//   - The two big counter tiles are GONE. Counter info now lives
//     inside the showing card on the left (yellow gold pills below
//     the seat count).
//   - The Invite/Pick meals buttons get the room. They're the
//     primary visual, not the counters.
//   - Done button still appears below, still greyed out until both
//     counters hit zero.
//
// The counter pills inside the showing card are tiny gold tracked
// "3/3 ASSIGN" / "3/3 MEAL" badges. They tick down as the user
// completes each action and turn green ✓ when zero.

import { useMemo } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { PosterMini } from '../Portal.jsx';

export default function PostPickOverview({
  placed,
  assignmentRows,
  onInvite,
  onPickMeals,
  onDone,
  finalizing,
  error,
  onClearError,
}) {
  const seatIds = placed?.seatIds || [];

  const justPlacedRows = useMemo(() => {
    return (assignmentRows || []).filter((r) =>
      seatIds.includes(r.seat_id || `${r.row_label}-${r.seat_num}`),
    );
  }, [assignmentRows, seatIds]);

  const stillToAssign = useMemo(
    () => justPlacedRows.filter((r) => !r.delegation_id).length,
    [justPlacedRows],
  );
  const stillNeedMeal = useMemo(
    () => justPlacedRows.filter((r) => !r.dinner_choice).length,
    [justPlacedRows],
  );

  const total = seatIds.length;
  const assigned = total - stillToAssign;
  const mealed = total - stillNeedMeal;
  const allDone = stillToAssign === 0 && stillNeedMeal === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Showing card with counter pills inside — left column has the
          poster, right column has the showing details + 2 small
          counter pills stacked at the bottom. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0,1fr)',
          gap: 12,
          alignItems: 'center',
          padding: 14,
          borderRadius: 14,
          background: 'var(--surface)',
          border: `1px solid var(--rule)`,
        }}
      >
        <PosterMini
          poster={placed?.posterUrl}
          color={placed?.color}
          label={placed?.movieTitle?.split(' ')[0]}
          size={56}
          showLabel={false}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: 1.5,
              color: 'var(--accent-text)',
              textTransform: 'uppercase',
            }}
          >
            {placed?.showLabel || 'Showing'} · {placed?.showTime}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--ink-on-ground)',
              letterSpacing: -0.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {placed?.movieTitle}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 11,
              color: 'var(--mute)',
            }}
          >
            {total} seat{total === 1 ? '' : 's'} · {placed?.theaterName}
          </div>
          {/* Counter pills inline below the meta row */}
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <CounterPill
              label="ASSIGN"
              done={assigned}
              total={total}
            />
            <CounterPill
              label="MEAL"
              done={mealed}
              total={total}
            />
          </div>
        </div>
      </div>

      {/* The two action buttons — primary visual now */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ActionButton
          label="Invite a guest"
          subtext={
            stillToAssign > 0
              ? `${stillToAssign} seat${stillToAssign === 1 ? '' : 's'} to assign`
              : 'All seats assigned ✓'
          }
          tone="indigo"
          disabled={stillToAssign === 0}
          onClick={onInvite}
        />
        <ActionButton
          label="Pick meals"
          subtext={
            stillNeedMeal > 0
              ? `${stillNeedMeal} seat${stillNeedMeal === 1 ? '' : 's'} need a meal`
              : 'All meals picked ✓'
          }
          tone="amber"
          disabled={stillNeedMeal === 0}
          onClick={onPickMeals}
        />
      </div>

      <DoneButton
        ready={allDone}
        finalizing={finalizing}
        onClick={onDone}
      />

      <div
        style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.55)',
          textAlign: 'center',
          fontStyle: 'italic',
          lineHeight: 1.5,
          marginTop: -4,
        }}
      >
        All assignments and meals can be changed later from the Tickets tab.
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'rgba(212,38,74,0.12)',
            border: `1px solid rgba(212,38,74,0.4)`,
            color: '#ff8da4',
            fontSize: 12,
          }}
          onClick={onClearError}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function CounterPill({ label, done, total }) {
  const complete = done >= total;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 99,
        background: complete
          ? 'rgba(99,201,118,0.12)'
          : 'rgba(244,185,66,0.12)',
        border: `1px solid ${complete ? 'rgba(99,201,118,0.30)' : 'rgba(244,185,66,0.32)'}`,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 1.2,
        color: complete ? '#7fcfa0' : BRAND.gold,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span>{complete ? '✓' : `${done}/${total}`}</span>
      <span>{label}</span>
    </span>
  );
}

function ActionButton({ label, subtext, tone, disabled, onClick }) {
  const map = {
    indigo: {
      bg: 'linear-gradient(135deg,#a8b1ff,#6f75d8)',
      fg: BRAND.navyDeep,
    },
    amber: {
      bg: 'linear-gradient(135deg,#f4b942,#c98517)',
      fg: BRAND.navyDeep,
    },
  };
  const s = map[tone] || map.indigo;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        all: 'unset',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxSizing: 'border-box',
        width: '100%',
        padding: '14px 18px',
        borderRadius: 14,
        background: disabled ? 'rgba(255,255,255,0.04)' : s.bg,
        color: disabled ? 'rgba(255,255,255,0.5)' : s.fg,
        border: disabled ? `1px solid var(--rule)` : 'none',
        opacity: disabled ? 0.65 : 1,
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.1 }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            opacity: 0.78,
            marginTop: 2,
          }}
        >
          {subtext}
        </div>
      </div>
      {!disabled && <span style={{ fontSize: 18, fontWeight: 800 }}>→</span>}
    </button>
  );
}

function DoneButton({ ready, finalizing, onClick }) {
  if (!ready) {
    return (
      <button
        disabled
        style={{
          all: 'unset',
          boxSizing: 'border-box',
          width: '100%',
          padding: '14px 18px',
          borderRadius: 14,
          background: 'transparent',
          border: `1.5px dashed rgba(255,255,255,0.18)`,
          color: 'rgba(255,255,255,0.45)',
          cursor: 'not-allowed',
          textAlign: 'center',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        Invite guests or pick meals to finish
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={finalizing}
      style={{
        all: 'unset',
        cursor: finalizing ? 'not-allowed' : 'pointer',
        boxSizing: 'border-box',
        width: '100%',
        padding: '14px 18px',
        borderRadius: 14,
        background: finalizing
          ? 'rgba(99,201,118,0.18)'
          : 'linear-gradient(135deg,#7fcfa0,#3fa86c)',
        color: '#fff',
        textAlign: 'center',
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: 0.3,
        opacity: finalizing ? 0.7 : 1,
      }}
    >
      {finalizing ? 'Finalizing…' : 'Done — all set ✓'}
    </button>
  );
}
