// Finalize.jsx — v2 confirmation surface (parity with v1
// ConfirmationScreen.jsx + TicketQrCard, Portal.jsx:779).
//
// P0.1: before this, v2 imported useFinalize but never called it, so
// sponsors who placed seats never received the confirmation email /
// SMS / QR. This file provides:
//   - FinalizeBanner: persistent "I'm done — send my confirmation" CTA
//   - ConfirmationView: full-screen post-finalize confirmation w/ QR
//   - TicketQrCardV2 (P1.2): persistent QR once already finalized
//
// Server contract mirrored client-side: /finalize requires every
// placed seat to have a dinner_choice (else 400 meals_required), so
// we block the POST and point the user at meals when any are missing.

function deliveryCopy(emailSent, smsSent) {
  if (emailSent && smsSent) return 'emailed and texted';
  if (emailSent) return 'emailed';
  if (smsSent) return 'texted';
  return 'saved';
}

export function checkInUrlFor(token) {
  return `https://gala.daviskids.org/checkin?t=${encodeURIComponent(token || '')}`;
}

export function qrSrcFor(token, apiBase = '', size = 240) {
  return `${apiBase}/api/gala/qr?t=${encodeURIComponent(token || '')}&size=${size}`;
}

// Persistent CTA shown when the sponsor has placed seats but has not
// yet finalized. Lives in the home shell flow (not fixed) so it
// scrolls naturally like every other v2 section.
export function FinalizeBanner({ placed, missingDinner, busy, error, onFinalize }) {
  const blocked = missingDinner > 0;
  return (
    <section className="p2-section tight">
      <div className="p2-card stripped p2-finalize">
        <div className="p2-card-body">
          <div className="p2-finalize-row">
            <div className="p2-finalize-copy">
              <div className="p2-eyebrow">Almost there</div>
              <h2>
                Send my <span className="p2-italic-flair">confirmation</span>.
              </h2>
              <p>
                {blocked ? (
                  <>
                    {missingDinner} seat{missingDinner === 1 ? '' : 's'} still
                    need{missingDinner === 1 ? 's' : ''} a dinner choice. Pick
                    meals for every seat, then come back to send your QR.
                  </>
                ) : (
                  <>
                    {placed} seat{placed === 1 ? '' : 's'} placed. Tap to lock
                    it in — we'll email and text your check-in QR code. Seats
                    stay editable until June 9.
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              className="p2-btn primary"
              disabled={busy || blocked}
              onClick={onFinalize}
            >
              {busy ? 'Sending…' : "I'm done — send it"}
            </button>
          </div>
          {error && (
            <div className="p2-notice red" style={{ marginTop: 16 }}>
              <p>
                {error.message ||
                  'Could not send your confirmation. Please try again.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Persistent check-in pass once the sponsor has finalized
// (identity.rsvpStatus === 'completed'). Parity with v1 TicketQrCard.
export function TicketQrCardV2({ token, apiBase = '' }) {
  return (
    <section className="p2-section tight">
      <div className="p2-card stripped p2-qr-card">
        <div className="p2-card-body p2-qr-body">
          <div className="p2-qr-copy">
            <div className="p2-eyebrow">Check-in pass</div>
            <h2>
              Your Gala <span className="p2-italic-flair">QR</span>.
            </h2>
            <p>Show this at the check-in table on June 10.</p>
            <a className="p2-link" href={checkInUrlFor(token)}>
              Open check-in code →
            </a>
          </div>
          <div className="p2-qr-chip">
            <img
              src={qrSrcFor(token, apiBase, 220)}
              alt="Check-in QR code"
              width={132}
              height={132}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// Full-screen confirmation, shown right after /finalize succeeds.
// Short-circuits the shell render (like ReceiveOverlay) so it reads
// as a moment, not a sheet stacked on the portal.
export function ConfirmationView({ name, token, apiBase = '', data, onClose }) {
  const seatCount = data?.seatCount || 0;
  const qrImgUrl = data?.qrImgUrl || qrSrcFor(token, apiBase, 260);
  const delivery = deliveryCopy(data?.email?.sent, data?.sms?.sent);
  const firstName = (name || 'there').split(' ')[0];

  return (
    <div className="p2-shell p2-confirm">
      <button
        type="button"
        className="p2-modal-close p2-confirm-close"
        aria-label="Back to my portal"
        onClick={onClose}
      >
        ×
      </button>
      <section className="p2-section">
        <div className="p2-confirm-inner">
          <div className="p2-eyebrow">Davis Education Foundation</div>
          <h1 className="p2-confirm-headline">
            You're <span className="p2-italic-flair">confirmed</span>.
          </h1>
          <p className="p2-confirm-meta">
            June 10, 2026 · 6:00 PM · Megaplex Theatres, Legacy Crossing
          </p>

          <div className="p2-confirm-thanks">
            <div className="p2-confirm-burst" aria-hidden="true">
              🎉
            </div>
            <h2>
              Thank you,{' '}
              <span className="p2-italic-flair">{firstName}</span>!
            </h2>
            <p>
              Your <b>{seatCount} seat{seatCount === 1 ? '' : 's'}</b>{' '}
              {seatCount === 1 ? 'is' : 'are'} locked in. We {delivery} your QR
              below — bring it on June 10.
            </p>
          </div>

          <div className="p2-card stripped p2-confirm-qr">
            <div className="p2-card-body">
              <div className="p2-eyebrow">Your check-in QR</div>
              <img
                src={qrImgUrl}
                alt="Check-in QR code"
                width={240}
                height={240}
              />
              <p className="p2-confirm-qr-hint">
                Show this at the check-in table on June 10.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="p2-btn primary p2-confirm-cta"
            onClick={onClose}
          >
            Back to my portal
          </button>
          <p className="p2-confirm-foot">
            Your seats remain editable until June 9. Change them anytime from
            your personal link.
          </p>
        </div>
      </section>
    </div>
  );
}
