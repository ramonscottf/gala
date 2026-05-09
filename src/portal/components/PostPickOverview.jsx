// PostPickOverview — V2 R11 (the post-pick state machine)
//
// Replaces the old 4-button PostPickSheet ("Assign / Hand block /
// Pick dinners / Done"). User feedback: too many options, too many
// half-states, no clear path to completion.
//
// New flow: a persistent overview screen the user keeps coming back
// to until BOTH counters hit zero. Two action buttons (Invite a
// guest / Pick meals) and a Done button that's outline-only +
// disabled until everything's done. Tap Invite → WhichSeatsPicker
// → DelegateForm → back here. Tap Pick meals → DinnerSheet → back
// here. Done unlocks → CompletionCelebration.
//
// "Hand the block to one guest" is folded into Invite (you select
// all seats in WhichSeatsPicker, which is the default state). No
// separate hand-block flow.
//
// All assignments + dinners can be changed later from the Tickets
// tab. The footnote on this screen says so explicitly.

import { useMemo } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { PosterMini } from '../Mobile.jsx';

export default function PostPickOverview({
  placed,           // { theaterId, seatIds, movieTitle, showLabel, showTime, theaterName, posterUrl }
  assignmentRows,   // current rows for the just-placed seats — drives counters
  onInvite,         // () => void — opens WhichSeatsPicker
  onPickMeals,      // () => void — opens DinnerSheet (or batch picker)
  onDone,           // () => void — fires CompletionCelebration
  finalizing,
  error,
  onClearError,
}) {
  // Just-placed seat ids
  const seatIds = placed?.seatIds || [];

  // Filter assignmentRows to only the seats we just placed
  const justPlacedRows = useMemo(() => {
    return (assignmentRows || []).filter((r) =>
      seatIds.includes(r.seat_id || `${r.row_label}-${r.seat_num}`),
    );
  }, [assignmentRows, seatIds]);

  // Counters
  const stillToAssign = useMemo(
    () => justPlacedRows.filter((r) => !r.delegation_id).length,
    [justPlacedRows],
  );
  const stillNeedMeal = useMemo(
    () => justPlacedRows.filter((r) => !r.dinner_choice).length,
    [justPlacedRows],
  );

  const allDone = stillToAssign === 0 && stillNeedMeal === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header tile: poster + showing summary */}
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
          size={48}
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
          <div style={{ marginTop: 3, fontSize: 11, color: 'var(--mute)' }}>
            {seatIds.length} seat{seatIds.length === 1 ? '' : 's'} · {placed?.theaterName}
          </div>
        </div>
      </div>

      {/* Counters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <CounterTile
          label="still to assign"
          n={stillToAssign}
          tone="indigo"
        />
        <CounterTile
          label="still need a meal"
          n={stillNeedMeal}
          tone="amber"
        />
      </div>

      {/* Action buttons */}
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

      {/* Done — outline only + greyed when not allDone, solid celebration
          when ready */}
      <DoneButton
        ready={allDone}
        finalizing={finalizing}
        onClick={onDone}
      />

      {/* Footnote */}
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

function CounterTile({ label, n, tone }) {
  const done = n === 0;
  const map = {
    indigo: {
      bg: done ? 'rgba(99,201,118,0.10)' : 'rgba(168,177,255,0.10)',
      fg: done ? '#63c976' : BRAND.indigoLight,
      br: done ? 'rgba(99,201,118,0.3)' : 'rgba(168,177,255,0.30)',
    },
    amber: {
      bg: done ? 'rgba(99,201,118,0.10)' : 'rgba(244,185,66,0.12)',
      fg: done ? '#63c976' : BRAND.gold,
      br: done ? 'rgba(99,201,118,0.3)' : 'rgba(244,185,66,0.32)',
    },
  };
  const s = map[tone] || map.indigo;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 16px',
        borderRadius: 12,
        background: s.bg,
        border: `1px solid ${s.br}`,
      }}
    >
      <span
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 28,
          fontWeight: 700,
          color: s.fg,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 32,
        }}
      >
        {done ? '✓' : n}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.85)',
          flex: 1,
        }}
      >
        {done ? `No seats ${label.replace(/^still /, '')}` : label}
      </span>
    </div>
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
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: -0.1,
          }}
        >
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
      {!disabled && (
        <span style={{ fontSize: 18, fontWeight: 800 }}>→</span>
      )}
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
