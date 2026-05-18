# Portal v2 — Phase 5.7+ (post-walk: nav + lineup + tickets + flows)

**Date:** 2026-05-18
**Branch:** `feat/portal-soft-website`
**Status:** 🚧 In progress (Step 1: header)
**Triggered by:** Scott walked the May 18 preview on iPhone after CC's audit closed. Walk surfaced items outside the audit's v1↔v2 parity scope.
**Parent:** [`2026-05-15-portal-v2-completion.md`](2026-05-15-portal-v2-completion.md) — phases 1–5 shipped, parity audit closed via CC handoff
**Mirror:** [`gala/docs/PLAN-phase-5.7-plus.md`](https://github.com/ramonscottf/gala/blob/feat/portal-soft-website/docs/PLAN-phase-5.7-plus.md)

## Why this exists

CC's audit (`docs/AUDIT-REPORT-2026-05-18.md`) closed every documented P0/P1/P2 parity item. Scott then walked the live preview and found a separate set of issues — not parity gaps, but new design direction for v2 to be strictly better than parity. This sub-plan captures and ships them.

CC parity audit closes here. Marking it Phase 5.6 ✅ in parent plan.

## Items (7)

### A. Floating-pill nav header (replaces bottom tab nav + top-left monogram)

Wicko-property pattern.

- Pill on top of every page:
  - Left: DEF/sponsor logo + "Lights · Camera · Take Action · 2026" wordmark
  - Right: hamburger
- Hamburger drawer: **Tickets · FAQ · Settings** (Profile + QR live here now)
- Home is the default view
- **Remove** bottom tab pill (HOME / TICKETS / FAQ)
- **Remove** top-left `SF` monogram (its functionality now lives in Settings)

Implementation: grep `wickowaypoint.com` / `fosterlabs.org` for the existing pill markup + CSS, port to `src/portal-v2/PortalShell.jsx` + `portal-v2.css`. Don't reinvent.

### B. Lineup horizontal rail on mobile (Phase 5.7 queue item)

Proper mobile rail at 390px:
- 2–2.5 cards visible (peek of next)
- `scroll-snap-type: x mandatory`, `scroll-snap-align: start` per card
- Inertia + snap on swipe
- No horizontal page-level overflow

### C. Movie modal — schedule always renders

Currently the modal hides the SCHEDULE block (Early/Late × Auditorium) when the film is in "Pending" state (e.g. Mandalorian/Grogu — image 3). The Pick-CTA gating is fine; the schedule block needs to render above the gating copy regardless.

### D. Tickets — three-dot menu replaces Edit/View

Mirror the group-modal `⋯` pattern.
- Single `⋯` button per ticket row
- Menu items: View ticket, Change seats, Pick meals, Reassign / Gift, Release
- Tap row → opens the group/single ticket modal (existing behavior)

### E. Seat labels on ticket rows

Render seat IDs ("F12 · G12 · G13") on each ticket row, under the showing time / seat-count line. No tap required. (Scott's "missing seats and raw" — confirm on first walk; trivial to revert if wrong.)

### F. QR repositioning — Settings only, troubleshooting framing

**Scott's call:** QR is sponsor-scoped fallback for trouble at the door, not primary check-in. Each group of seats IS the ticket.

- **Remove** the persistent home-page `TicketQrCardV2`
- **Remove** the QR from the per-ticket `ConfirmationView`
- **Add** a QR card to the Settings/Profile page (accessed via hamburger from A)
- Copy framing: "Trouble at the door? Show this QR for check-in."

### G. Fold meal selection into seat picker

**Scott's call:** Current flow (pick seats → commit → Seats Placed sheet → Pick Dinners sheet, stacked) becomes one screen.

- Tap a seat on the seat map → meal dropdown appears for that seat
- Commit fires only when all selected seats have a meal assigned
- Downstream celebration + finalize-confirmation flows unchanged

Touches `SeatPickSheet.jsx` + `SeatEngine.jsx`. Most complex item; saved for last.

## Sequence

1. ✅ Plan committed (this doc)
2. 🚧 A — header (do first; subsequent items land on the new shell)
3. ⏳ B + C — pure layout/CSS
4. ⏳ D + E — TicketsSection refactor
5. ⏳ F — additive in Settings, deletions elsewhere
6. ⏳ G — last

## Status hygiene

No item flips to ✅ Live until Scott walks the deployed change on his phone.
- "✅ Code shipped" = pushed + Pages deploy verified, awaiting Scott walk
- "✅ Live" = Scott confirmed on real hardware

## Not in scope

- Audited parity items (remain shipped from CC's work)
- `SeatEngine` seat-allocation logic
- Delegate / guest-portal flows
- Finalize endpoint behavior, email/SMS payloads

---

## Status — 2026-05-18 end of session

**Shipped to preview (`feat/portal-soft-website`, deploy `238dd465`):**

- ✅ **A.** Wicko pill nav + drawer (Tickets/FAQ/Settings) — commit `ede2aa3`, walked
- ✅ **F.** QR repositioning to Settings, removed from home + per-ticket — commit `ede2aa3`, walked
- ✅ **B.** Lineup horizontal scroll-snap rail on mobile — commit `4ffb556`, awaiting walk
- ✅ **C.** Movie modal renders Schedule for every film (including Pending) — commit `249f0d1`, awaiting walk
- ✅ **D.** Ticket row ⋯ menu replaces Edit/View — commit `c7a9044`, walked
- ✅ **E.** Seat labels visible on ticket rows — commit `c7a9044` (no JSX change needed; already rendered)
- ⏳ **G.** Fold meal selection into the seat picker — queued for next session; touches the load-bearing 1748-line `SeatPickSheet.jsx`. Deserves its own session.

**Additional fixes shipped 2026-05-18 (commit `bd13ee0`) — post-walk-of-D/E feedback:**

- **Release bug** — `releaseConfirm.returnTo.kind === 'close-group'` was a no-op which left the group modal mounted with stale data. Scott reported "nothing happens when I try to release. Stays on same card. No confirmation." Diagnosis: the seats *were* released on the backend; the UI just didn't reflect it. Fix: `setGroupModal(null)` for both `'close-group'` and the group-emptied-out path. Plus a success toast.
- **Toast confirmations on all destructive/save actions** — new `Toast.jsx` component, top-anchored, auto-dismisses after 3s. Fired on Release, Swap seat, Move group, Gift/Reassign, Invite. Settings save already has inline "Saved." notice from the pages-not-modals refactor.
- **Movie poster cropping** — `.p2-ticket-poster` was a 56px × 2:3 background-cover div, cropping non-2:3 posters (Breadwinner is squarer). Switched to `<img object-fit:contain>` in a 64×96 frame with navy-deep background; clean letterboxing across films.
- **Group modal action consolidation** — Change + Reassign were standalone chips on each seat row alongside ⋯ and the dinner pill. Scott: "Change and reassign should be under the three dots on the ticket page." Done: existing ⋯ overflow menu now hosts Change seat / Reassign-or-Gift / Release; only the dinner pill stays inline.
- **Invite same-group filter** — both `onInviteSeat` (from group modal) and `onInviteNew` (from gift modal) now filter giveable seats to the SAME `theater_id` + `showing_number`. Target seat preselected; other free seats in that group are toggleable pills. Scott: "Default to one, but offer the other seats in that movie/showtime/auditorium."

**Status hygiene:** Items B, C, F-partial-fixes still need Scott's phone walk before flipping to ✅ Live. Items A, D walked already. Items C, E (E confirmed visible in screenshots) walking later.

**Live preview:** `https://feat-portal-soft-website.gala-3z8.pages.dev/sponsor/sxnhcj7axdrllaku`

---

## Item G shipped — 2026-05-18 (commit `531f045`)

Folded meal selection into the seat picker, closing the last open item in Phase 5.7+.

**Design — opt-in on the shared SeatPickSheet:**
- New `foldMeals` prop on `SeatPickSheet` (default `false`). v1 unchanged.
- v2's `SeatPickerModal` passes `foldMeals={true}`.
- New `mealBySeatId` state map keyed by seat id (e.g. `'F-12'` → `'frenchdip'`).

**UX:**
- Inline meal-picker block renders below the seat chip row when `foldMeals && sel.size > 0`.
- One row per selected seat with the 4 dinner tiles (🥖 / 🥗 / 🌱 / 🧒) as tappable buttons.
- Active state: gold ring + gold-tint background.
- Header line shows live "X / N set" progress.
- Commit button gates on every selected seat having a meal — label flips to "Pick N more meals" until done.
- Deselecting a seat prunes its meal from the map.

**Commit flow:**
- After `seats.place()` succeeds, meals save in parallel via `Promise.allSettled` over the existing `/pick action=set_dinner` endpoint.
- Failures tolerated quietly — sponsor can still edit each seat's dinner pill from the group modal afterwards; refresh catches whatever did save.
- `onCommitted` payload gains `mealsAlreadySaved: true` so any v1 PostPickDinnerSheet host knows to skip the stacked sheet.

**Source:**
- `src/portal/components/SeatPickSheet.jsx` — prop, state, commit hook, inline UI block, Commit gate. ~90 lines added.
- `src/portal-v2/SeatPickerModal.jsx` — one-line prop pass.
- `src/portal-v2/portal-v2.css` — ~95 lines of `.p2-inline-meal*` styles. 4-up tile grid that holds at 390px viewport (tightened padding/font sizes below 480px).
- `DINNER_OPTIONS` reused from `src/portal-v2/DinnerModal.jsx` — one source of truth.

**Build:** 3 vite targets clean. Sponsor bundle `main-BVymp7oP.js` (86KB, +1.6) · `SeatPickSheet-DWGLD325.js` (181KB, +5).

## Phase 5.7+ — closed

All 7 items shipped to preview (`feat/portal-soft-website`). Awaiting Scott's full walk across the post-walk fixes + item G before flipping to ✅ Live on prod. After that: PR to `main`, verify deploy at `gala.daviskids.org`, mark Phase 5.7+ ✅ Live.

| Item | Commit | Status |
|---|---|---|
| A. Wicko pill nav + hamburger drawer | `ede2aa3` | ✅ Code shipped, walked |
| B. Lineup horizontal scroll-snap rail (mobile) | `4ffb556` | ✅ Code shipped |
| C. Movie modal schedule for every film | `249f0d1` | ✅ Code shipped |
| D. Ticket row ⋯ menu | `c7a9044` | ✅ Code shipped, walked |
| E. Seat labels on ticket rows | `c7a9044` | ✅ Already rendering |
| F. QR repositioning to Settings | `ede2aa3` | ✅ Code shipped, walked |
| G. Meal selection in seat picker | `531f045` | ✅ Code shipped |
| Post-walk fixes (release bug · toasts · posters · group modal cleanup · same-group invite) | `bd13ee0` | ✅ Code shipped |

---

## Mobile modal chrome shipped — 2026-05-18 (commit `fd32356`)

Post-G feedback from Scott walking item G on iPhone: *"opening up in cards on mobile is making navigation hard. can't scroll well. cards are nice on desktop, but mobile is making it hard to navigate. should we rethink the cards? i don't want to deviate mobile and desktop too much."*

**The play:** full-screen the modal chrome on mobile, keep the card chrome on desktop. Same content tree underneath. Responsive-chrome, not divergent-UX. Stripe / Linear / GitHub pattern.

**Mobile (≤640px) — pure CSS overrides:**
- `.p2-modal-backdrop` drops padding + overflow (modal becomes scroll surface), drops `backdrop-filter` (dodges iOS double-blur bug), solid navy background.
- `.p2-modal` edge-to-edge: 100% width, no margins, no border-radius, no shadow. `100dvh` height (iOS Safari dynamic viewport). `overflow-y: auto` + flex column. **All modals scroll as one container — kills the nested-scroll problem.**
- `.p2-modal.stripped::before` (gradient top strip) hidden on mobile — conflicts with sticky header background.
- `.p2-modal-header` sticky top with `padding-top: max(14px, env(safe-area-inset-top))` for iOS notch / Dynamic Island. Title size dropped to 20px so "Pick your seats" fits.
- `.p2-modal-body` `padding: 16px`, `flex: 1 1 auto`, **no overflow declared** (modal owns the scroll).
- `.p2-modal-footer` sticky bottom with `padding-bottom: max(12px, env(safe-area-inset-bottom))` for home indicator.
- Linear-gradient fade on header/footer backgrounds — content fades into them on scroll instead of hard-cutting.

**Desktop (>640px) — unchanged.** Card chrome, backdrop blur, centered 880px max-width.

**Pill auto-hide — one `:has()` rule, fires at all viewport widths:**
```css
body:has(.p2-modal-backdrop) .p2-wpn { display: none; }
```
Solves two problems simultaneously:
1. iOS Safari renders the pill's `backdrop-filter: blur(20px) saturate(160%)` as a **solid black rounded rectangle** when it stacks over the modal's own `backdrop-filter: blur(8px)` — visible top-left of Scott's screenshot.
2. The pill has no purpose while a modal is captive (the modal IS the surface). Removing it from layout when ANY modal is mounted clears visual chrome competition.

`:has()` is supported on iOS Safari 15.4+ (April 2022), well past device floor.

**Scope:** applies to every v2 modal — SeatPicker, TicketGroup, TicketDetail, Invite, Gift, Move, Swap, Release confirm, Movie detail, Delegation manage, Dinner, Profile, Faq-legacy. All share `.p2-modal-backdrop` + `.p2-modal` base. One CSS change covers all. `TicketRowMenu` uses `.p2-ticket-menu` (popover, not backdrop) — pill stays visible for menu opens, as intended.

**Build:** CSS-only delta. 3 vite targets clean. Deploy `4361cd2b` ✅, bundles `main-AMIHTh6C.js` + `main-xfFpB-a4.css` (50.8KB).
