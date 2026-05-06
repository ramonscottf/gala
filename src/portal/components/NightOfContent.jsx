// NightOfContent — Phase 1.9 M1.
//
// 8-row timeline schedule + 4-tile "Good to know" grid. Verbatim port of
// v1 gala-portal-app.html:2078-2167 with the audit-doc corrections:
// dinner is served IN auditoriums (not "Foyer · plated"), Sherry not
// Sasha, Apple Maps deep link on parking. Mirrors v1 exactly so
// returning sponsors see what they remember.
//
// Shared between Mobile.jsx NightTab and Desktop.jsx Night modal per
// the Phase 1.9 hard rule (every feature ships to both shells from
// the same import). Layout adapts: 2-column tile grid below 600px,
// 4-column above.

import { TOKENS } from '../../brand/tokens.js';

const TIMELINE = [
  {
    time: '3:15 PM',
    title: 'Doors open',
    sub: "Check in, red carpet, hors d'oeuvres in the lobby",
  },
  {
    time: '3:18–3:52',
    title: 'Take your seats · Showing 1',
    sub: 'Dinner served in your auditorium · staggered by film',
  },
  {
    time: '4:03–4:37',
    title: 'Showing 1 begins',
    sub: 'Mandalorian · Breadwinner · Paddington 2 · Dragon',
  },
  {
    time: '6:15 PM',
    title: 'Showing 1 ends',
    sub: 'All four films release at the same moment · lobby fills',
  },
  {
    time: '6:30 PM',
    title: 'Auction closes',
    sub: 'Final bids · 49ers drawing winner announced',
  },
  {
    time: '6:45 PM',
    title: 'Showing 2 dinner',
    sub: 'Take your seats · dinner served in your auditorium',
  },
  {
    time: '7:30 PM',
    title: 'Showing 2 begins',
    sub: 'All four films roll in unison',
  },
  {
    time: '9:08–9:42',
    title: 'Showing 2 ends',
    sub: 'Goodnight · safe travels',
  },
];

// Apple Maps deep link — opens Apple Maps app on iOS / iPadOS / macOS,
// falls back to maps.apple.com web view elsewhere. Cleaner sponsor
// experience than a Google Maps link on iOS.
const PARKING_HREF =
  'https://maps.apple.com/?q=Megaplex+Theatres+at+Legacy+Crossing+Centerville+UT';

const TILES = [
  {
    icon: '📍',
    title: 'Parking',
    sub: 'Free in the Legacy Crossing lot',
    href: PARKING_HREF,
  },
  {
    icon: '👔',
    title: 'Dress code',
    sub: 'Cocktail · come as you are',
  },
  {
    icon: '🍽️',
    title: 'Dinner',
    sub: "Hors d'oeuvres in lobby pre-show",
  },
  {
    icon: '📞',
    title: 'Help',
    sub: 'Sherry · smiggin@dsdmail.net',
    href: 'mailto:smiggin@dsdmail.net',
  },
];

export default function NightOfContent({ compact = false }) {
  // compact mode: tighter padding for use inside the desktop modal
  // which already has its own 24px container padding.
  const outerPadding = compact ? 0 : '0 22px';

  return (
    <div style={{ padding: outerPadding, fontFamily: TOKENS.font.ui }}>
      {/* Timeline */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          borderTop: `1px solid var(--rule)`,
        }}
      >
        {TIMELINE.map((row) => (
          <div
            key={row.title}
            style={{
              display: 'grid',
              gridTemplateColumns: '92px 1fr',
              gap: 14,
              padding: '14px 0',
              borderBottom: `1px solid var(--rule)`,
              alignItems: 'baseline',
            }}
          >
            <div
              style={{
                fontFamily: TOKENS.font.displaySerif,
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--text-accent)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: -0.2,
                whiteSpace: 'nowrap',
              }}
            >
              {row.time}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {row.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.5 }}>
                {row.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Good to know tile grid — 2-col on mobile, 4-col when the
          container is wide enough (auto-fit handles both). */}
      <div
        style={{
          marginTop: 22,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
        }}
      >
        {TILES.map((t) => {
          const inner = (
            <>
              <div style={{ fontSize: 24, lineHeight: 1, marginBottom: 8 }} aria-hidden>
                {t.icon}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 4,
                  letterSpacing: 0.1,
                }}
              >
                {t.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>{t.sub}</div>
            </>
          );
          const baseStyle = {
            padding: '14px',
            borderRadius: 12,
            border: `1px solid var(--rule)`,
            background: 'var(--fill-cream)',
            display: 'flex',
            flexDirection: 'column',
            textDecoration: 'none',
            color: 'inherit',
            cursor: t.href ? 'pointer' : 'default',
            transition: 'border-color 0.15s, background 0.15s',
          };
          if (t.href) {
            return (
              <a
                key={t.title}
                href={t.href}
                style={baseStyle}
                target={t.href.startsWith('http') ? '_blank' : undefined}
                rel={t.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              >
                {inner}
              </a>
            );
          }
          return (
            <div key={t.title} style={baseStyle}>
              {inner}
            </div>
          );
        })}
      </div>

      {/* Footer caveat — the schedule is what we're targeting, but
          the Foundation may shift slots in the final week. Better to
          surface that than have a sponsor catch a 5-min delta day-of. */}
      <div
        style={{
          marginTop: 20,
          fontSize: 11,
          color: 'var(--text-tertiary)',
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        Schedule subject to change · last updated June 2026
      </div>
    </div>
  );
}
