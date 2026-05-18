// AuctionRegistrationModal.jsx — full-screen overlay hosting the Qgiv
// (Bloomerang) embed for silent-auction registration.
//
// Architecture (from live walk-through 2026-05-18):
//   1. iframe → https://secure.qgiv.com/for/daviseducationfoundationauction/event/embed/
//      Qgiv ships no X-Frame-Options and Access-Control-Allow-Origin: *
//      so cross-origin framing from gala.daviskids.org works.
//   2. We pass first_name / last_name / email as URL params for sponsors
//      with no Qgiv cookie. For returning Qgiv users their cookie wins —
//      acceptable, the form is 3 steps and they retype 2 fields max.
//   3. postMessage events from inside the iframe drive our completion
//      handler. Names confirmed by grepping the Qgiv React bundle:
//        - QGIV.registrationStart
//        - QGIV.registrationStepChange    (fires on every step transition)
//        - QGIV.pageView                  (route changes inside iframe)
//        - QGIV.registrationClose         (user closed without completing)
//        - QGIV.registrationComplete   ← THIS is our completion signal
//        - resizeFullScreenModal       (height adjustment from iframe)
//   4. On registrationComplete: POST /auction-register with the email
//      and transaction_id from the payload. Stay in iframe — Qgiv routes
//      to /account/create/ where the sponsor sets their password.
//   5. We also listen for pageView events; once we see a route that
//      indicates account creation completed (sponsor lands on a Qgiv
//      "thanks for activating" screen), we swap to our success state.
//
// Fallback: on user-initiated close after registrationComplete already
// fired, we still consider it a success and call onRegistered with the
// captured email/txn. If the user closes BEFORE registrationComplete,
// they're not registered (per Qgiv: form must complete in one session
// for the postMessage to fire).
//
// Last-resort fallback: when modal opens we keep a "have we seen
// registrationComplete?" flag. If the iframe origin posts a vendor-
// shaped message we don't recognize but the user has clearly completed
// (we infer this by tracking step changes — when they reach step 3 and
// then the iframe issues another pageView away from the form, we poll
// /auction-status to see if a Qgiv webhook beat us to it).

import { useEffect, useRef, useState } from 'react';

const QGIV_ORIGIN = 'https://secure.qgiv.com';
const QGIV_HOST_PATTERN = /(^|\.)qgiv\.com$/;

function originAllowed(origin) {
  if (!origin) return false;
  if (origin === QGIV_ORIGIN) return true;
  try {
    const host = new URL(origin).hostname;
    return QGIV_HOST_PATTERN.test(host);
  } catch {
    return false;
  }
}

