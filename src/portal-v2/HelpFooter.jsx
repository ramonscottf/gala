// HelpFooter — v2 support surface (P0.2).
//
// v1 had HelpFooter (Portal.jsx:1273) with a tap-to-SMS link to
// Scott. v2 had zero in-portal way to reach help. This ports it
// v2-styled and persistent (CLAUDE.md P0.2 explicitly overrides v1's
// Platinum-only gate). Also hosts the "Got questions?" FAQ trigger
// (P1.1).

import { useState } from 'react';
import { FaqModal } from './FaqModal.jsx';

export function HelpFooter() {
  const [faqOpen, setFaqOpen] = useState(false);
  return (
    <>
      <section className="p2-section tight">
        <div className="p2-card p2-help">
          <div className="p2-card-body p2-help-body">
            <div className="p2-help-icon" aria-hidden="true">
              💬
            </div>
            <div className="p2-help-copy">
              <div className="p2-eyebrow">Need help?</div>
              <div className="p2-help-line">Text Scott Foster — anytime.</div>
              <a className="p2-help-sms" href="sms:+18018106642">
                801-810-6642 →
              </a>
            </div>
            <button
              type="button"
              className="p2-btn ghost sm p2-help-faq"
              onClick={() => setFaqOpen(true)}
            >
              Got questions?
            </button>
          </div>
        </div>
      </section>
      {faqOpen && <FaqModal onClose={() => setFaqOpen(false)} />}
    </>
  );
}
