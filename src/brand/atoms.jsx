// Brand atoms — Logo, GalaWordmark, Btn, CountCard, TierBadge, SectionEyebrow,
// Display, Icon, EditorialDivider.
//
// Editorial theme (Theme C, contest 2026-05-05): single light surface,
// navy ink, Cardo serif italic for emphasis, Source Sans 3 for body/UI.
// The legacy theme-branching scaffolding is gone — every
// atom now reads from TOKENS.

import { TOKENS, TIERS } from './tokens.js';

// Real DEF logo. Two file variants:
//   - light = white wordmark (for navy/dark surfaces — hero card, seat map)
//   - dark  = navy wordmark (for cream/white surfaces — page chrome)
// The `dark` prop describes the SURFACE (true = surface is dark, use the
// light/white-text variant). Naming flip is intentional.
export const Logo = ({ size = 32, dark }) => {
  const width = dark ? size * 3 : Math.round(size * 4 / 3);
  return (
    <img
      src={dark ? '/assets/brand/def-logo-light.png' : '/assets/brand/def-logo-dark.png'}
      alt="Davis Education Foundation"
      width={width}
      height={size}
      style={{
        height: size,
        width: 'auto',
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
    />
  );
};

export const GalaWordmark = ({ size = 14, color = TOKENS.brand.red }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      color,
      fontSize: size,
      letterSpacing: 1.5,
      fontWeight: 700,
      textTransform: 'uppercase',
      fontFamily: TOKENS.font.ui,
    }}
  >
    <span style={{ width: 24, height: 1.5, background: 'currentColor' }} />
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <svg width={size * 0.9} height={size * 0.9} viewBox="0 0 16 16" fill="currentColor">
        <circle cx="3" cy="8" r="2" />
        <rect x="6" y="6" width="9" height="4" rx="0.5" />
      </svg>
      Annual Gala
    </span>
  </div>
);

export const Btn = ({
  children,
  kind = 'primary',
  size = 'md',
  icon,
  onClick,
  full,
  disabled,
  style = {},
}) => {
  const sizes = {
    sm: { h: 36, px: 18, fs: 13 },
    md: { h: 46, px: 28, fs: 14 },
    lg: { h: 54, px: 36, fs: 15 },
  };
  const s = sizes[size];
  const styles = {
    primary: {
      background: TOKENS.brand.red,
      color: TOKENS.text.onBrand,
      border: 'none',
      boxShadow: TOKENS.shadow.button,
    },
    secondary: {
      background: TOKENS.surface.card,
      color: TOKENS.text.primary,
      border: `1px solid ${TOKENS.ruleStrong}`,
      boxShadow: TOKENS.shadow.card,
    },
    secondaryDark: {
      background: 'transparent',
      color: TOKENS.text.onBrand,
      border: `1px solid ${TOKENS.ruleOnBrand}`,
    },
    gold: {
      background: TOKENS.brand.gold,
      color: TOKENS.text.primary,
      border: 'none',
    },
    ghost: { background: 'transparent', color: 'inherit', border: 'none' },
  }[kind];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: s.h,
        padding: `0 ${s.px}px`,
        borderRadius: TOKENS.radius.md,
        fontSize: s.fs,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: full ? '100%' : 'auto',
        opacity: disabled ? 0.4 : 1,
        fontFamily: TOKENS.font.ui,
        letterSpacing: 0.2,
        ...styles,
        ...style,
      }}
    >
      {children}
      {icon}
    </button>
  );
};

// Stat readout card. Editorial spec: numbers in Cardo regular at 40px on
// dark hero surfaces, label in Source Sans 3 11px uppercase letter-spacing
// 1.5px at 60% white. The hero card paints the dark backdrop; this atom
// just paints the typography.
export const CountCard = ({ value, label, accent }) => (
  <div
    style={{
      textAlign: 'center',
      minWidth: 78,
      padding: '4px 6px',
    }}
  >
    <div
      style={{
        fontFamily: TOKENS.font.displaySerif,
        fontSize: 40,
        fontWeight: 400,
        color: accent || TOKENS.text.onBrand,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontFamily: TOKENS.font.ui,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 1.5,
        color: TOKENS.text.onBrandSecondary,
        marginTop: 8,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
  </div>
);

export const TierBadge = ({ tier = 'Platinum', dark }) => {
  const c = TIERS[tier]?.color || TOKENS.text.onBrand;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px 4px 8px',
        borderRadius: TOKENS.radius.pill,
        border: `1px solid ${dark ? TOKENS.ruleStrong : TOKENS.ruleOnBrand}`,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        color: dark ? TOKENS.text.primary : TOKENS.text.onBrand,
        fontFamily: TOKENS.font.ui,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: c }} />
      {tier}
    </span>
  );
};

