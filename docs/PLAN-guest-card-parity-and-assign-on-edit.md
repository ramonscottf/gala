# Gala — Guest-card parity + assign seats from the Edit-guest modal

**Slug:** `2026-05-22-gala-guest-card-parity-and-assign-on-edit`
**Project:** gala (ramonscottf/gala)
**Mirror:** [`docs/PLAN-guest-card-parity-and-assign-on-edit.md`](https://github.com/ramonscottf/gala/blob/main/docs/PLAN-guest-card-parity-and-assign-on-edit.md)
**Source chat:** This chat
**Created:** 2026-05-22
**Last updated:** 2026-05-22

## Status

| Phase | What | State |
|---|---|---|
| 1 | "Guests you invited" cards reach full Tickets-placed parity (poster · showtime/auditorium pills · seat chips) | ✅ Shipped — commit `36f4d26`, live bundle `main-DNpwKBut.js` |
| 2 | Per-guest ⋯ menu: View / Change seats / Edit guest / Resend / Reclaim | ✅ Shipped — commit `36f4d26` |
| 3 | Assign seats to an *existing* guest from inside the Edit-guest (Manage) modal | ✅ Shipped — commit `4ed6b06`, deploy `db538f10`, live |
| — | America First (Mandy Dawson, sponsor 92) — 5 guests staged name-only in prod D1 | ✅ Inserted — rows 77–81, no contact, no seats, status `pending` |

> Live-bundle confirmed (`gala.daviskids.org/sponsor/` references `main-DNpwKBut.js`). **Not** marked `✅ Live` per the never-mark-live-until-Scott-walks rule — awaiting Scott's walk on a real guest in the live portal.

## Driver

Direct sequel to [`2026-05-18-sponsor-see-guest-tickets`](2026-05-18-sponsor-see-guest-tickets.md). Two threads converged:

1. **Mandy Dawson / America First Credit Union** (Silent Auction sponsor, $5,000, sponsor 92, 14 seats) emailed Sherry five guest groups for her block (Amber Greenwell +3, Jake Bingham +3, Preslee Goff +1, Aimee Heward +1, Chad Tanner +1 = 14 seats exactly). She'd *prefer* DEF stage the guests rather than do it from her portal — but she gave **names only, no emails or phones**. Need: put them in now, with a way for her (or us) to add contact info later so each guest can manage their own seats.

2. **Visual inconsistency Scott caught:** the "Guests you invited" cards rendered differently from the "Tickets placed" cards — compact avatar + name + "X of Y placed" rows vs. the rich poster + pills + seat-chip cards. Scott wanted them identical, the only difference being the name line under the showtime/auditorium pills, plus an Edit-guest item in the per-card ⋯ menu.

3. **Follow-on (mid-session):** the Edit-guest modal could edit contact info but had **no way to assign seats** to that guest. The seat picker already existed — but only in the *Invite a guest* flow. Scott: "the current invite guest link already has what we need. it just needs to go on the page to edit the guests now."

## Approach

All work in the **v2 portal** (`src/portal-v2/`, `PortalShellV2` — the unconditional live default, no `?v2=1` flag). Reuse over rebuild throughout.

- **Phase 1 (card parity)** — new `buildDelegationGroups()` in `PortalShell.jsx` mirrors `buildTicketGroups()` but groups `childDelegationAssignments` by (delegation × showing). Feeds the same `ShowingAuditoriumPills` + poster + seat-chip markup the ticket cards use. The one visible difference: a guest-name line where the ticket card shows its who-line. Guests with no placed seats yet (incl. name-only) get a **placeholder card** (avatar + name + status + awaiting-seats/contact line) so they still surface. Hardened the showtime lookup to fall back to a theater_id match when `showing_number` is absent, so a missing field can't silently render a "TBD"/no-poster card. (Prod rows *do* carry `showing_number`; defensive only.)

- **Phase 2 (per-guest menu)** — `TicketRowMenu.jsx` gained optional `onEditGuest` / `onResend` / `onReclaim` props (sponsor ticket cards unaffected — they don't pass them). Guest cards wire View / Change seats / Edit guest / Resend / Reclaim. Edit guest + View open `DelegationManageModal`. Resend fires `action:'resend'` inline with a toast, gated on the guest having a phone or email. Reclaim routes through the manage modal's two-tap confirm rather than firing DELETE silently from a menu.

- **Phase 3 (assign-on-edit)** — `DelegationManageModal.jsx` gained an "Assign seats" section between "Their tickets" and "Edit details", shown only when there are assignable seats. It renders the sponsor's placed-but-not-yet-given seats (the `assignableSeats` array `PortalShell` already computes for `InviteModal`), grouped by showtime, tap-to-toggle. The button reads "Assign N seats to <name>" and POSTs to the **existing** `/assign` endpoint (`{theater_id, seat_ids, delegation_id}`) — the same call `InviteModal` makes post-create — grouped by theater, with the guest's existing `delegation.id`. `onRefresh` after.

## Why this was low-risk

- **No new endpoints, no schema changes.** Everything rides on `/assign` and `/delegate` (`update` / `resend` / DELETE-reclaim), all of which already existed and were already proven by the Invite + Manage flows.
- **`/assign` is reversible** — posting with `delegation_id: null` un-assigns a seat back to the sponsor. A wrong grouping is undoable.
- **Name-only inserts are safe** — no contact info means the invite/SMS pipeline has nothing to send to. Nothing went out to any America First guest.

## Data work — Mandy's 5 guests (done)

The CREATE delegation endpoint **rejects name-only** (requires phone or email: `delegate.js` line ~304). So staging name-only guests had to be a **direct D1 insert**, not the API:

- Verified live `sponsor_delegations` schema first (email/phone nullable, `seats_allocated` default 0, `token` UNIQUE NOT NULL, 12-char alphanumeric tokens via `generateToken()`).
- Confirmed Mandy (sponsor 92) had **zero** existing delegations (no double-create) and all 14 seats placed directly under her (`delegation_id: null` → all giveable).
- Inserted 5 rows (ids 77–81), each: `parent_sponsor_id=92`, name, fresh 12-char token, `seats_allocated=0`, `status='pending'`, no contact.

Seats were **not** assigned (Scott's call: create names only). When ready, each guest gets seats via the new assign-on-edit section, plus a phone/email so they can self-manage.

## Definition of done

- [x] Phase 1 — guest cards match ticket cards; placeholder card for unplaced/name-only guests
- [x] Phase 2 — ⋯ menu: View / Change seats / Edit guest / Resend / Reclaim
- [x] Phase 3 — Assign-seats section in the Edit-guest modal, posts to `/assign`
- [x] Mandy's 5 guests staged name-only in prod
- [x] Build clean, screenshot-verified in v2 preview harness (rich card, invited-no-seats card, name-only card, dropdown, assign-section select state + button)
- [x] Committed + pushed to main, deploy succeeded, live bundle hash confirmed
- [ ] **Scott walks it on the live portal** (open a guest → Assign seats → confirm Mandy's J18–J21 / G9–G18 show grouped by showtime) → then mark ✅ Live

## Files touched

- `src/portal-v2/TicketRowMenu.jsx` — optional `onEditGuest` / `onResend` / `onReclaim` menu items
- `src/portal-v2/PortalShell.jsx` — `buildDelegationGroups()`, rich guest-card render, menu wiring, pass `assignableSeats` to manage modal
- `src/portal-v2/DelegationManageModal.jsx` — `assignableSeats` prop, Assign-seats section, `assignSeats()` handler
- `qa/preview-v2/preview.jsx` — mock now carries `showing_number` on delegation assignments (parity with prod)
- `public/sponsor/*` — rebuilt bundle (committed; CF Pages `pages_build_output_dir = "public"` serves it directly)

## Commits

- `36f4d26` — feat(portal-v2): guest cards reach full ticket-card parity + Edit guest menu
- `4ed6b06` — feat(portal-v2): assign seats to an existing guest from the Edit-guest modal

## Lessons / notes for next session

- **CF Pages deploy queue stalled twice today** during an active Cloudflare incident ("Dashboard and API service issues", identified → monitoring). Both deploys sat in `queued idle` with every stage idle and only went through after a **manual deployment retry** (`POST .../deployments/{id}/retry`), which jumped the queue. If a future gala push sits in `queued idle`, retry the deployment — it's not the code.
- **Edge-cache lag on the HTML:** after the first deploy, `gala.daviskids.org/sponsor/` kept serving the old bundle hash for a while even though the new asset was reachable and Scott's browser had the new build. The second deploy's HTML flipped promptly. Check the actual `main-*.js` hash in the served HTML to confirm a deploy truly propagated, not just that the build succeeded.
- **The `ask_user_input_v0` widget never returned a selection this whole session** — it echoed the questions back instead of capturing taps. Worked around it by reading Scott's typed answers. If it's still broken, thumbs-down to Anthropic.
- The portal is `src/portal-v2/` now (PortalShellV2). The old `src/portal/` (Mobile/Desktop split, Portal.jsx) is reference-only, no longer routed.
