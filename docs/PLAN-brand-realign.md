---
title: Gala · Brand Realign · Portal token swap to match daviskids.org canonical system
status: shipped
project: gala
phase: brand-realign-v1
source_chat: 2026-05-10 Scott · "create a style guide for the gala"
created: 2026-05-10
last_updated: 2026-05-10
---

# Gala Brand Realign — May 10, 2026

## What this is

The sponsor portal (`gala.daviskids.org/sponsor/`) was visibly off-brand
from the marketing site (`daviskids.org/events-gala`) in three specific ways:

1. **Purple-bridged gradient.** The portal's brand gradient walked crimson
   through magenta into indigo (`#d72846 → #b1306d → #6a3a9a → #3b3f9f`).
   The marketing site goes blue → red directly, no purple bridge.
2. **Purple status numbers.** The "OPEN · TO PLACE · ASSIGNED" stat block
   on HomeTab used `BRAND.indigoLight` (`#a8b1ff`) — a light purple — for
   the big numbers. The marketing site uses brand blue (`#4a7df0`) for
   the equivalent moment.
3. **Wrong navy + wrong display font.** Portal navy was `#1a2350`; DEF
   canonical navy is `#0b1b3c`. Portal display font was Source Serif 4;
   marketing site is on Fraunces.

Scott surfaced it directly: *"the light purple is not really our color."*

## What changed

Three files. All token-level. No structural component changes.

### `src/brand/tokens.js`
- `BRAND.navy`: `#1a2350` → `#0b1b3c` (DEF canonical)
- `BRAND.red`: `#d72846` → `#CB262C` (canonical Gala red)
- `BRAND.gold`: `#f4b942` → `#ffc24d` (DEF gold-400)
- `BRAND.indigoLight`: `#a8b1ff` → `#4a7df0` (kept as alias for backward
  compat; new code should use `BRAND.blueLight`)
- Added `BRAND.blue` / `BRAND.blueDeep` / `BRAND.blueLight` as the new
  semantic names
- Added DEF gold ramp: `goldSoft` (300) / `gold` (400) / `goldDeep` (500)
- `BRAND.gradient`: replaced the four-stop magenta-bridged gradient with
  a direct blue↔red gradient: `linear-gradient(125deg, #2858d6, #CB262C, #4a7df0, #CB262C)`
- Added `BRAND.gradientStrip` (90° horizon for top-of-surface bars)
- Added `BRAND.gradientGoldSoft` (gold-300 → gold-500 for hairlines/scrollbars)
- `FONT_DISPLAY`: Source Serif 4 → Fraunces (with Source Serif 4 retained
  as fallback during the font rollout)
- `TIERS.Gold.color`: `#f4b942` → `#ffc24d` to match the new gold-400
- Rewrote the "USE OF GOLD" doctrine block at the top of the file to
  reflect the new "third voice" role for yellow (was "trim only")

### `src/brand/styles.css`
- `--ground`: `#0f1639` → `#0b1b3c` (matches `BRAND.navy`)
- `--accent-italic`: `#a8b1ff` → `#4a7df0` (the user-visible purple → blue swap)
- `--accent-text`: `#f4b942` → `#ffc24d` (DEF gold-400)
- Mirrored the same updates in the `.force-dark-vars` override class

### `docs/STYLE-GUIDE.html` (new)
Self-contained, opens in any browser. The canonical visual reference for
anyone touching Gala surfaces from here forward — sponsor portal, admin
tools, emails, SMS templates, print. Ten sections: identity, color
(including the new DEF gold ramp), gradients, typography, motion,
components, DEF yellow in use (new doctrine section), portal reskin
diagnosis, do/don't rules, and a drop-in `:root` block.

## Yellow doctrine — the v2 change

The previous doctrine said gold was "trim only — never text, never buttons,
never numbers, never status." That came from a specific failure (gold-on-paper
was illegible) and was correct in spirit but too restrictive in practice.

The v2 doctrine says gold is **the third voice** of the brand alongside blue
and red. It earns a small but real role on dark grounds:

- Eyebrows on navy (replaces all-red eyebrow for variety)
- Italic flair words in display headlines (one per page, navy ground only)
- Hairline dividers (`linear-gradient(90deg, transparent, gold, transparent)`)
- Scrollbars
- Gold-tier sponsor dots
- 1.6px hairline icon strokes
- Section-number bullet dots

What stays forbidden: body text on paper, buttons, primary CTAs, status
numbers, filled status pills, anything illegible. The yellow test: if
removing the yellow leaves the surface still legible and complete, yellow
is being used correctly. If removing it breaks understanding, you've asked
too much of it. **Jewelry, never structure.**

## What did NOT change

- Component file structure
- Routes, data flow, API contracts
- Light/dark mode behavior (still dark-mode-only per May 9 decision)
- Capacitor configuration
- Any backend or worker code
- Build pipeline

## Verification

- `npm run build` — main portal build succeeds (62 modules, 19.77 kB CSS)
- `npm run build:sponsors` — admin sponsor portal build succeeds (36 modules, 12.97 kB CSS)
- `grep BRAND\. src/` — every used token still resolves
- All `BRAND.indigoLight` call sites (TicketCard, TicketsTab, SeatPickSheet,
  DinnerPicker, HomeTab, TicketDetailSheet, PostPickOverview, SeatEngine,
  Portal, DinnerSheet) now render brand blue instead of purple without any
  per-component change — the semantic alias preservation worked as intended.

## Out of scope (followup tickets)

1. **Component-level rename pass.** All `BRAND.indigoLight` → `BRAND.blueLight`
   call sites should be renamed for clarity; the alias keeps working in the
   meantime. Aim to do this in a single grep+replace commit after a week of
   the alias being stable.
2. **Yellow accent rollout.** The doctrine now permits yellow on navy
   surfaces for eyebrows, italic flair, dividers, scrollbars, dots,
   hairline icons. Currently the portal uses zero of these — opportunity
   for a small follow-up to add yellow trim where it would help the navy
   surfaces feel more like the marketing site.
3. **Sponsor email template alignment.** The marketing emails still use
   the v6-locked palette which already matches; verify no purple has crept
   into recent edits.

## How to revert

This is a token-only change. To revert:
```
git revert <this-commit-sha>
npm run build && npm run build:sponsors
wrangler pages deploy public --project-name=gala
```
No data migration, no schema change, no user-facing state to clean up.
