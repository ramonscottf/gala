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

import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BRAND, FONT_DISPLAY, FONT_UI, TIERS } from '../brand/tokens.js';
import { Btn, Icon, SectionEyebrow } from '../brand/atoms.jsx';
import { config } from '../config.js';
import { useTheme } from '../hooks/useTheme.js';
import ConfirmationScreen from './ConfirmationScreen.jsx';
import SettingsSheet from './SettingsSheet.jsx';
import DinnerPicker from './components/DinnerPicker.jsx';
import NightOfContent from './components/NightOfContent.jsx';
// Phase 1.15 — adopt PR #56 architecture. Three purpose-built sheets
// replace the Phase 1.14 Step2Pick-export overlay:
//   SeatPickSheet  — replaces wizard StepShowing+StepSeats
//   PostPickSheet  — replaces wizard Step 4 Confirm (3-card "what next?")
//   AssignTheseSheet — multi-seat batch delegation picker after place
// Step2Pick is no longer imported here; the wizard still uses it
// internally for back-compat with email deep links.
import SeatPickSheet from './components/SeatPickSheet.jsx';
import PostPickSheet from './components/PostPickSheet.jsx';
import AssignTheseSheet from './components/AssignTheseSheet.jsx';
import MovieDetailSheet from './MovieDetailSheet.jsx';

// ── shared mini-components ─────────────────────────────────────────────

