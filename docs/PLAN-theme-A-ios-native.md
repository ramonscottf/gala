# Theme Contest · Branch A · iOS Native

**Branch:** `theme/ios-native`
**Preview URL (after first push):** `https://theme-ios-native.gala-3z8.pages.dev`
**Inherits:** `PLAN-theme-contest-core.md` (read that first; this plan adds the visual direction on top)

---

## The bet

Make the gala portal feel like a first-party iOS app — UIKit defaults, grouped table views, system fills, system text colors. The user opens it and their brain reads "this is just an Apple app." The navy hero card and red CTAs are the only brand color moments; everything else is system-neutral.

This is the safest bet. iOS users are pre-trained on this language. Cohesion comes for free because every element has a known precedent.

---

## Visual language

### Surfaces
- **Page ground:** `#f2f2f7` (iOS systemGroupedBackground)
- **Card:** `#ffffff` with no border, no glass, no gradient
- **Sheet:** `#ffffff` with `14px` top corners only, drag handle at top-center
- **Tab pill:** `#ffffff` solid with iOS-style shadow, no blur

### Text
- **Primary:** `#000000`
- **Secondary:** `rgba(60,60,67,0.60)` (iOS secondaryLabel)
- **Tertiary:** `rgba(60,60,67,0.30)` (iOS tertiaryLabel)
- **On brand surfaces (navy/red):** `#ffffff`

### Fills (for buttons, segmented controls, chips)
- **Primary fill:** `rgba(120,120,128,0.20)` (iOS systemFill)
- **Secondary fill:** `rgba(120,120,128,0.16)`
- **Tertiary fill:** `rgba(120,120,128,0.12)`

### Separators
- **Thin rule:** `rgba(60,60,67,0.18)` (iOS separator)

### Brand anchors (preserved)
- **Navy:** `#0d1b3d` (hero card body)
- **Navy mid:** `#1a2c5a` (hero card gradient stop)
- **Red:** `#c8102e` (primary CTA)
- **Red dark:** `#a01f24` (button shadow tint)
- **Gold:** `#ffb400` (hero card eyebrow caps only — nowhere else)

### Radii
- `sm: 6` — small chips (seat reference C10/E12)
- `md: 10` — buttons
- `lg: 12` — cards
- `xl: 14` — sheets
- `pill: 999`

### Shadows
- **Card:** `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)` (subtle, on gray ground)
- **Sheet:** `0 -2px 16px rgba(0,0,0,0.10)`
- **Pill (floating tab bar):** `0 8px 24px rgba(0,0,0,0.12)`

### Type
- **Display (h1 hero, h1 section):** `Cardo, "Times New Roman", serif` (existing FONT_DISPLAY) — preserve italic for the brand voice moments
- **UI (everything else):** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`
- **Sizes:** 11/13/15/17/22/28/34 (iOS standard scale)
- **Weights:** 400 / 600 / 700

---

## Component recipes

### Card
White surface, `12px` radius, no border, card shadow when on gray ground. Content padding `16-20px`.

```jsx
<div style={{
  background: TOKENS.surface.card,
  borderRadius: TOKENS.radius.lg,
  boxShadow: TOKENS.shadow.card,
  padding: TOKENS.space.lg,
}}>
```

### List row (iOS grouped table view row)
Full-bleed white surface with 16px horizontal padding, optional leading icon, title + optional subtitle, optional trailing chevron or value, separator below (except last row in section).

Stack rows in a "grouped list" container: white background, 12px radius on first/last row corners, no separator below the last row.

### Section header
Uppercase 13px secondary text, 0.5px letter-spacing, 16px horizontal padding, 8px below, 24px above.

### Button — primary
Red pill, white text, `padding: 14px 28px`, `borderRadius: 999`, button shadow. Same on mobile and desktop.

### Button — secondary (iOS gray button)
Tertiary fill background, primary text, `padding: 12px 24px`, `borderRadius: 10`.

### Toggle
iOS switch verbatim — 51×31px, 27px knob. Green `#34c759` when on, `#e9e9eb` when off. Use `<input type="checkbox">` with custom CSS or a hand-rolled `<button role="switch">` — either works.

### Segmented control
iOS segmented — secondary fill background (`rgba(120,120,128,0.12)`), 8px radius, white selected pill with subtle shadow, 13px medium text.

### Sheet
White surface, top corners radius 14, drag handle 36×5px tertiary fill at top-center 8px below the top edge, content padding 20px, bottom safe-area absorbed inside the sheet.

