// Mobile shell — boarding-pass home, Tickets/Guests/Night tabs, iOS glass-
// pill tab bar. Lifted from uploads/seating-chart/project/components/
// portal-mobile.jsx with three changes:
//
//   1. ES imports instead of `const {…} = window`. The brand atoms come
//      from src/brand, the icons too. React hooks come from 'react'.
//   2. Demo seed() data replaced by adaptPortalToMobileData(portal): real
//      identity / assignments / holds / showtimes from the API, grouped
//      into the (tier/name/company/blockSize/tickets/guests/lineup) shape
//      the lifted tabs expect.
//   3. WizardOverlay removed — onPlaceSeats and onOpenTicket navigate to
//      `${token}/seats` instead of toggling local state. The MobileWizard
//      lives at its own route now.
//
// Visual fidelity is held to debug-glass.png and the design source.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BRAND, FONT_DISPLAY, FONT_UI, TIERS } from '../brand/tokens.js';
import { Btn, Icon, SectionEyebrow } from '../brand/atoms.jsx';
import { config } from '../config.js';
import { useFinalize } from '../hooks/useFinalize.js';
import { useTheme } from '../hooks/useTheme.js';
import ConfirmationScreen from './ConfirmationScreen.jsx';
import SettingsSheet from './SettingsSheet.jsx';
import NightOfContent from './components/NightOfContent.jsx';
// Phase 1.15 — adopt PR #56 architecture. Three purpose-built sheets
// replace the Phase 1.14 Step2Pick-export overlay:
//   SeatPickSheet  — replaces wizard StepShowing+StepSeats
//   PostPickSheet  — replaces wizard Step 4 Confirm (3-card "what next?")
//   AssignTheseSheet — multi-seat batch delegation picker after place
// Step2Pick is no longer imported here; the wizard still uses it
// internally for back-compat with email deep links.
import SeatPickSheet from './components/SeatPickSheet.jsx';
import PostPickOverview from './components/PostPickOverview.jsx';
import CompletionCelebration from './components/CompletionCelebration.jsx';
import PostPickDinnerSheet from './components/PostPickDinnerSheet.jsx';
import TicketsTab from './components/TicketsTab.jsx';
import HomeTab from './components/HomeTab.jsx';
import DinnerSheet from './components/DinnerSheet.jsx';
import TicketDetailSheet from './components/TicketDetailSheet.jsx';
import MovieDetailSheet from './MovieDetailSheet.jsx';
import { enrichMovieScores, formatRottenBadge, highestRottenScore } from './movieScores.js';

const SheetFrameContext = createContext(false);

// ── shared mini-components ─────────────────────────────────────────────

export const PosterMini = ({ poster, color, label, size = 44, showLabel = true }) => (
  <div
    style={{
      width: size,
      height: size * 1.4,
      borderRadius: 5,
      background: poster
        ? `url(${poster}) center/cover`
        : `linear-gradient(160deg, ${color || BRAND.navyMid}, ${BRAND.navyDeep})`,
      display: 'flex',
      alignItems: 'flex-end',
      padding: 4,
      position: 'relative',
      overflow: 'hidden',
      flexShrink: 0,
    }}
  >
    {showLabel && !poster && (
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontStyle: 'italic',
          fontSize: size * 0.21,
          color: 'rgba(255,255,255,0.92)',
          lineHeight: 1.05,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    )}
  </div>
);

export const Avatar = ({ name, size = 36, color }) => {
  const initials = initialsFor(name);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        flexShrink: 0,
        background: color || `linear-gradient(135deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: size * 0.36,
        fontWeight: 700,
        letterSpacing: 0.4,
        border: `1px solid var(--rule)`,
      }}
    >
      {initials}
    </div>
  );
};

const initialsFor = (name) => (name || '?')
  .split(/\s+/)
  .map((n) => n[0])
  .slice(0, 2)
  .join('')
  .toUpperCase();

const StatusPill = ({ status }) => {
  const map = {
    claimed: { c: BRAND.indigoLight, bg: 'rgba(168,177,255,0.16)', t: 'CLAIMED' },
    pending: { c: BRAND.red, bg: 'rgba(212,38,74,0.14)', t: 'PENDING' },
    placed: { c: '#7fcfa0', bg: 'rgba(127,207,160,0.14)', t: 'PLACED' },
    open: { c: 'rgba(255,255,255,0.7)', bg: 'rgba(255,255,255,0.06)', t: 'OPEN' },
  }[status] || { c: 'rgba(255,255,255,0.7)', bg: 'rgba(255,255,255,0.06)', t: '—' };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.2,
        color: map.c,
        background: map.bg,
        padding: '4px 10px',
        borderRadius: 99,
      }}
    >
      {map.t}
    </span>
  );
};

// Megaplex venue logo. Originally a hand-drawn SVG placeholder (filmstrip
// icon + lowercase "Megaplex" type) Skippy invented while we waited for
// the official asset. May 5 2026: Scott uploaded the real Megaplex
// wordmark; processed into transparent-PNG variants and committed them
// into the repo at /assets/brand/megaplex-{light,dark}.png. We now serve
// from the local Pages domain instead of R2 because (a) the previous R2
// upload was an outline-only version that read as line-art noise on
// navy, and (b) the local file is ~32 KB vs the R2 one's 313 KB. The
// `dark` prop picks the variant: dark=true (boarding pass on navy) →
// light variant, dark=false → dark variant. Size prop controls height
// in px; width is computed from the wordmark's native aspect ratio
// (1136 × 128 ≈ 8.875 : 1).
const MEGAPLEX_RATIO = 1136 / 128;
const MegaplexLogo = ({ size = 14, dark = true }) => (
  <img
    src={dark ? '/assets/brand/megaplex-light.png' : '/assets/brand/megaplex-dark.png'}
    alt="Megaplex"
    loading="lazy"
    width={Math.round((size + 6) * MEGAPLEX_RATIO)}
    height={size + 6}
    style={{
      display: 'block',
      marginLeft: 'auto',
      objectFit: 'contain',
    }}
  />
);

const miniBtn = (kind, isLight = false) => ({
  padding: '8px 14px',
  borderRadius: 99,
  border: 0,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
  background: kind === 'primary'
    ? BRAND.gradient
    : isLight
      ? 'rgba(13,18,36,0.08)'
      : 'rgba(255,255,255,0.08)',
  color: kind === 'primary' || !isLight ? '#fff' : BRAND.ink,
  fontFamily: FONT_UI,
  boxShadow: kind === 'primary' ? '0 3px 8px rgba(215,40,70,0.35)' : 'none',
});

// ── ticket card hero ──────────────────────────────────────────────────
// Navy ticket with perforation + Megaplex co-brand. Phase 1.7 swapped
// the OLD 3px gold left-edge for 3px BRAND.gradient strips at the top
// AND bottom of the card per Sherry's email-blast reference (IMG_3918
// has the same crimson→indigo strip energy on the navy hero block).
// Other visual fidelity points kept: warm light pool radial-gradient,
// perforation circles cut at calc(100%-78px), dashed border between
// body and stub, MEGAPLEX wordmark, "YOUR GALA / N days out" eyebrow.

export const TicketHero = ({ tier, name, subline, blockSize, placed, assigned, openCount, logoUrl, daysOut, isDelegation = false, inviterCompany = '' }) => {
  const firstName = (name || '').split(' ')[0];
  const restName = (name || '').split(' ').slice(1).join(' ');
  return (
    <div
      className="force-dark-vars"
      style={{
        margin: '0 14px',
        borderRadius: '0 0 18px 18px',
        overflow: 'hidden',
        background: `linear-gradient(170deg, ${BRAND.navyMid} 0%, ${BRAND.navy} 60%, ${BRAND.navyDeep} 100%)`,
        border: `1px solid var(--rule)`,
        position: 'relative',
        boxShadow:
          '0 24px 48px -16px rgba(0,0,0,0.55), 0 8px 16px -10px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset',
      }}
    >
      {/* warm light pool — marquee glow */}
      <div
        style={{
          position: 'absolute',
          top: -80,
          right: -60,
          width: 240,
          height: 240,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(244,185,66,0.18) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      {/* perforation circles cut into navy-deep ground */}
      <div
        style={{
          position: 'absolute',
          left: -7,
          right: -7,
          top: 'calc(100% - 78px)',
          display: 'flex',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <span style={{ width: 14, height: 14, borderRadius: 99, background: BRAND.ink }} />
        <span style={{ width: 14, height: 14, borderRadius: 99, background: BRAND.ink }} />
      </div>
      {/* Top gold perforation strip — boarding-pass trim. Sits ABOVE the
          red→indigo gradient, taking 1.5px of the 3px header band so
          both reads visible. May 5 2026 add per Scott — original boarding
          pass had this and it got lost in the migration. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: BRAND.gradient,
          zIndex: 3,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1.5,
          background: BRAND.gold,
          zIndex: 4,
        }}
      />
      {/* Bottom gold perforation strip — mirrors the top, sitting just
          below the dashed perforation line at the bottom of the stub. */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 1.5,
          background: BRAND.gold,
          zIndex: 4,
        }}
      />

      <div style={{ padding: 'calc(env(safe-area-inset-top) + 18px) 20px 22px', position: 'relative', zIndex: 1 }}>
        {/* Sponsor portal header row (added May 5 2026 with the AppBar
            removal). Replaces the standalone top app bar — the DEF logo
            + GALA · 2026 / Sponsor portal label live INSIDE the hero
            card now. Avatar/settings is a separate floating button at
            the viewport's top-right. Days-out chip sits right side as
            a calm running counter (replaces the loose row that used to
            sit above the card). Padding-right reserves room for the
            floating avatar button which overlaps the card's top-right. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            paddingRight: 44,
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <img
              src="/assets/brand/def-logo-light.png"
              alt="Davis Education Foundation"
              height={22}
              style={{ height: 22, width: 'auto', display: 'block', flexShrink: 0 }}
            />
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.16)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 1.6,
                  color: 'rgba(255,255,255,0.55)',
                  whiteSpace: 'nowrap',
                }}
              >
                GALA · 2026
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#fff',
                  marginTop: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 200,
                }}
              >
                {isDelegation
                  ? `Guest of ${inviterCompany || 'a sponsor'}`
                  : 'Sponsor portal'}
              </div>
            </div>
          </div>
          {daysOut != null && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: 'rgba(255,255,255,0.7)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {daysOut} days out
            </div>
          )}
        </div>

        {/* Phase 1.14 — sponsor logo inline with the eyebrow caps row.
            Logo sits left of "LIGHTS · CAMERA · TAKE ACTION · 2026",
            tier badge stays right. Falls back gracefully when logoUrl
            is null (eyebrow caps fill the left slot alone). */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            minHeight: 22,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 0,
              flex: 1,
            }}
          >
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                loading="lazy"
                style={{
                  height: 22,
                  maxWidth: 80,
                  objectFit: 'contain',
                  objectPosition: 'left center',
                  opacity: 0.95,
                  flexShrink: 0,
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 2,
                color: BRAND.gold,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textShadow: '0 0 12px rgba(244,185,66,0.3)',
              }}
            >
              LIGHTS · CAMERA · TAKE ACTION · 2026
            </div>
          </div>
          {tier && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px 4px 9px',
                borderRadius: 99,
                // Light pill on dark navy ticket. Was 'var(--surface)' which
                // resolved to near-black in dark mode and near-white on light
                // mode — neither read well as a "tier badge" against the
                // always-dark ticket. Hardcoded to a soft white.
                background: 'rgba(255,255,255,0.92)',
                border: `1px solid rgba(255,255,255,0.6)`,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.4,
                // Dark text on light pill — was '#fff' which was invisible
                // against the new white-ish bg.
                color: BRAND.ink,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 99,
                  background: TIERS[tier]?.color || BRAND.indigoLight,
                }}
              />
              {tier.toUpperCase()}
            </span>
          )}
        </div>

        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 38,
            lineHeight: 0.98,
            letterSpacing: -1,
            margin: '14px 0 0',
            fontWeight: 700,
            color: '#fff',
          }}
        >
          {firstName}{' '}
          {restName && (
            <i
              style={{
                color: isDelegation ? BRAND.indigoLight : BRAND.gold,
                fontWeight: 500,
                // Slight text-shadow gives the italic a bit of pop on the
                // navy gradient, especially on small phone screens where
                // the iOS sample-bottom-bar dims everything above.
                textShadow: isDelegation
                  ? '0 0 18px rgba(168,177,255,0.30)'
                  : '0 0 18px rgba(244,185,66,0.25)',
              }}
            >
              {restName}.
            </i>
          )}
        </h1>
        {subline && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.95)', marginTop: 4, fontWeight: 600, letterSpacing: 0.1 }}>
            {subline}
          </div>
        )}

        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: isDelegation ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)',
            borderTop: `1px solid var(--rule)`,
            paddingTop: 14,
          }}
        >
          {(isDelegation
            ? [
                { label: 'TOTAL', value: blockSize, sub: 'Your seats', color: '#fff' },
                { label: 'PLACED', value: placed, sub: 'In seats', color: '#fff' },
                {
                  label: 'OPEN',
                  value: openCount,
                  sub: 'To place',
                  color: openCount > 0 ? BRAND.indigoLight : 'rgba(255,255,255,0.6)',
                },
              ]
            : [
                { label: 'TOTAL', value: blockSize, sub: 'Your block', color: '#fff' },
                { label: 'PLACED', value: placed, sub: 'In seats', color: '#fff' },
                { label: 'ASSIGNED', value: assigned, sub: 'To guests', color: '#fff' },
                {
                  label: 'OPEN',
                  value: openCount,
                  sub: 'To place',
                  color: openCount > 0 ? BRAND.indigoLight : 'rgba(255,255,255,0.6)',
                },
              ]
          ).map((s, i) => (
            <div
              key={i}
              style={{
                paddingLeft: i === 0 ? 0 : 10,
                borderLeft: i === 0 ? 'none' : `1px solid var(--rule)`,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 1.6,
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 30,
                  fontWeight: 700,
                  color: s.color,
                  marginTop: 4,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.45)',
                  marginTop: 3,
                }}
              >
                {s.sub}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* stub */}
      <div
        style={{
          borderTop: `1.5px dashed rgba(255,255,255,0.18)`,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.18)',
          position: 'relative',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
            Wednesday · June 10, 2026
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.75)',
              marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Doors 4:00 PM
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <MegaplexLogo size={14} />
          <div
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.7)',
              marginTop: 5,
              letterSpacing: 0.4,
            }}
          >
            Legacy Crossing · Centerville
          </div>
        </div>
        {/* Bottom gradient strip — mirrors the top edge per F7b. */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: BRAND.gradient,
          }}
        />
      </div>
    </div>
  );
};

// ── Text-my-seats button ─────────────────────────────────────────────
// Quick action that POSTs to /api/gala/portal/[token]/sms with kind=self.
// Inline state machine: idle → sending → sent (3s) → idle. Errors render
// inline with retry. No phone input — uses the sponsor's phone on file.

const TextMySeatsButton = ({ token, apiBase, sponsorPhone }) => {
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  const send = async () => {
    if (state === 'sending') return;
    setState('sending');
    setError('');
    try {
      const r = await fetch(`${apiBase || ''}/api/gala/portal/${token}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'self' }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setState('error');
        setError(data.error || `Failed (${r.status})`);
        return;
      }
      setState('sent');
      setTimeout(() => setState('idle'), 3500);
    } catch (e) {
      setState('error');
      setError(String(e.message || e));
    }
  };

  // Mask the sponsor phone so the destination is visible without
  // exposing the full number to anyone who happens to load the portal.
  // Format: (•••) •••-1234 — last 4 digits of the on-file number.
  const maskedPhone = (() => {
    if (!sponsorPhone) return '';
    const digits = String(sponsorPhone).replace(/\D/g, '');
    if (digits.length < 4) return '';
    return `(•••) •••-${digits.slice(-4)}`;
  })();

  const label =
    state === 'sending' ? 'Sending…'
    : state === 'sent' ? '✓ Texted'
    : state === 'error' ? 'Try again'
    : maskedPhone ? `Text my seats to ${maskedPhone}`
    : 'Text my seats to me';

  return (
    <div style={{ margin: '14px 18px 0' }}>
      <button
        onClick={send}
        disabled={state === 'sending'}
        style={{
          all: 'unset',
          boxSizing: 'border-box',
          cursor: state === 'sending' ? 'wait' : 'pointer',
          width: '100%',
          padding: '12px 16px',
          borderRadius: 12,
          background: state === 'sent' ? 'rgba(99,201,118,0.14)' : 'var(--surface)',
          border: `1px solid ${state === 'sent' ? 'rgba(99,201,118,0.4)' : 'var(--rule)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          color: state === 'sent' ? '#63c976' : 'var(--ink-on-ground)',
          transition: 'background .2s, border-color .2s',
        }}
      >
        <Icon name={state === 'sent' ? 'check' : 'msg'} size={15} stroke={2} />
        {label}
      </button>
      {error && state === 'error' && (
        <div style={{ fontSize: 11, color: '#ff8da4', marginTop: 6, paddingLeft: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
};

// ── Tickets tab ───────────────────────────────────────────────────────

export const seatLabel = (seat) => String(seat || '').replace('-', '');

export const assignmentOwner = (row, fallback) => (
  row?.ownerName ||
  row?.delegationName ||
  row?.guest_name ||
  fallback ||
  'Guest'
);

export const TicketQrCard = ({ token, apiBase = '' }) => {
  const checkInUrl = `https://gala.daviskids.org/checkin?t=${encodeURIComponent(token || '')}`;
  const qrSrc = `${apiBase}/api/gala/qr?t=${encodeURIComponent(token || '')}&size=220`;
  return (
    <section
      data-testid="ticket-qr-card"
      className="ticket-pass-card"
      style={{
        margin: '16px 18px 0',
        borderRadius: 18,
        border: `1px solid var(--rule)`,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(168,177,255,0.08))',
        padding: 14,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 112px',
        gap: 14,
        alignItems: 'center',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, color: 'var(--accent-text)', textTransform: 'uppercase' }}>
          Check-in pass
        </div>
        <div style={{ marginTop: 7, fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: 'var(--ink-on-ground)', lineHeight: 1.1 }}>
          Your Gala QR
        </div>
        <a
          href={checkInUrl}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            color: 'var(--accent-italic)',
            fontSize: 12,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          <Icon name="qr" size={14} /> Open check-in code
        </a>
      </div>
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: 12,
          padding: 8,
          background: '#fff',
          boxShadow: '0 14px 28px rgba(0,0,0,0.24)',
        }}
      >
        <img src={qrSrc} alt="Check-in QR code" style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </section>
  );
};

