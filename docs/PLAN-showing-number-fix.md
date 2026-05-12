---
title: showing_number end-to-end fix
status: ✅ COMPLETE — all 5 phases shipped, regression test verified against production
project: gala
phase: bugfix (post-Tanner-Clinic incident)
source_chat: 2026-05-11 Skippy session (Scott + Terra Cooper text exchange)
created: 2026-05-11
last_updated: 2026-05-12
---

## Status

- ✅ Phase 1 — plan + migration 009 committed (`3835806`)
- ✅ Phase 2 — read-path hotfix LIVE in production (`874285e`,
  `Portal-DTKs7jhM.js`). Terra Cooper's ticket card immediately showed
  correct showtimes from existing-correct DB data.
- ✅ Phase 3 — sponsor portal write path fix LIVE (`89b41fd`,
  `Portal-BTz3QoVF.js`). Migration 009 confirmed already applied to
  production D1 before code push. pick.js fully rewritten with
  showing_number threaded through every query. useSeats.js stops
  voiding showingId. DinnerPicker, DinnerSheet, TicketCard updated.
  Portal.jsx assignmentRows carry showing_number.
- ✅ Phase 4 — admin endpoints + admin chart fix LIVE (`2632d7f`).
  seating.js GET/POST/DELETE and seating-bulk.js POST require
  showing_number on writes, filter on reads. admin/seating.html
  passes pickerState.currentShowingNumber through every API call.
- ✅ Phase 5 — regression test + QA harness fixes + post-mortem
  committed (`5ecdf00`). New `qa/showing-number.test.mjs` exercises
  the exact bug pattern against live production; all 4 scenarios
  passed (theater 7, seat A-1). QA helpers (`qa/lib/portal-api.js`,
  `qa/api-stress.mjs`) updated to thread showing_number through —
  was a latent bug that would have 400'd existing scenarios on
  dual-showing theaters post-Phase 3. Post-mortem at
  `docs/HANDOFF-2026-05-11-showing-number.md`.

## Acceptance verified live

- Production seat_holds schema has showing_number column with
  UNIQUE(theater_id, showing_number, row_label, seat_num).
- gala.daviskids.org/sponsor/ serves Portal-BTz3QoVF.js.
- Terra Cooper (sponsor 77) DB rows all on correct showings:
  - Aud 3 showing 1 (5:00 PM Breadwinner) — E8, E9
  - Aud 4 showing 2 (7:50 PM Breadwinner) — F1–F12
  - Aud 8 showing 2 (7:40 PM Star Wars) — E11–E16
- Wicko (sponsor 89) end-to-end smoke test: hold + finalize + read +
  unfinalize at Aud 8 showing 2 — all four operations correctly
  scoped, DB row landed at showing 2, unfinalize removed only that
  row. State clean after test.
- Regression test `qa/showing-number.test.mjs` passed all 4 scenarios
  against production.

## Followups (not blocking)

1. Memory update: Wicko Waypoint = sponsor 89, not 80. Token is
   `sxnhcj7axdrllaku`. Scott to apply via `memory_user_edits`.
   **DONE 2026-05-11 (m27).**
2. Text Terra Cooper to refresh her tickets page.
3. Audit `seat_blocks` and `vip_locks` write paths — schemas have
   `showing_number` but no current code paths use them.
4. Audit `_loveseat_pairs.js` partner-lookup helpers for showing-
   awareness (used by pick.js — appears fine but worth a sweep).
5. Schedule `npm run qa:stress` weekly against production with a
   dedicated test token (currently ad-hoc).

## Same-family fixes shipped after the core 5 phases

### Phase 5.14 — Welcome popup showtime + UX fix (2026-05-11)

**Commit:** `78a5dd8` (live as `Portal-BQ0PhpkM.js`)

