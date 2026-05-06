# Theme Contest — Core Spec (shared by all three branches)

**Status:** Locked 2026-05-05. All three contestant branches inherit this spec verbatim.
**Owner:** Scott Foster
**Source chat:** 2026-05-05 gala edge-to-edge → AppBar → theme reset thread

---

## What's happening

The gala portal at `gala.daviskids.org` has accumulated theme debt across Phases 1.7 through 1.15: dual light/dark mode, Capacitor scaffolding, mixed token systems, and inconsistent surface treatment. Phase 1.x kept patching. Patches stopped working.

We're running a **three-way design contest** to reset the theme layer. Three branches built tonight in parallel, each picking its own visual direction. Tomorrow Scott picks the winner, the other two branches die.

This document defines what every contestant MUST do regardless of visual direction. Each contestant's own plan adds the specific visual language on top.

---

## The three contestants

| Branch | Direction | Plan |
|---|---|---|
| `theme/ios-native` | iOS system UI — UIKit defaults, grouped lists, system fills | `docs/PLAN-theme-A-ios-native.md` |
| `theme/linear` | Linear/Vercel — modern minimal, mono accents, dense info | `docs/PLAN-theme-B-linear.md` |
| `theme/editorial` | Stripe/Apple-marketing — editorial polish, large type, generous whitespace | `docs/PLAN-theme-C-editorial.md` |

All three branch from `main`. `main` is untouched until a winner is merged.

---

## Hard constraints — every contestant follows these or fails

### 1. Strip Capacitor entirely

The portal is web-only. Every Capacitor concession in the CSS shell must die.

**Remove from `src/brand/styles.css`:**
- `height: 100dvh` on html/body → use `min-height: 100%` and let the document scroll naturally
- `overflow: hidden` on body → remove
- `-webkit-touch-callout: none` → remove
- `-webkit-user-select: none` on body or chrome → remove (let users select text)
- `-webkit-tap-highlight-color: transparent` → keep ONLY scoped to `button, a` selectors
- `overscroll-behavior: none` → remove

**Remove from `src/portal/Mobile.jsx` outer shell:**
- `height: '100dvh'` → `minHeight: '100vh'`
- `overflow: 'hidden'` on the outer div → remove

**Remove from `src/portal/Desktop.jsx` outer shell:**
- `height: '100dvh'` → `minHeight: '100vh'`
- `overflow: 'hidden'` on the outer div → remove

**Remove from `src/portal/MobileWizard.jsx`:** same pattern.

**Remove from `package.json`:** any `@capacitor/*` deps if present (`grep capacitor package.json` first; if nothing, skip).

**Remove from `vite.config.js`:** any Capacitor-specific plugin if present.

**Acceptance:** `grep -rE "100dvh|user-select: none|overscroll-behavior|touch-callout|@capacitor" src/ package.json vite.config.js` returns zero hits.

### 2. Single light theme

No dark mode. No system that branches on color scheme.

**Delete:**
- The `useTheme` hook + provider in `src/brand/atoms.jsx`
- The `force-dark-vars` CSS class in `styles.css`
- The `forceDark` prop on the `Sheet` primitive (and any other component that takes it)
- Every `isDark ?` ternary in every JSX file
- Every reference to `BRAND.groundDeep`, `BRAND.navyDeep`-as-page-background (the navy may live ON the hero card; it does not paint the page)

The seat map inside `SeatPickSheet.jsx` is the **one allowed exception** — its interior is intentionally cinema-dark and Scott confirmed this stays. Implement it as a hard-coded local dark surface inside the sheet, not via a theme branch.

**Acceptance:** `grep -rE "isDark|useTheme|force-dark|forceDark" src/` returns zero hits except inside `SeatPickSheet.jsx` (where local dark is allowed for the seat map only).

### 3. Mobile and Desktop in lockstep

This is the rule that's been violated repeatedly across Phase 1.x. **Every change touches both.**

- Every token defined in `src/brand/tokens.js` is consumed by both Mobile.jsx and Desktop.jsx
- Every component (cards, sheets, buttons, list rows, toggles, dropdowns, segmented controls) renders the same on both — only width changes
- No `if (isMobile)` styling branches that differ in surface color, type weight, radius, shadow, or spacing scale
- The hero card looks the same on both. The CTA buttons look the same on both. The list rows look the same on both.
- If a contestant's design needs different *layout* between mobile and desktop (e.g., side-by-side columns on desktop), that's allowed — but the **components inside** the layout must be visually identical.

**Acceptance:** Any reviewer can open the same screen on iPhone and a laptop and see the same design language. Cards have the same fill, the same radius, the same shadow. Type uses the same weights and sizes (within ±1px). Buttons are pixel-equivalent.

### 4. Unified token system

One source of truth. `src/brand/tokens.js` is the only place colors, spacing, radii, shadows, and font stacks are defined.

**Required exports:**
```js
export const TOKENS = {
  brand:    { /* navy, red, etc — contestant-defined */ },
  surface:  { ground, card, cardElevated, sheet },
  text:     { primary, secondary, tertiary, onBrand },
  fill:     { primary, secondary, tertiary, quaternary },
  rule:     '...',                  // separator color
  semantic: { success, warning, danger, info },
  space:    { xs, sm, md, lg, xl, xxl, xxxl },
  radius:   { sm, md, lg, xl, pill },
  shadow:   { card, sheet, button },
  font:     { display, ui },
};
```

