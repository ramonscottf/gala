---
title: Gala Portal · Phase 2 · Theme Reset (iOS-native, single light theme, Capacitor stripped)
status: spec
project: gala
phase: 2.0 — spec only. Plan written by Skippy in chat 2026-05-05; awaiting Scott + Code execution.
source_chat: 2026-05-05 gala-edge-to-edge thread (after the AppBar removal series)
created: 2026-05-05
last_updated: 2026-05-05
---

# Phase 2 — Theme Reset

## Why this exists

Phase 1.x kept patching: light-mode sweeps, edge-to-edge attempts, AppBar removal, hero-card relocations. After all of it Scott is still seeing low-contrast surfaces, white/navy bands at viewport edges, and a portal that "lost all cohesion" compared to childspree. The diagnosis isn't another patch — the theme system itself is the problem.

Three root causes were identified in the source chat:

1. **Dual light/dark theme** added enormous surface area (tokens, force-dark-vars overrides, per-component branching) for a feature nobody asked for. Childspree picked one direction and committed; gala didn't.
2. **Capacitor scaffolding** baked into the CSS shell (`100dvh`, `env(safe-area-inset-*)` applied at multiple layers, scroll-lock on the body, `-webkit-tap-highlight-color: transparent`, `user-select: none` on chrome) bleeds into the Safari experience. The portal is web-only for the foreseeable future. The Capacitor rules are causing more bugs than they prevent.
3. **Inconsistent token usage.** Some surfaces use `var(--*)` CSS vars, others use `BRAND.*` JS constants, others use hex literals inline. Same color called three different ways = inevitable drift.

This plan strips dark mode, strips Capacitor, and rebuilds the theme layer on a single iOS-native light foundation. **Pages and components stay.** Only the style layer changes.

## Out of scope

- **Page logic, routes, data flow, component hierarchy.** Don't refactor anything that isn't styling.
- **Desktop redesign.** Desktop.jsx gets the same token swap but no structural changes; it already works.
- **MobileWizard.jsx structural changes.** Same — token swap only, no flow changes.
- **Capacitor app shell project itself.** If a separate Capacitor wrapper repo exists, leave it alone. We're only stripping Capacitor concessions from the web portal.
- **Other DEF properties** (childspree, daviskids.org, gala-dashboard admin). Out of scope. Just `gala.daviskids.org` / `ramonscottf/gala`.

## Visual direction (locked)

**Hybrid approach.** The two brand anchors stay:

- **Navy hero card** at the top of HomeTab — `linear-gradient(170deg, #1a2c5a → #0d1b3d)` with the gold perforation strip, eyebrow caps, white type. This is the gala brand moment. Don't touch its interior visual design.
- **Red CTA buttons** — `#c8102e` with the existing pill shape and shadow. Keep.

**Everything else becomes iOS-native:**

- **Surfaces:** white (`#ffffff`) for cards, light gray (`#f2f2f7`) for the page ground and grouped-list backgrounds. iOS's standard "grouped table view" feel.
- **Text:** `#000000` for primary, `#3c3c43` at 60% opacity for secondary, `#3c3c43` at 30% opacity for tertiary. iOS system label hierarchy verbatim.
- **Dividers:** `#3c3c43` at 18% opacity — `rgba(60,60,67,0.18)`. iOS's `separator` color.
- **Cards:** white background, `12px` border radius, no border, no glass, no gradient. Optional shadow `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)` for elevation, but only when the card sits on the gray ground (not when nested inside another card).
- **Toggles:** iOS switch style — `#34c759` green when on, `#e9e9eb` gray when off. 31px tall, 51px wide, 27px knob.
- **Dropdowns / segmented controls:** iOS segmented control — `#787880` at 12% bg, `0.5px` border, 8px radius, white selected pill with subtle shadow.
- **Sheets:** iOS modal sheet — white surface, top corners radius `14px`, drag handle (`#3c3c43` at 30% opacity, 36×5px) at the top-center, no glass blur.
- **Buttons:** primary stays red. Secondary becomes iOS gray button — `#787880` at 12% background, primary text color.
- **Typography:** keep the existing `FONT_DISPLAY` (serif italic) for hero card title and the section h1s — that's the brand voice. Body and UI uses `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif` exclusively. No Helvetica fallbacks lower in the stack.

**Single theme = light.** Drop `useTheme`, `isDark`, `force-dark-vars`, `forceDark` props on Sheet, every `isDark ?` ternary. The system honors `@media (prefers-color-scheme: dark)` in CSS only if and when we deliberately add a dark variant later — out of scope here.