// ── Guests tab ────────────────────────────────────────────────────────

// ── Group tab ─────────────────────────────────────────────────────────
//
// Sources from data.delegations (= portal.childDelegations from the API).
// Each delegation is a sub-token record with its own SMS/email invite
// history and three-state status. Tap a row → DelegateManage sheet.

// status → { color, bg, label }. R10 — the actual lifecycle the
// host cares about. The DB still uses 'pending'/'active'/'finalized'
// at the delegation level, but those don't fully reflect what's
// happened with the seats. A delegation can read 'pending' on the
// row even though every seat under it has been assigned and dinner-
// picked (the seat-finalize endpoint doesn't sync upward to the
// delegation row's status field). Real states the sponsor cares
// about, in order:
//
//   INVITED        — sent the link, no seats placed, never accessed
//                    → red (sponsor may want to nudge)
//   OPENED         — link clicked, no seats placed yet
//                    → gold (warming up)
//   IN PROGRESS    — some seats placed, not all
//                    → gold (still working)
//   CONFIRMED      — every allocated seat is placed and dinner-picked
//                    → green (done — sponsor can stop watching)
//
// resolveDelegationStatus(delegation) returns one of the above keys.
// Reads delegation.seatsPlaced / seatsAllocated for the seats math
// and falls back to delegation.status when seat math isn't available.
const DELEGATION_STATUS = {
  invited: { c: BRAND.red, bg: 'rgba(212,38,74,0.14)', t: 'INVITED' },
  opened: { c: BRAND.gold, bg: 'rgba(244,185,66,0.16)', t: 'OPENED' },
  inProgress: { c: BRAND.gold, bg: 'rgba(244,185,66,0.16)', t: 'IN PROGRESS' },
  confirmed: { c: '#63c976', bg: 'rgba(99,201,118,0.14)', t: 'CONFIRMED' },
};

function resolveDelegationStatus(d) {
  if (!d) return 'invited';
  const placed = d.seatsPlaced || 0;
  const allocated = d.seatsAllocated || 0;
  if (allocated > 0 && placed >= allocated) return 'confirmed';
  if (placed > 0) return 'inProgress';
  // No seats placed yet — distinguish "they clicked the link" from
  // "they haven't touched it" using the raw delegation status.
  // 'active' = accessed_at filled. 'pending' = invited but no access.
  if (d.status === 'active') return 'opened';
  return 'invited';
}

export const DelegationStatusPill = ({ delegation, status }) => {
  // Backwards-compat: callers can pass a full delegation object OR a
  // raw status string. Prefer the object so we can derive the smart
  // state. Old call sites that only have a status string still work
  // and will fall back to the old buckets via the legacy map below.
  const key = delegation ? resolveDelegationStatus(delegation) : null;
  const s = key
    ? DELEGATION_STATUS[key]
    : LEGACY_STATUS_MAP[status] || DELEGATION_STATUS.invited;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.2,
        color: s.c,
        background: s.bg,
        padding: '4px 10px',
        borderRadius: 99,
      }}
    >
      {s.t}
    </span>
  );
};

// Legacy map for any caller still passing a plain status string.
const LEGACY_STATUS_MAP = {
  pending: DELEGATION_STATUS.invited,
  active: DELEGATION_STATUS.opened,
  finalized: DELEGATION_STATUS.confirmed,
};

// ── DelegateManage sheet body ─────────────────────────────────────────
//
// Header card with avatar / name / status / "X of Y placed" + email/phone,
// then three actions:
//   - Resend invite     POST /delegate { action: 'resend', delegation_id }
//   - Copy their link   navigator.clipboard.writeText(`/gala-seats/{token}`)
//   - Reclaim seats     DELETE /delegate?delegation_id=N (with confirm)
//
// On resend / reclaim success, the parent calls onRefresh to repopulate
// delegations from the API, then closes the sheet.

