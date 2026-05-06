// DEF Gala design tokens — iOS Native theme (Branch A).
// Single source of truth for surfaces, fills, type, radii, shadows, and
// brand anchors. Mirrors styles.css :root vars one-for-one.
//
// All references previously routed through `BRAND` now flow through
// `TOKENS.*`. There is no compat shim — call sites import TOKENS directly.

export const TOKENS = {
  brand: {
    navy: '#0d1b3d',
    navyMid: '#1a2c5a',
    navyDeep: '#091228',
    red: '#c8102e',
    redDark: '#a01f24',
    gold: '#ffb400',
  },
  surface: {
    ground: '#f2f2f7',
    card: '#ffffff',
    cardElevated: '#ffffff',
    sheet: '#ffffff',
  },
  text: {
    primary: '#000000',
    secondary: 'rgba(60,60,67,0.60)',
    tertiary: 'rgba(60,60,67,0.30)',
    onBrand: '#ffffff',
    onBrandSecondary: 'rgba(255,255,255,0.65)',
  },
  fill: {
    primary: 'rgba(120,120,128,0.20)',
    secondary: 'rgba(120,120,128,0.16)',
    tertiary: 'rgba(120,120,128,0.12)',
    quaternary: 'rgba(120,120,128,0.08)',
  },
  rule: 'rgba(60,60,67,0.18)',
  ruleOpaque: '#c6c6c8',
  semantic: {
    success: '#34c759',
    warning: '#ff9500',
    danger: '#ff3b30',
    info: '#007aff',
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
  radius: { sm: 6, md: 10, lg: 12, xl: 14, pill: 999 },
  shadow: {
    card: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
    sheet: '0 -2px 16px rgba(0,0,0,0.10)',
    pill: '0 8px 24px rgba(0,0,0,0.12)',
    button: '0 2px 6px rgba(200,16,46,0.30)',
  },
  font: {
    display: 'Cardo, "Times New Roman", serif',
    ui: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
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

export const FONT_DISPLAY = TOKENS.font.display;
export const FONT_UI = TOKENS.font.ui;