**Bug:** CompletionCelebration rendered a green "You're all set / See
you on June 10" block stacked on top of the ticket card inside the
same scroll container (not a real popup), AND the body text was
hardcoded to `"Doors open at 4:00 PM. Dinner at 4:00, movie at 4:30."`
Late-showing sponsors saw early-showing times right next to their
late-showing ticket. Scott caught it on his Wicko test (Aud 8 Star
Wars LATE 7:40 PM).

**Why this is same-family as the Tanner Clinic incident:** Same
class of bug — per-showing context dropped at a customer-facing
surface. The DB writes are correct now (Phases 1–5), but
`onCommitted` in SeatPickSheet was emitting `showTime` and
`showLabel` without `dinnerTime`, so the prop chain into
CompletionCelebration was incomplete. Even if you fix the visible
copy, the missing prop forces a fallback. **Lesson generalized:
when threading per-showing fields through React props, treat them
as a fixed bundle — `{showingNumber, showLabel, showTime,
dinnerTime}` go together, every time.**

**Fix:**
- `src/portal/components/CompletionCelebration.jsx` rewritten as
  a proper dismissible modal overlay (fixed position, X button,
  click-outside, ESC, "Got it" button). Body text derives from
  `ticket.dinnerTime` + `ticket.showTime` with graceful fallback.
- `src/portal/components/SeatPickSheet.jsx` `onCommitted` payload
  now includes `dinnerTime` (sourced from `showingsRich`, same
  pattern as the sibling `showTime` lookup).

**Verified:** Built bundle has 0 occurrences of the hardcoded
`"4:00 PM"` string, has the dynamic `Dinner at ${dinnerTime}`
template, has the new `welcome-modal-title` id. CF Pages picked
up `Portal-BQ0PhpkM.js` and it's serving from production.

---




# showing_number end-to-end fix

## TL;DR

The seat-placement pipeline never wired through `showing_number`. Every
sponsor-portal write of a seat collapses to `showing_number = 1`, and every
ticket-card render also collapses to the first showtime in an auditorium.
For auditoriums that host two showings of the same movie (Aud 6, 7, 8, 10),
this means "I picked the late showing" silently writes to the early
showing. For auditoriums that host only a late showing (Aud 1, 4, 5, 12),
the write lands on a phantom `showing_number = 1` row that has no matching
showtime — and only renders correctly by accident.

**Discovered:** May 11 2026, 5:00 PM — Terra Cooper (Tanner Clinic,
Platinum, sponsor 77) texted Scott that she kept placing 6 Star Wars seats
"at 7 o'clock" but they were showing as 4:30 on her ticket card. Diagnosis
took ~30 minutes. Her 20 seats were corrected by direct SQL UPDATE
(`showing_number` set to 2 for her Aud 8 and Aud 4 seats). She is the
**only** sponsor who has placed seats so far — production damage stops
with her.

**Why it didn't get caught:** every other sponsor either didn't have
seats yet, or only had seats in single-showing auditoriums where the
silent default-to-1 happened to be wrong-but-render-right (Aud 4 with
only showing 2 in showtimes table; the ticket card couldn't find showing
1 so it rendered showing 2 anyway). The bug was masked by the data layout.

## Symptoms in production

What Terra saw and what was actually happening:

| What she did | What was written | What ticket card showed |
|---|---|---|
| Picked Late · 7:40 PM Star Wars · Aud 8 | `theater_id=8, showing_number=1` | "Early · 4:50 PM" |
| Picked Late · 7:50 PM Breadwinner · Aud 4 | `theater_id=4, showing_number=1` (phantom — no showtime row) | "Late · 7:50 PM" (correct by accident — only showtime in Aud 4 is showing 2) |
| Picked Early · 5:00 PM Breadwinner · Aud 3 | `theater_id=3, showing_number=1` | "Early · 5:00 PM" (correct by accident — showing 1 IS what she picked) |

Admin chart bonus bug: tapping "Aud 8" on the admin seating page renders
all Aud 8 seats from all showings on the same chart, because the admin's
client-side seat key is `(theater_id, row, seat)` with no showing
separation. That's why Scott's admin view also looks wrong — same root
cause.