const PosterMini = ({ poster, color, label, size = 44, showLabel = true }) => (
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

const Avatar = ({ name, size = 36, color }) => {
  const initials = (name || '?')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('');
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

const TicketHero = ({ tier, name, subline, blockSize, placed, assigned, openCount, logoUrl }) => {
  const firstName = (name || '').split(' ')[0];
  const restName = (name || '').split(' ').slice(1).join(' ');
  return (
    <div
      className="force-dark-vars"
      style={{
        margin: '12px 18px 0',
        borderRadius: 18,
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

      <div style={{ padding: '18px 20px 22px', position: 'relative', zIndex: 1 }}>
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
                color: BRAND.gold,
                fontWeight: 500,
                // Slight text-shadow gives the gold italic a bit of pop on
                // the navy gradient, especially on small phone screens
                // where the iOS sample-bottom-bar dims everything above.
                textShadow: '0 0 18px rgba(244,185,66,0.25)',
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
            gridTemplateColumns: 'repeat(4, 1fr)',
            borderTop: `1px solid var(--rule)`,
            paddingTop: 14,
          }}
        >
          {[
            { label: 'TOTAL', value: blockSize, sub: 'Your block', color: '#fff' },
            { label: 'PLACED', value: placed, sub: 'In seats', color: '#fff' },
            { label: 'ASSIGNED', value: assigned, sub: 'To guests', color: '#fff' },
            {
              label: 'OPEN',
              value: openCount,
              sub: 'To place',
              color: openCount > 0 ? BRAND.indigoLight : 'rgba(255,255,255,0.6)',
            },
          ].map((s, i) => (
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
            Doors 3:15 PM
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

const TextMySeatsButton = ({ token, apiBase }) => {
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

  const label =
    state === 'sending' ? 'Sending…'
    : state === 'sent' ? '✓ Texted'
    : state === 'error' ? 'Try again'
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

// ── Home tab ──────────────────────────────────────────────────────────

const HomeTab = ({ data, onPlaceSeats, onOpenTicket, onAssign, onMovieDetail, token, apiBase }) => {
  const { tier, name, subline, blockSize, tickets, lineup, daysOut, logoUrl } = data;
  const { isLight } = useTheme();
  const placed = tickets.reduce((n, t) => n + t.seats.length, 0);
  const assignedCount = tickets
    .filter((t) => t.guestName || t.localGuestId)
    .reduce((n, t) => n + t.seats.length, 0);
  const openCount = Math.max(0, blockSize - placed);
  const firstUnassigned = tickets.find((t) => !t.guestName && !t.localGuestId);

  return (
    <div className="scroll-container" style={{ flex: 1, paddingBottom: 30 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 22px 0',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 2,
            color: isLight ? 'rgba(13,18,36,0.58)' : 'rgba(255,255,255,0.45)',
          }}
        >
          YOUR GALA
        </div>
        <div
          style={{
            fontSize: 11,
            color: isLight ? 'rgba(13,18,36,0.62)' : 'rgba(255,255,255,0.55)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {daysOut != null ? `${daysOut} days out` : ''}
        </div>
      </div>

      <TicketHero
        tier={tier}
        name={name}
        subline={subline}
        blockSize={blockSize}
        placed={placed}
        assigned={assignedCount}
        openCount={openCount}
        logoUrl={logoUrl}
      />

      <div
        style={{
          margin: '14px 18px 0',
          padding: '12px 14px',
          borderRadius: 14,
          background: 'var(--surface)',
          border: `1px solid var(--rule)`,
          boxShadow:
            '0 6px 16px -10px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02) inset',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: openCount > 0 ? BRAND.gradient : 'rgba(127,207,160,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: openCount > 0 ? '#fff' : '#7fcfa0',
            flexShrink: 0,
            boxShadow: openCount > 0 ? '0 4px 12px rgba(215,40,70,0.35)' : 'none',
          }}
        >
          <Icon name={openCount > 0 ? 'seat' : 'check'} size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-on-ground)' }}>
            {openCount > 0 ? `${openCount} seats still to place` : `All ${blockSize} seats placed`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>
            {placed} placed · {assignedCount} with guests
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {firstUnassigned && (
            <button
              onClick={() => {
                // HAPTIC: light — Assign opens TicketManage on the first
                // un-assigned ticket so the user can pick a guest from the
                // list (read-only API guests + local additions).
                onAssign(firstUnassigned);
              }}
              style={miniBtn('ghost', isLight)}
            >
              Assign
            </button>
          )}
          <button
            onClick={() => {
              // HAPTIC: light — Phase 2 wires Capacitor Haptics here.
              onPlaceSeats();
            }}
            style={miniBtn('primary', isLight)}
          >
            {openCount > 0 ? 'Place' : 'Edit'}
          </button>
        </div>
      </div>

      {/* "Text my seats to me" — sponsor-only quick action. Sends the
          seats summary as SMS to the phone on file. Uses the existing
          /api/gala/portal/[token]/sms endpoint. Hidden if no seats
          are placed yet (nothing to send). */}
      {placed > 0 && token && (
        <TextMySeatsButton token={token} apiBase={apiBase} />
      )}

      <div
        style={{
          padding: '24px 22px 0',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            letterSpacing: -0.4,
          }}
        >
          Your tickets
        </h2>
        <div
          style={{
            fontSize: 11,
            color: 'var(--mute)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {placed} <span style={{ opacity: 0.5 }}>/ {blockSize}</span>
        </div>
      </div>

      <div style={{ margin: '12px 18px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tickets.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              // HAPTIC: light — ticket card tap.
              onOpenTicket(t);
            }}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '12px 14px',
              borderRadius: 14,
              background: 'var(--surface)',
              border: `1px solid ${
                t.guestName ? 'var(--rule)' : 'rgba(244,185,66,0.22)'
              }`,
              boxShadow:
                '0 4px 12px -8px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.02) inset',
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 14,
              alignItems: 'center',
            }}
          >
            {t.guestName ? (
              <Avatar name={t.guestName} size={44} />
            ) : (
              <PosterMini
                poster={t.posterUrl}
                color={t.color}
                label={t.movieShort}
                size={36}
                showLabel={false}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {t.guestName && <Icon name="users" size={12} stroke={2} />}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--ink-on-ground)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t.guestName || t.movieShort}
                </div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--mute)',
                  marginTop: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t.showTime ? `${t.showTime} · ${t.theaterName}` : t.theaterName}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {t.seats.slice(0, 7).map((s) => (
                  <span
                    key={s}
                    style={{
                      padding: '2px 6px',
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 700,
                      background: 'rgba(168,177,255,0.16)',
                      color: 'var(--accent-italic)',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: 0.3,
                    }}
                  >
                    {s.replace('-', '')}
                  </span>
                ))}
                {t.seats.length > 7 && (
                  <span style={{ fontSize: 10, color: 'var(--mute)', alignSelf: 'center' }}>
                    +{t.seats.length - 7}
                  </span>
                )}
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--mute)',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              {t.guestName ? 'View' : 'Edit'} <Icon name="chev" size={12} />
            </span>
          </button>
        ))}

        {openCount > 0 && (
          <button
            onClick={() => {
              // HAPTIC: medium — primary "place seats" CTA.
              onPlaceSeats();
            }}
            style={{
              all: 'unset',
              cursor: 'pointer',
              marginTop: 4,
              padding: '14px',
              borderRadius: 14,
              border: `1.5px dashed rgba(244,185,66,0.35)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: 'rgba(244,185,66,0.06)',
              color: 'var(--accent-text)',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <Icon name="plus" size={14} /> Place {openCount} more seat
            {openCount === 1 ? '' : 's'}
          </button>
        )}
      </div>

      <div style={{ padding: '28px 22px 0' }}>
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            letterSpacing: -0.4,
          }}
        >
          The lineup
        </h2>
        <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4 }}>
          {lineup.length} film{lineup.length === 1 ? '' : 's'} · two showtimes · select one or split
          your block
        </div>
      </div>
      <div
        className="no-scrollbar"
        style={{
          marginTop: 14,
          paddingLeft: 18,
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 6,
          paddingRight: 18,
          scrollSnapType: 'x mandatory',
        }}
      >
        {lineup.map((m) => (
          <button
            key={m.id}
            onClick={() => onMovieDetail && onMovieDetail(m)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              flexShrink: 0,
              width: 160,
              scrollSnapAlign: 'start',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div
              style={{
                width: '100%',
                aspectRatio: '2/3',
                borderRadius: 10,
                background: m.posterUrl
                  ? `url(${m.posterUrl}) center/cover`
                  : `linear-gradient(160deg, ${m.color || BRAND.navyMid}, ${BRAND.navyDeep})`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: 10,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {!m.posterUrl && (
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontStyle: 'italic',
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#fff',
                    lineHeight: 1.05,
                  }}
                >
                  {m.short || m.title}
                </div>
              )}
              {/* TMDB score badge — top-left corner of poster.
                  Only shows if score >= 1 (filters out unreleased/zero-vote
                  films like the 2026 releases that haven't been rated yet). */}
              {m.tmdbScore != null && m.tmdbScore >= 1 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    background: 'rgba(13,15,36,0.85)',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 99,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: 0.2,
                    border: '1px solid rgba(255,255,255,0.14)',
                  }}
                >
                  <span style={{ color: '#f4b942' }}>★</span>
                  {m.tmdbScore.toFixed(1)}
                </div>
              )}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ink-on-ground)',
                marginTop: 8,
                lineHeight: 1.25,
              }}
            >
              {m.title}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--mute)',
                marginTop: 2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {m.rating} · {m.runtime}m
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Tickets tab ───────────────────────────────────────────────────────

const TicketsTab = ({ data, onOpenTicket, onPlaceSeats, token, apiBase, onRefresh }) => {
  const { tickets, blockSize } = data;
  const { isLight } = useTheme();
  const placed = tickets.reduce((n, t) => n + t.seats.length, 0);

  return (
    <div className="scroll-container" style={{ flex: 1, paddingBottom: 30 }}>
      <div style={{ padding: '18px 22px 0' }}>
        <SectionEyebrow>Tickets</SectionEyebrow>
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
          All <i style={{ color: 'var(--accent-text)', fontWeight: 500 }}>{blockSize} seats.</i>
        </h1>
        <div style={{ fontSize: 13, color: 'var(--mute)' }}>
          {placed} placed · {Math.max(0, blockSize - placed)} still open · tap any seat to reassign
        </div>
      </div>

      <div style={{ padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tickets.map((t) => (
          <div
            key={t.id}
            style={{
              borderRadius: 14,
              background: 'var(--surface)',
              border: `1px solid var(--rule)`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderBottom: `1px solid var(--rule)`,
              }}
            >
              <PosterMini poster={t.posterUrl} color={t.color} label={t.movieShort} size={34} showLabel={false} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.6,
                    color: 'var(--accent-text)',
                  }}
                >
                  {(t.showLabel || '').toUpperCase()} ·{' '}
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t.showTime}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-on-ground)', marginTop: 2 }}>
                  {t.movieTitle}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--mute)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t.seats.length} seats
              </span>
            </div>
            <div
              style={{
                padding: '12px 14px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                background: 'rgba(0,0,0,0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                {t.guestName ? (
                  <Avatar name={t.guestName} size={32} />
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
                    }}
                  >
                    <Icon name="user" size={14} />
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color:
                        t.guestName || t.delegationName
                          ? 'var(--ink-on-ground)'
                          : 'var(--mute)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {t.guestName ||
                      (t.delegationName
                        ? `Held by ${t.delegationName}`
                        : 'No guest assigned')}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>
                    {t.guestName
                      ? ''
                      : t.delegationName
                        ? 'tap to reassign'
                        : 'tap to assign'}
                  </div>
                </div>
              </div>
              <button onClick={() => onOpenTicket(t)} style={miniBtn('ghost', isLight)}>
                Manage
              </button>
            </div>
            <div style={{ padding: '10px 14px 14px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {t.seats.map((s) => (
                <button
                  key={s}
                  onClick={() => onOpenTicket(t)}
                  style={{
                    padding: '6px 9px',
                    borderRadius: 5,
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'rgba(168,177,255,0.18)',
                    color: 'var(--accent-italic)',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: 0.3,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {s.replace('-', '')}
                </button>
              ))}
            </div>
            {/* H1 — per-seat dinner picker. Only finalized (claimed)
                seats are eligible; pending holds render greyed out
                until they finalize. */}
            <div
              style={{
                padding: '0 14px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                borderTop: `1px solid var(--rule)`,
                paddingTop: 12,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1.4,
                  color: 'var(--accent-text)',
                  marginBottom: 2,
                }}
              >
                DINNER
              </div>
              {(t.assignmentRows || []).map((a) => (
                <div
                  key={a.seat_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 38,
                      flexShrink: 0,
                      padding: '4px 6px',
                      borderRadius: 5,
                      background: 'rgba(168,177,255,0.18)',
                      color: 'var(--accent-italic)',
                      fontSize: 10,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: 0.3,
                      textAlign: 'center',
                    }}
                  >
                    {a.seat_id.replace('-', '')}
                  </span>
                  {a.status === 'claimed' ? (
                    <DinnerPicker
                      assignment={a}
                      token={token}
                      apiBase={apiBase}
                      size="sm"
                      onChange={() => onRefresh && onRefresh()}
                    />
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--mute)', fontStyle: 'italic' }}>
                      Hold pending — finalize to set dinner
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '18px 18px 0' }}>
        <Btn
          kind="secondary"
          size="md"
          full
          onClick={onPlaceSeats}
          icon={<Icon name="plus" size={14} />}
        >
          Add another showing
        </Btn>
      </div>
    </div>
  );
};

// ── Guests tab ────────────────────────────────────────────────────────

// ── Group tab ─────────────────────────────────────────────────────────
//
// Sources from data.delegations (= portal.childDelegations from the API).
// Each delegation is a sub-token record with its own SMS/email invite
// history and three-state status. Tap a row → DelegateManage sheet.

// status → { color, bg, label } — uses existing palette but maps the
// real delegation statuses (pending/active/finalized/reclaimed) into the
// design's pill vocabulary. 'active' is the API name for what the spec
// doc calls "accessed" (delegate has opened the link but not finalized).
const DELEGATION_STATUS = {
  pending: { c: BRAND.red, bg: 'rgba(212,38,74,0.14)', t: 'PENDING' },
  active: { c: BRAND.gold, bg: 'rgba(244,185,66,0.16)', t: 'ACCESSED' },
  finalized: { c: BRAND.indigoLight, bg: 'rgba(168,177,255,0.16)', t: 'FINALIZED' },
};

export const DelegationStatusPill = ({ status }) => {
  const s = DELEGATION_STATUS[status] || DELEGATION_STATUS.pending;
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

const GroupTab = ({ data, onInvite, onOpenDelegation }) => {
  const { delegations, seatMath, blockSize } = data;
  const totalAllocated = delegations.reduce((n, d) => n + (d.seatsAllocated || 0), 0);
  const totalPlaced = delegations.reduce((n, d) => n + (d.seatsPlaced || 0), 0);
  const available = seatMath?.available ?? Math.max(0, blockSize - totalAllocated);

  return (
    <div className="scroll-container" style={{ flex: 1, paddingBottom: 30 }}>
      <div style={{ padding: '18px 22px 0' }}>
        <SectionEyebrow>Group</SectionEyebrow>
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
          Your <i style={{ color: 'var(--accent-italic)', fontWeight: 500 }}>assignments.</i>
        </h1>
        <div style={{ fontSize: 13, color: 'var(--mute)' }}>
          {delegations.length} invited · {totalPlaced} of {totalAllocated} assigned seats placed
          {available > 0 && (
            <span style={{ color: 'var(--accent-italic)' }}> · {available} still yours to assign</span>
          )}
        </div>
      </div>

      <div style={{ padding: '18px 18px 0' }}>
        <button
          onClick={onInvite}
          disabled={available <= 0}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 14,
            border: `1.5px dashed ${available > 0 ? 'rgba(168,177,255,0.4)' : BRAND.rule}`,
            background: available > 0 ? 'rgba(168,177,255,0.06)' : 'transparent',
            color: available > 0 ? BRAND.indigoLight : 'var(--mute)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: available > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          <Icon name="plus" size={16} />{' '}
          {available > 0 ? 'Invite someone to seats' : 'No seats left to assign'}
        </button>
      </div>

      <div
        style={{
          padding: '14px 18px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {delegations.map((d) => (
          <button
            key={d.id}
            onClick={() => onOpenDelegation(d)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '14px',
              borderRadius: 14,
              background: 'var(--surface)',
              border: `1px solid var(--rule)`,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 14,
              alignItems: 'center',
            }}
          >
            <Avatar name={d.delegateName} size={44} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--ink-on-ground)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {d.delegateName}
              </div>
              {(d.phone || d.email) && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--mute)',
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {d.phone || d.email}
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
                {d.seatsPlaced} of {d.seatsAllocated} placed
              </div>
            </div>
            <DelegationStatusPill status={d.status} />
          </button>
        ))}
        {delegations.length === 0 && (
          <div
            style={{
              padding: '24px 18px',
              borderRadius: 14,
              border: `1px dashed var(--rule)`,
              fontSize: 13,
              color: 'var(--mute)',
              fontStyle: 'italic',
              textAlign: 'center',
              lineHeight: 1.55,
            }}
          >
            No one invited yet. Tap "Invite someone to seats" above and we'll text + email them
            their own link to select seats.
          </div>
        )}
      </div>
    </div>
  );
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
  const [pending, setPending] = useState(null); // 'resend' | 'reclaim' | null
  const [error, setError] = useState(null);
  const [confirmReclaim, setConfirmReclaim] = useState(false);
  const [copied, setCopied] = useState(false);

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
        <DelegationStatusPill status={delegation.status} />
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

// M1 — NightTab now wraps the shared NightOfContent component (timeline
// + good-to-know tiles, with the audit-doc corrections: dinner is
// served IN auditoriums, Sherry not Sasha, Apple Maps deep link on
// parking).
const NightTab = () => (
  <div className="scroll-container" style={{ flex: 1, paddingBottom: 30 }}>
    <div style={{ padding: '18px 22px 14px' }}>
      <SectionEyebrow>The night</SectionEyebrow>
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
        What to <i style={{ color: 'var(--accent-italic)', fontWeight: 500 }}>expect.</i>
      </h1>
      <div style={{ fontSize: 13, color: 'var(--mute)' }}>
        Wednesday, June 10 · doors 3:15 PM
      </div>
    </div>
    <NightOfContent />
  </div>
);

// ── ios-glass-pill tab bar (the only variant we ship) ─────────────────

const ALL_TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'tickets', label: 'Tickets', icon: 'ticket' },
  { id: 'group', label: 'Group', icon: 'users' },
  { id: 'night', label: 'Night', icon: 'moon' },
];

const TabBar = ({ active, onChange, tabs = ALL_TABS }) => {
  const { isDark } = useTheme();
  return (
  <div
    className="tab-bar tab-bar-glass"
    style={{
      flexShrink: 0,
      position: 'relative',
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
        padding: '8px 8px',
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

// ── Top app bar ───────────────────────────────────────────────────────

const AppBar = ({ name, onAvatarTap }) => {
  const { isDark } = useTheme();
  return (
  <div
    className="page-header"
    style={{
      flexShrink: 0,
      padding: '4px 22px 8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img
        src={isDark ? '/assets/brand/def-logo-light.png' : '/assets/brand/def-logo-dark.png'}
        alt="Davis Education Foundation"
        style={{
          height: 28,
          width: 'auto',
          display: 'block',
        }}
      />
      <div style={{ width: 1, height: 22, background: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(13,18,36,0.14)' }} />
      <div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 1.6,
            color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(13,18,36,0.78)',
          }}
        >
          GALA · 2026
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#fff' : BRAND.ink, marginTop: 0 }}>
          Sponsor portal
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={onAvatarTap}
        aria-label="Open settings"
        style={{
          all: 'unset',
          cursor: 'pointer',
          borderRadius: 99,
        }}
      >
        <Avatar name={name} size={34} />
      </button>
    </div>
  </div>
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
  let iso;
  if (raw.includes('T')) iso = raw;
  else if (raw.includes(' ')) iso = raw.replace(' ', 'T');
  else if (/^\d{1,2}:\d{2}/.test(raw)) iso = `2026-06-10T${raw.length === 5 ? `${raw}:00` : raw}`;
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
    t.seats.push(sid);
    t.seatDelegations[sid] = row.delegation_id || null;
    t.assignmentRows.push({
      seat_id: sid,
      theater_id: row.theater_id,
      row_label: row.row_label,
      seat_num: row.seat_num,
      dinner_choice: row.dinner_choice || null,
      status,
    });
    if (!t.guestName && row.guest_name) t.guestName = row.guest_name;
    if (!t.delegationName && row.delegation_id) {
      const d = delegationsById[row.delegation_id];
      if (d) t.delegationName = d.delegateName;
    }
    if (status === 'pending' && t.status === 'claimed') t.status = 'pending';
  };
  (portal.myAssignments || []).forEach((r) => addRow(r, 'claimed'));
  (portal.myHolds || []).forEach((r) => addRow(r, 'pending'));
  const tickets = [...ticketMap.values()].sort(
    (a, b) => (a.showingNumber || 0) - (b.showingNumber || 0)
  );

  // delegations — sub-token records from the API (sponsor_delegations
  // table). Each has its own portal token, SMS/email invite history, and
  // seatsAllocated/seatsPlaced counters. Phase 1.6 promotes these to the
  // primary "Group" tab concept; they replace the v1.5 synthesized "guest"
  // list (which was just unique guest_name strings off seat_assignments).
  const delegations = portal.childDelegations || [];

  // lineup — unique movies across all showtimes
  const movieMap = new Map();
  showtimes.forEach((s) => {
    if (movieMap.has(s.movie_id)) return;
    movieMap.set(s.movie_id, {
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
      streamUid: s.stream_uid,
      synopsis: s.synopsis,
      year: s.year,
      tmdbScore: s.tmdb_score,
      tmdbVoteCount: s.tmdb_vote_count,
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
    delegations,
    lineup,
    daysOut: daysUntilGala(),
    seatMath: portal.seatMath || { total: 0, placed: 0, delegated: 0, available: 0 },
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

export const DelegateForm = ({ token, apiBase, available, onCreated, onClose, lockSeats = null }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [seats, setSeats] = useState(lockSeats ?? (Math.min(available, 2) || 1));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const valid = name.trim() && (phone.trim() || email.trim()) && seats >= 1 && seats <= available;

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
          seats_allocated: seats,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      if (onCreated) await onCreated(j.delegation);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 16, lineHeight: 1.55 }}>
        We'll text + email a link so they select their own seats. They get a personal portal you
        can keep tabs on right here.
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
          SEATS TO ASSIGN
        </div>
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
  // Phase 1.15 — forceDark lets the SeatPickSheet host the cinema/seat-pick
  // experience in dark navy regardless of system theme, matching its
  // dark-cinema intent. PostPickSheet and AssignTheseSheet leave forceDark
  // off so they flip with the OS like other forms/dialogs.
  const isDark = systemDark || forceDark;
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={isDark ? 'force-dark-vars' : undefined}
        style={{
          width: '100%',
          maxHeight: '88%',
          background: isDark ? BRAND.navyDeep : '#ffffff',
          color: isDark ? '#fff' : BRAND.ink,
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

const TicketManage = ({ ticket, delegations, onTapSeat, onUnplace, onClose, pending }) => {
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

const SeatAssignSheet = ({
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

export default function Mobile({ portal, token, theaterLayouts, seats, isDev, onRefresh }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isDark } = useTheme();
  // Wizard's "Take me to my tickets" CTA navigates here with ?tab=tickets
  // so we land on the right tab without needing a global tab store.
  const initialTab = searchParams.get('tab') || 'home';
  const [tab, setTab] = useState(initialTab);
  // After /finalize succeeds, MobileWizard navigates back here with route
  // state carrying the QR + delivery channels. We promote that into local
  // state on mount so subsequent re-renders + tab switches don't re-show
  // confirmation if the user clears it; "Edit my seats" both clears local
  // state AND replaces route state to drop the back-stack entry.
  const [confirmationData, setConfirmationData] = useState(
    () => location.state?.confirmation || null
  );
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
  const [postPick, setPostPick] = useState(null);
  const [assignThese, setAssignThese] = useState(null);
  const [dinnerOpen, setDinnerOpen] = useState(false);

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
  // invite was launched from SeatAssignSheet's "Invite someone new" CTA.
  const onDelegationCreated = async (newDeleg) => {
    const seatBinding = typeof inviteOpen === 'object' ? inviteOpen : null;
    if (seatBinding && newDeleg?.id) {
      try {
        await fetch(`${config.apiBase}/api/gala/portal/${token}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            theater_id: seatBinding.theaterId,
            seat_ids: [seatBinding.seat],
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
          setConfirmationData(null);
          // Strip the route state so a refresh doesn't re-show
          // confirmation. replace: true keeps the URL stable.
          navigate('', { replace: true });
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        overflow: 'hidden',
        position: 'relative',
        background: isDark
          ? BRAND.groundDeep
          : `radial-gradient(ellipse 120% 60% at 50% -10%, #fff 0%, #f7f8fb 60%)`,
        color: isDark ? '#fff' : BRAND.ink,
        fontFamily: FONT_UI,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isDev && <DevBanner />}
      <AppBar name={data.name} onAvatarTap={() => setSettingsOpen(true)} />

      {tab === 'home' && (
        <HomeTab
          data={{ ...data, tickets: ticketsWithLocalGuests }}
          onPlaceSeats={goSeats}
          onOpenTicket={openTicket}
          onAssign={openTicket}
          onMovieDetail={setMovieDetail}
          token={token}
          apiBase={config.apiBase}
        />
      )}
      {tab === 'tickets' && (
        <TicketsTab
          data={{ ...data, tickets: ticketsWithLocalGuests }}
          onOpenTicket={openTicket}
          onPlaceSeats={goSeats}
          token={token}
          apiBase={config.apiBase}
          onRefresh={onRefresh}
        />
      )}
      {tab === 'group' && (
        <GroupTab
          data={data}
          onInvite={openInvite}
          onOpenDelegation={(d) => setDelegationSheet(d)}
        />
      )}
      {tab === 'night' && <NightTab />}

      <TabBar
        active={tab}
        onChange={setTab}
        tabs={
          data.isDelegation
            ? ALL_TABS.filter((t) => t.id !== 'group')
            : ALL_TABS
        }
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
        title={typeof inviteOpen === 'object' ? `Invite for seat ${inviteOpen.seat.replace('-', '')}` : 'Invite to seats'}
      >
        <DelegateForm
          token={token}
          apiBase={config.apiBase}
          available={
            typeof inviteOpen === 'object'
              ? Math.max(1, data.seatMath?.available ?? 1)
              : (data.seatMath?.available ?? 0)
          }
          lockSeats={typeof inviteOpen === 'object' ? 1 : null}
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

      {/* Phase 1.15 — Sheet flow adopted from PR #56. SeatPickSheet
          is the canonical seat-pick surface (forced dark for cinema
          feel, regardless of system theme). On commit it hands off to
          PostPickSheet which fans out to AssignThese or DinnerPicker.
          Done returns to Home. */}
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
            onCommitted={(placed) => {
              setSeatPickOpen(false);
              setPostPick(placed);
            }}
            onClose={() => setSeatPickOpen(false)}
          />
        )}
      </Sheet>

      <Sheet
        open={!!postPick}
        onClose={() => setPostPick(null)}
        title="Seats placed"
      >
        {postPick && (
          <PostPickSheet
            placed={postPick}
            missingDinnerCount={postPick.seatIds?.length || 0}
            onAssign={() => setAssignThese(postPick)}
            onPickDinners={() => setDinnerOpen(true)}
            onDone={() => {
              setPostPick(null);
              setAssignThese(null);
              setDinnerOpen(false);
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={!!assignThese}
        onClose={() => setAssignThese(null)}
        title="Assign seats"
      >
        {assignThese && (
          <AssignTheseSheet
            placed={assignThese}
            delegations={data.delegations || []}
            token={token}
            apiBase={config.apiBase}
            onSaved={async () => {
              if (onRefresh) await onRefresh();
              setAssignThese(null);
              setPostPick(null);
            }}
            onSkip={() => setAssignThese(null)}
            onInviteNew={() => {
              setAssignThese(null);
              setInviteOpen(true);
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={dinnerOpen}
        onClose={() => setDinnerOpen(false)}
        title="Pick dinners"
      >
        {dinnerOpen && postPick && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 4 }}>
              Choose a meal for each seat you just placed.
            </div>
            {(portal?.myAssignments || [])
              .filter((r) => postPick.seatIds?.includes(`${r.row_label}-${r.seat_num}`))
              .map((r) => (
                <div
                  key={`${r.theater_id}-${r.row_label}-${r.seat_num}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 10,
                    borderRadius: 10,
                    border: `1px solid var(--rule)`,
                    background: 'var(--surface)',
                  }}
                >
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: 'rgba(168,177,255,0.18)',
                      color: BRAND.indigoLight,
                      fontSize: 11,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 44,
                      textAlign: 'center',
                    }}
                  >
                    {r.row_label}
                    {r.seat_num}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <DinnerPicker
                      assignment={r}
                      token={token}
                      apiBase={config.apiBase}
                      onChange={() => {
                        if (onRefresh) onRefresh();
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        )}
      </Sheet>

      {/* MovieDetailSheet — opened from the SeatPickSheet movie card.
          Same pattern as MobileWizard.jsx and Desktop.jsx: the parent
          holds open-state and the sheet renders conditionally. The
          movie object carries __showLabel / __showTime / __showingNumber
          tagged on by SeatPickSheet's onMoreInfo so the sheet header
          can show "Early showing · 6:00 PM" without a re-lookup. */}
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
          onClose={() => setMovieDetail(null)}
        />
      )}
    </div>
  );
}