---

## File-by-file work

### Stage A1 — Foundation (1 commit)

**`src/brand/tokens.js`** (NEW): paste the TOKENS object below verbatim.

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
```

**`src/brand/styles.css`** rewritten:
- Strip Capacitor preamble (per core spec section 1)
- New `:root` mirroring tokens.js
- `body { background: var(--ground); color: var(--text-primary); font-family: var(--font-ui); min-height: 100vh; margin: 0; }`
- Drop `.force-dark-vars`, `.tab-bar`, `.tab-bar-glass` rules
- Keep `.scroll-container { -webkit-overflow-scrolling: touch; }` only

**`src/brand/atoms.jsx`**:
- Delete `useTheme`, `ThemeProvider`, `BRAND` exports
- Keep any pure utility exports (`Avatar`, `initialsFor`, `colorFor`, etc.)
- Re-import `TOKENS` from `./tokens.js` at the top

After A1: app builds, looks identical-ish (since tokens mirror current colors closely), but the foundation is single-source.

### Stage A2 — Mobile.jsx + Desktop.jsx parallel sweep (1 commit)

**Both files in one commit** to enforce the lockstep rule.

For each visual surface in Mobile.jsx, apply the iOS recipe. Find the equivalent surface in Desktop.jsx and apply the same recipe.

Surfaces to touch:
1. Outer shell — strip Capacitor (`100dvh` → `minHeight: 100vh`, `overflow: hidden` → remove). Background `TOKENS.surface.ground`.
2. Hero card (`TicketHero`) — interior preserved. Margin honors `env(safe-area-inset-top)` exactly once.
3. Floating avatar button — solid white `TOKENS.surface.card` with `TOKENS.shadow.card`.
4. "X seats still to place" CTA card — white card on gray ground, gray icon container `TOKENS.fill.tertiary`, red `Place` button.
5. "Text my seats to me" + "Manage tickets" rows — convert to iOS grouped list rows in a single grouped container.
6. "Your tickets" section — section header (uppercase 13px secondary), each ticket as white card with card shadow. Seat chips become iOS pills (`TOKENS.fill.tertiary` bg, primary text, 4×8 padding, sm radius).
7. "Place N more seats" dashed CTA — ghost button, dashed `TOKENS.rule` border, secondary text.
8. "The lineup" section — section header, movie posters keep current treatment.
9. TicketsTab / GroupTab / NightTab — same conventions: section header style, white card list rows, iOS chips.
10. Tab bar pill — solid white, pill shadow, no blur. Inactive labels `TOKENS.text.secondary`. Active label primary text + subtle `TOKENS.fill.tertiary` pill behind.

### Stage A3 — Component sweep (1 commit per component)

- `PostPickSheet.jsx`
- `SeatPickSheet.jsx` — chrome iOS-native, INTERIOR seat map stays dark (hardcode the dark surface inside, no `forceDark` prop)
- `AssignTheseSheet.jsx`
- `DinnerPicker.jsx` — radio rows iOS-style with right-aligned checkmark when selected
- `NightOfContent.jsx`
- `SettingsSheet.jsx` — full iOS Settings app mimicry: grouped list with section headers, white rows, chevron right, dividers between rows
- `MovieDetailSheet.jsx`
- `ConfirmationScreen.jsx`
- `MobileWizard.jsx` — token swap only
- `Desktop.jsx` portal wizard scenes — token swap only

### Stage A4 — Cleanup commit

- Grep verification (per core spec acceptance test)
- Fix any stragglers
- Final `npm run build`
- Push

---

## Inheritance from core

This plan inherits all hard constraints from `PLAN-theme-contest-core.md` §§ 1-6. Re-read that file before each commit.

---

## Estimated effort

Single overnight session. ~6-8 hours wall-clock for a focused executor. Stages A1 + A2 in the first 4 hours (foundation + the two big files), A3 in the next 2-3 hours (10 components × 15-20 min each), A4 in the final hour (cleanup + verification + push).

---

## What "winning" looks like

When Scott opens this branch's preview URL on his iPhone in the morning, his brain reads "this is an iOS app, not a website." The navy hero card and red CTAs are the only color moments. Everything else recedes into iOS-native quiet. He doesn't have to think about any visual element — they're all where his eye expects them.

If he's not sure whether the page is a web app or a native app at first glance, this branch wins.
