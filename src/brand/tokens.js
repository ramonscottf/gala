// DEF Gala portal — Linear/Vercel theme tokens.
// Single source of truth: every color, spacing, radius, shadow, and font
// stack lives here. Mirrored to CSS variables in src/brand/styles.css.
//
// Visual direction: Linear/Vercel/Raycast. Cool gray-and-white surfaces,
// 1px borders carrying hierarchy (no shadows on cards), tight grid,
// mono numerals for data. Navy hero card and red CTAs are the warmth
// anchors against the cool ground.

export const TOKENS = {
  brand: {
    navy: '#0d1b3d',
    navyMid: '#1a2c5a',
    navyDeep: '#091228',
    red: '#c8102e',
    redDark: '#a01f24',
    gold: '#ffb400', // hero card eyebrow only — see plan
  },
  surface: {
    ground: '#fafafa',
    card: '#ffffff',
    cardElevated: '#ffffff',
    sheet: '#ffffff',
    fill: '#f5f5f5',
    fillStrong: '#f0f0f0',
  },
  text: {
    primary: '#0a0a0a',
    secondary: '#6b6b6b',
    tertiary: '#9a9a9a',
    onBrand: '#ffffff',
    onBrandSecondary: 'rgba(255,255,255,0.65)',
    onBrandTertiary: 'rgba(255,255,255,0.45)',
    mono: '#0a0a0a',
  },
  fill: {
    primary: '#f5f5f5',
    secondary: '#f0f0f0',
    tertiary: '#e8e8e8',
    quaternary: '#fafafa',
  },
  rule: '#e8e8e8',
  ruleStrong: '#d4d4d4',
  ruleOnBrand: 'rgba(255,255,255,0.14)',
  semantic: {
    success: '#0d9373',
    warning: '#cc7a00',
    danger: '#c8102e',
    info: '#0066ff',
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, xxxxl: 40 },
  radius: { sm: 4, md: 6, lg: 8, xl: 12, pill: 999 },
  shadow: {
    none: 'none',
    card: 'none',
    cardElevated: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
    sheet: '0 -1px 0 #e8e8e8, 0 -16px 48px rgba(0,0,0,0.06)',
    pill: '0 4px 16px rgba(0,0,0,0.06), 0 1px 0 #e8e8e8',
    button: '0 1px 2px rgba(0,0,0,0.04)',
  },
  font: {
    display: 'Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    ui: 'Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Monaco, monospace',
  },
};

// Tier mapping per DEF: Platinum 20 / Gold 16 / Silver 14 / Bronze 12 / F&F 10
export const TIERS = {
  Platinum: { seats: 20, color: '#c5c8d0' },
  Gold: { seats: 16, color: '#ffb400' },
  Silver: { seats: 14, color: '#a8acb4' },
  Bronze: { seats: 12, color: '#b87333' },
  Family: { seats: 10, color: '#7a8aa3' },
};

export const FONT_DISPLAY = TOKENS.font.display;
export const FONT_UI = TOKENS.font.ui;
export const FONT_MONO = TOKENS.font.mono;
