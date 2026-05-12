// CompletionCelebration — V2 R13 (Phase 5.14 — real popup, correct times)
//
// Shown when the user hits "Done" on the dinner picker after the
// seat-pick → meals flow finishes. The "You're all set / See you on
// June 10" greeting is now a real modal popup overlay (dismissible
// via X, click-outside, ESC, or "Got it") instead of an inline
// banner stacked on top of the ticket.
//
// V2 R12 → R13 changelog:
//   - "Doors open at 4:00 PM. Dinner at 4:00, movie at 4:30." was
//     HARDCODED to early-showing times. Now uses ticket.dinnerTime
//     and ticket.showTime so late showings (Aud 6/7/8/10) read
//     correctly. Same fix family as the May 11 2026 Tanner Clinic
//     showing_number incident — early-showing data leaking into
//     late-showing surfaces.
//   - Banner promoted to fixed-position modal overlay (matches the
//     FlowError modal pattern). Pops once on mount. Click outside,
//     X button, ESC, or "Got it" dismisses to reveal the ticket
//     cleanly. Mobile + desktop behave the same way.
//
// Below the modal: same TicketDetailSheet (poster / QR / per-seat
// detail), Done button, and the secondary "Want to invite a guest"
// CTA from R12.

import { useState, useEffect } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import TicketDetailSheet from './TicketDetailSheet.jsx';

export default function CompletionCelebration({
  ticket,
  daysOut,
  token,
  apiBase,
  onClose,
  onPickDinner,
  onInviteSeat,
  onManageGuest,
  onInviteGroup,
}) {
  const [showWelcome, setShowWelcome] = useState(true);

  // Build the showtime line from the actual ticket. Falls back to
  // generic copy if for some reason times aren't on the ticket yet.
  const dinnerTime = ticket?.dinnerTime || null;
  const showTime = ticket?.showTime || null;
  const showtimeLine = (() => {
    if (dinnerTime && showTime) {
      return `Dinner at ${dinnerTime}, movie at ${showTime}.`;
    }
    if (showTime) {
      return `Movie at ${showTime}.`;
    }
    return 'Check your ticket below for showtimes.';
  })();

  // ESC to close the welcome modal
  useEffect(() => {
    if (!showWelcome) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setShowWelcome(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showWelcome]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* The ticket renders normally — no shove-on-top */}
      <TicketDetailSheet
        ticket={ticket}
        daysOut={daysOut}
        token={token}
        apiBase={apiBase}
        onPickDinner={onPickDinner}
        onInviteSeat={onInviteSeat}
        onManageGuest={onManageGuest}
        onClose={onClose}
      />

      {/* Thank-you footer */}
      <div
        style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.65)',
          textAlign: 'center',
          fontStyle: 'italic',
          lineHeight: 1.5,
          marginTop: -4,
        }}
      >
        Thank you for supporting Davis Education Foundation 🧡
      </div>

      <button
        type="button"
        onClick={onClose}
        style={{
          all: 'unset',
          cursor: 'pointer',
          boxSizing: 'border-box',
          width: '100%',
          padding: '14px 18px',
          borderRadius: 14,
          background: 'linear-gradient(135deg,#7fcfa0,#3fa86c)',
          color: '#fff',
          textAlign: 'center',
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 0.3,
        }}
      >
        Done
      </button>

      {typeof onInviteGroup === 'function' && (
        <button
          type="button"
          onClick={() => onInviteGroup(ticket)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            width: '100%',
            padding: '12px 18px',
            borderRadius: 99,
            background: 'transparent',
            border: `1.5px solid rgba(255,255,255,0.25)`,
            color: 'var(--ink-on-ground)',
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 600,
            marginTop: -4,
          }}
        >
          Want to invite a guest to join you?
        </button>
      )}

      {/* Welcome popup — fixed-position overlay, dismissible.
          Renders only when showWelcome is true; ticket sits below
          and is fully revealed once dismissed. Same pattern as
          FlowError modal. */}
      {showWelcome && (
        <WelcomeModal
          showtimeLine={showtimeLine}
          onDismiss={() => setShowWelcome(false)}
        />
      )}
    </div>
  );
}

function WelcomeModal({ showtimeLine, onDismiss }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      aria-describedby="welcome-modal-body"
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.62)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        // Above Sheet (z=50). FlowError (z=200) won't fire during a
        // happy-path completion, but we sit at 220 to be safe.
        zIndex: 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'flow-error-fade-in 0.18s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 380,
          background: BRAND.navyDeep,
          color: '#fff',
          borderRadius: 18,
          border: `1px solid rgba(127,207,160,0.32)`,
          boxShadow:
            '0 24px 48px -16px rgba(0,0,0,0.6), 0 8px 16px -10px rgba(0,0,0,0.5)',
          padding: '24px 22px 20px',
          textAlign: 'center',
          animation:
            'flow-error-scale-in 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        }}
      >
        {/* Close X */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          style={{
            all: 'unset',
            cursor: 'pointer',
            position: 'absolute',
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: 99,
            background: 'rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: 99,
            background:
              'linear-gradient(135deg, rgba(127,207,160,0.28), rgba(168,177,255,0.20))',
            border: `1px solid rgba(127,207,160,0.35)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
            fontSize: 28,
          }}
        >
          🎬
        </div>

        <div
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: 1.6,
            color: '#7fcfa0',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          You're all set
        </div>

        <div
          id="welcome-modal-title"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: -0.3,
            lineHeight: 1.1,
            color: '#fff',
            marginBottom: 12,
          }}
        >
          See you on June&nbsp;10
        </div>

        <div
          id="welcome-modal-body"
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: 'rgba(255,255,255,0.85)',
            marginBottom: 20,
          }}
        >
          {showtimeLine}
          <br />
          Your ticket is just behind this — save it to your phone or
          open this page when you arrive.
        </div>

        <button
          type="button"
          onClick={onDismiss}
          autoFocus
          style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            width: '100%',
            padding: '12px 18px',
            borderRadius: 12,
            background: 'linear-gradient(135deg,#7fcfa0,#3fa86c)',
            color: '#fff',
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: 0.3,
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
