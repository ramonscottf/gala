// CompletionCelebration — V2 R12 (Phase 5.13 — primary Done + invite CTA)
//
// Shown when the user hits "Done" on the dinner picker after the
// seat-pick → meals flow finishes. Same TicketDetailSheet poster /
// QR / per-seat detail, but with:
//   - Celebration eyebrow banner at the top
//   - Primary "Done" button (closes the sheet)
//   - Hollow secondary "Want to invite a guest to join you?"
//     button below — opens DelegateForm scoped to the just-placed
//     seats so the sponsor can hand any/all of them to a guest
//     without backing out and starting over.
//
// Why both: Kara feedback was that invite should happen AFTER seat
// + meal commit, not alongside it. Most sponsors will tap Done; the
// invite path is the warm follow-up offer, not the front door.

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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Celebration banner */}
      <div
        style={{
          position: 'relative',
          padding: '20px 18px',
          borderRadius: 16,
          background:
            'linear-gradient(135deg, rgba(127,207,160,0.18), rgba(168,177,255,0.18))',
          border: `1px solid rgba(127,207,160,0.28)`,
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            fontSize: 32,
            lineHeight: 1,
            marginBottom: 6,
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
          }}
        >
          You're all set
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--ink-on-ground)',
            marginTop: 4,
            letterSpacing: -0.3,
            lineHeight: 1.15,
          }}
        >
          See you on June&nbsp;10
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.78)',
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          Doors open at 4:00&nbsp;PM. Dinner at 4:00, movie at 4:30.
          <br />
          Your ticket is below — save it to your phone or just open this
          page when you arrive.
        </div>
      </div>

      {/* The actual ticket */}
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
    </div>
  );
}