export const DelegateManage = ({ delegation, token, onRefresh, onClose, apiBase }) => {
  const [pending, setPending] = useState(null); // 'resend' | 'reclaim' | 'remind_dinners' | null
  const [error, setError] = useState(null);
  const [confirmReclaim, setConfirmReclaim] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reminded, setReminded] = useState(false);

  if (!delegation) return null;

  // Use the canonical production gala domain — this URL gets shared via
  // SMS/email to the delegate, so it must be absolute and stable across
  // sponsor browsing context (preview deploys, dev, etc.)
  const portalUrl = `https://gala.daviskids.org/sponsor/${delegation.token}`;

  const resend = async () => {
    setPending('resend');
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', delegation_id: delegation.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await onRefresh();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  };

  // Sponsor-only nudge to a delegation that has placed seats but missing
  // dinner choices. Sends a focused SMS+email asking them to pick meals.
  // Distinct from `resend` so we can show a friendlier confirmation
  // ("Reminder sent") and stay in the sheet — no need to close + refresh
  // since the delegation row itself is unchanged by this action.
  const remindDinners = async () => {
    setPending('remind_dinners');
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remind_dinners', delegation_id: delegation.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setReminded(true);
      setTimeout(() => setReminded(false), 3500);
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  };

  const reclaim = async () => {
    setPending('reclaim');
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/gala/portal/${token}/delegate?delegation_id=${delegation.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await onRefresh();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
      setConfirmReclaim(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fall back to selecting the text — older webviews may block clipboard
      // without user gesture. Phase 2 Capacitor.Clipboard will replace this.
    }
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 18,
          padding: 14,
          borderRadius: 14,
          background: 'var(--surface)',
          border: `1px solid var(--rule)`,
        }}
      >
        <Avatar name={delegation.delegateName} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-on-ground)' }}>
            {delegation.delegateName}
          </div>
          {(delegation.phone || delegation.email) && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--mute)',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {[delegation.phone, delegation.email].filter(Boolean).join(' · ')}
            </div>
          )}
          <div
            style={{
              fontSize: 11,
              color: 'var(--accent-italic)',
              marginTop: 4,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {delegation.seatsPlaced} of {delegation.seatsAllocated} placed
          </div>
        </div>
        <DelegationStatusPill delegation={delegation} />
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'rgba(212,38,74,0.12)',
            border: `1px solid rgba(212,38,74,0.4)`,
            color: '#ff8da4',
            fontSize: 12,
            marginBottom: 14,
          }}
        >
          {error.message}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Remind dinners — only when the delegate has placed seats but
            some have no meal choice yet. Distinct from "Resend invite"
            (which goes back to picking seats from scratch). Stays in
            the sheet on success and shows a transient confirmation
            because the delegation row itself doesn't change. */}
        {(delegation.seatsMissingDinner ?? 0) > 0 && (
          <button
            onClick={remindDinners}
            disabled={pending !== null || reminded}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 12,
              border: `1px solid ${reminded ? 'rgba(99,201,118,0.5)' : 'rgba(168,177,255,0.4)'}`,
              background: reminded
                ? 'rgba(99,201,118,0.10)'
                : 'rgba(168,177,255,0.08)',
              color: reminded ? '#63c976' : BRAND.indigoLight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: pending || reminded ? 'default' : 'pointer',
              opacity: pending && pending !== 'remind_dinners' ? 0.5 : 1,
              transition: 'all .2s',
            }}
          >
            <Icon name={reminded ? 'check' : 'msg'} size={16} />{' '}
            {reminded
              ? 'Reminder sent'
              : pending === 'remind_dinners'
                ? 'Sending…'
                : `Remind to pick dinner${delegation.seatsMissingDinner === 1 ? '' : 's'} (${delegation.seatsMissingDinner})`}
          </button>
        )}

        <button
          onClick={resend}
          disabled={pending !== null}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 12,
            border: `1px solid var(--rule)`,
            background: 'var(--surface)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending && pending !== 'resend' ? 0.5 : 1,
          }}
        >
          <Icon name="msg" size={16} />{' '}
          {pending === 'resend' ? 'Sending…' : 'Resend invite'}
        </button>

        <button
          onClick={copyLink}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 12,
            border: `1px solid var(--rule)`,
            background: 'var(--surface)',
            color: copied ? BRAND.indigoLight : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Icon name={copied ? 'check' : 'link'} size={16} />{' '}
          {copied ? 'Copied to clipboard' : 'Copy their link'}
        </button>

        <button
          onClick={() => setConfirmReclaim(true)}
          disabled={pending !== null}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 12,
            border: `1.5px solid rgba(212,38,74,0.4)`,
            background: 'transparent',
            color: BRAND.red,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: pending ? 'not-allowed' : 'pointer',
          }}
        >
          <Icon name="trash" size={16} /> Reclaim seats
        </button>
      </div>

      {confirmReclaim && (
        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 12,
            background: 'rgba(212,38,74,0.08)',
            border: `1px solid rgba(212,38,74,0.32)`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ff8da4', marginBottom: 6 }}>
            Reclaim {delegation.seatsAllocated} seat
            {delegation.seatsAllocated === 1 ? '' : 's'}?
          </div>
          <div style={{ fontSize: 12, color: 'var(--mute)', lineHeight: 1.55, marginBottom: 12 }}>
            {delegation.delegateName}'s link will stop working. Any seats they've already placed
            get unplaced and return to your block.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setConfirmReclaim(false)}
              disabled={pending !== null}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 99,
                border: `1.5px solid var(--rule)`,
                background: 'transparent',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={reclaim}
              disabled={pending !== null}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 99,
                border: 0,
                background: BRAND.red,
                color: '#fff',
                fontWeight: 700,
                fontSize: 13,
                cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              {pending === 'reclaim' ? 'Reclaiming…' : 'Reclaim seats'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ── Night tab ─────────────────────────────────────────────────────────

// V2 R6 — NightTab is now the FAQ surface (replaces the old timeline
// + good-to-know tiles, which had wrong times and pointed help to
// Sherry's email). Pulls from /api/gala/chat/faq — the same source
// of truth as gala.daviskids.org/faq and the Booker chatbot.
export const NightTab = () => (
  <div className="scroll-container" style={{ flex: 1, paddingBottom: 130 }}>
    <div style={{ padding: 'calc(env(safe-area-inset-top) + 12px) 56px 14px 22px' }}>
      <SectionEyebrow>Frequently asked</SectionEyebrow>
      <h1
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 36,
          fontWeight: 700,
          margin: '10px 0 6px',
          letterSpacing: -0.6,
          lineHeight: 1,
        }}
      >
        Questions & <i style={{ color: 'var(--accent-italic)', fontWeight: 500 }}>answers.</i>
      </h1>
      <div style={{ fontSize: 13, color: 'var(--mute)', lineHeight: 1.5 }}>
        Everything for Wednesday June 10. Search if you're looking for something
        specific — or ask Booker.
      </div>
    </div>
    <NightOfContent />
  </div>
);

// ── ios-glass-pill tab bar (the only variant we ship) ─────────────────

const ALL_TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'tickets', label: 'Tickets', icon: 'ticket' },
  { id: 'group', label: 'Guests', icon: 'users' },
  { id: 'night', label: 'FAQ', icon: 'info' },
];

const TabBar = ({ active, onChange, tabs = ALL_TABS }) => {
  const { isDark } = useTheme();
  return (
  <div
    className="tab-bar tab-bar-glass"
    style={{
      // Position lives in the .tab-bar CSS class now (was inline
      // here) so a desktop media query can flip it from
      // bottom-anchored pill to top-anchored nav on wider screens.
      // Phone: bottom-anchored pill. Desktop (>=880px): docked top
      // nav. See styles.css for the override.
      zIndex: 20,
      padding: '10px 18px 0',
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        padding: 8,
        width: '100%',
        maxWidth: 340,
        borderRadius: 32,
        // Phase 1.15 — glass background flips for light mode so the bar
        // doesn't disappear into the cream paper. Dark mode keeps the
        // existing translucent white glass; light mode uses translucent
        // ink for the same frosted-pill effect.
        background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(13,15,36,0.06)',
        backdropFilter: 'blur(28px) saturate(200%)',
        WebkitBackdropFilter: 'blur(28px) saturate(200%)',
        border: isDark ? '0.5px solid rgba(255,255,255,0.22)' : '0.5px solid rgba(13,15,36,0.10)',
        boxShadow: [
          '0 1px 0 0 rgba(255,255,255,0.30) inset',
          '0 -0.5px 0 0 rgba(255,255,255,0.08) inset',
          '0 8px 32px rgba(0,0,0,0.35)',
          '0 2px 8px rgba(0,0,0,0.25)',
        ].join(', '),
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 1,
          borderRadius: 31,
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 80%, rgba(255,255,255,0.06) 100%)',
        }}
      />
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => {
              // HAPTIC: light — tab tap.
              onChange(t.id);
            }}
            style={{
              all: 'unset',
              cursor: 'pointer',
              position: 'relative',
              flex: 1,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '8px 0',
              borderRadius: 24,
              background: isActive
                ? isDark
                  ? 'radial-gradient(ellipse at 50% 0%, rgba(244,185,66,0.32) 0%, rgba(244,185,66,0.14) 60%, rgba(244,185,66,0) 100%)'
                  : 'radial-gradient(ellipse at 50% 0%, rgba(168,177,255,0.34) 0%, rgba(168,177,255,0.16) 55%, rgba(168,177,255,0) 100%)'
                : 'transparent',
              // Phase 1.15 — inactive label uses var(--mute) so it
              // flips to a readable dark on paper in light mode.
              color: isActive ? BRAND.indigoLight : 'var(--mute)',
              transition: 'background .25s ease, color .2s',
            }}
          >
            <Icon name={t.icon} size={20} stroke={isActive ? 2.4 : 1.9} />
            <span
              style={{
                fontSize: 9,
                fontWeight: isActive ? 800 : 600,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  </div>
  );
};

// ── Floating avatar button ─────────────────────────────────────────────
//
// May 5 2026: AppBar removed entirely. The DEF logo + GALA·2026 / Sponsor
// portal text moved INTO the navy hero card on the Home tab — gala now
// follows childspree's pattern: zero top chrome, content bleeds edge to
// edge into the iOS safe area. Only the avatar/settings tap target
// remains as a floating circle in the top-right corner. Pinned to the
// safe-area inset so it clears the notch / dynamic island.
const FloatingAvatar = ({ name, onTap }) => {
  return (
    <button
      onClick={onTap}
      aria-label={`${initialsFor(name)} settings`}
      style={{
        position: 'absolute',
        top: 'calc(env(safe-area-inset-top) + 6px)',
        right: 14,
        zIndex: 25,
        all: 'unset',
        cursor: 'pointer',
        borderRadius: 99,
      }}
    >
      <Avatar name={name} size={34} />
    </button>
  );
};

// ── DEV banner ────────────────────────────────────────────────────────

const DevBanner = () => (
  <div
    style={{
      flexShrink: 0,
      padding: '4px 14px',
      background: BRAND.gold,
      color: BRAND.ink,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: 1.6,
      textAlign: 'center',
    }}
  >
    DEV PORTAL · NOT FOR SPONSORS · /GALA-DEV/(TOKEN)
  </div>
);

// ── Adapter: portal API → mobile data shape ───────────────────────────

const GALA_DATE = new Date(2026, 5, 10); // June 10, 2026
function daysUntilGala() {
  const ms = GALA_DATE - new Date();
  return Math.max(0, Math.ceil(ms / 86400000));
}

// SQLite returns show_start in formats that vary: 'HH:MM:SS', 'HH:MM',
// 'YYYY-MM-DD HH:MM:SS', or full ISO with T. Try each before giving up
// (returning '' rather than 'Invalid Date'). Output is locale-formatted
// as e.g. "4:30 PM".
const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});
export function formatShowTime(raw) {
  if (!raw) return '';
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const twelveHour = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([AP])\.?M\.?$/i);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = (twelveHour[2] || '00').padStart(2, '0');
    const meridiem = twelveHour[3].toUpperCase();
    if (!hour || hour > 12 || Number(minute) > 59) return '';
    return `${hour}:${minute} ${meridiem}M`;
  }
  let iso;
  if (trimmed.includes('T')) iso = trimmed;
  else if (trimmed.includes(' ')) iso = trimmed.replace(' ', 'T');
  else if (/^\d{1,2}:\d{2}/.test(trimmed)) iso = `2026-06-10T${trimmed.length === 5 ? `${trimmed}:00` : trimmed}`;
  else return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return TIME_FMT.format(d);
}
export function formatGalaDateTime(raw) {
  const t = formatShowTime(raw);
  return t ? `Wed Jun 10 · ${t}` : 'Wed Jun 10';
}

