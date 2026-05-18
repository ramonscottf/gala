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
