// AuctionRegistrationCard.jsx — silent-auction sign-up surface.
//
// Lives on the portal home (under FinalizeBanner) and on the confirmation
// screen (as the dominant follow-on CTA after seats are locked). Visible
// only for sponsor tokens with seats placed; never shown to delegations.
//
// Three states:
//   CTA  — auctionRegisteredAt is null → primary button opens the Qgiv
//          embed modal. Headline: "Register to bid in the silent auction."
//   DONE — auctionRegisteredAt set → green ✓ card with Givi app download
//          buttons (iOS App Store + Google Play) and a "lost ticket code"
//          mailto fallback to Sherry.
//
// Visual language matches FinalizeBanner: stripped p2-card with gradient
// strip, p2-eyebrow + Fraunces headline + Inter body, primary p2-btn on
// the right of a row layout that wraps on mobile.

import { AuctionRegistrationModal } from './AuctionRegistrationModal.jsx';
import { useState } from 'react';

// App Store IDs — verified during this build. Confirm in beta test.
// iOS: Givi by Qgiv, current App Store entry uses bundle id1485270576.
// Android: com.qgiv.givi on Play. If either is wrong, swap before Bronze.
const GIVI_IOS_URL =
  'https://apps.apple.com/us/app/givi-by-qgiv/id1485270576';
const GIVI_ANDROID_URL =
  'https://play.google.com/store/apps/details?id=com.qgiv.givi';

const QGIV_EMBED_URL =
  'https://secure.qgiv.com/for/daviseducationfoundationauction/event/embed/?preventRefreshOnClose=true';

function buildEmbedUrl(identity) {
  // Per the live walk-through 2026-05-18: Qgiv prefill params are
  // first_name / last_name / email (lowercase, underscore). Cookie
  // session overrides URL params for returning Qgiv users — for
  // fresh sponsors the prefill works.
  const params = new URLSearchParams();
  if (identity?.contactName) {
    const [first, ...rest] = identity.contactName.trim().split(/\s+/);
    if (first) params.set('first_name', first);
    if (rest.length) params.set('last_name', rest.join(' '));
  }
  if (identity?.email) params.set('email', identity.email);
  // preventRefreshOnClose=true keeps the iframe stable when the user
  // navigates back/forward inside the embedded flow.
  params.set('preventRefreshOnClose', 'true');
  return `${QGIV_EMBED_URL.split('?')[0]}?${params.toString()}`;
}

export function AuctionRegistrationCard({
  identity,
  token,
  apiBase = '',
  variant = 'home', // 'home' | 'confirmation'
  onRegistered,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const isSponsor = identity?.kind === 'sponsor';
  const registeredAt = identity?.auctionRegisteredAt || null;
  const registrationEmail =
    identity?.auctionRegistrationEmail || identity?.email || '';

  if (!isSponsor) return null;

  if (registeredAt) {
    // ── DONE state ─────────────────────────────────────────────────
    return (
      <section
        className={`p2-section ${variant === 'confirmation' ? '' : 'tight'}`}
      >
        <div className="p2-card stripped p2-auction p2-auction-done">
          <div className="p2-card-body">
            <div className="p2-auction-row">
              <div className="p2-auction-copy">
                <div className="p2-eyebrow">Silent auction</div>
                <h2>
                  <span className="p2-auction-check" aria-hidden="true">
                    ✓
                  </span>{' '}
                  You're <span className="p2-italic-flair">registered</span> to
                  bid.
                </h2>
                <p>
                  Download <b>Givi</b> on your phone before June 10. Sign in
                  with <b>{registrationEmail}</b> — your password is whatever
                  you set during registration. Bidding closes at 7:30 PM on June 10.
                </p>
              </div>
              <div className="p2-auction-store-row">
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
            </div>
            <p className="p2-auction-foot">
              Lost your ticket code or can't find the email?{' '}
              <a href="mailto:smiggin@dsdmail.net">Email Sherry</a> and she'll
              resend it.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // ── CTA state ──────────────────────────────────────────────────────
  return (
    <>
      <section
        className={`p2-section ${variant === 'confirmation' ? '' : 'tight'}`}
      >
        <div className="p2-card stripped p2-auction">
          <div className="p2-card-body">
            <div className="p2-auction-row">
              <div className="p2-auction-copy">
                <div className="p2-eyebrow">Silent auction</div>
                <h2>
                  Register to bid in the{' '}
                  <span className="p2-italic-flair">silent auction</span>.
                </h2>
                <p>
                  {variant === 'confirmation'
                    ? "Your seats are locked. One more thing before you go — set up your bidder account now so the Givi app is ready on auction night. Takes about 30 seconds."
                    : 'Your bidder account works in the Givi app on auction night. Setting it up now means no scramble at the door — takes about 30 seconds.'}
                </p>
              </div>
              <button
                type="button"
                className="p2-btn primary"
                onClick={() => setModalOpen(true)}
              >
                Register now
              </button>
            </div>
          </div>
        </div>
      </section>
      {modalOpen && (
        <AuctionRegistrationModal
          embedUrl={buildEmbedUrl(identity)}
          token={token}
          apiBase={apiBase}
          identity={identity}
          onClose={() => setModalOpen(false)}
          onRegistered={(result) => {
            setModalOpen(false);
            if (onRegistered) onRegistered(result);
          }}
        />
      )}
    </>
  );
}