export function adaptPortalToMobileData(portal, theaterLayouts) {
  if (!portal) return null;
  const id = portal.identity || {};
  const isDelegation = id.kind === 'delegation';
  const tier = id.tier || id.parentTier || 'Sponsor';
  const name = id.contactName || id.delegateName || '';
  const company = id.company || id.parentCompany || '';
  const logoUrl = id.logoUrl || id.parentLogoUrl || null;
  const blockSize = id.seatsPurchased || id.seatsAllocated || 0;
  // Boarding-pass subline. For sponsors it's just the company name; for
  // delegates it's the parent company + the seat invitation count so they
  // immediately see who invited them and for how many.
  const subline = isDelegation
    ? `${company} invited you to ${blockSize} seat${blockSize === 1 ? '' : 's'}`
    : company;

  const showtimes = portal.showtimes || [];
  const theatersById = {};
  (theaterLayouts?.theaters || []).forEach((t) => {
    theatersById[t.id] = t;
  });
  const showtimeByTheater = {};
  showtimes.forEach((s) => {
    if (!showtimeByTheater[s.theater_id]) showtimeByTheater[s.theater_id] = s;
  });

  // tickets — group myAssignments + myHolds by theater
  const delegationsById = {};
  (portal.childDelegations || []).forEach((d) => {
    delegationsById[d.id] = d;
  });
  const ticketMap = new Map();
  const addRow = (row, status) => {
    const key = row.theater_id;
    if (!ticketMap.has(key)) {
      const st = showtimeByTheater[key];
      const theater = theatersById[key];
      ticketMap.set(key, {
        id: `t-${key}`,
        theaterId: key,
        showingNumber: st?.showing_number,
        showLabel: st?.showing_number === 1 ? 'Early' : st?.showing_number === 2 ? 'Late' : '',
        showTime: formatShowTime(st?.show_start),
        showFullDate: formatGalaDateTime(st?.show_start),
        dinnerTime: formatShowTime(st?.dinner_time),
        movieId: st?.movie_id,
        movieTitle: st?.movie_title,
        movieShort: st?.movie_title?.split(' ')[0] || '',
        posterUrl: st?.poster_url,
        theaterName: theater?.name || `Theater ${key}`,
        seats: [],
        // Per-seat delegation_id map: { 'F-7': 4, 'F-8': null } so
        // TicketManage chips can show per-chip assignment state and the
        // /assign endpoint can target individual seats.
        seatDelegations: {},
        // H1 — full assignment-row carry-through so DinnerPicker can
        // build the /pick set_dinner body without a second lookup.
        // Only 'claimed' rows (real myAssignments) are eligible for
        // dinner picking; 'pending' (myHolds) seats render the chip
        // but skip the picker until they finalize.
        assignmentRows: [],
        guestName: null,
        // delegationName populated when ANY of the ticket's seats is held
        // by a delegation. Triggers the "Held by {name}" pill in TicketsTab
        // when guest_name is empty.
        delegationName: null,
        status,
      });
    }
    const t = ticketMap.get(key);
    const sid = `${row.row_label}-${row.seat_num}`;
    const delegationId = row.delegation_id || null;
    const delegation = delegationId ? delegationsById[delegationId] : null;
    const sponsorName = name.trim().toLowerCase();
    const directGuestName = (row.guest_name || '').trim();
    const directGuest = !!directGuestName && (!sponsorName || directGuestName.toLowerCase() !== sponsorName);
    t.seats.push(sid);
    t.seatDelegations[sid] = delegationId;
    t.assignmentRows.push({
      seat_id: sid,
      theater_id: row.theater_id,
      row_label: row.row_label,
      seat_num: row.seat_num,
      dinner_choice: row.dinner_choice || null,
      guest_name: row.guest_name || null,
      delegation_id: delegationId,
      delegationName: delegation?.delegateName || row.delegate_name || null,
      ownerName: delegation?.delegateName || row.delegate_name || row.guest_name || name || null,
      ownerKind: delegationId || directGuest ? 'guest' : 'sponsor',
      managedBySponsor: !delegationId,
      status,
    });
    if (!t.guestName && row.guest_name) t.guestName = row.guest_name;
    if (!t.delegationName && delegation) t.delegationName = delegation.delegateName;
    if (status === 'pending' && t.status === 'claimed') t.status = 'pending';
  };
  (portal.myAssignments || []).forEach((r) => addRow(r, 'claimed'));
  (portal.myHolds || []).forEach((r) => addRow(r, 'pending'));
  const tickets = [...ticketMap.values()].sort(
    (a, b) => (a.showingNumber || 0) - (b.showingNumber || 0)
  );

  const decorateDelegationAssignment = (row) => {
    const st = showtimeByTheater[row.theater_id];
    const theater = theatersById[row.theater_id];
    const sid = `${row.row_label}-${row.seat_num}`;
    return {
      seat_id: sid,
      theater_id: row.theater_id,
      row_label: row.row_label,
      seat_num: row.seat_num,
      dinner_choice: row.dinner_choice || null,
      guest_name: row.guest_name || null,
      delegation_id: row.delegation_id || null,
      delegationName: row.delegate_name || delegationsById[row.delegation_id]?.delegateName || null,
      ownerName: row.delegate_name || delegationsById[row.delegation_id]?.delegateName || row.guest_name || null,
      ownerKind: 'guest',
      managedBySponsor: false,
      // Always 'claimed' — childDelegationAssignments comes from
      // seat_assignments (only finalized seats live there). Pre-pick
      // holds aren't included. Setting this lets the host-side dinner
      // picker condition (status === 'claimed') match for guest cards.
      status: 'claimed',
      showLabel: st?.showing_number === 1 ? 'Early' : st?.showing_number === 2 ? 'Late' : '',
      showTime: formatShowTime(st?.show_start),
      dinnerTime: formatShowTime(st?.dinner_time),
      movieId: st?.movie_id,
      movieTitle: st?.movie_title,
      movieShort: st?.movie_title?.split(' ')[0] || '',
      posterUrl: st?.poster_url,
      theaterName: theater?.name || `Theater ${row.theater_id}`,
    };
  };

  const childAssignments = (portal.childDelegationAssignments || []).map(decorateDelegationAssignment);
  const childAssignmentsByDelegation = {};
  childAssignments.forEach((row) => {
    if (!row.delegation_id) return;
    if (!childAssignmentsByDelegation[row.delegation_id]) childAssignmentsByDelegation[row.delegation_id] = [];
    childAssignmentsByDelegation[row.delegation_id].push(row);
  });

  const guestTicketMap = new Map();
  childAssignments.forEach((row) => {
    const key = `${row.delegation_id}-${row.theater_id}`;
    if (!guestTicketMap.has(key)) {
      guestTicketMap.set(key, {
        id: `g-${key}`,
        theaterId: row.theater_id,
        delegationId: row.delegation_id,
        delegationName: row.delegationName,
        showLabel: row.showLabel,
        showTime: row.showTime,
        dinnerTime: row.dinnerTime,
        movieId: row.movieId,
        movieTitle: row.movieTitle,
        movieShort: row.movieShort,
        posterUrl: row.posterUrl,
        theaterName: row.theaterName,
        seats: [],
        assignmentRows: [],
        ownerKind: 'guest',
      });
    }
    const t = guestTicketMap.get(key);
    t.seats.push(row.seat_id);
    t.assignmentRows.push(row);
  });
  const guestTickets = [...guestTicketMap.values()].sort(
    (a, b) => (a.showTime || '').localeCompare(b.showTime || '') || (a.movieTitle || '').localeCompare(b.movieTitle || '')
  );

  // delegations — sub-token records from the API (sponsor_delegations
  // table). Each has its own portal token, SMS/email invite history, and
  // seatsAllocated/seatsPlaced counters. Phase 1.6 promotes these to the
  // primary "Group" tab concept; they replace the v1.5 synthesized "guest"
  // list (which was just unique guest_name strings off seat_assignments).
  const delegations = (portal.childDelegations || []).map((d) => ({
    ...d,
    assignments: childAssignmentsByDelegation[d.id] || [],
  }));

  // lineup — unique movies across all showtimes
  const movieMap = new Map();
  // Phase 5.5 — for each unique movie in the lineup, collect every
  // showtime that plays it so the MovieDetailSheet can render a
  // schedule block ("Early · 4:30 PM · Auditorium 7"). Some films
  // play in both the early and late slot (different theaters); some
  // play only in one. The schedule needs to be stable-sorted by
  // showing_number so 'Early' always renders above 'Late'.
  showtimes.forEach((s) => {
    if (movieMap.has(s.movie_id)) return;
    movieMap.set(s.movie_id, enrichMovieScores({
      id: s.movie_id,
      title: s.movie_title,
      short: s.movie_title?.split(' ')[0] || '',
      rating: s.rating,
      runtime: s.runtime_minutes,
      posterUrl: s.poster_url,
      // Carry the rest of the movie metadata so the MovieDetailSheet
      // (opened from the home tab lineup) has a synopsis, year,
      // backdrop, and trailer to render. Without these the sheet
      // shows just a poster + title and looks broken.
      thumbnailUrl: s.thumbnail_url,
      backdropUrl: s.backdrop_url,
      trailerUrl: s.trailer_url,
      trailerVideoUrl: s.trailer_video_url,
      streamUid: s.stream_uid,
      synopsis: s.synopsis,
      year: s.year,
      tmdbScore: s.tmdb_score,
      tmdbVoteCount: s.tmdb_vote_count,
      rtCriticsScore: s.rt_critics_score,
      rtAudienceScore: s.rt_audience_score,
      rtUrl: s.rt_url,
      // Schedule: filled in below after movieMap is seeded so we
      // capture every showtime row that plays this movie (a film
      // playing in both early + late lands two entries here).
      schedule: [],
    }));
  });
  // Second pass — append every showtime to its movie's schedule.
  showtimes.forEach((s) => {
    const m = movieMap.get(s.movie_id);
    if (!m) return;
    const theater = theatersById[s.theater_id];
    m.schedule.push({
      theaterId: s.theater_id,
      theaterName: theater?.name || `Theater ${s.theater_id}`,
      showingNumber: s.showing_number,
      showLabel:
        s.showing_number === 1 ? 'Early' :
        s.showing_number === 2 ? 'Late' : '',
      showTime: formatShowTime(s.show_start),
      showStart: s.show_start, // raw, for any future sorting needs
    });
  });
  // Sort each movie's schedule: Early before Late, then by raw start
  // time as tiebreaker. Done in-place after collection so multiple
  // entries per showing slot also stay deterministic.
  movieMap.forEach((m) => {
    m.schedule.sort((a, b) => {
      if (a.showingNumber !== b.showingNumber) {
        return (a.showingNumber || 99) - (b.showingNumber || 99);
      }
      return String(a.showStart || '').localeCompare(String(b.showStart || ''));
    });
  });
  const lineup = [...movieMap.values()];

  return {
    tier,
    name,
    company,
    logoUrl,
    subline,
    isDelegation,
    blockSize,
    tickets,
    guestTickets,
    delegations,
    lineup,
    daysOut: daysUntilGala(),
    seatMath: portal.seatMath || { total: 0, placed: 0, delegated: 0, available: 0 },
    // Phase 5.3 — Tickets-tab CTA state machine. For sponsors,
    // rsvpStatus === 'completed' means the sponsor has fired
    // /finalize and the QR has been issued. For delegations, the
    // 'finalized' status means the delegate has finalized their
    // sub-block. The TicketCard uses this to switch its bottom CTA
    // between 'Select meals', 'Finalize seats', and 'View'.
    isFinalized: isDelegation
      ? id.status === 'finalized'
      : id.rsvpStatus === 'completed',
    // Phone on file for the underlying sponsor record. Used by the
    // "Text my seats to me" button to display a masked destination
    // ("Text my seats to (•••) •••-6642") so anyone tapping the
    // button can see whose phone the SMS will hit before pressing.
    // For delegations this is the delegate's own phone, but the button
    // is hidden for delegations anyway (server returns 403).
    sponsorPhone: id.phone || null,
  };
}

// ── GuestForm sheet body ──────────────────────────────────────────────
//
// Lifted from portal-mobile.jsx 504-559. The legacy in-portal "guest"
// model has been superseded by sponsor_delegations (POST /delegate fires
// real Twilio invites, sub-tokens, etc.) and per-seat assignment via
// POST /assign — see DelegateForm + SeatAssignSheet below. The
// GuestField helper here is reused by SettingsSheet's profile form so
// the input styling stays consistent.

