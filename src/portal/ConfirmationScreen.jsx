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

import { TOKENS, FONT_DISPLAY, FONT_UI } from '../brand/tokens.js';
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
      style={{
        minHeight: '100vh',
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
        className="page-header"
        style={{
          padding: '32px 22px 24px',
          position: 'relative',
        }}
      >
        {/* 3px gradient strip across the top of the hero — the "Sherry blast"
            energy from her email reference. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: TOKENS.brand.navy,
          }}
        />
        <SectionEyebrow color={TOKENS.brand.red}>Davis Education Foundation</SectionEyebrow>
        {logoUrl && (
          <div style={{ margin: '12px 0 4px' }}>
            <img
              src={logoUrl}
              alt=""
              loading="lazy"
              style={{
                maxHeight: 36,
                maxWidth: 200,
                objectFit: 'contain',
                objectPosition: 'left center',
                opacity: 0.95,
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
            fontSize: 44,
            lineHeight: 1.02,
            letterSpacing: -1,
            margin: '12px 0 6px',
            fontWeight: 700,
            color: '#fff',
          }}
        >
          You're{' '}
          <i
            style={{
              background: TOKENS.brand.navy,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontWeight: 500,
            }}
          >
            confirmed.
          </i>
        </h1>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            fontSize: 13,
            color: 'var(--mute)',
            marginTop: 8,
          }}
        >
          <span>📅 June 10, 2026 · 6:00 PM</span>
          <span>📍 Megaplex Theatres · Legacy Crossing</span>
        </div>
      </section>

      {/* Big celebratory icon + thank you */}
      <div
        style={{
          textAlign: 'center',
          padding: '12px 22px 0',
        }}
      >
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 8 }} aria-hidden>
          🎉
        </div>
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 28,
            fontWeight: 700,
            margin: '0 0 8px',
            color: '#fff',
            letterSpacing: -0.4,
          }}
        >
          Thank you, <i style={{ color: 'var(--accent-italic)', fontWeight: 500 }}>{firstName}!</i>
        </h2>
        <p
          style={{
            fontSize: 15,
            color: 'var(--mute)',
            lineHeight: 1.55,
            maxWidth: 480,
            margin: '0 auto',
          }}
        >
          Your <b style={{ color: '#fff' }}>{seatCount} seat{seatCount === 1 ? '' : 's'}</b>{' '}
          {seatCount === 1 ? 'is' : 'are'} locked in. We {delivery} your QR below — bring it on
          June 10.
        </p>
      </div>

      {/* QR card */}
      <div
        style={{
          margin: '24px 22px 0',
          padding: 24,
          borderRadius: 18,
          background: TOKENS.brand.navyDeep,
          border: `1px solid var(--rule)`,
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* same gradient strip flourish along the top of the QR card */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: TOKENS.brand.navy,
          }}
        />
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1.6,
            color: 'var(--accent-text)',
            marginBottom: 14,
            textTransform: 'uppercase',
          }}
        >
          Your check-in QR
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
              borderRadius: 10,
              background: '#fff',
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
              borderRadius: 10,
              background: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--mute)',
              fontSize: 12,
            }}
          >
            QR generating…
          </div>
        )}
        <div
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.55)',
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
          padding: '24px 22px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <Btn
          kind="primary"
          size="lg"
          full
          onClick={() => {
            // HAPTIC: light — return to portal home.
            onEdit();
          }}
          icon={<Icon name="arrowR" size={16} />}
        >
          Edit my seats
        </Btn>
        <button
          disabled
          title="Coming in Phase 2.5"
          style={{
            padding: '14px',
            borderRadius: 12,
            border: `1.5px solid var(--rule)`,
            background: 'rgba(255,255,255,0.03)',
            color: 'rgba(255,255,255,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'not-allowed',
            fontFamily: FONT_UI,
          }}
        >
          <Icon name="qr" size={16} /> Add to Apple Wallet (coming soon)
        </button>
      </div>

      <div
        style={{
          padding: '20px 22px max(28px, env(safe-area-inset-bottom))',
          fontSize: 12,
          color: 'var(--mute)',
          lineHeight: 1.55,
          textAlign: 'center',
        }}
      >
        Your seats remain editable until June 9. You can change them anytime from your personal
        link.
      </div>
    </div>
  );
}
