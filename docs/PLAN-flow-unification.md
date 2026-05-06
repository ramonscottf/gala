---
title: Gala Portal — Flow Unification (Kill the Legacy Wizard Seat-Pick Path)
status: spec
project: gala
phase: flow-unification
source_chat: 2026-05-06 Skippy + Scott — "WHAT THE FUCK" sync
created: 2026-05-06
last_updated: 2026-05-06
---

# Flow Unification

> **One sentence:** Mobile and desktop must run the **same finite-state machine** for sponsor flow. They can render that state machine with different chrome (boarding-pass vs wizard side-rail), but every seat-pick, every confirmation, every finalize, every reward beat must be the same code path producing the same outcome.

## Why this exists

Scott walked the desktop portal at `gala.daviskids.org/sponsor/dgu5lwmfmgtecky3` on May 6 and got a QR-code confirmation through one path AND a separate text/email flow through a different path. That can only happen if there are two distinct seat-selection codepaths on desktop. There are.

`src/portal/Desktop.jsx` (line 942 + line 1242) still wires up the legacy `StepShowing` + `StepSeats` wizard components from the original wizard pattern. Phase 1.15 (back when this code lived in def-site) added `SeatPickSheet` (used at `seatPickOpen` state, opened from line 2322–2324) as the canonical seat-pick surface but kept the legacy wizard "for back-compat with email deep links to `?step=seats`." Both paths are live. Both produce different confirmation experiences.

The repo migrated from `def-site` to `ramonscottf/gala` on May 5 2026. The bug rode along with the migration intact. Phase 1.16 in the gala repo was a separate bug-fix sprint (orphan-seat fixes, etc.) and didn't touch this divergence.

This is the kind of drift the plan-persistence rule was designed to catch. Phases 1.7, 1.14, and 1.15 each said "unification" but each unified a different surface. The full sponsor flow on desktop is still split.

Mobile has a related but different gap: the SeatPickSheet → PostPickSheet chain has no celebratory "you placed N seats — here's your ticket card" reward beat between picking and the eventual Finalize. The boarding-pass card on Home updates silently. From the sponsor's perspective, the picker just closes.

## What "done" looks like

A sponsor walking through either shell experiences this exact flow:

1. **Land on the portal.** Mobile sees boarding-pass home + tabs. Desktop sees PortalNav + stepper + right rail + main panel. **Different chrome. Same state.**
2. **Tap "Place seats" / open the seat picker.** Both shells open the **same** `SeatPickSheet` component (mobile in a sheet, desktop in a Modal). One codepath. Same showtime → theater → seat selection logic.
3. **Place seats.** Same `/api/gala/portal/{token}/pick` POST. Both shells route to **the same** `PostPickSheet` afterward, which presents the same three cards: "Pick more seats" / "Assign these seats to guests" / "I'm done — send my QR".
4. **Reward beat (the missing piece).** When PostPickSheet opens, both shells show **the placed seats as a ticket-card preview at the top of the sheet** — a "here are the tickets you just locked in" moment. Same component on both shells. Mobile-style boarding-pass mini-card; on desktop, slightly larger.
5. **Finalize.** Both shells POST `/api/gala/portal/{token}/finalize`. Same `ConfirmationScreen`. Same QR. Same email + SMS dispatch. Same "Edit my seats" exit.
6. **Home/dashboard view.** Mobile = HomeTab with TicketHero + per-ticket cards. Desktop = StepWelcome with the same data, rendered as a wizard-style overview. Both surfaces read the same `mobileData` adapter (`adaptPortalToMobileData`). Both update identically when finalize runs.

If you can finalize on one shell and get a different end-state than the other shell with the same starting data, **we are not done.**

## Hard rules