const GuestField = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label style={{ display: 'block', marginBottom: 14 }}>
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1.4,
        color: 'var(--accent-text)',
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '14px 14px',
        borderRadius: 12,
        border: `1px solid var(--rule)`,
        background: 'var(--surface)',
        color: '#fff',
        fontSize: 15,
        fontFamily: FONT_UI,
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  </label>
);

// ── DelegateForm sheet body ───────────────────────────────────────────
//
// Replaces v1.5 GuestForm. Real submit hits POST /api/gala/portal/{token}
// /delegate which creates a sub-token, fires SMS via Twilio, and emails
// the recipient an invite. seatsAllocated is capped to seatMath.available
// so the +/- spinner can't oversubscribe. Server re-validates capacity.

// DelegateForm — V2 R13.
//
// Two modes, controlled by which props the caller passes:
//
//   Mode A (quota mode) — when invoked from the bare 'Invite a guest'
//     button before any seats are placed. Caller passes 'available'
//     (number of seats the sponsor still has to give) and DOES NOT
//     pass seatPills. The form shows a +/- counter ('1 of N'). The
//     allocated seats are spent later when the guest picks them via
//     their personal portal.
//
//   Mode B (specific-seats mode) — when invoked from a context where
//     the seats are already known: per-seat '+ Invite' on a Tickets
//     row, the post-pick 'Invite a guest' flow, or 'Hand to a guest'
//     on a placed block. Caller passes 'seatPills' as an array of
//     seat ids (e.g. ['F-9','F-10']). The form shows tappable seat
//     pills instead of a counter. Tap a pill to drop it from the
//     invite (split-block use case). At least 1 must remain selected.
//
// onCreated receives the new delegation AND the final list of seat
// ids the user kept selected (for Mode B), so the caller can chain a
// /assign for those exact seats. Mode A passes through with no seat
// ids (assignment happens later when the guest picks).
export const DelegateForm = ({
  token,
  apiBase,
  available,
  onCreated,
  onClose,
  // R13 — Mode B: array of seat ids (strings like 'F-9'); when set,
  // the form renders seat pills instead of the quota counter.
  seatPills = null,
  // Phase 5.4 — when supplied, defines which seats start CHECKED in
  // the pill picker. Without it, every seat in seatPills is selected
  // by default (the original group-invite contract). With it, the
  // form shows the full giveable block as the visible pill universe
  // but starts only the listed seats checked — the entry-from-a-row
  // case where one seat triggered the invite but the user might want
  // to add more. Pass either an array or a Set.
  preselectedPills = null,
  // Legacy: locks the counter to a specific count. Kept for any
  // call sites still on the old contract; prefer seatPills.
  lockSeats = null,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // Mode B uses selectedPills as the source of truth. Mode A uses
  // the seats counter.
  //
  // Initial-selection rule:
  //   - if preselectedPills is supplied: start only those checked
  //     (they MUST be a subset of seatPills; non-overlapping ids are
  //     ignored)
  //   - else: start every pill in seatPills checked (group-invite
  //     legacy behavior)
  const [selectedPills, setSelectedPills] = useState(() => {
    if (preselectedPills) {
      const universe = new Set(seatPills || []);
      const initial = Array.from(preselectedPills).filter((id) => universe.has(id));
      return new Set(initial);
    }
    return new Set(seatPills || []);
  });
  const [seats, setSeats] = useState(
    seatPills?.length ?? lockSeats ?? (Math.min(available, 2) || 1),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  // In Mode B the effective seat count is the number of pills still
  // selected. In Mode A it's the counter value.
  const effectiveSeats = seatPills ? selectedPills.size : seats;

  const valid =
    name.trim() &&
    (phone.trim() || email.trim()) &&
    effectiveSeats >= 1 &&
    (seatPills ? true : effectiveSeats <= available);

  const submit = async () => {
    if (!valid) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delegate_name: name.trim(),
          delegate_phone: phone.trim() || undefined,
          delegate_email: email.trim() || undefined,
          seats_allocated: effectiveSeats,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      // R13 — pass back BOTH the new delegation AND the final seat
      // selection so the caller can chain /assign for Mode B. Mode A
      // returns null for keptSeats (no specific assignment yet).
      const keptSeats = seatPills ? Array.from(selectedPills) : null;
      if (onCreated) await onCreated(j.delegation, keptSeats);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };

  const togglePill = (sid) => {
    setSelectedPills((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) {
        // Don't let them deselect the last one — at least 1 must
        // remain. The pill stays solid; submit stays valid.
        if (next.size > 1) next.delete(sid);
      } else {
        next.add(sid);
      }
      return next;
    });
  };

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 16, lineHeight: 1.55 }}>
        {seatPills
          ? "We'll text + email a link with these specific seats. They get a personal portal you can keep tabs on right here."
          : "We'll text + email a link so they select their own seats. They get a personal portal you can keep tabs on right here."}
      </div>

      <GuestField label="NAME" value={name} onChange={setName} placeholder="Their full name" />
      <GuestField
        label="PHONE"
        value={phone}
        onChange={setPhone}
        placeholder="(801) 555-0100"
        type="tel"
      />
      <GuestField
        label="EMAIL"
        value={email}
        onChange={setEmail}
        placeholder="they@example.com"
        type="email"
      />

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1.4,
            color: 'var(--accent-italic)',
            marginBottom: 6,
          }}
        >
          {seatPills ? 'SEATS' : 'SEATS TO ASSIGN'}
        </div>
        {seatPills ? (
          // Mode B — tap-to-deselect seat pills. At least 1 must stay
          // selected. Selected pills are solid indigo; deselected
          // pills go to a faded outline (still tappable to re-add).
          <div
            style={{
              padding: '12px',
              borderRadius: 12,
              border: `1px solid var(--rule)`,
              background: 'rgba(168,177,255,0.06)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            {seatPills.map((sid) => {
              const on = selectedPills.has(sid);
              return (
                <button
                  key={sid}
                  type="button"
                  onClick={() => togglePill(sid)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '8px 14px',
                    borderRadius: 99,
                    background: on
                      ? 'rgba(168,177,255,0.18)'
                      : 'transparent',
                    border: `1.5px ${on ? 'solid' : 'dashed'} ${on ? 'rgba(168,177,255,0.45)' : 'rgba(255,255,255,0.20)'}`,
                    fontFamily: FONT_DISPLAY,
                    fontSize: 15,
                    fontWeight: 700,
                    color: on ? BRAND.indigoLight : 'rgba(255,255,255,0.50)',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: 0.3,
                    textDecoration: on ? 'none' : 'line-through',
                    textDecorationThickness: '1.5px',
                    textDecorationColor: 'rgba(255,255,255,0.40)',
                  }}
                >
                  {seatLabel(sid)}
                </button>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: 12,
              border: `1px solid var(--rule)`,
              background: 'rgba(168,177,255,0.06)',
            }}
          >
            <button
              onClick={() => setSeats((s) => Math.max(1, s - 1))}
              disabled={seats <= 1 || lockSeats !== null}
              style={{
                width: 36,
                height: 36,
                borderRadius: 99,
                border: `1.5px solid var(--rule)`,
                background: 'transparent',
                color: '#fff',
                cursor: seats <= 1 || lockSeats !== null ? 'not-allowed' : 'pointer',
                fontSize: 20,
                opacity: seats <= 1 || lockSeats !== null ? 0.4 : 1,
              }}
            >
              −
            </button>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 36,
                fontWeight: 700,
                color: 'var(--accent-italic)',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {seats}
              <span
                style={{ color: 'var(--mute)', fontSize: 14, fontStyle: 'italic', fontWeight: 400 }}
              >
                {' '}of {available}
              </span>
            </div>
            <button
              onClick={() => setSeats((s) => Math.min(available, s + 1))}
              disabled={seats >= available || lockSeats !== null}
              style={{
                width: 36,
                height: 36,
                borderRadius: 99,
                border: `1.5px solid var(--rule)`,
                background: 'transparent',
                color: '#fff',
                cursor: seats >= available || lockSeats !== null ? 'not-allowed' : 'pointer',
                fontSize: 20,
                opacity: seats >= available || lockSeats !== null ? 0.4 : 1,
              }}
            >
              +
            </button>
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'rgba(212,38,74,0.12)',
            border: `1px solid rgba(212,38,74,0.4)`,
            color: '#ff8da4',
            fontSize: 12,
            marginBottom: 14,
          }}
        >
          {error.message}
        </div>
      )}

      <button
        onClick={submit}
        disabled={!valid || pending}
        style={{
          width: '100%',
          padding: '14px 16px',
          borderRadius: 99,
          border: 0,
          background: !valid || pending ? 'rgba(255,255,255,0.1)' : BRAND.gradient,
          color: '#fff',
          fontWeight: 700,
          fontSize: 14,
          cursor: !valid || pending ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Icon name="msg" size={16} />{' '}
        {pending ? 'Sending invite…' : `Invite ${name.split(' ')[0] || 'them'}`}
      </button>
      <div
        style={{
          fontSize: 11,
          color: 'var(--mute)',
          marginTop: 8,
          textAlign: 'center',
          lineHeight: 1.55,
        }}
      >
        Phone or email required (we send both when both are filled in).
      </div>
    </>
  );
};

// ── Sheet (bottom modal) ──────────────────────────────────────────────

const Sheet = ({ open, onClose, title, children, forceDark = false }) => {
  const { isDark: systemDark } = useTheme();
  const withinFrame = useContext(SheetFrameContext);
  // Phase 1.15 — forceDark lets the SeatPickSheet host the cinema/seat-pick
  // experience in dark navy regardless of system theme, matching its
  // dark-cinema intent. PostPickSheet and AssignTheseSheet leave forceDark
  // off so they flip with the OS like other forms/dialogs.
  const isDark = systemDark || forceDark;
  if (!open) return null;
  return (
    <div
      className="sheet-backdrop"
      onClick={onClose}
      style={{
        position: withinFrame ? 'absolute' : 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 50,
        display: 'flex',
        // Phone: bottom-anchored. On >=880px a CSS media query flips
        // align-items to 'center' so the panel sits in the middle of
        // the screen as a centered modal — web-native pattern.
        alignItems: 'flex-end',
      }}
    >
      <div
        className={`sheet-panel ${isDark ? 'force-dark-vars' : ''}`.trim()}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '88%',
          background: isDark ? BRAND.navyDeep : '#ffffff',
          color: isDark ? '#fff' : BRAND.ink,
          // Phone: rounded top corners only (slides up from bottom).
          // Desktop CSS overrides to round all corners for the
          // centered-modal look.
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          padding: '8px 0 24px',
          display: 'flex',
          flexDirection: 'column',
          borderTop: `1px solid ${isDark ? BRAND.rule : BRAND.ruleDark}`,
          animation: 'slideUp 0.25s ease-out',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(13,18,36,0.25)',
            borderRadius: 2,
            alignSelf: 'center',
            marginBottom: 14,
          }}
        />
        {title && (
          <div
            style={{
              padding: '0 22px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: `1px solid ${isDark ? BRAND.rule : BRAND.ruleDark}`,
            }}
          >
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600 }}>
              {title}
            </div>
            <button
              aria-label="Close dialog"
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 99,
                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(13,18,36,0.08)',
                border: 0,
                color: isDark ? '#fff' : BRAND.ink,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="scroll-container" style={{ flex: 1, padding: '18px 22px' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

// ── TicketManage sheet body ───────────────────────────────────────────
//
// Lifted from portal-mobile.jsx 562-617. Header card (poster + showing
// label + movie title + theater + count), seat chips ("yours" indigo),
// per-seat tap-to-assign opening SeatAssignSheet (Phase 1.6 B2 wired
// the real /assign endpoint there), Unplace + Done buttons at the
// bottom. onUnplace fans out per-seat /pick action:'unfinalize' calls
// via useSeats.unplace().

// SmallAvatar — inline next to seat number when a delegation owns the seat.
const SmallAvatar = ({ name, size = 16 }) => {
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        background: BRAND.indigoLight,
        color: BRAND.ink,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.55,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
};

export const TicketManage = ({ ticket, delegations, onTapSeat, onUnplace, onClose, pending }) => {
  const delegationsById = {};
  delegations.forEach((d) => {
    delegationsById[d.id] = d;
  });
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 18,
          padding: 14,
          borderRadius: 14,
          background: 'var(--surface)',
          border: `1px solid var(--rule)`,
        }}
      >
        <PosterMini
          poster={ticket.posterUrl}
          color={ticket.color}
          label={ticket.movieShort}
          size={44}
          showLabel={false}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: 'var(--accent-text)' }}
          >
            {(ticket.showLabel || '').toUpperCase()} ·{' '}
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{ticket.showTime}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-on-ground)', marginTop: 2 }}>
            {ticket.movieTitle}
          </div>
          <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>
            {ticket.theaterName} · {ticket.seats.length} seat
            {ticket.seats.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.4,
          color: 'var(--accent-italic)',
          marginBottom: 8,
        }}
      >
        TAP A SEAT TO ASSIGN
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        {ticket.seats.map((s) => {
          const delegId = ticket.seatDelegations?.[s] || null;
          const deleg = delegId ? delegationsById[delegId] : null;
          return (
            <button
              key={s}
              onClick={() => onTapSeat(s)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: 6,
                background: 'rgba(168,177,255,0.18)',
                color: 'var(--accent-italic)',
                fontSize: 12,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: deleg ? `1px solid ${BRAND.indigoLight}` : '1px solid transparent',
              }}
            >
              {deleg && <SmallAvatar name={deleg.delegateName} size={16} />}
              {s.replace('-', '')}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 18, lineHeight: 1.55 }}>
        Tap a seat number to choose who's sitting there — pull from your invited group, or invite
        someone new just for that seat.
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onUnplace}
          disabled={pending}
          style={{
            padding: '14px 16px',
            borderRadius: 99,
            border: `1.5px solid rgba(212,38,74,0.4)`,
            background: 'transparent',
            color: BRAND.red,
            fontWeight: 700,
            fontSize: 13,
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.5 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icon name="undo" size={14} /> {pending ? 'Working…' : 'Unplace'}
        </button>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: '14px 16px',
            borderRadius: 99,
            border: 0,
            background: BRAND.red,
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </>
  );
};