## Root cause (file × line)

The schema is correct. `seat_assignments` and `vip_locks` both have
`UNIQUE(theater_id, showing_number, row_label, seat_num)`. The code
treats `showing_number` as if it didn't exist.

**Server-side write paths that drop showing_number:**

1. `functions/api/gala/portal/[token]/pick.js` — sponsor portal hold +
   finalize + unfinalize + release + set_dinner. Every INSERT / DELETE /
   SELECT keys by `(theater_id, row_label, seat_num)` only. Lines:
   - 227-230 (existing check)
   - 236-240 (held-by-other check)
   - 327-336 (hold INSERT — also misses showing_number column)
   - 448-456 (finalize INSERT)
   - 211-214 (unfinalize DELETE)
   - 180-190 (release DELETE)
   - 161-166 (set_dinner UPDATE)
   - 59-87 (orphan-check queries)

2. `functions/api/gala/seating.js` — admin single-seat POST + DELETE.
   - 82-93 (POST INSERT)
   - 119-127 (DELETE)
   - 50-52 (GET by theater — no showing filter)

3. `functions/api/gala/seating-bulk.js` — admin bulk INSERT.
   - 56-63 (bulk INSERT)

4. `seat_holds` table itself lacks a `showing_number` column entirely.
   Migration 009 adds it.

**Client-side paths that drop showing_number:**