1. **Don't change the look.** Desktop wizard chrome stays. Mobile boarding-pass shell stays. The viewport-aware split at 880px stays. We are unifying the **process**, not the **layout**.
2. **`SeatPickSheet` is the single canonical seat-picker.** Both shells must open it, not their own implementations. Delete `StepShowing` and `StepSeats` from `Desktop.jsx` after wiring `SeatPickSheet` into the wizard's "Seats" step.
3. **`ConfirmationScreen` is the single canonical end-state.** Both shells already do this — verify it stays that way.
4. **Email deep links must still work.** The route `/sponsor/{token}/seats` must land the user on the correct step in their shell with `SeatPickSheet` open. Test this explicitly — it's the back-compat the legacy stepper was protecting.
5. **No new components without a unification justification.** Every new component added in this phase must replace ≥2 existing duplicated components, or fill the missing reward beat. We are deleting code, not adding it.
6. **Branch off main, work in commits, open a PR.** Do not push to main. Scott reviews on GitHub before deploy.
7. **One Code session pushing this repo at a time.** Verify `git log --oneline origin/main..HEAD` is empty before starting; check open PRs on the GitHub repo for in-flight Codex work.
8. **Production tokens must produce identical OR clearly-better visible output** until merged — no half-states visible to real sponsors during the build.
9. **Use `X-Auth-Key` + `X-Auth-Email` for any Cloudflare API calls — never Bearer.**
10. **Build target is `public/sponsor/`** (Vite `outDir`, see `vite.config.js`). Don't touch the four sibling apps in `public/` (admin/, review/, volunteer/, checkin/).

## The concrete diff

### `src/portal/Desktop.jsx` changes

**Delete:**
- `StepShowing` component (line 942 onward — find its closing brace)
- `StepSeats` component (line 1242 onward — find its closing brace)
- The wizard render cases that mount these (around lines 2322–2360 — `<StepShowing>` and `<StepSeats>` JSX)
- Any state hooks that exclusively serve the legacy stepper (`theaterId`, `movieId` if they're only read by deleted components — verify before removing)
- Local `finalize` function on Desktop (line ~1696) IF it's only called from deleted components. If StepWelcome or surviving components call it, keep it. (PostPickSheet's "I'm done" CTA likely needs its own finalize — verify path.)

**Add / rewire:**
- The wizard's "Seats" step (currently rendered by `StepSeats`) must now render a **wrapper** that opens `SeatPickSheet` immediately on mount, the same way Mobile does via `goSeats`.
- That wrapper needs to handle the case where `SeatPickSheet` closes without a placement → `setStep(1)` to return to Welcome.
- After `SeatPickSheet` confirms a placement, the desktop wizard advances to the existing PostPickSheet flow (already imported from `./components/`). Verify PostPickSheet renders correctly inside the desktop's `Modal` wrapper at desktop widths — visually QA it.

**Verify intact:**
- `StepWelcome` (the dashboard-style overview)
- Right rail (DelegateForm / DelegateManage modal triggers)
- PortalNav, settings sheet, night-of modal
- `ConfirmationScreen` short-circuit (line ~2186)

### `src/portal/Mobile.jsx` changes

**Add the missing reward beat:**
- After `SeatPickSheet` confirms placement and the user lands on `PostPickSheet`, render a **`PlacedTicketsPreview` component** at the top of PostPickSheet showing the just-placed seats as a mini boarding-pass card.
- This is a NEW shared component (lives at `src/portal/components/PlacedTicketsPreview.jsx`) used by both shells.
- Receives: `{ ticketsJustPlaced: Array<{theaterId, movieId, showingNumber, seats: [{rowLabel, seatNum}]}> }`
- Renders: Mobile boarding-pass styling (gold edge, perforation, MEGAPLEX wordmark) — but smaller (~140px tall) and stacked if multiple movies/theaters.

**Verify intact:**
- HomeTab boarding-pass card and TicketHero
- TabBar (Home / Tickets / Guests / Night)
- `ConfirmationScreen` short-circuit (line ~2837)

### `src/portal/MobileWizard.jsx` changes

The wizard is the back-compat path for `/sponsor/{token}/seats` deep links on mobile. It currently has its OWN finalize call (line 2136) — verify it routes through the same code as the SeatPickSheet path. If not, refactor so both paths share the finalize → ConfirmationScreen handoff.

