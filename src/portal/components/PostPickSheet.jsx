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

import { TOKENS, FONT_DISPLAY, FONT_MONO } from '../../brand/tokens.js';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Success header */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          padding: 16,
          borderRadius: TOKENS.radius.lg,
          background: TOKENS.surface.card,
          border: `1px solid ${TOKENS.rule}`,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: TOKENS.radius.sm,
            background: TOKENS.fill.secondary,
            color: TOKENS.semantic.success,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="check" size={16} stroke={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 15,
              fontWeight: 600,
              color: TOKENS.text.primary,
              lineHeight: 1.3,
              letterSpacing: '-0.01em',
            }}
          >
            <span style={{ fontFamily: FONT_MONO, fontWeight: 600 }}>{N}</span> seat
            {N === 1 ? '' : 's'} placed
          </div>
          <div
            style={{
              fontSize: 12,
              color: TOKENS.text.secondary,
              marginTop: 2,
            }}
          >
            {placed.movieTitle}
            {placed.showLabel ? ` · ${placed.showLabel}` : ''}
          </div>
          <div
            style={{
              fontSize: 12,
              color: TOKENS.text.primary,
              marginTop: 8,
              fontFamily: FONT_MONO,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.01em',
            }}
          >
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
          fontWeight: 600,
          letterSpacing: 0.5,
          color: TOKENS.text.tertiary,
          textTransform: 'uppercase',
          marginTop: 12,
          marginBottom: 4,
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
        flag={missingDinnerCount > 0}
      />
      <ActionCard
        icon="check"
        title="Done"
        sub="Return to your tickets"
        onClick={onDone}
        primary
      />
    </div>
  );
}

const ActionCard = ({ icon, title, sub, onClick, flag, primary }) => (
  <button
    onClick={onClick}
    style={{
      all: 'unset',
      cursor: 'pointer',
      padding: 14,
      borderRadius: TOKENS.radius.lg,
      background: primary ? TOKENS.brand.red : TOKENS.surface.card,
      border: primary
        ? 'none'
        : `1px solid ${flag ? TOKENS.brand.red : TOKENS.rule}`,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      boxShadow: primary ? TOKENS.shadow.button : 'none',
    }}
  >
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: TOKENS.radius.sm,
        background: primary ? 'rgba(255,255,255,0.16)' : TOKENS.fill.secondary,
        color: primary ? TOKENS.text.onBrand : TOKENS.text.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={16} stroke={1.8} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: primary ? TOKENS.text.onBrand : TOKENS.text.primary,
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: primary ? TOKENS.text.onBrandSecondary : TOKENS.text.secondary,
          marginTop: 2,
        }}
      >
        {sub}
      </div>
    </div>
    <span style={{ color: primary ? TOKENS.text.onBrandSecondary : TOKENS.text.tertiary }}>
      <Icon name="chev" size={14} />
    </span>
  </button>
);
