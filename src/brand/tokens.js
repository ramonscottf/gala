// DEF Gala brand tokens — locked to daviskids.org visual system.
// Deep DEF navy ground with brand BLUE accents (was purple/indigo before
// May 10 2026 — see git blame). Brand gradient runs CRIMSON → BLUE
// (left→right), used on tier cards, headings, CTAs. NO purple bridge.
//
// ─────────────────────────────────────────────────────────────────────────
// USE OF GOLD — DOCTRINE (May 10 2026, v2)
// ─────────────────────────────────────────────────────────────────────────
// Gold is the DEF foundation's signature accent and earns a small but
// REAL role across the system — promoted from "trim only" to "the third
// voice" on dark grounds. Forbidden on paper (illegibility).
//
// ALLOWED on navy grounds:
//   - Eyebrows (the kicker text above section titles)
//   - Italic flair words in display headlines (one per page max)
//   - Hairline dividers (`linear-gradient(90deg, transparent, gold, transparent)`)
//   - Scrollbars
//   - Gold-tier sponsor dot
//   - Hairline icon strokes (1.6px, never filled)
//   - Section number bullets, glow dots
//
// FORBIDDEN everywhere:
//   - Body text on paper grounds (gold-on-paper is illegible)
//   - Buttons, button outlines, primary CTAs
//   - Status numbers, counts, "remaining" displays
//   - Filled tier cards or filled status pills
//
// The yellow test: if removing the yellow would leave the surface
// still legible and complete, yellow is being used correctly.
// If removing it breaks understanding, you've asked too much of it.
// Yellow is jewelry, never structure.
// ─────────────────────────────────────────────────────────────────────────

export const BRAND = {
  // DEF navy — aligned to daviskids.org (#0b1b3c). Was #1a2350 in the
  // gala-only token system before the May 10 brand realign.
  navy: '#0b1b3c',
  navyDeep: '#071028',
  navyMid: '#122a57',
  navySoft: '#24508f',

  // Brand BLUE (replaces indigo). Two-color story: blue → red, no purple bridge.
  blue: '#2858d6',
  blueDeep: '#1a3aa3',
  blueLight: '#4a7df0', // "yours" treatment — your seats, your placed/claimed chips, your progress

  // Brand red — corrected to canonical Gala red (#CB262C, was #d72846).
  red: '#CB262C',
  redDeep: '#a01f24',
  redWarm: '#e84e53',

  // DEF gold ramp — three stops from daviskids.org canonical tokens.
  gold: '#ffc24d',        // DEF gold-400 (was #f4b942)
  goldSoft: '#ffd77f',    // DEF gold-300 (dividers, glow)
  goldDeep: '#f5a623',    // DEF gold-500 (scrollbar end, deepest)

  // DEPRECATED ALIASES — kept for backward compat during the May 10 migration.
  // All call sites should migrate to the new token names above. These will
  // be removed in a follow-up commit after grep verification.
  indigo: '#2858d6',      // → use BRAND.blue
  indigoDeep: '#1a3aa3',  // → use BRAND.blueDeep
  indigoLight: '#4a7df0', // → use BRAND.blueLight (THIS is the purple-to-blue fix)

  paper: '#f8fbff',
  paperWarm: '#eff6ff',
  paperCool: '#e9f2ff',
  ink: '#0b1233',
  rule: 'rgba(255,255,255,0.10)',
  ruleStrong: 'rgba(255,255,255,0.16)',
  ruleDark: 'rgba(13,15,36,0.12)',
  mute: 'rgba(255,255,255,0.65)',
  muteDark: 'rgba(13,15,36,0.6)',

  // Gradient: direct blue → red, NO purple bridge.
  // Was: linear-gradient(95deg, #d72846 0%, #b1306d 45%, #6a3a9a 75%, #3b3f9f 100%)
  gradient:
    'linear-gradient(125deg, #2858d6 0%, #CB262C 35%, #4a7df0 65%, #CB262C 100%)',
  gradientSoft:
    'linear-gradient(125deg, rgba(40,88,214,0.85) 0%, rgba(203,38,44,0.85) 50%, rgba(74,125,240,0.85) 100%)',
  // Horizon strip — used on the 3px brand bar at the top of surfaces.
  gradientStrip:
    'linear-gradient(90deg, #2858d6, #CB262C, #4a7df0, #CB262C)',
  // DEF gold trim — for hairline dividers and scrollbars on navy.
  gradientGoldSoft:
    'linear-gradient(180deg, #ffd77f, #f5a623)',

  groundDeep:
    'radial-gradient(ellipse 120% 60% at 50% -10%, #24508f 0%, #122a57 35%, #0b1b3c 75%, #050b1c 100%)',
};

// Tier mapping per DEF: Platinum 20 / Gold 16 / Silver 14 / Bronze 12 / F&F 10
export const TIERS = {
  Platinum: { seats: 20, color: '#e8e8ee' },
  Gold: { seats: 16, color: '#ffc24d' },  // DEF gold-400 (was #f4b942)
  Silver: { seats: 14, color: '#c0c4cc' },
  Bronze: { seats: 12, color: '#c08560' },
  Family: { seats: 10, color: '#9bb5d4' },
};

// Fonts — Fraunces is the canonical display font on daviskids.org/events-gala.
// Was Source Serif 4 in the previous token doctrine; corrected May 10 2026.
export const FONT_DISPLAY = '"Fraunces", "Source Serif 4", Georgia, serif';
export const FONT_UI = '"Inter", system-ui, -apple-system, sans-serif';

// ─────────────────────────────────────────────────────────────────────────
// Theme-aware color helpers (May 5 2026, updated May 10 for gold doctrine)
// ─────────────────────────────────────────────────────────────────────────
// Components that previously hard-coded BRAND.gold for "highlight text"
// — eyebrows, italic emphasis in headlines, status numbers, badge text —
// should call these helpers with the current `isLight` from useTheme().
// Gold-on-paper is illegible. Navy-on-paper / red-on-paper / gold-on-navy
// is the corrected mapping.
//
// Usage:
//   const { isLight } = useTheme();
//   <div style={{ color: accentText(isLight) }}>...
export function accentText(isLight) {
  return isLight ? BRAND.ink : BRAND.gold;
}
export function accentAction(isLight) {
  return isLight ? BRAND.red : BRAND.gold;
}

// DINNER_LOCK_DAYS — N days before gala, dinner choices freeze for
// kitchen prep. Was historically declared in SeatDetailSheet.jsx;
// moved here when SeatDetailSheet was retired in the V1 cleanup.
// Used by TicketsTab / TicketDetailSheet / HomeTab to render
// the "dinners lock in N days" banner and disable the dinner pill.
export const DINNER_LOCK_DAYS = 7;