**Required CSS mirror in `styles.css`:**
```css
:root {
  --ground: ...;
  --card: ...;
  --text-primary: ...;
  /* ...mirroring every token */
}
```

**The old `BRAND` export in `atoms.jsx` is deleted.** Every import site migrates to `TOKENS.*`. No compat shim. If something breaks during migration, fix the call site, don't add a fallback.

**Acceptance:** `grep -rE "import \{ BRAND \}|from.*atoms" src/` returns only references to other (non-BRAND) atoms exports. `grep -rE "#[0-9a-fA-F]{3,8}" src/portal/` returns near-zero hits (only inside `tokens.js` and the hero card SVG perforation if it has one).

### 5. Pages and functionality stay identical

This is a theme rebuild, not a feature rebuild.

- Routes in `App.jsx` unchanged
- Component hierarchy unchanged (same files, same exports, same default exports)
- Data flow unchanged (same hooks, same state, same API calls)
- Business logic unchanged (seat selection algorithm, delegation flow, dinner picker logic)
- All existing functionality keeps working — every spot Scott can click today must still click and route the same way tomorrow

If a contestant feels a component needs to be split or merged for their visual direction, **don't.** Style what's there.

The only exceptions:
- **Adding** a new shared primitive (e.g., `<Card>`, `<ListRow>`, `<Toggle>`) is allowed if the contestant's plan calls for it
- **Removing** dead code that the constraint sweep eliminates (the `useTheme` hook and its consumers)

### 6. Edge-to-edge native feel (the original bug that started all this)

The page bleeds top and bottom. No white or navy bands in the iOS safe area. No flat-color halos around the floating tab pill. Match `childspree.org`'s feel.

**Mechanism:** `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` applied **once per layout edge**, never doubled. Each contestant picks where it lands — outermost shell, hero card margin, or list row padding — but it lands in exactly one place.

**Acceptance:** Open the deployed branch preview on an iPhone in Safari. Status bar area shows the page background, not a flat white band. Bottom URL bar area shows content, not a flat white halo around the floating tab pill.

---

## Build and deploy

Each contestant pushes to their branch. Cloudflare Pages auto-deploys every branch as a preview at:

- `https://theme-ios-native.gala-3z8.pages.dev` (or similar — the actual subdomain pattern is `<branch-with-dashes>.<project>.pages.dev`)

The preview URL becomes the demo. Scott opens all three on his phone and laptop in the morning, picks one.

**Each branch's plan must include its expected preview URL** so Scott has three links to tap, not three pages.dev hunts.

---

## Acceptance test (run before pushing the final commit)

Every contestant runs this before declaring done:

- [ ] `npm run build` succeeds with zero warnings
- [ ] `grep -rE "100dvh|user-select: none|overscroll-behavior|touch-callout|@capacitor" src/ package.json` returns zero
- [ ] `grep -rE "isDark|useTheme|force-dark|forceDark" src/` returns zero (or only inside SeatPickSheet.jsx)
- [ ] `grep -rE "import \{ BRAND \}" src/` returns zero
- [ ] `grep -rE "#[0-9a-fA-F]{3,8}" src/portal/Mobile.jsx src/portal/Desktop.jsx` returns near-zero (≤5 acceptable for SVG paths)
- [ ] Mobile and Desktop screenshots side-by-side: same colors, same radii, same shadows, same type
- [ ] iPhone Safari screenshot: no white/navy band at top or bottom
- [ ] Every existing function still works: place seats, delegate, pick dinners, view tickets, open settings, navigate tabs

If any check fails, fix it before pushing the final commit. No half-done branches in the contest.

---

## What NOT to do (lessons from Phase 1.x)

These are the failure modes that produced the current mess. Every contestant must avoid them:

1. **Don't add a compat layer.** No `BRAND` re-export pointing at TOKENS. Migrate the call sites.
2. **Don't preserve dual-mode "just in case."** Delete it.
3. **Don't apply safe-area in two places.** Pick one layer.
4. **Don't ship dark-mode tokens "for the future."** YAGNI. If we ever want dark mode, we'll add a single `:root[data-theme="dark"]` block from a clean foundation.
5. **Don't introduce new theme branching.** No `if (isMobile)` color choices. Same tokens everywhere.
6. **Don't refactor business logic.** Style only.

---

## Plan persistence

Per Skippy v5 plan-persistence rules:

- Core spec (this file): `gala/docs/PLAN-theme-contest-core.md`
- Branch A: `gala/docs/PLAN-theme-A-ios-native.md`
- Branch B: `gala/docs/PLAN-theme-B-linear.md`
- Branch C: `gala/docs/PLAN-theme-C-editorial.md`
- Cross-project index: `skippy-plans/plans/2026-05-05-gala-theme-contest.md` (links to all four)

All five files committed and pushed before any contestant starts work. Status in the skippy-plans README: 📋 Spec → 🚧 In progress → ✅ Code shipped per branch → 🏆 Winner merged / 🗑️ Branch deleted.
