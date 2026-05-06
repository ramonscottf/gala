# Theme Contest · Branch C · Editorial

**Branch:** `theme/editorial`
**Preview URL (after first push):** `https://theme-editorial.gala-3z8.pages.dev`
**Inherits:** `PLAN-theme-contest-core.md` (read that first; this plan adds the visual direction on top)

---

## The bet

Make the gala portal feel like Apple's marketing site or Stripe's product pages — generous whitespace, large editorial type, careful typography, restrained color, soft warmth. The user opens it and reads "this is a celebration, this matters, this is an event worth dressing up for."

This is the bet on **emotional resonance**. The gala IS a celebration — Lights, Camera, Take Action — and the portal should feel like the program in a hotel lobby, not a SaaS dashboard. Sponsors gave money to participate in something special; the portal should reflect that gravity.

The risk: editorial designs can feel slow on mobile if not executed carefully. The mitigation: tight rhythm at small sizes, generous rhythm at large. Bento-style cards mix text and data crisply. Type does the heavy lifting; color is restrained.

---

## Visual language

### Surfaces
- **Page ground:** `#fbfaf7` (warm off-white, paper-like)
- **Card:** `#ffffff` with `1px solid rgba(13,27,61,0.08)` (navy-tinted hairline) and a soft shadow `0 1px 0 rgba(13,27,61,0.04), 0 8px 24px rgba(13,27,61,0.06)`
- **Card warm:** `#f5f0e6` (cream) — alternate card surface for variety, used sparingly for "feature" content
- **Sheet:** `#ffffff`, `20px` top corners (more generous than iOS or Linear), drag handle styled but visually quiet
- **Tab pill:** `#ffffff` with the soft navy-tinted shadow

### Text
- **Primary:** `#0d1b3d` (navy — same as the brand anchor — text IS brand color in editorial)
- **Secondary:** `#3a4666`
- **Tertiary:** `#697089`
- **Accent (italic eyebrow):** `#c8102e` (red, used sparingly for editorial eyebrows)
- **On brand surfaces:** `#ffffff`

### Fills
- **Subtle:** `rgba(13,27,61,0.04)`
- **Selected:** `rgba(13,27,61,0.08)`
- **Cream wash:** `#f5f0e6` (the warm card surface, used as fill in some contexts)

### Separators
- **Hairline:** `rgba(13,27,61,0.08)` (1px, navy-tinted, very subtle)
- **Editorial divider:** A `60px` wide centered horizontal rule in `#c8102e` at `2px` height — used between major sections, treats the page like an editorial layout

### Brand anchors (preserved, integrated MORE than other directions)
- **Navy:** `#0d1b3d` — used for primary text AND the hero card. Body text being navy makes the whole page feel "of one piece" with the brand.
- **Navy mid:** `#1a2c5a`
- **Red:** `#c8102e` — primary CTA + accent eyebrow
- **Red dark:** `#a01f24`
- **Gold:** `#ffb400` — extends to hero eyebrows AND italic accents on key h1s ("Your gala", "The lineup", "Your seats")

### Radii
- `sm: 8` — chips
- `md: 12` — buttons
- `lg: 16` — cards (more generous)
- `xl: 20` — sheets
- `pill: 999`

Editorial radii are larger and softer than Linear, more generous than iOS.

### Shadows
- **Card:** `0 1px 0 rgba(13,27,61,0.04), 0 8px 24px rgba(13,27,61,0.06)` (soft, navy-tinted)
- **Card elevated:** `0 2px 0 rgba(13,27,61,0.06), 0 16px 48px rgba(13,27,61,0.08)`
- **Sheet:** `0 -2px 0 rgba(13,27,61,0.04), 0 -16px 56px rgba(13,27,61,0.10)`
- **Pill:** `0 8px 32px rgba(13,27,61,0.12), 0 1px 0 rgba(13,27,61,0.08)`
- **Button:** `0 4px 12px rgba(200,16,46,0.20)`

### Type — the editorial differentiator

This direction LEANS into typography. The serif italic display font is featured prominently.