If `MobileWizard` is now redundant (the boarding-pass shell + SeatPickSheet covers the deep-link case via `App.jsx` opening SeatPickSheet on mount when `onSeatsRoute === true`), consider deleting it entirely. **Decision point — flag for Scott if you reach it.**

### New shared component

**`src/portal/components/PlacedTicketsPreview.jsx`** — used in both `PostPickSheet` calls (mobile + desktop wrapper). Single source of truth for the "you just placed these" reward visual.

### `src/App.jsx` — minimal changes expected

The viewport split at 880px stays. After deleting `StepShowing`/`StepSeats`, `initialStep={onSeatsRoute ? 3 : 1}` won't make sense — desktop's case-3 step won't exist. Either:
- (a) map `onSeatsRoute` to opening `SeatPickSheet` immediately on Desktop mount, OR
- (b) collapse the wizard to just Welcome + Confirmation steps and have `onSeatsRoute` open `SeatPickSheet` from Welcome.

(b) is cleaner. **Pick (b).**

## Build sequence

1. **Pre-flight.** Verify clean working tree on main. Verify `git log --oneline origin/main..HEAD` is empty. Verify production `gala.daviskids.org/sponsor/dgu5lwmfmgtecky3` (Wicko test sponsor) loads. Check the GitHub repo for any open in-progress PRs (Codex or otherwise).
2. **Branch:** `git checkout -b feat/flow-unification`
3. **Map the deletion.** Open `Desktop.jsx`, find the exact line ranges for `StepShowing` and `StepSeats`. Confirm they're not referenced outside the wizard render block. As a safety check, comment out (don't delete yet) the JSX call sites — you should be able to build and Desktop should error or no-op on the case-2/case-3 path. That's the proof you've found all the call sites.
4. **Wire SeatPickSheet into desktop's case-2 step.** Replace the legacy render with a wrapper that opens `SeatPickSheet` and routes its outputs into the existing PostPickSheet → AssignTheseSheet → DinnerPicker chain (already imported on Desktop).
5. **Verify desktop:** open the branch's Pages preview URL (or `gala-3z8.pages.dev/sponsor/dgu5lwmfmgtecky3`) at desktop width, walk Welcome → Seats → place → PostPick → Finalize → ConfirmationScreen. Should mirror mobile's flow exactly.
6. **Delete `StepShowing` and `StepSeats` from `Desktop.jsx`.** Commit with `chore: remove legacy desktop seat-pick stepper`.
7. **Build `PlacedTicketsPreview` component.** Test in isolation with mock data first.
8. **Wire `PlacedTicketsPreview` into PostPickSheet.** Both shells get the reward beat.
9. **Decide on MobileWizard.** If the SPA can fully serve `/sponsor/{token}/seats` from `Mobile.jsx` + `SeatPickSheet`, delete `MobileWizard.jsx` and remove the route in `App.jsx`. Otherwise, refactor MobileWizard's finalize to share code with SeatPickSheet's path. Flag the decision in the PR description.
10. **Email deep-link test:** open the test sponsor with the URL `/sponsor/dgu5lwmfmgtecky3/seats` on BOTH shells. Verify `SeatPickSheet` opens. Verify back navigation works. Verify finalize from a deep-link entry produces ConfirmationScreen.
11. **QA matrix:**
    - 414px (mobile) → boarding-pass home → seat pick → post-pick reward → finalize → ConfirmationScreen
    - 880px (breakpoint) → desktop wizard → seat pick → post-pick reward → finalize → ConfirmationScreen
    - 1280px (laptop) → same as 880px, verify right rail intact
    - Test sponsors: Wicko (token `dgu5lwmfmgtecky3`, ID 80) and Kara DEF Staff (token `sgohonmgwicha15n`, ID 93)
    - Two browser windows side by side at 414px and 1280px — same actions should produce visually-different-but-functionally-identical results