## Capacitor strip

Remove from the codebase:

1. CSS in `src/brand/styles.css` (line 1-30 or wherever the Capacitor-readiness preamble lives):
   - `height: 100dvh` on `html, body` → change to `min-height: 100%` and let scroll work normally
   - `overflow: hidden` on `body` → remove (page can scroll normally in Safari)
   - `-webkit-touch-callout: none` → remove
   - `-webkit-user-select: none` on body / chrome → remove (let users select text)
   - `-webkit-tap-highlight-color: transparent` → keep ONLY on `button, a` (not body)
   - `overscroll-behavior: none` → remove
2. The `env(safe-area-inset-*)` calls. Keep them, but apply ONCE per layout edge:
   - Top: only on the outermost shell's `padding-top` (or on the hero card's `margin-top` — never both)
   - Bottom: only on the floating tab bar pill's internal padding (already correct)
3. The `100dvh` height on the Mobile.jsx outer shell → change to `min-height: 100vh`. Let the page grow naturally and scroll the document, not an inner container.
4. Capacitor-related package.json deps if any (`@capacitor/*`) — uninstall. Code should grep for these before removing to avoid breaking anything.
5. `vite.config.js` — check for any Capacitor-specific plugin or build target. Strip if present.

After the strip, the page should behave like a normal scrolling web page in Safari. The floating tab pill stays absolute-positioned over content. The hero card flows from the top of the document.

## Token system (single source of truth)

Create `src/brand/tokens.js` as the **only** place colors and spacing values are defined. Every component imports from here. No more `BRAND.*` constants in mixed locations, no more inline hex.

```js
// src/brand/tokens.js
export const TOKENS = {
  // Brand anchors (the two things we keep)
  brand: {
    navy: '#0d1b3d',
    navyMid: '#1a2c5a',
    navyDeep: '#091228',
    red: '#c8102e',
    redDark: '#a01f24',
    gold: '#ffb400',          // hero card eyebrow only
  },

  // iOS system surfaces
  surface: {
    ground: '#f2f2f7',         // page background
    card: '#ffffff',           // card surface
    cardElevated: '#ffffff',   // modal/sheet surface (same color, different shadow)
    grouped: '#f2f2f7',        // iOS grouped list background
  },

  // iOS system text
  text: {
    primary: '#000000',
    secondary: 'rgba(60,60,67,0.60)',
    tertiary: 'rgba(60,60,67,0.30)',
    onBrand: '#ffffff',         // text on navy or red surfaces
    onBrandSecondary: 'rgba(255,255,255,0.65)',
  },

  // iOS system fills
  fill: {
    primary: 'rgba(120,120,128,0.20)',    // primary fill
    secondary: 'rgba(120,120,128,0.16)',  // secondary fill (segmented bg)
    tertiary: 'rgba(120,120,128,0.12)',   // tertiary fill (button bg)
    quaternary: 'rgba(120,120,128,0.08)', // quaternary fill (subtle hover)
  },

  // iOS separators
  rule: 'rgba(60,60,67,0.18)',
  ruleOpaque: '#c6c6c8',

  // iOS semantic colors
  semantic: {
    success: '#34c759',
    warning: '#ff9500',
    danger: '#ff3b30',
    info: '#007aff',
  },

  // Spacing (4pt iOS grid)
  space: {
    xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
  },

  // Radii (iOS conventions)
  radius: {
    sm: 6,    // small chips
    md: 10,   // buttons
    lg: 12,   // cards
    xl: 14,   // sheets / modals
    pill: 999,
  },

  // Shadows (iOS-light)
  shadow: {
    card: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
    sheet: '0 -2px 16px rgba(0,0,0,0.10)',
    pill: '0 8px 24px rgba(0,0,0,0.12)',
  },

  // Typography
  font: {
    display: 'Cardo, "Times New Roman", serif',  // existing FONT_DISPLAY for hero h1s
    ui: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
  },
};
```

CSS variables in `styles.css` mirror these for cases where we need them in stylesheets:

```css
:root {
  --ground: #f2f2f7;
  --card: #ffffff;
  --text-primary: #000000;
  --text-secondary: rgba(60,60,67,0.60);
  --text-tertiary: rgba(60,60,67,0.30);
  --rule: rgba(60,60,67,0.18);
  --brand-navy: #0d1b3d;
  --brand-red: #c8102e;
  /* etc */
}
```

