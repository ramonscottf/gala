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
//   canFinalize: boolean — when true, the third card switches into
//     "send my QR" mode and clicking it fires onFinalize instead of
//     onDone. The host computes canFinalize from portal state (all
//     entitled seats placed). Server-side /finalize is permissive
//     (only requires >= 1 placed seat) so dinners are NOT part of the
//     gate; sponsors can pick dinners later via the dinner picker.
//   onFinalize() — POSTs /finalize via the useFinalize hook. Required
//     when canFinalize is true; ignored otherwise.
//   finalizing: boolean — true while /finalize is in flight. Disables
//     the Done card and swaps its title to "Sending your QR…" so the
//     user has feedback during the 1-3s server round-trip (Twilio +
//     email run synchronously inside the request handler).
//   error: Error | null — if /finalize failed, render the message above
//     the action cards so the user can retry instead of staring at a
//     silently-stalled sheet.
//   onClearError() — dismiss the error banner.

import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { Icon } from '../../brand/atoms.jsx';

export default function PostPickSheet({
  placed,
  missingDinnerCount = 0,
  onAssign,
  onPickDinners,
  onDone,
  canFinalize = false,
  onFinalize = null,
  finalizing = false,
  error = null,
  onClearError = null,
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

      {error && (
        <div
          role="alert"
          data-testid="post-pick-error"
          style={{
            padding: 12,
            borderRadius: 12,
            background: 'rgba(255,111,134,0.10)',
            border: `1px solid ${BRAND.red}55`,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.red }}>
              Couldn't send your QR
            </div>
            <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
              {error.message || String(error)}. Try again — your seats are safe.
            </div>
          </div>
          {onClearError && (
            <button
              onClick={onClearError}
              aria-label="Dismiss error"
              style={{
                all: 'unset',
                cursor: 'pointer',
                color: 'var(--mute)',
                fontSize: 16,
                padding: 4,
              }}
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Action cards */}
      <ActionCard
        icon="users"
        title="Assign these to guests"
        sub="Match the just-placed seats to attendees"
        onClick={onAssign}
        disabled={finalizing}
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
        disabled={finalizing}
      />
      <ActionCard
        icon="check"
        title={
          finalizing
            ? 'Sending your QR…'
            : canFinalize
              ? "I'm done — send my QR"
              : 'Done — back to overview'
        }
        sub={
          finalizing
            ? 'Please wait — texting and emailing now'
            : canFinalize
              ? "We'll email and text your QR code"
              : 'Return to your tickets'
        }
        onClick={canFinalize && onFinalize ? onFinalize : onDone}
        primary
        testId="post-pick-done"
        disabled={finalizing}
      />
    </div>
  );
}

const ActionCard = ({ icon, title, sub, onClick, accent, primary, testId, disabled }) => (
  <button
    onClick={disabled ? undefined : onClick}
    data-testid={testId}
    disabled={disabled}
    aria-busy={disabled || undefined}
    style={{
      all: 'unset',
      cursor: disabled ? 'wait' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      padding: 14,
      borderRadius: 14,
      background: primary ? BRAND.gradient : 'rgba(255,255,255,0.04)',
      border: primary
        ? 'none'
        : `1px solid ${accent ? `${accent}55` : 'var(--rule)'}`,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      transition: 'border-color 0.15s, background 0.15s, opacity 0.15s',
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
