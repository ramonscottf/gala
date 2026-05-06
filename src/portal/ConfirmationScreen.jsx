// ConfirmationScreen — full-page replacement after the wizard's Done tap.
//
// Pattern lifted from the OLD gala-seats-app.html renderDoneScreen (lines
// 2593-2626): hero kicker + serif H1 with gradient accent on "confirmed",
// celebratory icon, "Thank you, {name}" + dynamic delivery copy ("emailed
// and texted" / "emailed" / "texted" / "saved" depending on which channels
// /finalize confirmed), 260×260 QR card, return-to-portal CTA, footer
// reminder that seats remain editable until June 9.
//
// Server already returns everything we need from POST /finalize:
//   { ok, finalized, seatCount, checkInUrl, qrImgUrl,
//     email: {sent: boolean}, sms: {sent: boolean} }
//
// This component is route-agnostic — it short-circuits Mobile's render
// before TabBar/AppBar mount, so the user sees a full confirmation
// experience, not a sheet-on-top-of-portal.

import { TOKENS, FONT_DISPLAY, FONT_UI, FONT_MONO } from '../brand/tokens.js';
import { Btn, Icon, SectionEyebrow } from '../brand/atoms.jsx';

function deliveryCopy(emailSent, smsSent) {
  if (emailSent && smsSent) return 'emailed and texted';
  if (emailSent) return 'emailed';
  if (smsSent) return 'texted';
  return 'saved';
}

export default function ConfirmationScreen({ name, data, onEdit, isDev, logoUrl }) {
  const seatCount = data?.seatCount || 0;
  const qrImgUrl = data?.qrImgUrl;
  const delivery = deliveryCopy(data?.email?.sent, data?.sms?.sent);
  const firstName = (name || 'sponsor').split(' ')[0];

  return (
    <div
      className="scroll-container"
      style={{
        minHeight: '100vh',
        overflow: 'auto',
        background: TOKENS.surface.ground,
        color: TOKENS.text.primary,
        fontFamily: FONT_UI,
        position: 'relative',
      }}
    >
      {isDev && (
        <div
          style={{
            padding: '4px 14px',
            background: TOKENS.brand.gold,
            color: TOKENS.text.primary,
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 1.6,
            textAlign: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 5,
          }}
        >
          DEV PORTAL · NOT FOR SPONSORS · /GALA-DEV/(TOKEN)
        </div>
      )}

      {/* Hero */}
      <section
        style={{
          padding: 'calc(env(safe-area-inset-top) + 32px) 16px 24px',
          position: 'relative',
        }}
      >
        <SectionEyebrow>Davis Education Foundation</SectionEyebrow>
        {logoUrl && (
          <div style={{ margin: '14px 0 0' }}>
            <img
              src={logoUrl}
              alt=""
              loading="lazy"
              style={{
                maxHeight: 32,
                maxWidth: 200,
                objectFit: 'contain',
                objectPosition: 'left center',
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 32,
            lineHeight: 1.1,
            letterSpacing: '-0.025em',
            margin: '12px 0 6px',
            fontWeight: 600,
            color: TOKENS.text.primary,
          }}
        >
          You're confirmed
        </h1>
        <div
          style={{
            fontSize: 13,
            color: TOKENS.text.secondary,
            marginTop: 6,
            fontFamily: FONT_MONO,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          Jun 10 · 6:00 PM · Megaplex Legacy Crossing
        </div>
      </section>

      {/* Thank you */}
      <div style={{ padding: '4px 16px 0' }}>
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 22,
            fontWeight: 600,
            margin: '0 0 8px',
            color: TOKENS.text.primary,
            letterSpacing: '-0.02em',
          }}
        >
          Thank you, {firstName}.
        </h2>
        <p
          style={{
            fontSize: 14,
            color: TOKENS.text.secondary,
            lineHeight: 1.55,
            maxWidth: 480,
            margin: 0,
          }}
        >
          Your{' '}
          <span
            style={{
              fontFamily: FONT_MONO,
              color: TOKENS.text.primary,
              fontWeight: 500,
            }}
          >
            {seatCount}
          </span>{' '}
          seat{seatCount === 1 ? '' : 's'} {seatCount === 1 ? 'is' : 'are'} locked in. We{' '}
          {delivery} your QR below — bring it on June 10.
        </p>
      </div>

      {/* QR card */}
      <div
        style={{
          margin: '24px 16px 0',
          padding: 24,
          borderRadius: TOKENS.radius.lg,
          background: TOKENS.surface.card,
          border: `1px solid ${TOKENS.rule}`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            color: TOKENS.text.tertiary,
            marginBottom: 14,
            textTransform: 'uppercase',
          }}
        >
          Check-in QR
        </div>
        {qrImgUrl ? (
          <img
            src={qrImgUrl}
            alt="Check-in QR code"
            width={260}
            height={260}
            style={{
              display: 'block',
              margin: '0 auto',
              borderRadius: TOKENS.radius.md,
              background: TOKENS.text.onBrand,
              padding: 12,
              maxWidth: '100%',
              height: 'auto',
            }}
          />
        ) : (
          <div
            style={{
              width: 260,
              height: 260,
              margin: '0 auto',
              borderRadius: TOKENS.radius.md,
              background: TOKENS.fill.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: TOKENS.text.tertiary,
              fontSize: 12,
            }}
          >
            QR generating…
          </div>
        )}
        <div
          style={{
            fontSize: 12,
            color: TOKENS.text.secondary,
            marginTop: 12,
            lineHeight: 1.5,
          }}
        >
          Show this at the check-in table on June 10.
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          padding: '24px 16px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <Btn
          kind="primary"
          size="lg"
          full
          onClick={onEdit}
          icon={<Icon name="arrowR" size={16} />}
        >
          Edit my seats
        </Btn>
        <button
          disabled
          title="Coming in Phase 2.5"
          style={{
            padding: '10px 14px',
            borderRadius: TOKENS.radius.md,
            border: `1px solid ${TOKENS.rule}`,
            background: TOKENS.surface.card,
            color: TOKENS.text.tertiary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'not-allowed',
            fontFamily: FONT_UI,
          }}
        >
          <Icon name="qr" size={14} /> Add to Apple Wallet (coming soon)
        </button>
      </div>

      <div
        style={{
          padding: '24px 16px max(28px, env(safe-area-inset-bottom))',
          fontSize: 12,
          color: TOKENS.text.secondary,
          lineHeight: 1.55,
          textAlign: 'center',
        }}
      >
        Your seats remain editable until June 9.
      </div>
    </div>
  );
}