**Delete** the existing `BRAND` export in `src/brand/atoms.jsx` and replace all imports project-wide. Code should grep for `BRAND\.` and migrate each call site to `TOKENS.*`.

## File-by-file action list

This is the work. Code follows it in order.

### Stage 1 — Foundation (tokens + CSS shell)

**Commit 1.** `src/brand/tokens.js` (NEW). Paste the TOKENS object verbatim from the spec above.

**Commit 2.** `src/brand/styles.css` rewritten:
- Strip the Capacitor preamble lines (100dvh, overflow:hidden body, user-select none, tap-highlight, overscroll-behavior)
- New `:root` variables matching tokens.js
- `body { background: var(--ground); color: var(--text-primary); font-family: -apple-system, ...; min-height: 100vh; margin: 0; }`
- Drop `.force-dark-vars` entirely
- Drop the `.tab-bar` and `.tab-bar-glass` rules — recreate inline in components
- Keep `.scroll-container { -webkit-overflow-scrolling: touch; }` only

**Commit 3.** `src/brand/atoms.jsx`:
- `useTheme` → delete entire hook + provider (or keep stub returning `{ isDark: false }` for back-compat if too risky to remove in one pass; Stage 4 deletes the stub)
- `BRAND` → re-export `TOKENS` flattened to old shape for compat, with a `// TODO Phase 2: migrate to TOKENS.*` comment on each. Stage 4 deletes the compat layer.

After Stage 1 the app should still build and look identical to current. Only the foundation changed.

### Stage 2 — Mobile.jsx surface sweep (the big one)

This is ~2,989 lines and most of the visual debt lives here. Code attacks it in passes:

**Pass A — outer shell + tabs**
- Mobile() outer return (line ~2968): `height: '100dvh'` → `minHeight: '100vh'`. `overflow: 'hidden'` → remove. Keep `position: 'relative'` and `display: 'flex'`.
- Body bg already `var(--ground)` — ensure it's `TOKENS.surface.ground`.
- TabBar (line ~1801): replace the glass pill with a solid white pill on iOS-shadow:
  ```jsx
  background: TOKENS.surface.card,
  boxShadow: TOKENS.shadow.pill,
  border: 'none',
  // remove backdrop-filter blur entirely
  ```
  Inactive tab labels: `TOKENS.text.secondary`. Active tab: `TOKENS.brand.navy` text + small `TOKENS.fill.tertiary` background pill behind it.
- FloatingAvatar (line ~1908 area): keep the position. Change avatar bg from any glass treatment to solid `TOKENS.surface.card` with `TOKENS.shadow.card`.

**Pass B — HomeTab (line ~673 onward)**
- Hero card stays as designed. Don't touch its interior — it's the brand moment. Only verify the `margin: 'calc(env(safe-area-inset-top) + 8px) 14px 0'` is honoring safe-area exactly once.
- "X seats still to place" CTA card (line ~720ish) — currently has a gradient icon block + body. Convert to: white card, gray rounded icon container (`TOKENS.fill.tertiary` bg), red `Place` button (already red, just verify).
- "Text my seats to me" row — currently a card with light bg. Convert to a clean iOS list-row inside a grouped-list container (white, full-width edge-to-edge bleed with 16px inner padding, divider line below).
- "Manage tickets" row — same iOS list-row treatment.
- "Your tickets" section — section header gets uppercase 11px secondary text per iOS pattern. Each ticket card becomes a white surface with `TOKENS.shadow.card` on the gray ground. Seat reference chips (C10, E12, etc.) become iOS pill-style: `TOKENS.fill.tertiary` bg, `TOKENS.text.primary` text, 4px vertical padding, 8px horizontal, `TOKENS.radius.sm`.
- "Place N more seats" dashed CTA → iOS-style ghost button: 1px dashed `TOKENS.rule`, `TOKENS.text.secondary` text, white bg.
- "The lineup" section header — same uppercase 11px treatment.

**Pass C — TicketsTab (line ~1112)**
- Section eyebrow — uppercase 11px, `TOKENS.text.secondary`.
- Tab heading h1 — keep `FONT_DISPLAY` italic but in `TOKENS.text.primary` (black).
- Each ticket card — same treatment as HomeTab tickets.

**Pass D — GroupTab (line ~1391)**
- Same conventions as TicketsTab.
- Group member rows become iOS list-rows with avatar circles on the left, name + email stacked, action button right.

