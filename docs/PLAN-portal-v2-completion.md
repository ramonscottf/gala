# Portal v2 — Feature Completion Audit & Plan

**Status:** spec
**Branch:** `feat/portal-soft-website`
**Author:** Skippy + Scott
**Date:** May 15, 2026

---

## Why this plan exists

The v2 portal redesign nailed the look-and-feel — soft website, navy ground, Fraunces serif, gradient cards, page scroll instead of app shell. Verified live on Wicko Waypoint Platinum: tickets group properly, hero CTA reads right, modal seam is gone.

But the old portal had a *lot* of features under the hood. Some were quiet (per-row dinner pills inside ticket cards) and some were modal-flow heavy (post-pick celebration, delegate invite form with two modes). The redesign so far is the **shell** — it's pretty but it's not feature-complete with what shipped before.

This plan inventories what's still missing, what's regressed, what's polish-quality drift, and orders the work so we ship a v2 that's strictly better than v1, not just prettier.

---

## Feature inventory — what v1 did that v2 has to match

Numbered for cross-reference, grouped by surface.

### Tickets (the placed-seats list)

1. **Per-seat dinner pill on every ticket row.** Each seat shows its current meal choice (🥖 French Dip / 🥗 Salad / 🌱 Veggie / 🧒 Kids) or "Pick dinner". Tapping it opens DinnerSheet. **v2 has none of this.**
2. **Per-seat "+ Invite" button.** From a placed-but-unassigned seat row, single-tap to invite a guest. Routes through DelegateForm in single-seat mode. **v2 has none of this.**
3. **Per-seat "Manage" button** (when the seat IS assigned to a delegate). Opens DelegateManage to resend / revoke / see status. **v2 has none of this.**
4. **Ticket-group "View ticket" detail sheet** that shows the QR, all seats, all dinners, all guests in one stacked card. **v2 has a basic group modal but no QR, no per-seat dinner display, no per-seat guest display.**
5. **Finalize from card** action — locks selections, triggers confirmation send. **v2 has none of this.**
6. **Edit meals / Edit seats** as separate per-card actions. v2 conflates them into one "Edit my seats" button.

### Group / Guests tab (delegations)

7. **Invite a guest** flow (multi-mode: Mode A = quota counter, Mode B = pills tied to specific seats). **v2 has none of this.** The Group section just lists existing delegates with no actions.
8. **DelegateManage** — open an existing delegation, resend invite, revoke, see whether they've claimed it. **v2 has none of this.**
9. **DelegationStatusPill** — visual status: invited / claimed / declined / expired. **v2 has none of this.**
10. **"Invite a guest" as a primary CTA** at the top of the group section when sponsor has leftover seats. **v2 has none of this.**

### Seat-picking flow

11. **Post-pick celebration** screen on the FIRST finalize. Confetti + "You're all set". **v2 closes the modal immediately on commit — no closure beat.**
12. **Post-pick dinner sheet** — modal-blocking, must pick a meal for every just-placed seat before moving on. **v2 has none of this.** Critical: this is HOW dinners get picked at all on first-pass.
13. **Movie detail sheet from inside the seat picker** — tap "More about this movie" → shows synopsis + trailer + "Select seats for this film" CTA inline. v2 has MovieDetailModal but it's only reachable from the lineup section on the home page, not from inside the picker.

### Settings / Profile

14. **Help footer for Platinum sponsors** — "Need help? Text Scott" link inside the settings sheet. **v2 ProfileModal has none of this.**
15. **Sign out flow** that respects delegate vs sponsor. v2 calls `/api/auth/signout` blindly — works for sponsors but may not be the right call for delegate tokens.

### Home / Hero

16. **TicketHero status block** had per-section stats including "ASSIGNED" (different from "DELEGATED") — counted seats with a guest name attached, regardless of whether a delegation existed. v2 dropped this and shows just DELEGATED (= seats with delegation_id). Subtly different math; the old one was more useful at a glance.

### Cross-cutting