- **Display serif italic (h1 hero, h1 sections, accent words):** `Cardo, "Times New Roman", serif` — italic weight 700 — this is the editorial voice.
- **Sans display (h2, h3, supporting):** `'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif`, weight 600
- **Body / UI:** `'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif`, weight 400
- **Numbers (stat readouts, large counts):** Cardo regular at large sizes — let the serif breathe in the stats
- **Sizes:** 12/14/16/18/22/28/40/56 (more dramatic scale)
- **Weights:** 400 / 600 / 700

Editorial typography pattern: hero h1 mixes upright sans + italic serif accents.

```jsx
<h1>
  <span style={{ fontFamily: TOKENS.font.sans, fontWeight: 600 }}>Your </span>
  <span style={{ fontFamily: TOKENS.font.displaySerif, fontStyle: 'italic', color: TOKENS.brand.gold }}>gala.</span>
</h1>
```

This is the signature look. Used on every section h1.

### Spacing — editorial rhythm
- Base: 16px
- Card padding: `24-32px` (generous)
- Section spacing: `48-64px` between sections (generous)
- Mobile reduces by 0.6x but stays generous compared to iOS/Linear

---

## Component recipes

### Card
White, `16px` radius, soft navy-tinted shadow, no visible border. Generous interior padding (`24-32px`). Optional cream variant (`#f5f0e6`) for emphasis cards.

### List row (editorial)
Generous height (`56-64px`), 24px horizontal padding, leading icon optional, title in 16px sans 500, subtitle in 14px secondary, hairline separator below. Last row no separator.

Lists feel more like a magazine table-of-contents than an iOS settings list.

### Section header
Pattern: small uppercase eyebrow in red 11px weight 700 letter-spacing 1.5px → large h2 in navy mixing sans + serif italic accent → optional 14px secondary lead paragraph below.

```jsx
<>
  <div style={{ color: TOKENS.brand.red, fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
    Your tickets
  </div>
  <h2 style={{ marginTop: 8, fontSize: 28, fontWeight: 600, color: TOKENS.text.primary }}>
    Two blocks, <span style={{ fontFamily: TOKENS.font.displaySerif, fontStyle: 'italic', color: TOKENS.brand.gold }}>fifteen seats.</span>
  </h2>
</>
```

### Button — primary
Red pill, white text, weight 700, `14px 32px` padding (more generous), `12px` radius. Soft red-tinted shadow. Hover: lift to elevated shadow.

### Button — secondary
White surface, `1px solid rgba(13,27,61,0.16)`, navy text, same dimensions, soft shadow.

### Button — text link
No background, navy text 600, red on hover, optional `→` trailing arrow.

### Toggle
Custom-styled — 48×28px, 22px knob. Off: cream `#f5f0e6` with hairline navy border. On: navy `#0d1b3d`. Knob is pure white. Slow 250ms ease.

### Segmented control
Cream background (`#f5f0e6`), 12px radius. Selected segment: white surface, soft shadow, navy text 600. Unselected: navy text 400. 38px tall, 14px text.

### Sheet
White, 20px top corners, generous interior padding (32px). Drag handle styled (`32×4px` navy at 12% opacity, 12px from top). Close affordance: tap outside OR drag down — no X button (more elegant).

### Editorial divider
Horizontal centered rule used between major sections:

```jsx
<div style={{ width: 60, height: 2, background: TOKENS.brand.red, margin: '48px auto' }} />
```

A signature touch. Used 2-3 times per page max.

### Stat readouts (TOTAL/PLACED/ASSIGNED/OPEN inside hero card)
Numbers in Cardo serif at 40px, white. Labels in sans 11px uppercase letter-spacing 1.5px at 60% white opacity. Big visual hit.

---

## File-by-file work