// Editorial section eyebrow — small uppercase, red by default, generous
// letter-spacing. Pairs with a sans+serif h2 below it; see the section
// header recipe in PLAN-theme-C-editorial.md.
export const SectionEyebrow = ({ children, color = TOKENS.brand.red, style = {} }) => (
  <div
    style={{
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1.5,
      color,
      textTransform: 'uppercase',
      fontFamily: TOKENS.font.ui,
      ...style,
    }}
  >
    {children}
  </div>
);

// Display heading. Defaults to navy on light surface; pass `dark` for the
// inverse on hero card / sheets that paint their own dark backdrop.
// `italic` swaps to Cardo serif italic — used for the editorial accent
// word in the sans+serif h1 mix.
export const Display = ({
  children,
  size = 40,
  dark = false,
  italic = false,
  gold = false,
  style = {},
}) => (
  <h1
    style={{
      fontFamily: italic ? TOKENS.font.displaySerif : TOKENS.font.ui,
      fontSize: size,
      lineHeight: 1.1,
      letterSpacing: italic ? 0 : -0.5,
      margin: 0,
      fontWeight: italic ? 700 : 600,
      fontStyle: italic ? 'italic' : 'normal',
      color: gold ? TOKENS.brand.gold : dark ? TOKENS.text.onBrand : TOKENS.text.primary,
      ...style,
    }}
  >
    {children}
  </h1>
);

// Editorial signature divider — a 60×2 red horizontal rule, centered with
// generous vertical margin. Used between major sections (e.g. hero ↔
// tickets, tickets ↔ lineup) — 2-3 placements per page max.
export const EditorialDivider = ({ style = {} }) => (
  <hr
    aria-hidden="true"
    style={{
      width: 60,
      height: 2,
      background: TOKENS.brand.red,
      border: 0,
      margin: '48px auto',
      ...style,
    }}
  />
);

const ICON_PATHS = {
  chev: 'M9 6l6 6-6 6',
  chevL: 'M15 6l-6 6 6 6',
  chevD: 'M6 9l6 6 6-6',
  chevU: 'M18 15l-6-6-6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  arrowR: 'M5 12h14M13 5l7 7-7 7',
  arrowL: 'M19 12H5M11 5l-7 7 7 7',
  check: 'M5 12l4 4 10-10',
  close: 'M6 6l12 12M18 6L6 18',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  users:
    'M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 21a6 6 0 0 1 12 0M14 21a6 6 0 0 1 8-3.5',
  msg: 'M21 12a8 8 0 1 1-3.5-6.6L21 4l-1.4 3.5A8 8 0 0 1 21 12z',
  mail: 'M3 6h18v12H3zM3 6l9 7 9-7',
  link:
    'M10 14a4 4 0 0 1 0-5.6l3-3a4 4 0 1 1 5.6 5.6l-1.5 1.5M14 10a4 4 0 0 1 0 5.6l-3 3a4 4 0 1 1-5.6-5.6l1.5-1.5',
  pin: 'M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  search: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3',
  zoomIn: 'M11 8v6M8 11h6 M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3',
  zoomOut: 'M8 11h6 M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  lasso:
    'M4 7c0-2 4-3 8-3s8 1 8 3-4 3-8 3-8-1-8-3zM4 7v6c0 1 1.5 2 4 2.5M16 16c0 2-1.5 3.5-4 3.5-2 0-3 1-3 2',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M4 6h16M4 12h16M4 18h16',
  sparkle:
    'M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2',
  ticket:
    'M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM10 5v14',
  seat: 'M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M3 12h18v5H3zM6 17v3M18 17v3',
  home: 'M3 11 12 4l9 7M5 10v10h14V10',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v3M14 20h3v-3M17 17v3M14 14v0',
  download: 'M12 4v12M6 12l6 6 6-6M4 20h16',
  share: 'M16 6l-4-4-4 4M12 2v13M20 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6',
  trash:
    'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14',
  undo: 'M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 0 10h-3',
  play: 'M6 4l14 8-14 8z',
  sun: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  target:
    'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 13.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
  move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M19 9l3 3-3 3M9 19l3 3 3-3M2 12h20M12 2v20',
  accessibility: 'M12 4a2 2 0 1 1 0 0M5 8h14M9 8v3l-1 9M15 8v3l1 9M9 11h6',
  armchair:
    'M5 14V9a3 3 0 0 1 6 0v3h2V9a3 3 0 0 1 6 0v5M3 14h18v5a2 2 0 0 1-2 2h-1l-1-2H7l-1 2H5a2 2 0 0 1-2-2v-5z',
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
};

export const Icon = ({ name, size = 18, stroke = 1.6 }) => {
  const p = ICON_PATHS[name];
  if (!p) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={p} />
    </svg>
  );
};