// ── SeatAssignSheet body — per-seat picker ────────────────────────────
//
// Opens when user taps a seat chip in TicketManage. Lists all
// childDelegations as picker rows; selecting one POSTs /assign with
// that single seat. Bottom row "Invite someone new just for this seat"
// opens DelegateForm in seat-bound mode (seats locked to 1, on submit
// chains POST /assign for the new delegation).

export const SeatAssignSheet = ({
  seat,
  ticket,
  delegations,
  token,
  apiBase,
  onRefresh,
  onClose,
  onInviteNew,
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  if (!seat) return null;
  const currentDelegId = ticket?.seatDelegations?.[seat] || null;

  const assign = async (delegationId) => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theater_id: ticket.theaterId,
          seat_ids: [seat],
          delegation_id: delegationId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await onRefresh();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 18, lineHeight: 1.55 }}>
        Who's in <b style={{ color: 'var(--accent-italic)' }}>seat {seat.replace('-', '')}</b> at{' '}
        {ticket.theaterName} for the {ticket.showLabel.toLowerCase()} showing of{' '}
        <b style={{ color: '#fff' }}>{ticket.movieTitle}</b>?
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'rgba(212,38,74,0.12)',
            border: `1px solid rgba(212,38,74,0.4)`,
            color: '#ff8da4',
            fontSize: 12,
            marginBottom: 14,
          }}
        >
          {error.message}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {[...delegations, null].map((d, i) => {
          const isCurrent = (d?.id || null) === currentDelegId;
          return (
            <button
              key={d?.id ?? `none-${i}`}
              onClick={() => assign(d?.id ?? null)}
              disabled={pending}
              style={{
                all: 'unset',
                cursor: pending ? 'not-allowed' : 'pointer',
                padding: '12px',
                borderRadius: 12,
                background: isCurrent
                  ? 'rgba(168,177,255,0.14)'
                  : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${isCurrent ? BRAND.indigoLight : BRAND.rule}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                opacity: pending && !isCurrent ? 0.5 : 1,
              }}
            >
              {d ? (
                <Avatar name={d.delegateName} size={32} />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 99,
                    border: `1.5px dashed var(--rule)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--mute)',
                  }}
                >
                  <Icon name="user" size={14} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {d ? d.delegateName : 'No one yet (clear assignment)'}
                </div>
                {d && (d.phone || d.email) && (
                  <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>
                    {d.phone || d.email}
                  </div>
                )}
              </div>
              {isCurrent && <Icon name="check" size={16} stroke={2} />}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onInviteNew(seat, ticket.theaterId)}
        disabled={pending}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: 12,
          border: `1.5px dashed var(--rule)`,
          background: 'transparent',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: pending ? 'not-allowed' : 'pointer',
        }}
      >
        <Icon name="plus" size={14} /> Invite someone new for this seat
      </button>
    </>
  );
};

// ── Mobile root ───────────────────────────────────────────────────────

export default function Portal({
  portal,
  token,
  theaterLayouts,
  seats,
  isDev,
  onRefresh,
  openSheetOnMount = false,
  desktopFrame = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isDark } = useTheme();
  // Wizard's "Take me to my tickets" CTA navigates here with ?tab=tickets
  // so we land on the right tab without needing a global tab store.
  const initialTab = searchParams.get('tab') || 'home';
  const [tab, setTab] = useState(initialTab);
  // After /finalize succeeds via the canonical PostPickSheet "Done" CTA,
  // useFinalize captures the response in confirmationData and Mobile
  // short-circuits to ConfirmationScreen. The legacy MobileWizard path
  // also feeds in via route state (navigate('', {state:{confirmation}}))
  // — initialConfirmationData seeds from route state on first render so
  // both entry points reach the same ConfirmationScreen short-circuit
  // without flicker.
  const {
    finalize,
    finalizing,
    error: finalizeError,
    clearError: clearFinalizeError,
    confirmationData,
    setConfirmationData,
  } = useFinalize({
    apiBase: config.apiBase,
    token,
    onRefresh,
    initialConfirmationData: location.state?.confirmation || null,
  });
  const [ticketSheet, setTicketSheet] = useState(null);
  const [delegationSheet, setDelegationSheet] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // inviteOpen: { seat?, theaterId? } | true | false. true → bare invite,
  // { seat, theaterId } → invite then chain /assign for that seat.
  const [inviteOpen, setInviteOpen] = useState(false);
  // seatPicker: { seat, ticket } | null — opens SeatAssignSheet.
  const [seatPicker, setSeatPicker] = useState(null);

  // Phase 1.15 — adopted PR #56 architecture. The four states below
  // drive the SeatPick → PostPick → AssignThese → DinnerPicker chain.
  // SeatPickSheet (single source of truth for seat picking) replaces
  // both the legacy wizard's StepShowing+StepSeats AND Phase 1.14's
  // Step2Pick-export overlay. PostPickSheet asks "what next?" with
  // three cards. AssignTheseSheet does multi-seat batch delegation.
  // DinnerPicker scopes to just-placed seats.
  const [seatPickOpen, setSeatPickOpen] = useState(false);
  // Phase 5.5 — when SeatPickSheet is opened from a MovieDetailSheet
  // CTA, this carries the showing/movie that the sheet should land on
  // (rather than defaulting to showings[0] or the placed-seats theater).
  // null means "no preselection — use existing init logic."
  const [seatPickInitial, setSeatPickInitial] = useState(null);
  // Task 11: `/seats` deep-link now flows through `openSheetOnMount`
  // (App.jsx no longer routes /seats to MobileWizard). Deps
  // `[openSheetOnMount]` (NOT `[]`) so route changes from `/:token` →
  // `/:token/seats` re-fire when React Router keeps the same component
  // instance mounted across path changes — per spec, "the URL opens the
  // sheet, every time."
  useEffect(() => {
    if (openSheetOnMount) setSeatPickOpen(true);
  }, [openSheetOnMount]);
  const [postPick, setPostPick] = useState(null);
  const [dinnerOpen, setDinnerOpen] = useState(false);
  // V2 R11 — post-pick state machine. The user lands on
  // PostPickOverview after seat selection, taps Invite or Pick meals,
  // does the inner action, returns here. Done unlocks when both
  // counters hit 0 → CompletionCelebration. The sub-states:
  //   'overview'   — the persistent screen with counters (default)
  //   'whichSeats' — picking which seats to invite for
  //   'celebrate'  — post-Done celebration screen with the ticket
  // Pick meals tap sets dinnerOpen (existing surface); when it closes
  // we return to overview automatically.
  const [postPickStep, setPostPickStep] = useState('overview');
  const [postPickInviteSeats, setPostPickInviteSeats] = useState(null); // string[] | null
  // V2 R3 — per-seat sheets driven by TicketCard row buttons. R4
  // collapsed the per-seat invite into the canonical DelegateForm via
  // setInviteOpen({theaterId, seat}); only the dinner sheet remains
  // as a dedicated V2 surface here.
  const [dinnerSheet, setDinnerSheet] = useState(null); // seat object | null
  // V2 R5 — TicketDetailSheet (per-group ticket view with QR + save-
  // to-phone). Opened from TicketCard's "View ticket" button.
  const [ticketDetail, setTicketDetail] = useState(null); // ticket | null

  // F4 / Phase 1.15.x — MovieDetailSheet open state. Wired on May 5
  // 2026 — previously SeatPickSheet was passed an inert onMovieDetail
  // callback because the wizard already had its own movieDetail state
  // and the new sheet path was added without porting the same wiring.
  // Result: tapping the movie card did literally nothing. Mirrors the
  // Desktop.jsx + MobileWizard.jsx pattern (set state, render sheet
  // conditionally).
  const [movieDetail, setMovieDetail] = useState(null);

  const data = useMemo(
    () => adaptPortalToMobileData(portal, theaterLayouts),
    [portal, theaterLayouts]
  );

  if (!data) return null;

  // canFinalize gate — the host computes whether PostPickSheet's "Done"
  // CTA should fire /finalize (canonical canFinalize=true) or just
  // dismiss (false). Server contract is permissive (only requires >= 1
  // placed seat), so the UX gate is "all entitled seats placed". Dinners
  // are NOT part of the gate; sponsors pick them later.
  const placedCount = (portal?.myAssignments || []).length;
  // personalQuota — sponsor's directly-placeable cap. Server pick.js:240
  // caps at (total - delegated): seats given to a sub-delegation are the
  // delegate's responsibility. Sponsors with active sub-delegations would
  // never reach placedCount >= blockSize themselves, so canFinalize would
  // never trip. Use the personal quota instead.
  const delegatedAway = data.seatMath?.delegated ?? 0;
  const personalQuota = Math.max(0, (data.blockSize || 0) - delegatedAway);
  const canFinalize = placedCount >= personalQuota && personalQuota > 0;

  // Tickets are passed through without the v1 localGuestId shim — per-seat
  // assignment now lives in ticket.seatDelegations from the API.
  const ticketsWithLocalGuests = data.tickets;

  // Merge real guests (from myAssignments.guest_name) with local additions.
  // Real takes precedence on name collision.
  // Phase 1.15 — `goSeats` opens SeatPickSheet (the canonical sheet
  // Phase 1.15 — `goSeats` opens SeatPickSheet (the canonical sheet
  // adopted from PR #56). Always refreshes portal state first so the
  // picker has accurate myAssignments/allAssignments/holds — without
  // this, stale state from page-load could let the user click their
  // own already-placed seats (filter logic depends on allSelfIds being
  // current) or miss seats that other sponsors just took.
  // The legacy wizard route ?step=seats still resolves for back-compat.
  const goSeats = async () => {
    if (onRefresh) await onRefresh();
    setSeatPickOpen(true);
  };
  const openTicket = (t) => setTicketSheet(t);
  const openInvite = () => setInviteOpen(true);
  const openSeatPicker = (seat) => {
    if (!ticketSheet) return;
    setSeatPicker({ seat, ticket: ticketSheet });
  };
  const inviteForSeat = (seat, theaterId) => {
    setSeatPicker(null);
    setInviteOpen({ seat, theaterId });
  };

  const onUnplace = async () => {
    if (!ticketSheet || !seats) return;
    try {
      await seats.unplace(ticketSheet.theaterId, ticketSheet.seats);
      setTicketSheet(null);
    } catch {
      // pickError surfaced by useSeats; sheet stays open
    }
  };

  // After DelegateForm creates a new delegation, optionally chain a
  // /assign call so the seat that triggered the invite goes straight to
  // the new delegate. inviteOpen carries { seat, theaterId } when the
  // invite was launched from SeatAssignSheet's "Invite someone new"
  // CTA. R13 — DelegateForm now passes (newDeleg, keptSeats) where
  // keptSeats is the array of seat ids the user left selected in the
  // pill picker. Use that for /assign so dropped pills stay open.
  const onDelegationCreated = async (newDeleg, keptSeats) => {
    // seatBinding tells us the theater_id; keptSeats tells us which
    // seat ids to bind. If the form ran in Mode A (no pills) keptSeats
    // is null and no /assign happens — the guest will pick later.
    const seatBinding = typeof inviteOpen === 'object' ? inviteOpen : null;
    const ids = keptSeats
      ?? (seatBinding
        ? (seatBinding.seatIds || (seatBinding.seat ? [seatBinding.seat] : []))
        : []);
    if (ids.length > 0 && newDeleg?.id && seatBinding?.theaterId) {
      try {
        await fetch(`${config.apiBase}/api/gala/portal/${token}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            theater_id: seatBinding.theaterId,
            seat_ids: ids,
            delegation_id: newDeleg.id,
          }),
        });
      } catch {
        // Soft-fail: the delegation was created (Twilio fired); the assign
        // chain is convenience only. User can pick the new delegation via
        // SeatAssignSheet on next open.
      }
    }
    if (onRefresh) await onRefresh();
  };

  // Confirmation short-circuit — full-page replacement, NOT a sheet.
  // Order matters: render BEFORE the AppBar/TabBar tree so the user
  // sees a confirmation experience (matching OLD renderDoneScreen at
  // gala-seats-app.html line 2593-2626).
  if (confirmationData) {
    return (
      <ConfirmationScreen
        name={data.name}
        data={confirmationData}
        isDev={isDev}
        logoUrl={data.logoUrl}
        onEdit={() => {
          // Phase 5.3 — celebration dismiss returns user to Home tab,
          // not back to wherever they triggered finalize from. The
          // Home tab is the "you're done, here's everything" view;
          // landing there post-celebration is the natural next beat.
          setConfirmationData(null);
          setTab('home');
          // Strip the route state so a refresh doesn't re-show
          // confirmation. replace: true keeps the URL stable.
          navigate('', { replace: true });
        }}
      />
    );
  }

  return (
    <SheetFrameContext.Provider value={desktopFrame}>
      <div
        className={desktopFrame ? 'portal-shell-root portal-shell-root--desktop-frame' : 'portal-shell-root'}
        data-testid="portal-shell-root"
        style={{
          width: '100%',
          height: '100dvh',
          overflow: 'hidden',
          position: 'relative',
          background: isDark ? BRAND.navyDeep : 'var(--ground)',
          color: isDark ? '#fff' : BRAND.ink,
          fontFamily: FONT_UI,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
      {isDev && <DevBanner />}
      <FloatingAvatar name={data.name} onTap={() => setSettingsOpen(true)} />

      {tab === 'home' && (
        <HomeTab
          data={{ ...data, tickets: ticketsWithLocalGuests }}
          onPlaceSeats={goSeats}
          onInvite={openInvite}
          onAssign={openTicket}
          onMovieDetail={setMovieDetail}
          onManageTickets={() => setTab('tickets')}
          onViewTicket={(ticket) => setTicketDetail(ticket)}
          token={token}
          apiBase={config.apiBase}
        />
      )}
      {tab === 'tickets' && (
        <TicketsTab
          data={{ ...data, tickets: ticketsWithLocalGuests }}
          daysOut={data.daysOut}
          token={token}
          apiBase={config.apiBase}
          onRefresh={onRefresh}
          onPlaceSeats={goSeats}
          onOpenTicket={openTicket}
          onOpenDelegation={(d) => setDelegationSheet(d)}
          onInviteGuest={openInvite}
          onViewTicket={(ticket) => setTicketDetail(ticket)}
          onInviteGroup={(ticket) => {
            // Group invite — hand the showing-group to one guest via
            // DelegateForm in Mode B (seatPills). Identical UX to
            // per-seat invite and post-pick invite — ONE form, seats
            // rendered as tappable pills.
            const seatIds = (ticket.assignmentRows || [])
              // Only hand off seats the sponsor actually owns; never
              // re-route a seat already assigned to a different
              // delegation through this path.
              .filter((r) => !r.delegation_id)
              .map((r) => r.seat_id || `${r.row_label}-${r.seat_num}`);
            if (seatIds.length === 0) return;
            setInviteOpen({
              theaterId: ticket.theaterId,
              seatIds,
            });
          }}
          onPickDinner={(seat) => setDinnerSheet(seat)}
          onInviteSeat={(seat, ticket) => {
            // Phase 5.4 — per-seat "+ Invite" on a Tickets-tab row
            // now opens the same form the group-invite button does,
            // but preselects ONLY the tapped seat. The other giveable
            // seats in the same showing block render as unselected
            // pills so the user can tap to add more without backing
            // out and using the group-invite path. Same form, same
            // submit, just a different starting selection.
            const tappedId = `${seat.row_label}-${seat.seat_num}`;
            // Block universe = every seat in this ticket the sponsor
            // still owns (not yet delegated). Mirrors the giveable
            // rule used by the group-invite button below. If we don't
            // have ticket context (older callers), fall back to
            // single-seat-only behavior.
            if (ticket?.assignmentRows) {
              const giveableIds = ticket.assignmentRows
                .filter((r) => !r.delegation_id)
                .map((r) => r.seat_id || `${r.row_label}-${r.seat_num}`);
              // If for some reason the tapped seat isn't in the
              // giveable set, just show it solo. Shouldn't happen but
              // keeps us defensive.
              if (giveableIds.includes(tappedId) && giveableIds.length > 1) {
                setInviteOpen({
                  theaterId: seat.theaterId,
                  seatIds: giveableIds,
                  preselected: [tappedId],
                });
                return;
              }
            }
            setInviteOpen({
              theaterId: seat.theaterId,
              seat: tappedId,
            });
          }}
          onSelectMeals={(ticket) => {
            // Phase 5.3 — reuse the existing PostPickDinnerSheet flow,
            // but scope it to this ticket's full seat list (not just
            // post-pick subset). Seeds postPick with the ticket-scoped
            // seat ids so the sheet picks them up unchanged.
            const seatIds = (ticket.assignmentRows || [])
              .map((r) => r.seat_id || `${r.row_label}-${r.seat_num}`);
            if (seatIds.length === 0) return;
            setPostPick({
              theaterId: ticket.theaterId,
              seatIds,
              movieTitle: ticket.movieTitle,
              showLabel: ticket.showLabel,
              showTime: ticket.showTime,
              theaterName: ticket.theaterName,
              posterUrl: ticket.posterUrl,
            });
            setDinnerOpen(true);
          }}
          onFinalizeFromCard={async () => {
            // Phase 5.3 — fires /finalize directly. useFinalize stuffs
            // the response into confirmationData; the parent shell's
            // existing short-circuit then renders the celebration
            // screen. Errors stay in finalizeError; the user retries.
            try {
              await finalize();
            } catch {
              // useFinalize captures error; we don't need to do
              // anything else here. The TicketCard stays in its
              // pre-finalize state until /finalize succeeds.
            }
          }}
        />
      )}
      {tab === 'night' && <NightTab />}

      <TabBar
        active={tab}
        onChange={setTab}
        // The 'group' tab was V1 only. V2 folded the Guests section
        // into the Tickets tab, so the standalone tab is gone.
        tabs={ALL_TABS.filter((t) => t.id !== 'group')}
      />

      <Sheet
        open={!!ticketSheet}
        onClose={() => setTicketSheet(null)}
        title="Manage ticket"
      >
        {ticketSheet && (
          <TicketManage
            ticket={ticketSheet}
            delegations={data.delegations}
            onTapSeat={openSeatPicker}
            onUnplace={onUnplace}
            onClose={() => setTicketSheet(null)}
            pending={seats?.pending}
          />
        )}
      </Sheet>

      <Sheet
        open={!!seatPicker}
        onClose={() => setSeatPicker(null)}
        title={seatPicker ? `Seat ${seatPicker.seat.replace('-', '')}` : ''}
      >
        {seatPicker && (
          <SeatAssignSheet
            seat={seatPicker.seat}
            ticket={seatPicker.ticket}
            delegations={data.delegations}
            token={token}
            apiBase={config.apiBase}
            onRefresh={onRefresh || (() => Promise.resolve())}
            onClose={() => setSeatPicker(null)}
            onInviteNew={inviteForSeat}
          />
        )}
      </Sheet>

      <Sheet
        open={!!inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={(() => {
          if (typeof inviteOpen !== 'object' || !inviteOpen) return 'Invite a guest';
          // R13 — title shows actual seat ids, comma-separated, no
          // counter-style "for N seats" framing. Both single-seat
          // and multi-seat callers land in the same Mode B form.
          //
          // Phase 5.4 — when the per-seat tap path fires (preselected
          // is set), the visible pill universe is the WHOLE block but
          // the title only reflects the tapped seat — that's the only
          // one initially selected, and it matches the user's mental
          // model: "I tapped Invite on F10, the title should say F10."
          // The other pills are an affordance to expand selection if
          // they want; the title updates to reflect what's actually
          // about to be invited (selectedPills) once they tap more,
          // but for static title display we anchor on preselected.
          const ids = inviteOpen.preselected?.length
            ? inviteOpen.preselected
            : inviteOpen.seatIds?.length
              ? inviteOpen.seatIds
              : inviteOpen.seat
                ? [inviteOpen.seat]
                : [];
          if (ids.length === 0) return 'Invite a guest';
          return `Invite for ${ids.map((s) => s.replace('-', '')).join(', ')}`;
        })()}
      >
        <DelegateForm
          token={token}
          apiBase={config.apiBase}
          // R13 — when the caller passes seat ids (per-seat '+ Invite'
          // from a Tickets row, or multi-seat hand-off from a placed
          // block), switch DelegateForm into Mode B (pills). When no
          // seats are passed (the bare 'Invite a guest' button), fall
          // back to Mode A (quota counter).
          seatPills={(() => {
            if (typeof inviteOpen !== 'object' || !inviteOpen) return null;
            if (inviteOpen.seatIds?.length) return inviteOpen.seatIds;
            if (inviteOpen.seat) return [inviteOpen.seat];
            return null;
          })()}
          // Phase 5.4 — preselectedPills is set ONLY by the per-seat
          // tap path. When set, the form starts with just those pills
          // checked while still showing the rest of the block. Group
          // invite leaves it null so all pills start checked (legacy
          // behavior).
          preselectedPills={
            typeof inviteOpen === 'object' && inviteOpen?.preselected?.length
              ? inviteOpen.preselected
              : null
          }
          available={
            typeof inviteOpen === 'object' && inviteOpen
              ? Math.max(
                  inviteOpen.seatIds?.length || 1,
                  data.seatMath?.available ?? 1
                )
              : (data.seatMath?.available ?? 0)
          }
          onCreated={onDelegationCreated}
          onClose={() => setInviteOpen(false)}
        />
      </Sheet>

      <Sheet
        open={!!delegationSheet}
        onClose={() => setDelegationSheet(null)}
        title="Manage invite"
      >
        {delegationSheet && (
          <DelegateManage
            delegation={delegationSheet}
            token={token}
            apiBase={config.apiBase}
            onRefresh={onRefresh || (() => Promise.resolve())}
            onClose={() => setDelegationSheet(null)}
          />
        )}
      </Sheet>

      {/* Per-seat sheets driven by TicketCard row buttons.
          DinnerSheet opens when the user taps a row's dinner pill.
          The "+ Invite" row button routes through setInviteOpen() with
          single-seat binding {theaterId, seat} so the canonical
          DelegateForm card opens — kept consistent with every other
          invite path. Guest rows route through DelegateManage via
          setDelegationSheet. */}
      <Sheet
        open={!!dinnerSheet}
        onClose={() => setDinnerSheet(null)}
        title="Pick dinner"
      >
        {dinnerSheet && (
          <DinnerSheet
            seat={dinnerSheet}
            token={token}
            apiBase={config.apiBase}
            onSaved={async () => {
              if (onRefresh) await onRefresh();
              setDinnerSheet(null);
            }}
            onClose={() => setDinnerSheet(null)}
          />
        )}
      </Sheet>

      {/* V2 R5 — TicketDetailSheet (per-group ticket view).
          Opened from TicketCard's "View ticket" button. The QR is
          per sponsor token (single QR per portal — same one V1 had on
          the page-level card, just relocated into each ticket).
          Inside the sheet, dinner pills and per-row Invite/Manage
          buttons reuse the same callbacks (DinnerSheet via
          setDinnerSheet, single-seat Invite via setInviteOpen with
          {theaterId, seat} binding, guest Manage via setDelegationSheet). */}
      <Sheet
        open={!!ticketDetail}
        onClose={() => setTicketDetail(null)}
        title="Your ticket"
      >
        {ticketDetail && (
          <TicketDetailSheet
            ticket={ticketDetail}
            daysOut={data.daysOut}
            token={token}
            apiBase={config.apiBase}
            // Guest-section ticket detail uses the same component but
            // without per-row Invite (the seats belong to a delegation
            // already; the sponsor manages via DelegateManage).
            guest={!!ticketDetail.delegationId}
            onPickDinner={(seat) => setDinnerSheet(seat)}
            onInviteSeat={(seat) => {
              setTicketDetail(null);
              setInviteOpen({
                theaterId: seat.theaterId,
                seat: `${seat.row_label}-${seat.seat_num}`,
              });
            }}
            onManageGuest={(d) => {
              setTicketDetail(null);
              setDelegationSheet(d);
            }}
            onClose={() => setTicketDetail(null)}
          />
        )}
      </Sheet>

      <Sheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
      >
        <SettingsSheet
          identity={portal?.identity}
          isDelegation={data.isDelegation}
          token={token}
          apiBase={config.apiBase}
          onClose={() => setSettingsOpen(false)}
          onSaved={onRefresh}
        />
      </Sheet>

      {/* SeatPickSheet — the canonical seat-pick surface (forced dark
          for cinema feel, regardless of system theme). On commit it
          hands off to PostPickOverview, which routes to invite or
          dinner picking and ultimately to CompletionCelebration. */}
      <Sheet
        open={seatPickOpen}
        onClose={() => setSeatPickOpen(false)}
        title="Place seats"
        forceDark
      >
        {seatPickOpen && (
          <SeatPickSheet
            portal={portal}
            theaterLayouts={theaterLayouts}
            seats={seats}
            blockSize={data.blockSize}
            token={token}
            apiBase={config.apiBase}
            onRefresh={onRefresh}
            onMovieDetail={setMovieDetail}
            initialShowingNumber={seatPickInitial?.showingNumber || null}
            initialMovieId={seatPickInitial?.movieId || null}
            onCommitted={(placed) => {
              setSeatPickOpen(false);
              setSeatPickInitial(null);
              setPostPick(placed);
            }}
            onClose={() => {
              setSeatPickOpen(false);
              setSeatPickInitial(null);
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={!!postPick}
        onClose={() => {
          setPostPick(null);
          setPostPickStep('overview');
          setPostPickInviteSeats(null);
        }}
        title={
          postPickStep === 'celebrate'
            ? "You're all set"
            : postPickStep === 'inviteForm'
              ? `Invite for ${(postPickInviteSeats || []).map((s) => s.replace('-', '')).join(', ')}`
              : 'Seats placed'
        }
      >
        {postPick && postPickStep === 'overview' && (
          <PostPickOverview
            placed={postPick}
            assignmentRows={(portal?.myAssignments || []).map((a) => ({
              ...a,
              seat_id: a.seat_id || `${a.row_label}-${a.seat_num}`,
            }))}
            // R13 — Invite goes straight to the form. The form shows
            // every just-placed seat that's not yet assigned as a
            // tappable pill (default all selected). User can drop
            // pills before submitting if they want to split. No more
            // separate WhichSeatsPicker step.
            onInvite={() => {
              const unassigned = (portal?.myAssignments || [])
                .filter((a) =>
                  postPick.seatIds?.includes(a.seat_id || `${a.row_label}-${a.seat_num}`),
                )
                .filter((a) => !a.delegation_id)
                .map((a) => a.seat_id || `${a.row_label}-${a.seat_num}`);
              if (unassigned.length === 0) return;
              setPostPickInviteSeats(unassigned);
              setPostPickStep('inviteForm');
            }}
            onPickMeals={() => setDinnerOpen(true)}
            onDone={async () => {
              try {
                await finalize();
                // Move to celebration step instead of dismissing
                setPostPickStep('celebrate');
              } catch {
                // finalizeError surface stays; user retries
              }
            }}
            finalizing={finalizing}
            error={finalizeError}
            onClearError={clearFinalizeError}
          />
        )}
        {postPick && postPickStep === 'inviteForm' && (
          <DelegateForm
            token={token}
            apiBase={config.apiBase}
            // R13 — Mode B: seat pills from the just-placed block.
            // available stays as the count for legacy validation but
            // the form uses selectedPills.size as the source of truth
            // when seatPills is set.
            available={postPickInviteSeats?.length || 0}
            seatPills={postPickInviteSeats || []}
            onClose={() => setPostPickStep('overview')}
            onCreated={async (newDeleg, keptSeats) => {
              // R13 — keptSeats is the final list of seat ids the user
              // left selected in the form. Use that (not the original
              // postPickInviteSeats) for the /assign so dropped pills
              // stay open for a second invite.
              const seatsToAssign = keptSeats || postPickInviteSeats || [];
              try {
                if (seatsToAssign.length && newDeleg?.id) {
                  await fetch(`${config.apiBase}/api/gala/portal/${token}/assign`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      theater_id: postPick.theaterId,
                      seat_ids: seatsToAssign,
                      delegation_id: newDeleg.id,
                    }),
                  });
                }
              } catch {
                // Soft-fail: delegation was created (Twilio fired);
                // assign chain is best-effort. User can still pick
                // delegation manually from per-seat invite later.
              }
              if (onRefresh) await onRefresh();
              setPostPickInviteSeats(null);
              setPostPickStep('overview');
            }}
          />
        )}
        {postPick && postPickStep === 'celebrate' && (
          (() => {
            // Build a synthetic ticket from the just-placed block so
            // CompletionCelebration can render it via TicketDetailSheet.
            // The just-placed seats are now in portal.myAssignments
            // with their delegation_id and dinner_choice set, so just
            // filter to those rows.
            const rows = (portal?.myAssignments || [])
              .filter((a) => postPick.seatIds.includes(a.seat_id || `${a.row_label}-${a.seat_num}`))
              .map((a) => ({
                ...a,
                seat_id: a.seat_id || `${a.row_label}-${a.seat_num}`,
              }));
            const ticket = {
              id: `done-${postPick.theaterId}-${postPick.seatIds.join(',')}`,
              theaterId: postPick.theaterId,
              movieTitle: postPick.movieTitle,
              showLabel: postPick.showLabel,
              showTime: postPick.showTime,
              dinnerTime: postPick.dinnerTime,
              theaterName: postPick.theaterName,
              posterUrl: postPick.posterUrl,
              assignmentRows: rows,
            };
            return (
              <CompletionCelebration
                ticket={ticket}
                daysOut={data.daysOut}
                token={token}
                apiBase={config.apiBase}
                onPickDinner={(seat) => setDinnerSheet(seat)}
                onInviteSeat={(seat) => {
                  setInviteOpen({
                    theaterId: seat.theaterId,
                    seat: `${seat.row_label}-${seat.seat_num}`,
                  });
                }}
                onManageGuest={(d) => setDelegationSheet(d)}
                onClose={() => {
                  setPostPick(null);
                  setPostPickStep('overview');
                  setPostPickInviteSeats(null);
                  setDinnerOpen(false);
                }}
              />
            );
          })()
        )}
      </Sheet>

      <Sheet
        open={dinnerOpen}
        onClose={() => setDinnerOpen(false)}
        title="Pick dinners"
      >
        {dinnerOpen && postPick && (
          <PostPickDinnerSheet
            assignments={(portal?.myAssignments || []).filter((r) =>
              postPick.seatIds?.includes(`${r.row_label}-${r.seat_num}`)
            )}
            token={token}
            apiBase={config.apiBase}
            onRefresh={onRefresh}
            canFinalize={canFinalize}
            onFinalize={async () => {
              try {
                await finalize();
                setPostPick(null);
                setDinnerOpen(false);
              } catch {
                // useFinalize sets error state; sheet stays open.
              }
            }}
            finalizing={finalizing}
            error={finalizeError}
            onClearError={clearFinalizeError}
            onDone={() => {
              setPostPick(null);
              setDinnerOpen(false);
            }}
          />
        )}
      </Sheet>

      {/* MovieDetailSheet — opened from the SeatPickSheet movie card.
          Same pattern as MobileWizard.jsx and Desktop.jsx: the parent
          holds open-state and the sheet renders conditionally. The
          movie object carries __showLabel / __showTime / __showingNumber
          tagged on by SeatPickSheet's onMoreInfo so the sheet header
          can show "Early showing · 6:00 PM" without a re-lookup.
          Phase 5.5 — sheet now also receives the bottom CTAs:
          'SELECT SEATS FOR THIS FILM' opens SeatPickSheet preselected
          on the movie's first showtime, OR if the sponsor has finalized
          and has nothing left to place, switches to a 'View your
          tickets' CTA that closes the sheet and routes to the Tickets
          tab. */}
      {movieDetail && (
        <MovieDetailSheet
          movie={movieDetail}
          showLabel={
            movieDetail.__showLabel ||
            (movieDetail.__showingNumber === 1
              ? 'Early showing'
              : movieDetail.__showingNumber === 2
                ? 'Late showing'
                : '')
          }
          showTime={movieDetail.__showTime}
          // Used by the bottom CTA to swap from "SELECT SEATS" to
          // "View your tickets" when there are no seats left to place
          // (sponsor has finalized OR every seat is already placed).
          // The CTA still opens the seat-picker on the chosen film
          // even if isFinalized — the user can rearrange. The
          // "viewTickets" branch only fires when seatMath says zero
          // available AND zero on hold.
          ctaMode={
            (data.seatMath?.available ?? 0) <= 0
              ? 'viewTickets'
              : 'selectSeats'
          }
          onSelectSeatsForFilm={(scheduleEntry) => {
            // Open SeatPickSheet preselected on this movie + showing.
            // Movie id comes from movieDetail; showingNumber from the
            // schedule entry the user saw on the sheet (when there's
            // only one showing, scheduleEntry is implicit). If the
            // schedule has multiple entries the sheet shows them all
            // and the user picks one.
            setSeatPickInitial({
              showingNumber: scheduleEntry?.showingNumber || null,
              movieId: movieDetail.id,
            });
            setMovieDetail(null);
            setSeatPickOpen(true);
          }}
          onViewTickets={() => {
            // No seats to place — route to the Tickets tab.
            setMovieDetail(null);
            setTab('tickets');
          }}
          onClose={() => setMovieDetail(null)}
        />
      )}
      </div>
    </SheetFrameContext.Provider>
  );
}
