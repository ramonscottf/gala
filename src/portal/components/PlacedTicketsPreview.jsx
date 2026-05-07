// src/portal/components/PlacedTicketsPreview.jsx
//
// Reward beat — rendered at the top of PostPickSheet on both shells.
// Shows the just-placed seats as a mini boarding-pass card. Single
// source of truth for the "you just placed these" visual.
//
// Props:
//   placed: {
//     theaterName: string,
//     movieTitle: string,
//     showLabel: string,
//     showTime: string,
//     seatIds: string[],   // "A-3", "A-4"
//   }
//
// Renders ~140px tall on mobile, ~180px on desktop. Gold edge ornament
// (4px accent bar — doctrine permits gold as trim), perforated divider,
// wordmark, seat list, showtime row. No interactivity — purely visual.
//
// Theming: uses CSS variables (var(--surface), var(--ink-on-ground),
// var(--mute), var(--accent-text)) so light mode flips legibly. Mirrors
// Mobile.jsx's boarding-pass cards (Mobile.jsx:1154-1180 and 2559-2580)
// which is the family this component is supposed to match. Gold edge bar
// stays as ornament per the gold doctrine in src/brand/tokens.js:5-32.
//
// Format note: showLabel + showTime renders as
// `{SHOWLABEL.toUpperCase()} · {showTime}` — matches the existing
// boarding-pass card format on Mobile.jsx (e.g. "EARLY · 4:30 PM").

import { BRAND, FONT_DISPLAY, FONT_UI } from '../../brand/tokens.js';

export default function PlacedTicketsPreview({ placed }) {
  if (!placed || !placed.seatIds?.length) return null;
  const seatLabels = [...placed.seatIds].sort().map((s) => s.replace(/-/g, ''));
  const showLabelUpper = (placed.showLabel || '').toUpperCase();
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 14,
        background: 'var(--surface)',
        border: `1px solid ${BRAND.gold}55`, // 33% alpha gold trim
        boxShadow: `0 8px 24px rgba(0,0,0,0.20), inset 0 0 0 1px rgba(255,255,255,0.04)`,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: BRAND.gold,
          borderTopLeftRadius: 14,
          borderBottomLeftRadius: 14,
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div
          style={{
            fontFamily: FONT_UI,
            fontSize: 9,
            letterSpacing: 2.4,
            color: 'var(--accent-text)',
            fontWeight: 800,
          }}
        >
          MEGAPLEX · DEF GALA 2026
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--mute)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 700,
            letterSpacing: 1.2,
          }}
        >
          {showLabelUpper}
          {showLabelUpper ? ' · ' : ''}
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{placed.showTime}</span>
        </div>
      </div>

      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 18,
          color: 'var(--ink-on-ground)',
          lineHeight: 1.2,
        }}
      >
        {placed.movieTitle}
      </div>

      <div
        aria-hidden="true"
        style={{
          height: 1,
          background: `repeating-linear-gradient(90deg, var(--rule) 0 6px, transparent 6px 12px)`,
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: FONT_UI,
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--mute)' }}>
          {placed.theaterName}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--ink-on-ground)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: 0.6,
          }}
        >
          {seatLabels.join(' · ')}
        </div>
      </div>
    </div>
  );
}
