// PostPickSheet — Phase 1.9.1.
//
// Replaces the wizard's Step 4 Confirm screen. Slides up immediately
// after SeatPickSheet commits. Shows a success header for the just-
// placed seats and asks the natural next question: assign guests, pick
// dinners, or done.
//
// Mounted by the host inside <Sheet> (mobile) or <Modal> (desktop).
//
// Props:
//   placed: { theaterId, seatIds[], movieTitle, showLabel, showTime,
//             theaterName, posterUrl }
//   missingDinnerCount: number — used to pre-flag the "Pick dinners"
//     card when the just-placed seats need dinner choices
//   onAssign() — opens AssignTheseSheet
//   onPickDinners() — opens DinnerPicker scoped to placed.seatIds
//   onDone() — dismiss everything, return to overview

import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { Icon } from '../../brand/atoms.jsx';

export default function PostPickSheet({
  placed,
  missingDinnerCount = 0,
  onAssign,
  onPickDinners,
  onDone,
}) {
  if (!placed) return null;
  const N = placed.seatIds?.length || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Success header */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          padding: 14,
          borderRadius: 14,
          background: 'rgba(127,207,160,0.10)',
          border: `1px solid rgba(127,207,160,0.25)`,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 99,
            background: '#7fcfa0',
            color: BRAND.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="check" size={18} stroke={2.4} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--ink-on-ground)',
              lineHeight: 1.25,
            }}
          >
            {N} seat{N === 1 ? '' : 's'} placed in {placed.movieTitle}
            {placed.showLabel ? ` (${placed.showLabel})` : ''}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--mute)',
              marginTop: 4,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {placed.theaterName} ·{' '}
            {[...placed.seatIds]
              .sort()
              .map((s) => s.replace('-', ''))
              .join(', ')}
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 1.6,
          color: 'var(--accent-text)',
          textTransform: 'uppercase',
          marginTop: 4,
        }}
      >
        What next?
      </div>

      {/* Action cards */}
      <ActionCard
        icon="users"
        title="Assign these to guests"
        sub="Match the just-placed seats to attendees"
        onClick={onAssign}
      />
      <ActionCard
        icon="ticket"
        title="Pick dinners"
        sub={
          missingDinnerCount > 0
            ? `${missingDinnerCount} of these seats still need a meal choice`
            : `Choose meals for the seats you just placed`
        }
        onClick={onPickDinners}
        accent={missingDinnerCount > 0 ? BRAND.gold : null}
      />
      <ActionCard
        icon="check"
        title="Done — back to overview"
        sub="Return to your tickets"
        onClick={onDone}
        primary
      />
    </div>
  );
}

const ActionCard = ({ icon, title, sub, onClick, accent, primary }) => (
  <button
    onClick={onClick}
    style={{
      all: 'unset',
      cursor: 'pointer',
      padding: 14,
      borderRadius: 14,
      background: primary ? BRAND.gradient : 'rgba(255,255,255,0.04)',
      border: primary
        ? 'none'
        : `1px solid ${accent ? `${accent}55` : 'var(--rule)'}`,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      transition: 'border-color 0.15s, background 0.15s',
    }}
  >
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        background: primary
          ? 'rgba(255,255,255,0.18)'
          : accent
            ? `${accent}1f`
            : 'rgba(255,255,255,0.06)',
        color: primary ? '#fff' : accent || BRAND.indigoLight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={18} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-on-ground)' }}>{title}</div>
      <div style={{ fontSize: 11, color: primary ? 'rgba(255,255,255,0.85)' : 'var(--mute)', marginTop: 2 }}>
        {sub}
      </div>
    </div>
    <Icon name="chev" size={14} />
  </button>
);
