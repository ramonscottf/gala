// ConfirmationScreen — full-page replacement after the wizard's Done tap.
//
// Editorial direction (Theme C, 2026-05-05):
//   - Warm cream-white ground, navy ink, generous spacing
//   - Sans + serif italic h1 ("You're all set.")
//   - 60×2 red EditorialDivider between hero and QR card
//   - QR card lives on a navy surface — it's a TICKET, not chrome, so a
//     dark backdrop reads as "here's your pass" the way a stub does
//
// Server returns from POST /finalize:
//   { ok, finalized, seatCount, checkInUrl, qrImgUrl,
//     email: {sent: boolean}, sms: {sent: boolean} }

import { TOKENS } from '../brand/tokens.js';
import { Btn, Icon, SectionEyebrow, EditorialDivider } from '../brand/atoms.jsx';

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
        fontFamily: TOKENS.font.ui,
      }}
    >
      {isDev && (
        <div
          style={{
            padding: '6px 14px',
            background: TOKENS.brand.gold,
            color: TOKENS.text.primary,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.4,
            textAlign: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 5,
            textTransform: 'uppercase',
          }}
        >
          Dev portal · not for sponsors · /gala-dev/(token)
        </div>
      )}

      {/* Hero */}
      <section
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '64px 24px 24px',
          textAlign: 'center',
        }}
      >
        <SectionEyebrow style={{ marginBottom: 12 }}>Davis Education Foundation</SectionEyebrow>
        {logoUrl && (
          <div style={{ margin: '12px 0 8px', display: 'flex', justifyContent: 'center' }}>
            <img
              src={logoUrl}
              alt=""
              loading="lazy"
              style={{
                maxHeight: 36,
                maxWidth: 200,
                objectFit: 'contain',
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
            fontSize: 56,
            lineHeight: 1.05,
            margin: '20px 0 12px',
            color: TOKENS.text.primary,
            letterSpacing: -1,
          }}
        >
          <span style={{ fontFamily: TOKENS.font.ui, fontWeight: 600 }}>You're</span>{' '}
          <span
            style={{
              fontFamily: TOKENS.font.displaySerif,
              fontStyle: 'italic',
              fontWeight: 700,
              color: TOKENS.brand.gold,
            }}
          >
            all set.
          </span>
        </h1>
        <p
          style={{
            fontSize: 16,
            color: TOKENS.text.secondary,
            lineHeight: 1.6,
            maxWidth: 480,
            margin: '0 auto',
          }}
        >
          Thank you,{' '}
          <span
            style={{
              fontFamily: TOKENS.font.displaySerif,
              fontStyle: 'italic',
              fontWeight: 700,
              color: TOKENS.brand.gold,
            }}
          >
            {firstName}.
          </span>{' '}
          Your <b style={{ color: TOKENS.text.primary }}>
            {seatCount} seat{seatCount === 1 ? '' : 's'}
          </b>{' '}
          {seatCount === 1 ? 'is' : 'are'} locked in. We {delivery} your QR below — bring it on
          June 10.
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 18,
            fontSize: 13,
            color: TOKENS.text.tertiary,
            marginTop: 24,
          }}
        >
          <span>June 10, 2026 · 6:00 PM</span>
          <span>Megaplex Theatres · Legacy Crossing</span>
        </div>
      </section>

      <EditorialDivider />

      {/* QR card — navy "ticket" surface in the middle of the cream page. */}
      <section
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '0 24px',
        }}
      >
        <div
          style={{
            padding: 32,
            borderRadius: TOKENS.radius.lg,
            background: TOKENS.brand.navy,
            color: TOKENS.text.onBrand,
            textAlign: 'center',
            boxShadow: TOKENS.shadow.cardElevated,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: TOKENS.brand.red,
            }}
          />
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.5,
              color: TOKENS.brand.gold,
              textTransform: 'uppercase',
              marginBottom: 16,
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
                borderRadius: 10,
                background: TOKENS.fill.onBrandPrimary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: TOKENS.text.onBrandSecondary,
                fontSize: 12,
              }}
            >
              QR generating…
            </div>
          )}
          <div
            style={{
              fontSize: 13,
              color: TOKENS.text.onBrandSecondary,
              marginTop: 16,
              lineHeight: 1.5,
            }}
          >
            Show this at the check-in table on June 10.
          </div>
        </div>
      </section>

      {/* Action buttons */}
      <section
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '32px 24px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <Btn kind="primary" size="lg" full onClick={onEdit} icon={<Icon name="arrowR" size={16} />}>
          Edit my seats
        </Btn>
        <button
          disabled
          title="Coming in Phase 2.5"
          style={{
            padding: '14px',
            borderRadius: TOKENS.radius.md,
            border: `1px solid ${TOKENS.ruleStrong}`,
            background: TOKENS.surface.card,
            color: TOKENS.text.tertiary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'not-allowed',
            fontFamily: TOKENS.font.ui,
          }}
        >
          <Icon name="qr" size={16} /> Add to Apple Wallet (coming soon)
        </button>
      </section>

      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '24px 24px 48px',
          fontSize: 13,
          color: TOKENS.text.tertiary,
          lineHeight: 1.6,
          textAlign: 'center',
        }}
      >
        Your seats remain editable until June 9. You can change them anytime from your personal
        link.
      </div>
    </div>
  );
}