**Pass E — NightTab (line ~1807)**
- Same conventions.
- Movie posters keep their current treatment (visual content, not chrome).
- Showtime toggle becomes an iOS segmented control.

### Stage 3 — Component sweep

**Commit one per component file** so reviews are tight:

- `src/portal/components/PostPickSheet.jsx` — sheet surface white, drag handle on top, iOS-native action rows.
- `src/portal/components/SeatPickSheet.jsx` — keep the cinema-dark interior (the seat map IS dark by design and Scott has confirmed this). Only sweep the chrome around it: header, footer, close button. Use `TOKENS.brand.navyDeep` directly instead of `forceDark` plumbing.
- `src/portal/components/AssignTheseSheet.jsx` — sheet white, list rows iOS-native.
- `src/portal/components/DinnerPicker.jsx` — radio rows become iOS-style with the checkmark on the right when selected.
- `src/portal/components/NightOfContent.jsx` — surface treatment only.
- `src/portal/SettingsSheet.jsx` — iOS Settings app mimicry. Grouped list with section headers, white rows, chevron right, dividers between rows but not around the section.
- `src/portal/MovieDetailSheet.jsx` — sheet white, poster + meta + dismiss.
- `src/portal/ConfirmationScreen.jsx` — full-screen success. White ground, large green check, message, primary CTA.
- `src/portal/MobileWizard.jsx` — token swap only, no structural changes. Drop the radial gradient on the outer shell (already done in earlier commit but verify).
- `src/portal/Desktop.jsx` — token swap only, no structural changes.

### Stage 4 — Deletion pass

After Stages 1-3 are merged and Scott has spot-checked production:
- Delete `useTheme` entirely
- Delete the `BRAND` compat layer in atoms.jsx
- Grep for any remaining `isDark`, `force-dark-vars`, `forceDark` and remove
- Grep for any `100dvh` references and convert to `100vh` or `minHeight`
- Run a full build and visually QA every screen on iPhone Safari

## Pre-flight (run before each stage commit)

- [ ] `npm run build` succeeds with zero warnings
- [ ] `git diff --stat` shows ONLY the files this stage was supposed to touch
- [ ] No new `BRAND.*` references introduced (post-Stage 4)
- [ ] No `env(safe-area-inset-top)` applied to more than one element per layout edge
- [ ] No `100dvh` outside of `tokens.js` (and only as a documented edge case if at all)
- [ ] No new `isDark` or `useTheme` references introduced
- [ ] Every CTA still routes to a real URL (no placeholder hrefs)
- [ ] Mobile + Desktop both render in dev (`vite dev` then test both viewports)

## Acceptance

The portal is done when:

1. Scott opens `gala.daviskids.org` on iOS Safari and the page bleeds edge-to-edge with no white/navy bands at top or bottom (matches childspree feel)
2. Every card, list row, toggle, sheet, and dropdown reads as iOS-native at a glance — no glass, no gradient surfaces, no dual-mode color confusion
3. The navy hero card and red CTAs remain as the only brand color moments
4. Contrast passes WCAG AA on every text/background pairing
5. `grep -r "isDark\|useTheme\|force-dark\|100dvh\|user-select: none\|overscroll-behavior" src/` returns zero hits

## Estimated effort

- Stage 1 (foundation): 1-2 hours
- Stage 2 (Mobile.jsx sweep): 4-6 hours, single sitting
- Stage 3 (component sweep): 2-3 hours, one commit per component
- Stage 4 (deletion + QA): 1-2 hours
- **Total: 8-13 hours of Code time, spread across 1-2 sessions**

Worth doing in two sessions: Stages 1+2 in session one (lock the foundation and the biggest surface), Stages 3+4 in session two after Scott has lived with the new look for a day.

## Handoff

Code should:

1. Read this plan + `src/brand/styles.css` + `src/brand/atoms.jsx` first
2. Do Stage 1 in a single PR. Open it, have Scott review, merge.
3. Stage 2 next, opened as a separate PR. Mobile.jsx is the heavy lift — Code should commit per pass (A through E) inside that PR for reviewability.
4. Stages 3 and 4 each as their own PRs.

Each PR description references this plan path: `docs/PLAN-portal-retheme.md`. README in skippy-plans gets updated as each stage ships (status: spec → in-progress → code-shipped → live).

## Open questions for Scott

None blocking. The plan is locked.

If Code hits something unexpected (a Capacitor dep that turns out to be load-bearing, a token migration that breaks a screen Code can't reason about), pause and ask. Otherwise execute.
