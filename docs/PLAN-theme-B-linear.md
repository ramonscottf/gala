# Theme Contest · Branch B · Linear / Vercel

**Branch:** `theme/linear`
**Preview URL (after first push):** `https://theme-linear.gala-3z8.pages.dev`
**Inherits:** `PLAN-theme-contest-core.md` (read that first; this plan adds the visual direction on top)

---

## The bet

Make the gala portal feel like a modern dev tool — Linear, Vercel, Raycast aesthetics. Tight grid. Mono accents for data. Density without crowding. Subtle borders instead of shadows. Information-first, decoration-second. The user opens it and reads "this is software for people who do things, not a marketing page."

This is the bet on **legibility and density**. Sponsors looking at seat counts, dinner choices, group rosters, and showtimes want to scan, not browse. Linear-style nails this — every pixel has a purpose, every list scans fast.

The risk: it can feel "techy" for a gala portal. The mitigation: keep the navy hero card and red CTAs as warmth anchors. The Linear coolness is in the supporting surfaces.

---

## Visual language

### Surfaces
- **Page ground:** `#fafafa` (off-white, slightly warmer than pure)
- **Card:** `#ffffff` with `1px solid #e8e8e8` border, no shadow (borders carry the hierarchy)
- **Sheet:** `#ffffff`, `12px` top corners, top border `1px solid #e8e8e8`, no drag handle (X button instead, top-right)
- **Tab pill:** `#ffffff` with `1px solid #e8e8e8`, subtle shadow `0 4px 16px rgba(0,0,0,0.04)`

### Text
- **Primary:** `#0a0a0a` (near-black, not pure black — Linear convention)
- **Secondary:** `#6b6b6b`
- **Tertiary:** `#9a9a9a`
- **Mono accent (data):** `#0a0a0a` in `'JetBrains Mono', 'SF Mono', Menlo, monospace` — used for seat references, counts, dates
- **On brand surfaces:** `#ffffff`

### Fills
- **Subtle hover:** `#f5f5f5`
- **Selected:** `#f0f0f0`
- **Pressed:** `#e8e8e8`

### Separators
- **Border / rule:** `#e8e8e8` (1px solid, used liberally)
- **Strong rule:** `#d4d4d4` (1px solid, between major sections)

### Brand anchors (preserved)
- **Navy:** `#0d1b3d`
- **Navy mid:** `#1a2c5a`
- **Red:** `#c8102e`
- **Red dark:** `#a01f24`
- **Gold:** `#ffb400` (hero card eyebrow only)

### Radii
- `sm: 4` — small chips, inputs
- `md: 6` — buttons, cards
- `lg: 8` — larger cards, sheets
- `xl: 12` — sheets only
- `pill: 999`

Linear uses smaller radii than iOS. 4-8px max for most surfaces.

### Shadows
- **Card:** none (use 1px border instead)
- **Card elevated (hover/active):** `0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)`
- **Sheet:** `0 -1px 0 #e8e8e8, 0 -16px 48px rgba(0,0,0,0.06)`
- **Pill (floating tab bar):** `0 4px 16px rgba(0,0,0,0.06), 0 1px 0 #e8e8e8`
- **Button:** none on default; `0 1px 2px rgba(0,0,0,0.04)` on primary

### Type
- **Display (h1 hero, h1 section):** Inter or system-ui at 28-34px, weight 600, tight letter-spacing `-0.02em`. Drop the serif italic — Linear doesn't do serifs.
- **UI:** `Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif` at 13-16px
- **Mono:** `'JetBrains Mono', 'SF Mono', Menlo, Monaco, monospace` for all data values
- **Sizes:** 11/12/13/14/16/18/22/28/34
- **Weights:** 400 / 500 / 600 / 700