5. `src/hooks/useSeats.js` — sponsor portal.
   - 41-45 (collapses every seat to "first showing the theater plays" —
     comment literally says "Realistically each theater plays one
     showing per night so this is a no-op")
   - 118-123 (explicitly `void`s `showingId` before the POST)
   - 80-87 (POST body does not include showing_number)

6. `src/portal/Portal.jsx` — sponsor ticket page render.
   - 1611-1614 (`showtimeByTheater` keyed by theater_id only, first
     showtime wins)
   - 1621-1623 (`ticketMap` keyed by theater_id only)
   - 1701-1702 (rows added to ticketMap without showing context)

7. `public/admin/seating.html` — admin chart.
   - 1814-1830 (`loadAssignmentsFromAPI` builds `assignments[]` keyed by
     `(theater_id, row, seat)` — no showing separation)
   - 1822 (`seatKey()` ignores showing_number)
   - The page DOES track `currentShowingNumber` for the picker UI (lines
     1871, 1938) but doesn't pass it to the assignments fetch or use it
     in the chart key.

## Phasing

Five phases. Each phase is a clean commit, deployable on its own, with
clear acceptance criteria. We stop after any phase if production looks
right and the immediate risk to remaining sponsors is gone.

Crucial ordering: **read fix before write fix.** The data Terra has in
the DB right now is correct (per the manual SQL UPDATE earlier today).
The read fix alone makes her ticket page show the right time. The write
fix prevents future sponsors from hitting the same bug. We ship the read
fix first because (a) it's lower-risk, (b) it has a smaller blast
radius if it goes wrong, (c) it benefits Terra immediately.

### Phase 1 — Plan persistence (this file)

Commit this plan. Push. Verify on github.

**Acceptance:** This file lives at `docs/PLAN-showing-number-fix.md` on
`main` and is visible at https://github.com/ramonscottf/gala/blob/main/docs/PLAN-showing-number-fix.md

### Phase 2 — Read-path hotfix (sponsor ticket page)

Smallest possible diff to make Terra's ticket card show the right
showtime from the existing-correct DB data. **No write-path changes,
no schema changes.**

Files changed:
- `src/portal/Portal.jsx`:
  - Change `showtimeByTheater` to `showtimeByTheaterShowing` keyed by
    `${theater_id}:${showing_number}`.
  - Change `ticketMap` key from `row.theater_id` to
    `${row.theater_id}:${row.showing_number}`. `row.showing_number`
    already comes back from `/api/gala/portal/[token]` — it's in
    `seat_assignments`.
  - Update sort to use `showingNumber` field that now varies per ticket.
  - Same fix applied to the delegation-tickets ticketMap further down
    (search for `${row.delegation_id}-${row.theater_id}`).
- `src/hooks/useSeats.js`:
  - Stop voiding `showingId`. Change `buildAssigned` to read
    `row.showing_number` from each assignment row directly (it's already
    in the API response) and key off that, not from `showingsByTheater`.

What this does NOT touch:
- pick.js (write path) — left untouched, still buggy
- seating.js, seating-bulk.js — left untouched
- admin/seating.html — left untouched (admin sees the same overlap until
  Phase 4)
- migration — not deployed yet (no DB change in this phase)

**Acceptance:**
- Reload Terra's portal. Star Wars ticket card shows "Late · 7:40 PM"
  (not 4:50). Breadwinner Aud 4 still shows 7:50. Breadwinner Aud 3
  still shows 5:00.
- Place a test seat as Wicko (sponsor 80) on a single-showing theater
  via the portal. It still works end-to-end (still writes to showing 1
  because we didn't fix the write path, but reads back correctly because
  showing 1 IS that theater's only showing).

### Phase 3 — Write-path fix (sponsor portal)

Stop new placements from going to the wrong showing. Schema migration
runs first; then `pick.js` rewrites to thread `showing_number` through
every query; then `useSeats.js` and the dinner pickers start passing
`showing_number` in the POST body.

Files changed:
- `migrations/009_seat_holds_showing_number.sql` — already written, ready
  to apply via `wrangler d1 execute gala-seating --remote --file=...`
- `functions/api/gala/portal/[token]/pick.js`:
  - Add `resolveShowingNumber()` helper at top — accepts a body-provided
    number, validates against `showtimes` table. Falls back to "the only
    showing in this theater" when missing, returns 400 when ambiguous.
  - Thread `showing_number` through every SQL query: existing check,
    held-by-other check, hold INSERT (now includes showing_number
    column), finalize INSERT, unfinalize DELETE, release DELETE,
    set_dinner UPDATE, both orphan-check queries.
- `src/hooks/useSeats.js`:
  - `callPick` accepts `showingNumber` and includes it in the body.
  - `place(showingId, theaterId, ...)` translates `showingId` →
    `SHOWING_ID_TO_NUMBER[showingId]` and passes it to `callPick`.
  - `unplace(theaterId, ...)` needs to learn `showingNumber` — easiest
    is to derive from the assignment row at call sites.
- `src/portal/components/DinnerSheet.jsx`,
  `src/portal/components/DinnerPicker.jsx`:
  - Pass `showing_number` in the set_dinner POST body. Source is the
    `assignment` object that's already in scope (it has
    `showing_number` from the API response).

**Acceptance:**
- Run migration on production D1. `PRAGMA table_info(seat_holds)` shows
  the new column with default 1.
- Place a test seat as Wicko in Aud 8 LATE (the showing terra got bit
  by). DB row shows `showing_number=2`. Ticket card shows 7:40.
- Cancel that seat. DB row gone. No phantom showing-1 row left behind.
- Hold a seat in Aud 8 LATE on one browser tab, try to hold the same
  seat in Aud 8 EARLY on another tab — both holds succeed (different
  showings, different seats).
- Try to hold the same seat at the same showing on both tabs — second
  one is rejected.

### Phase 4 — Admin chart + admin endpoint fix

Make `/api/gala/seating` GET filter by `showing_number`. Make
`/api/gala/seating` POST + DELETE require `showing_number`. Make
`/api/gala/seating-bulk` POST accept and use `showing_number` (the
admin UI already passes it — see line 2585 of admin/seating.html — the
endpoint just ignores it). Make admin chart key its in-memory
`assignments[]` by `(theater_id, showing_number, row, seat)` and clear
the chart correctly when the picker switches showings.

Files changed:
- `functions/api/gala/seating.js`:
  - GET: accept optional `?showing_number=N`, filter when present.
  - POST: require `showing_number` in body, include in INSERT, include
    in ON CONFLICT key.
  - DELETE: require `showing_number`, include in WHERE.
- `functions/api/gala/seating-bulk.js`:
  - Require `showing_number` in body. Include in INSERT and ON CONFLICT.
- `public/admin/seating.html`:
  - `seatKey()` becomes `${theaterId}:${showing}:${row}:${seat}`.
  - `loadAssignmentsFromAPI(theaterId, showingNumber)` — pass through
    to GET as `?theater_id=X&showing_number=Y`.
  - When `pickerState.currentShowingNumber` changes, reload assignments
    for the new (theater, showing) pair.
  - Clear-by-prefix logic in `loadAssignmentsFromAPI` updated to clear
    `${theaterId}:${showing}:` not `${theaterId}:`.

**Acceptance:**
- Admin "Aud 8 · 308 seats" with showing 1 active shows ZERO of Terra's
  seats (she's all on showing 2 in Aud 8 now). Switch picker to showing
  2 — her 6 E11-E16 seats appear.
- Bulk-place a row from admin into Aud 8 LATE. Confirm DB row has
  `showing_number=2`.

### Phase 5 — Test harness + post-mortem

Add a qa script that exercises the showing_number paths end-to-end so
this can't regress silently. Write the post-mortem note in
`docs/HANDOFF-...md` style describing what we learned.

Files changed:
- `qa/showing-number.test.mjs` — new file. Spins up a test sponsor +
  token + showtime fixtures, exercises hold/finalize/unfinalize/dinner
  at both showings.
- `docs/HANDOFF-2026-05-11-showing-number.md` — post-mortem capturing
  the Terra incident, the latent admin chart bug, and how the new
  test prevents regression.

**Acceptance:**
- qa test passes locally against a fresh D1.
- Post-mortem reviewed by Scott.

## Deferred / out of scope

- **`vip_locks`** has `showing_number` in its schema. Nothing in the
  codebase currently writes to it through code paths we audited;
  if/when it gets used, the same scoping rules apply. Out of scope
  here unless a vip_locks write path is found.
- **`seat_blocks`** also has `showing_number`. Same status.
- **Skippy chat tools** (`functions/api/gala/chat/_tools.js`,
  `_helpers.js`) reference `showing_number`. Worth a sweep but not
  blocking — they're internal AI tooling, not user write paths.
- **Loveseat partner lookups** (`_loveseat_pairs.js`) — verify whether
  partner data is showing-scoped. If a "left half" exists at showing
  1 and 2, current code probably treats them as the same loveseat.
  Most likely fine since loveseats are physical-seat properties not
  showing-time properties, but worth checking in Phase 3.

## What Scott does between phases

Between Phase 2 and Phase 3:
- Text Terra: "Refresh your tickets page — Star Wars should now show
  7:40 like you picked. Aud 8, seats E11-E16, dinner 7:15. Everything
  else unchanged. Sorry for the confusion."
- Monitor: any other sponsor who places seats in this window writes to
  showing 1, but if their theater only has one showing, they're fine.
  If they pick a two-showing aud (6, 7, 8, 10) and the LATE option,
  same bug as Terra — but we're capped at the small number of sponsors
  who'd act in the gap.

Between Phase 3 and Phase 4:
- Sponsor portal is fully correct. Admin chart still overlays both
  showings. Don't pre-fill any new sponsor blocks from the admin until
  Phase 4 ships.

## Rollback

Each phase is independently revertible.

- Phase 2: revert Portal.jsx + useSeats.js commit. No data damage —
  worst case Terra sees the wrong time again.
- Phase 3: migration is non-destructive (adds nullable column with
  default). pick.js revert restores old behavior (silent collapse to
  showing 1).
- Phase 4: admin/seating.html revert restores the old overlapping chart.
  Endpoint revert restores ignoring of showing_number. No data damage
  because the migration column stays.