### Stage C1 — Foundation (1 commit)

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
    cream: '#f5f0e6',
  },
  surface: {
    ground: '#fbfaf7',
    card: '#ffffff',
    cardWarm: '#f5f0e6',
    cardElevated: '#ffffff',
    sheet: '#ffffff',
  },
  text: {
    primary: '#0d1b3d',
    secondary: '#3a4666',
    tertiary: '#697089',
    onBrand: '#ffffff',
    onBrandSecondary: 'rgba(255,255,255,0.65)',
    accent: '#c8102e',
    italic: '#ffb400',
  },
  fill: {
    primary: 'rgba(13,27,61,0.04)',
    secondary: 'rgba(13,27,61,0.08)',
    tertiary: 'rgba(13,27,61,0.12)',
    cream: '#f5f0e6',
  },
  rule: 'rgba(13,27,61,0.08)',
  ruleStrong: 'rgba(13,27,61,0.16)',
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
```

**`src/brand/styles.css`**:
- Strip Capacitor preamble
- Import fonts: `@import url('https://fonts.googleapis.com/css2?family=Cardo:ital,wght@0,400;0,700;1,400;1,700&family=Source+Sans+3:wght@400;500;600;700&display=swap');`
- New `:root` vars
- `body { background: var(--ground); color: var(--text-primary); font-family: var(--font-ui); font-size: 16px; line-height: 1.55; min-height: 100vh; margin: 0; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }`
- Drop legacy classes

**`src/brand/atoms.jsx`**:
- Delete `useTheme`, `ThemeProvider`, `BRAND`
- Add a new helper export: `<EditorialDivider />` that renders the 60×2 red rule with auto margin

### Stage C2 — Mobile.jsx + Desktop.jsx (1 commit)

The editorial sweep. Specific changes:

1. Outer shell — strip Capacitor, warm cream-white ground.
2. Hero card — interior preserved BUT stat numbers (20/15/15/5) re-rendered in Cardo regular at 40px, labels in Source Sans 3 at 11px uppercase. Big editorial hit.
3. Section h1s mixed sans + italic serif accent (e.g., "Your tickets" pattern shown above).
4. Floating avatar — white circle, soft navy-tinted shadow.
5. "X seats still to place" — generous card with cream-warm surface variant, large editorial type, red Place CTA.
6. Action rows — generous list-row recipe (56-64px tall), italic serif used on row titles where it adds emotional weight.
7. "Your tickets" section — uses red eyebrow + sans+serif h2 pattern. Each ticket as a generous card. Seat refs as Cardo regular inline (e.g., "E12, E13, E14...") in primary text — serif numbers feel like programme entries.
8. EditorialDivider rule used 2-3x: between hero and tickets, between tickets and lineup.
9. Tab bar pill — white, soft navy shadow. Selected tab: navy bg pill with white text + serif italic accent if room.
10. Lineup section — movie posters keep treatment, but section header uses red eyebrow + serif italic h2 ("The *lineup*").

### Stage C3 — Components (1 commit per component)

- `PostPickSheet.jsx` — generous sheet, editorial section headers
- `SeatPickSheet.jsx` — chrome editorial-styled (sheet feel, drag handle), interior dark-cinema preserved
- `AssignTheseSheet.jsx` — generous list rows, italic accents on key labels
- `DinnerPicker.jsx` — radio rows, selected gets cream-warm surface fill + red accent border-left
- `NightOfContent.jsx` — feature treatment with editorial dividers between film blocks
- `SettingsSheet.jsx` — magazine TOC feel, sans+serif section headers, generous spacing
- `MovieDetailSheet.jsx` — feature card with cream-warm variant
- `ConfirmationScreen.jsx` — large editorial layout, italic serif h1 ("You're *all set.*"), red EditorialDivider, secondary text generous below
- `MobileWizard.jsx` — token swap + apply editorial type pattern to step headers
- `Desktop.jsx` — token swap + editorial spacing on the wider canvas (this direction earns its keep on desktop)

### Stage C4 — Cleanup

Same as core spec acceptance.

---

## Inheritance from core

All hard constraints from `PLAN-theme-contest-core.md` §§ 1-6.

---

## Estimated effort

7-9 hours wall-clock. Slightly more than A or B because typography editorial patterns require care — every h1 needs the sans+serif mix decided per heading, and the editorial divider placements are taste decisions.

---

## What "winning" looks like

When Scott opens this branch's preview URL on his iPhone in the morning, his brain reads "this feels like the night itself — special, considered, dressed up." The serif italic accents on h1s create rhythm. The navy primary text + cream-white ground feels warm and confident, not corporate. The hero card stats in Cardo serif read like a program. The red CTAs feel like opening-night invitations.

If it makes him feel like the gala matters — like the portal is part of the celebration, not a tool to manage it — this branch wins.
