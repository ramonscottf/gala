// DEF Gala brand tokens — locked to daviskids.org/gala visual system.
// Deep navy ground with cool purple/indigo accents. Brand gradient runs
// CRIMSON → INDIGO (left→right), used on tier cards, headings, CTAs.
// Gold reserved as a subtle warm accent (Donate button, sponsor portal accents).
//
// Lifted verbatim from uploads/seating-chart/project/components/brand.jsx so
// production designs and dev portal stay byte-identical on color values.

export const BRAND = {
  navy: '#1a2350', // deep navy ground (matches site hero)
  navyDeep: '#0f1639',
  navyMid: '#1f2a5e',
  navySoft: '#2c3878',
  indigo: '#3b3f9f', // brand-gradient right end (purple/indigo)
  indigoDeep: '#2a2f7a',
  red: '#d72846', // crimson primary CTA
  redDeep: '#a91d3a',
  redWarm: '#e93055',
  gold: '#f4b942', // warm accent (use sparingly — wordmark, perforation, gold-tier badge dot)
  goldDeep: '#d99a1f',
  indigoLight: '#a8b1ff', // "yours" treatment — your seats, your placed/claimed chips, your progress
  paper: '#fbf8f3',
  paperWarm: '#f5ede0',
  paperCool: '#eef0f9', // cool paper for light surfaces (matches Funding What Matters bg)
  ink: '#0b1233', // near-black with blue tint
  rule: 'rgba(255,255,255,0.10)',
  ruleStrong: 'rgba(255,255,255,0.16)',
  ruleDark: 'rgba(13,15,36,0.12)',
  mute: 'rgba(255,255,255,0.65)',
  muteDark: 'rgba(13,15,36,0.6)',

  gradient:
    'linear-gradient(95deg, #d72846 0%, #b1306d 45%, #6a3a9a 75%, #3b3f9f 100%)',
  gradientSoft:
    'linear-gradient(95deg, rgba(215,40,70,0.85) 0%, rgba(106,58,154,0.85) 60%, rgba(59,63,159,0.85) 100%)',
  groundDeep:
    'radial-gradient(ellipse 120% 60% at 50% -10%, #2c3878 0%, #1a2350 35%, #0f1639 75%, #070b25 100%)',
};

// Tier mapping per DEF: Platinum 20 / Gold 16 / Silver 14 / Bronze 12 / F&F 10
export const TIERS = {
  Platinum: { seats: 20, color: '#e8e8ee' },
  Gold: { seats: 16, color: '#f4b942' },
  Silver: { seats: 14, color: '#c0c4cc' },
  Bronze: { seats: 12, color: '#c08560' },
  Family: { seats: 10, color: '#9bb5d4' },
};

export const FONT_DISPLAY = '"Source Serif 4", "Source Serif Pro", Georgia, serif';
export const FONT_UI = '"Inter", system-ui, -apple-system, sans-serif';