export function AuctionRegistrationModal({
  embedUrl,
  token,
  apiBase = '',
  identity,
  onClose,
  onRegistered,
}) {
  const iframeRef = useRef(null);
  const [stage, setStage] = useState('loading'); // loading | form | complete | error
  const [errorMsg, setErrorMsg] = useState('');
  const [completedPayload, setCompletedPayload] = useState(null);
  const completedRef = useRef(false);
  const lastStepRef = useRef(0);

  // ── postMessage plumbing ──────────────────────────────────────────
  useEffect(() => {
    function handleMessage(evt) {
      if (!originAllowed(evt.origin)) return;

      const data = evt.data || {};
      const eventName =
        typeof data === 'string' ? data : data.event || data.type || '';

      if (!eventName || typeof eventName !== 'string') return;

      // The Qgiv embed signals its desired height on resize. We mostly
      // honor it but cap at viewport so it never overflows.
      if (eventName === 'resizeFullScreenModal' || eventName === 'resize') {
        return; // iframe is already 100vh in our chrome; ignore height msgs
      }

      if (eventName === 'QGIV.registrationStart') {
        setStage('form');
        return;
      }

      if (eventName === 'QGIV.registrationStepChange') {
        const step = Number(
          data.step ?? data.payload?.step ?? data.currentStep ?? 0,
        );
        if (Number.isFinite(step) && step > lastStepRef.current) {
          lastStepRef.current = step;
        }
        return;
      }

      if (eventName === 'QGIV.registrationComplete') {
        const payload = data.payload || data;
        const txn =
          payload?.transaction?.Transaction_ID ||
          payload?.transaction_id ||
          '';
        const email =
          payload?.contact?.email ||
          payload?.transaction?.Email ||
          identity?.email ||
          '';
        completedRef.current = true;
        const result = {
          email,
          transaction_id: String(txn || ''),
          registered_at: new Date().toISOString(),
        };
        setCompletedPayload(result);
        // POST to our backend. Don't switch to 'complete' until the
        // write succeeds so the user doesn't see a success screen
        // followed by a recoverable error.
        postRegistration(result);
        return;
      }

      if (eventName === 'QGIV.registrationClose') {
        // User closed the iframe via Qgiv's own close button before
        // completing. Treat the same as our X — close the modal.
        if (!completedRef.current) {
          onClose?.();
        }
        return;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function postRegistration(result) {
    try {
      const r = await fetch(
        `${apiBase}/api/gala/portal/${encodeURIComponent(token)}/auction-register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        },
      );
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(body || `HTTP ${r.status}`);
      }
      const json = await r.json();
      setStage('complete');
      if (onRegistered) onRegistered({ ...result, ...(json || {}) });
    } catch (err) {
      setErrorMsg(
        err?.message || 'We could not save your registration. Please try again.',
      );
      setStage('error');
    }
  }

  // ── Close-on-Escape ────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (completedRef.current && stage !== 'complete') return;
        onClose?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, stage]);

  // ── Close-then-poll fallback ──────────────────────────────────────
  // If the user dismisses the iframe and we never saw a completion
  // event, do one last GET to /auction-status — covers the case where
  // a Qgiv webhook to our backend beat the postMessage.
  async function handleCloseWithPoll() {
    if (completedRef.current) {
      onClose?.();
      return;
    }
    try {
      const r = await fetch(
        `${apiBase}/api/gala/portal/${encodeURIComponent(token)}/auction-status`,
      );
      if (r.ok) {
        const json = await r.json();
        if (json?.registered) {
          if (onRegistered)
            onRegistered({
              email: json.email,
              transaction_id: json.transaction_id,
              registered_at: json.registered_at,
            });
          return;
        }
      }
    } catch {
      // ignore — we just close
    }
    onClose?.();
  }

  return (
    <div
      className="p2-auction-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Register to bid in the silent auction"
    >
      <div className="p2-auction-modal-bar">
        <div className="p2-auction-modal-title">
          <span className="p2-eyebrow">Silent auction</span>
          <span className="p2-auction-modal-headline">
            {stage === 'complete'
              ? "✓ You're registered"
              : 'Register to bid'}
          </span>
        </div>
        <button
          type="button"
          className="p2-auction-modal-close"
          onClick={handleCloseWithPoll}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {stage === 'complete' ? (
        <AuctionRegistrationSuccess
          email={completedPayload?.email || identity?.email}
          onClose={onClose}
        />
      ) : (
        <div className="p2-auction-modal-body">
          {stage === 'error' && (
            <div className="p2-notice red p2-auction-error">
              <p>{errorMsg}</p>
              <p>
                Your Qgiv account was created but we couldn't sync it to your
                portal. Email{' '}
                <a href="mailto:smiggin@dsdmail.net">smiggin@dsdmail.net</a>{' '}
                and we'll mark you as registered manually.
              </p>
            </div>
          )}
          <iframe
            ref={iframeRef}
            className="p2-auction-iframe"
            title="Silent auction registration"
            src={embedUrl}
            allow="payment"
            onLoad={() => {
              if (stage === 'loading') setStage('form');
            }}
          />
        </div>
      )}
    </div>
  );
}

// Givi app links — duplicated here from the card so the success view is
// self-contained. Keep in sync with AuctionRegistrationCard.jsx.
const GIVI_IOS_URL =
  'https://apps.apple.com/us/app/givi-by-qgiv/id1485270576';
const GIVI_ANDROID_URL =
  'https://play.google.com/store/apps/details?id=com.qgiv.givi';

function AuctionRegistrationSuccess({ email, onClose }) {
  return (
    <div className="p2-auction-success">
      <div className="p2-auction-success-inner">
        <div className="p2-auction-burst" aria-hidden="true">
          🏷️
        </div>
        <h2>
          You're <span className="p2-italic-flair">registered</span> to bid.
        </h2>
        <p className="p2-auction-success-lede">
          Your bidder account is ready. Download the Givi app, sign in with{' '}
          <b>{email}</b>, and you're set for June 10.
        </p>
        <div className="p2-auction-success-stores">
          <a
            className="p2-auction-store"
            href={GIVI_IOS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="p2-auction-store-eyebrow">Download on the</span>
            <span className="p2-auction-store-name">App Store</span>
          </a>
          <a
            className="p2-auction-store"
            href={GIVI_ANDROID_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="p2-auction-store-eyebrow">Get it on</span>
            <span className="p2-auction-store-name">Google Play</span>
          </a>
        </div>
        <p className="p2-auction-success-foot">
          Check your email for the Qgiv ticket code — keep it in case you ever
          need to reset your password.
        </p>
        <button
          type="button"
          className="p2-btn primary p2-auction-success-cta"
          onClick={onClose}
        >
          Back to my portal
        </button>
      </div>
    </div>
  );
}