17. **Dinner pills are colored** by selection state — yellow if picked, red outline if missing on a finalized ticket. v2 has nothing.
18. **Logo per sponsor** — `identity.logoUrl` (e.g. white-logos/wicko-waypoint.png) used to render in the TicketHero. v2 ignores it; shows initials avatar only.
19. **Auditorium pills currently look like square chips ("Auditorium 8")** — Scott called out these should match the broader pill language. Two pills, 50/50 with buffer, side-by-side, possibly two colors (one for showing, one for auditorium).
20. **"Edit my seats" CTA inside the group modal opens the FULL seat picker**, not the picker filtered to that group's showing. Slightly wrong — if you're managing your Star Wars block, "Edit" should land you on the Star Wars showtime in the picker.

---

## Gap analysis — what's missing vs polish

**Missing (must build before merge):**
- 1, 2, 3, 7, 8, 9, 10, 11, 12, 17 — without these, the portal is functionally regressed. A sponsor can't pick dinners. Can't invite delegates. Can't manage existing invites. We'd be merging a downgrade.

**Polish (should fix before merge):**
- 4 (QR + richer group view), 6 (split Edit Meals vs Edit Seats), 13 (movie detail from picker), 19 (auditorium pill styling), 20 (filter the picker on group edit)

**Nice-to-have (after merge):**
- 5 (finalize from card — most sponsors finalize via the post-pick flow anyway)
- 14 (Platinum help footer — can fast-follow)
- 15 (sign-out delegate quirk — edge case, only matters if delegates are using v2 already, which they're not)
- 16 (ASSIGNED stat refinement)
- 18 (sponsor logo in hero — currently SF initials look fine; can sub in logo later)

---

## Proposed phasing

Eight phases. Each one is small enough that we ship it, screenshot it, you eyeball it on your phone, we move on. No big-bang.

### Phase 1 — Dinner picker (the meal selector you flagged)

Build:
- `DinnerModal.jsx` — v2-skinned modal hosting per-seat meal pills, four options. Read/write `/api/gala/portal/{token}/dinner` (already exists).
- Add a dinner pill to each row inside `TicketGroupModal`'s seat list — shows current meal or "Pick dinner" prompt. Tap opens `DinnerModal`.
- Same dinner pill on the single-seat `TicketDetailModal`.

This is the single most missed feature. Build it first, in isolation, ship it.

### Phase 2 — Post-pick dinner flow

Build:
- After a seat commit inside `SeatPickerModal`, instead of closing the modal and refreshing, transition the modal into a "now pick your meals" step. Block close until every just-placed seat has a meal.
- On meal completion, show a small celebration ("You're all set — N seats placed, meals picked"), THEN close.
- For the "Edit my seats" path (where the user wasn't mid-pick), no celebration — just close cleanly.

This is what makes dinners actually get picked for most sponsors. Without it, sponsors finalize without meals and Sherry has a manual cleanup problem.

### Phase 3 — Invite a guest (delegation flow)

Build:
- `InviteModal.jsx` — wraps the existing `DelegateForm` component (which handles Mode A / Mode B correctly) in v2 modal chrome.
- "Invite a guest" CTA in the Group section header.
- Per-seat "+ Invite" affordance inside `TicketGroupModal` for any unassigned seat.
- New `DelegationManageModal.jsx` — wraps existing `DelegateManage` for resend / revoke / status.
- Make the Group section cards tappable → open `DelegationManageModal`.

`DelegateForm` and `DelegateManage` are battle-tested. Reuse them; don't rebuild.

### Phase 4 — Group section polish + auditorium pills

Build:
- DelegationStatusPill rendering inside Group section cards (claimed / invited / declined).
- Auditorium + Showing as proper pills inside the ticket card subline. Replace the small "Auditorium 8" chip with two colored pills side-by-side: showing pill (blue-tint) and auditorium pill (gold-tint). Same 50/50 layout, buffer.
- Same pill upgrade in `TicketGroupModal` body and `TicketDetailModal` body.

### Phase 5 — Picker pre-fill on Edit

Build:
- `TicketGroupModal.onEditSeats` and `TicketDetailModal.onEditSeats` should pass `initialShowingNumber` + `initialMovieId` through to `SeatPickerModal`, which forwards them to `SeatPickSheet` (which already supports them — props exist). Edit Star Wars → lands on the Star Wars showtime in the picker, skips step 1.
- The picker's "More about this movie" link (currently a no-op in v2 because `onMovieDetail` isn't wired through) → opens `MovieDetailModal`. The wiring's already in `SeatPickerModal`, but verify it routes correctly inside the modal-on-modal case.

### Phase 6 — QR + richer ticket detail

Build:
- One QR per sponsor (sponsor-wide check-in code) rendered inside `TicketGroupModal` and `TicketDetailModal`. Endpoint `/api/gala/portal/{token}/qr` likely exists; verify.
- Each seat row inside `TicketGroupModal` shows: seat label + meal pill + guest name (if delegated) — currently just shows seat + guest.

### Phase 7 — Sponsor logo + Platinum help

Build:
- Sponsor logo in the BrandNav or hero — pulls from `identity.logoUrl`. Renders as a small horizontal mark beside the DEF logo, not replacing it.
- Platinum-tier help footer inside `ProfileModal` ("Need help? Text Scott" link).

### Phase 8 — Finalize action + cleanup

Build:
- "Finalize my picks" action at the end of the post-pick dinner step (or as a separate CTA on the home page when all seats placed + all meals picked but not yet finalized). Wires to existing `/api/gala/portal/{token}/finalize`.
- Once finalized, hero copy changes ("Your night is set. We've sent confirmations.") and per-seat actions narrow to "View" only — no more Edit on seats.
- Remove `src/portal/` (the old portal directory) — keep `src/portal/components/SeatPickSheet.jsx` and helpers that v2 still reuses, but delete `Portal.jsx`, `HomeTab.jsx`, `TicketsTab.jsx`, the `TabBar`, etc.

---

## Effort and ordering

Phases 1–4 are the merge-blocker set. None should take more than a session each. Recommended order: 1 → 2 → 3 → 4. Each phase ships behind the same `feat/portal-soft-website` branch; no need for sub-branches.

Phases 5–8 can land before merge if there's time, or fast-follow after merge if the merge pressure builds.

**Decision points along the way:**
- After Phase 1 (dinner picker), eyeball on phone. Does the dinner pill on a ticket row feel right? Or should it surface differently (e.g. dinner row of pills at the bottom of the ticket card instead of per-row).
- After Phase 3 (delegate flow), eyeball the Mode A vs Mode B routing. Old behavior was Mode A = "Invite a guest" raw button, Mode B = per-seat. Confirm that translates to v2.
- Before Phase 8, decide: do we delete old `src/portal/Portal.jsx` entirely, or leave it as a "blast door" we can route back to via feature flag in case of disaster? Argument for keeping: cheap insurance. Argument for deleting: cruft. Punt to Phase 8.

---

## How this gets executed

**Not by Claude Code subagents.** v5 rule applies: no parallel agents writing to the same repo. This is one branch, one Claude session at a time, working through the phases sequentially.

**Plan persistence:** this doc lives at `gala/docs/PLAN-portal-v2-completion.md` (here) and is mirrored to `skippy-plans/plans/2026-05-15-portal-v2-completion.md`. Every phase update updates BOTH files. When a phase completes, this doc's "Status:" header rolls forward.

**Definition of done for each phase:**
1. Built locally, `npm run build` clean.
2. Screenshotted via the preview pipeline.
3. Pushed to `feat/portal-soft-website`, Cloudflare Pages preview verified live.
4. Scott eyeballs on his phone — explicit "good, next" before moving on.
5. This plan doc updated.

---

## Open questions for Scott before Phase 1 kicks off

1. **Dinner pill placement.** Inside each ticket row (one pill per seat), OR consolidated as a meal row at the bottom of the ticket card ("4 meals: 🥖🥖🥗🌱"). The first is closer to v1; the second is cleaner v2-style.
2. **Auditorium pill colors** (Phase 4). Showing pill = blue, auditorium pill = gold? Or both same gold? Or showing-time-aware (early = blue-tint, late = red-tint)?
3. **Post-pick celebration** (Phase 2). Full-screen confetti moment, or inline-in-modal "✓ All set" toast that auto-dismisses after 2 seconds? Old portal had something between — a "You're all set" tile inside the post-pick sheet.

Hold these until Phase 1 is built and you've seen it, OR answer all three now and I roll straight through. Either works.