12. **Build & verify bundle:** `npm run build`, check `public/sponsor/` updated, gzipped size delta should be NEGATIVE (we're net-deleting code).
13. **Push branch, open PR.** Title: `Flow unification — one seat-pick path, ticket-preview reward beat`. Description includes:
    - Before/after screenshots at 414px, 880px, 1280px
    - The deleted line count (target: net negative — removing ~600 lines from Desktop.jsx and possibly all of MobileWizard.jsx)
    - Confirmation that production behavior for the test sponsors is functionally identical (just unified) and the QR/finalize flow is consistent between shells
    - Confirmation that `/sponsor/{token}/seats` deep links work on both shells
    - The MobileWizard decision (kept and refactored, or deleted)
14. **Tag Scott. Don't merge yourself.**

## What "not done" looks like

- Desktop still has `StepShowing` or `StepSeats` defined anywhere
- Desktop's case-2 render references anything other than the SeatPickSheet wrapper
- Mobile and desktop produce different `/finalize` payloads or different ConfirmationScreen states for the same input
- Email deep link `/sponsor/{token}/seats` lands on a different surface in the two shells
- PostPickSheet doesn't show the placed-tickets preview
- New duplicate components were created instead of shared ones
- Any of the four sibling apps (admin/, review/, volunteer/, checkin/) was touched
- Net line count went UP (we should be deleting more than we add)

## Recovery if you get stuck

1. **Can't tell what calls `StepShowing` / `StepSeats`:** `grep -rn "StepShowing\|StepSeats" src/` should show you. If anything outside Desktop.jsx imports them, stop and message Scott.
2. **PostPickSheet doesn't render right at desktop width:** check the Modal wrapper. PostPickSheet is designed for full-width on mobile; on desktop it lives inside a Modal which constrains its width. May need a `variant="desktop"` prop. Don't fork — extend.
3. **Email deep link breaks:** the `initialStep={onSeatsRoute ? 3 : 1}` in `App.jsx` is what currently wires `/seats` → desktop case-3. After deletion, case-3 doesn't exist. Plan picks option (b): collapse the wizard, have `onSeatsRoute` open SeatPickSheet from Welcome.
4. **MobileWizard refactor too risky:** keep it as-is for this PR, just verify its finalize calls produce identical results. File a follow-up to delete it later. Don't let MobileWizard scope-creep this PR.
5. **Genuinely need Scott's input:** commit what you have, push, message Scott. Don't guess — especially on subjective design choices.

## Out of scope (do NOT do these in this PR)

- Theme work (the Phase 2 theme reset / theme contest plans exist separately in skippy-plans)
- Light mode bug fixes (separate Codex audit handoff doc covers those)
- Capacitor wrap (future phase)
- Universal Links / App Links (future phase)
- New visual styling, color tweaks, or animation work
- Any change to the `/api/gala/portal/{token}/finalize` server contract
- Any change to the four sibling apps in `public/`
- def-site cleanup (the gala-emails skill still lives there — separate concern)

## References

- This plan: `ramonscottf/skippy-plans/plans/2026-05-06-gala-portal-flow-unification.md`
- Project copy: `ramonscottf/gala/docs/PLAN-flow-unification.md`
- Codex audit handoff: `ramonscottf/gala/docs/HANDOFF-2026-05-05-codex-audit.md` (separate scope — light mode bugs, not flow unification)
- Theme contest plans: `ramonscottf/gala/docs/PLAN-theme-contest-core.md`, `PLAN-theme-A-ios-native.md`, `PLAN-theme-B-linear.md`, `PLAN-theme-C-editorial.md` (separate concurrent track)
- Repo: `ramonscottf/gala` (Cloudflare Pages project: `gala`, build to `public/sponsor/`)
- Live URL: `https://gala.daviskids.org/sponsor/{token}`
- Pages preview subdomain: `gala-3z8.pages.dev`
- D1: `gala-seating` (`1468a0b3-cc6c-49a6-ad89-421e9fb00a86`), bound as `GALA_DB`
- Test sponsors:
  - Wicko (Scott, ID 80): `dgu5lwmfmgtecky3`
  - DEF Staff (Kara, ID 93): `sgohonmgwicha15n`
- Cloudflare account: `77f3d6611f5ceab7651744268d434342`
- Auth: Global API Key, `X-Auth-Key` + `X-Auth-Email` headers (NEVER Bearer)
