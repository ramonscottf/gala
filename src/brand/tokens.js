// DEF Gala — Editorial theme tokens (Theme C, contest 2026-05-05).
//
// One source of truth for colors, spacing, radii, shadows, and font stacks.
// Editorial direction: warm cream ground, navy ink, restrained red CTA, gold
// reserved for italic serif accents in headlines. Cardo serif italic carries
// the editorial voice; Source Sans 3 is the body/UI workhorse.
//
// All call sites import TOKENS (not BRAND — that doctrine is gone). The CSS
// mirror lives in styles.css under :root.

export const TOKENS = {
  brand: {
    navy: '#0d1b3d',
    navyMid: '#1a2c5a',
    navyDeep: '#091228',
    red: '#c8102e',
    redDark: '#a01f24',
    gold: '#ffb400',
    cream: '#f5f0e6',
  },
  surface: {
    ground: '#fbfaf7',
    card: '#ffffff',
    cardWarm: '#f5f0e6',
    cardElevated: '#ffffff',
    sheet: '#ffffff',
    seatMapDark: '#091228',
  },
  text: {
    primary: '#0d1b3d',
    secondary: '#3a4666',
    tertiary: '#697089',
    onBrand: '#ffffff',
    onBrandSecondary: 'rgba(255,255,255,0.65)',
    onBrandTertiary: 'rgba(255,255,255,0.42)',
    accent: '#c8102e',
    italic: '#ffb400',
  },
  fill: {
    primary: 'rgba(13,27,61,0.04)',
    secondary: 'rgba(13,27,61,0.08)',
    tertiary: 'rgba(13,27,61,0.12)',
    cream: '#f5f0e6',
    onBrandPrimary: 'rgba(255,255,255,0.08)',
    onBrandSecondary: 'rgba(255,255,255,0.14)',
  },
  rule: 'rgba(13,27,61,0.08)',
  ruleStrong: 'rgba(13,27,61,0.16)',
  ruleOnBrand: 'rgba(255,255,255,0.18)',
  semantic: {
    success: '#1a8a5b',
    warning: '#cc7a00',
    danger: '#c8102e',
    info: '#0d1b3d',
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48, xxxxl: 64 },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },
  shadow: {
    none: 'none',
    card: '0 1px 0 rgba(13,27,61,0.04), 0 8px 24px rgba(13,27,61,0.06)',
    cardElevated: '0 2px 0 rgba(13,27,61,0.06), 0 16px 48px rgba(13,27,61,0.08)',
    sheet: '0 -2px 0 rgba(13,27,61,0.04), 0 -16px 56px rgba(13,27,61,0.10)',
    pill: '0 8px 32px rgba(13,27,61,0.12), 0 1px 0 rgba(13,27,61,0.08)',
    button: '0 4px 12px rgba(200,16,46,0.20)',
    buttonElevated: '0 8px 20px rgba(200,16,46,0.28)',
  },
  font: {
    displaySerif: 'Cardo, "Times New Roman", serif',
    display: '"Source Sans 3", -apple-system, BlinkMacSystemFont, sans-serif',
    ui: '"Source Sans 3", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
  },
};

// Tier mapping per DEF: Platinum 20 / Gold 16 / Silver 14 / Bronze 12 / F&F 10
export const TIERS = {
  Platinum: { seats: 20, color: '#e8e8ee' },
  Gold: { seats: 16, color: '#ffb400' },
  Silver: { seats: 14, color: '#c0c4cc' },
  Bronze: { seats: 12, color: '#c08560' },
  Family: { seats: 10, color: '#9bb5d4' },
};