### Density
- Default row height: `36px` (tighter than iOS's 44)
- Default content padding: `12px` (tighter than iOS's 16)
- Section spacing: `24px` between groups, `40px` between major sections

---

## Component recipes

### Card
White surface, `1px solid #e8e8e8`, `8px` radius, no shadow. Padding `16px`. On hover (interactive cards), border becomes `#d4d4d4` and elevated shadow appears.

### List row
36px tall, 12px horizontal padding, optional 16×16 leading icon (in secondary text color), title 14px medium, optional trailing data in mono 13px or chevron. Border-bottom `1px solid #e8e8e8` (no border on last row in container).

### Section header
Uppercase 11px tertiary text, weight 600, `0.5px` letter-spacing, 12px below, 32px above. Optional inline action button on the right (e.g., "View all →" in 12px medium).

### Button — primary
Red surface, white text, `padding: 10px 20px`, `borderRadius: 6`, weight 600, 14px text. No shadow. Hover: red darkens to `#a01f24`.

### Button — secondary
White surface, `1px solid #d4d4d4`, primary text, same dimensions. Hover: bg `#fafafa`.

### Button — ghost
Transparent surface, no border, primary text, same dimensions. Hover: bg `#f5f5f5`.

### Toggle
Linear-style — 32×18px track, 14px knob, smooth slide. Off: `#e0e0e0`. On: `#0a0a0a` (not green — Linear toggles are mono). 200ms ease transition.

### Segmented control
`#f5f5f5` background, `4px` radius, `1px solid #e8e8e8`. Selected segment: white surface, `1px solid #d4d4d4`, subtle shadow. 32px tall, 13px medium text.

### Sheet
White, `12px` top corners, 1px top border, X button top-right (24×24, ghost button style). No drag handle. Content padding 24px.

### Data display (the Linear signature)
Numbers, seat counts, dates — render in mono. Example:

```jsx
<div style={{ fontFamily: TOKENS.font.mono, fontSize: 14, color: TOKENS.text.primary }}>
  15 / 20
</div>
```

Date stamps: `Jun 10 · Wed` in mono secondary. Seat refs: `E12, E13, E14, G14, G15` in mono primary, comma-separated, no chips.

---

## File-by-file work

### Stage B1 — Foundation (1 commit)

**`src/brand/tokens.js`** (NEW):

```js
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
    display: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    ui: 'Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Monaco, monospace',
  },
};
```

**`src/brand/styles.css`**:
- Strip Capacitor preamble
- Import Inter from Google Fonts at the top: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');`
- New `:root` vars
- `body { background: var(--ground); color: var(--text-primary); font-family: var(--font-ui); font-size: 14px; line-height: 1.5; min-height: 100vh; margin: 0; -webkit-font-smoothing: antialiased; }`
- Drop force-dark-vars, tab-bar legacy classes

**`src/brand/atoms.jsx`**:
- Delete `useTheme`, `ThemeProvider`, `BRAND`
- Keep utility exports

### Stage B2 — Mobile.jsx + Desktop.jsx (1 commit, both files together)

Apply Linear recipes to every surface. Specific changes:

1. Outer shell — strip Capacitor, ground bg.
2. Hero card — body preserved (still navy), but the card shadow becomes a subtle 1px navy-tinted border, `12px` corners (slightly tighter than iOS).
3. Floating avatar — white circle, 1px `#d4d4d4` border, no shadow.
4. "X seats still to place" CTA card — white card with 1px border. Replace gradient icon block with a simple icon in primary text color. Place button is red.
5. Action rows — list-row recipe, mono for any data values.
6. "Your tickets" section — each ticket as bordered card. Seat refs render as mono inline list `E12, E13, E14, G14...`, NOT pills. Take advantage of Linear's data-density.
7. Tab bar pill — white surface, 1px border, pill shadow. Selected tab gets `#f0f0f0` rounded background behind label.
8. All section headers use uppercase 11px tertiary recipe.
9. Stat readouts (TOTAL/PLACED/ASSIGNED/OPEN inside hero card) — numbers in mono, white-on-navy. 28px weight 600.

### Stage B3 — Components (1 commit per component)

- `PostPickSheet.jsx` — bordered cards inside, X button top-right
- `SeatPickSheet.jsx` — chrome Linear-styled, interior dark-cinema preserved
- `AssignTheseSheet.jsx` — list rows
- `DinnerPicker.jsx` — Linear-style radio rows: row clickable, selected gets left border accent in red
- `NightOfContent.jsx`
- `SettingsSheet.jsx` — Linear-style settings: bordered cards grouped, mono for any data fields
- `MovieDetailSheet.jsx`
- `ConfirmationScreen.jsx`
- `MobileWizard.jsx` — token swap
- `Desktop.jsx` — token swap

### Stage B4 — Cleanup

Same as core spec acceptance.

---

## Inheritance from core

All hard constraints from `PLAN-theme-contest-core.md` §§ 1-6.

---

## Estimated effort

6-8 hours wall-clock. Same shape as Branch A.

---

## What "winning" looks like

When Scott opens this branch's preview URL, his brain reads "this is software, this scans, I can find what I need fast." Mono numbers everywhere catch the eye for the data that matters (seat counts, dates, references). Borders carry the hierarchy without screaming. The navy hero card feels deliberately rich against the cool gray-and-white surrounding surfaces — it earns its visual weight.

If it feels productive and dense without feeling cramped, this branch wins.
