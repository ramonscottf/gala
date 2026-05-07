// src/portal/components/PlacedTicketsPreview.jsx
//
// Reward beat — rendered at the top of PostPickSheet on both shells.
// Shows the just-placed seats as a mini boarding-pass card. Single
// source of truth for the "you just placed these" visual.
//
// Props:
//   placed: {
//     theaterId: number,
//     theaterName: string,
//     movieTitle: string,
//     showLabel: string,
//     showTime: string,
//     seatIds: string[],   // "A-3", "A-4"
//     posterUrl: string | null,
//   }
//
// Renders ~140px tall on mobile, ~180px on desktop. Gold edge,
// perforated divider, MEGAPLEX wordmark, seat list, showtime row.
// No interactivity — purely visual.
//
// Format note: showLabel + showTime renders as
// `{SHOWLABEL.toUpperCase()} · {showTime}` — matches the existing
// boarding-pass card format on Mobile.jsx (e.g. "EARLY · 4:30 PM").

import { BRAND, FONT_DISPLAY, FONT_UI } from '../../brand/tokens.js';

export default function PlacedTicketsPreview({ placed }) {
  if (!placed || !placed.seatIds?.length) return null;
  const seatLabels = [...placed.seatIds].sort().map((s) => s.replace('-', ''));
  const showLabelUpper = (placed.showLabel || '').toUpperCase();
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 14,
        background: 'linear-gradient(180deg, #1a1730 0%, #0f0d22 100%)',
        border: `1px solid ${BRAND.gold}55`,
        boxShadow: `0 8px 24px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.04)`,
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
            color: BRAND.gold,
            fontWeight: 800,
          }}
        >
          MEGAPLEX · DEF GALA 2026
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.65)',
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
          color: '#fff',
          lineHeight: 1.2,
        }}
      >
        {placed.movieTitle}
      </div>

      <div
        aria-hidden="true"
        style={{
          height: 1,
          background: `repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 6px, transparent 6px 12px)`,
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
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          {placed.theaterName}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
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
