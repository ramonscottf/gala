# Showing-Number Incident — Post-Mortem (May 11 2026)

**Severity:** P1 (silent data integrity bug on the day of first real
sponsor placement)
**Discovery:** May 11 2026, ~5:00 PM MDT, via Terra Cooper text
**Resolution:** May 12 2026, 00:15 UTC, all 4 code phases shipped
**Blast radius:** 1 sponsor (Terra Cooper, Tanner Clinic, 20 seats —
the only sponsor who had placed seats when the bug was discovered)
**Customer-visible duration:** ~30 minutes from her first wrong-time
ticket display to her DB rows being corrected by hand

## What happened

Terra Cooper, sponsor 77 (Tanner Clinic, Platinum, 20 seats), opened
her sponsor portal for the first time and started placing seats for
the late showings. She picked:

- Aud 8, row E, seats 11-16, LATE Star Wars (7:40 PM)
- Aud 4, row F, seats 1-12, LATE Breadwinner (7:50 PM)
- Aud 3, row E, seats 8-9, EARLY Breadwinner (5:00 PM)

After picking, her ticket cards rendered:

- Aud 8 → "EARLY · 4:50 PM Star Wars" ❌ (she picked LATE)
- Aud 4 → "LATE · 7:50 PM Breadwinner" ✓ (correct by accident)
- Aud 3 → "EARLY · 5:00 PM Breadwinner" ✓ (correct by accident)

She texted Scott a screenshot. He pinged Skippy. Diagnosis took ~30
minutes; a manual SQL `UPDATE` fixed her 20 rows; then we shipped the
end-to-end code fix.

## Root cause

The `seat_assignments` table schema correctly uses
`UNIQUE(theater_id, showing_number, row_label, seat_num)`. The code,
on every write and every read, ignored `showing_number`. Specifically:

**Write paths that dropped showing_number:**

1. `functions/api/gala/portal/[token]/pick.js` — the sponsor portal's
   hold/finalize/unfinalize/release/set_dinner endpoint. Every SQL
   query keyed by `(theater_id, row_label, seat_num)`. Hold INSERT
   didn't include the column at all; the DB defaulted to 1.
2. `functions/api/gala/seating.js` — admin single-seat POST/DELETE.
3. `functions/api/gala/seating-bulk.js` — admin bulk INSERT.
4. `src/hooks/useSeats.js` — sponsor portal client. Had this comment:
   *"Realistically each theater plays one showing per night so this is
   a no-op"*. It actively `void`ed the showingId before the POST.
5. `seat_holds` table didn't have a `showing_number` column at all
   (migration 009 fixes this).

**Read paths that collapsed showing_number:**

6. `src/portal/Portal.jsx` — `showtimeByTheater` was keyed by
   `theater_id` only. First showtime wins, others discarded. Ditto
   `ticketMap` for sponsor tickets and `guestTicketMap` for delegation
   tickets.
7. `public/admin/seating.html` — admin chart `assignments` keyed by
   `(theater_id, row, seat)`. Tapping "Aud 8" overlaid both showings
   on one chart.

**Damage by auditorium type:**

| Aud type | Auditoriums | Behavior |
|---|---|---|
| Both showings, same movie | 6, 7, 8, 10 | "I picked late" → wrote to early. Ticket card rendered early time. **The bug.** |
| Late showing only | 1, 4, 5, 12 | Write went to phantom `showing=1` row (no showtime row exists for that slot). Render found showing 2 anyway because the lookup fallback picked the only existing showtime. **Bug masked.** |
| Early showing only | 2, 3, 9, 13 | Default-to-1 happened to be correct. **Bug masked.** |

This is why nobody caught it before Terra. Most theaters didn't
expose the bug, and Terra was the first sponsor to actually place
seats — and she happened to pick Aud 8 LATE on her very first try.

## Timeline

- **May 11, ~5:00 PM MDT** — Terra texts Scott about wrong showtime
- **~5:05 PM** — Scott pings Skippy with screenshots
- **~5:10 PM** — Diagnosis begins. SQL queries against production D1
  reveal Terra's rows have `showing_number=1` despite her picking
  LATE
- **~5:25 PM** — Manual `UPDATE` fixes Terra's 20 rows
- **~5:30 PM** — Scott texts Terra: "Gotcha. Let me check the back end…"
- **~5:35 PM** — Phase 2 (read-path hotfix in Portal.jsx) committed
  and pushed (`874285e`). Bundle `Portal-DTKs7jhM.js`.
- **(plan creation interlude — phases 1, 3, 4, 5 spec'd)**
- **May 12, 00:00 UTC** — Phase 1 (plan + migration 009) committed
  (`3835806`)
- **May 12, 00:08 UTC** — Phase 3 (pick.js + useSeats + clients)
  committed and pushed (`89b41fd`). New bundle `Portal-BTz3QoVF.js`.
- **May 12, 00:12 UTC** — Phase 4 (admin endpoints + chart) committed
  and pushed (`2632d7f`)
- **May 12, 00:14 UTC** — Smoke test: placed Wicko-89 test seat at
  Aud 8 LATE. DB confirms `showing_number=2`. Unfinalize confirms
  scoped delete. Test seat removed, production state clean.

## What worked

- **Memory layer caught the bug fast.** Skippy's stored context about
  the schema (`UNIQUE(theater_id, showing_number, row_label, seat_num)`)
  and showtime structure (Aud 8 hosts both 4:50 and 7:40 Star Wars)
  meant we could pinpoint "the writes are ignoring showing_number"
  within minutes of seeing the screenshots.
- **Read-fix-before-write ordering** got Terra a correct ticket page
  within ~30 min of diagnosis, before we even started the full code
  cleanup. The DB had been hand-corrected; the bundle just needed to
  read it correctly.
- **Migration was non-destructive** (added a nullable column with
  default 1), so we could apply it to production D1 without a
  maintenance window or coordinated code rollback path.
- **Phase 1 commit (plan + migration) survived a context-window event.**
  Earlier-in-chat me had partial-completed Phases 3+4 in the working
  tree without remembering it. Re-reading the working tree before
  acting + checking git log first prevented destructive rework.

## What didn't work

- **The optimistic comment.** The line in `useSeats.js` that said
  *"Realistically each theater plays one showing per night so this
  is a no-op"* was wrong, and it was written confidently. A code
  reviewer didn't flag it because the gala 2025 lineup happened to
  match that assumption. The 2026 lineup didn't.
- **Schema correctness alone wasn't enough.** The DB had the right
  UNIQUE constraint for over a year. Every write ignored it. The
  composite key only protects against simultaneous duplicate-write
  conflicts; it doesn't enforce that callers supply the full key.
- **No test covered dual-showing isolation.** The existing QA harness
  (`qa/api-stress.mjs`) only exercised single-showing theaters by
  default, so even when run regularly it would have stayed green.
- **Memory was wrong about the test sponsor.** Skippy's memory said
  Wicko = sponsor 80, token `dgu5lwmfmgtecky3`. Reality: Wicko =
  sponsor 89, token `sxnhcj7axdrllaku`. (80 is Town Dental of
  Bountiful.) Memory-staleness rule paid for itself again — verify
  against the live DB before acting.
- **Chat-internal state drift.** Three times in this session, Skippy
  rediscovered work it had already done earlier in the same chat
  (Phase 2 bundle, migration application, working-tree edits). The
  pattern: long sessions with many file edits and tool calls cause
  earlier-in-chat memory to become unreliable; checking git log and
  production state is the only safe ground truth.

## Action items

| # | Action | Status |
|---|---|---|
| 1 | Manual fix of Terra's 20 rows (showing_number 1→2) | ✅ Done |
| 2 | Phase 2: read-path hotfix in Portal.jsx | ✅ Shipped (874285e) |
| 3 | Phase 1: plan doc + migration 009 SQL | ✅ Shipped (3835806) |
| 4 | Phase 3: write-path fix (pick.js, useSeats, clients) | ✅ Shipped (89b41fd) |
| 5 | Phase 4: admin endpoints + chart fix | ✅ Shipped (2632d7f) |
| 6 | Phase 5: regression test `qa/showing-number.test.mjs` | ✅ This commit |
| 7 | Update `qa/lib/portal-api.js` to thread showing through | ✅ This commit |
| 8 | Update `qa/api-stress.mjs` callers | ✅ This commit |
| 9 | Memory update: Wicko = sponsor 89, not 80 | ⏸️ Scott to apply |
| 10 | Text Terra: "refresh your tickets page, it should show 7:40 now" | ⏸️ Scott to send |
| 11 | Audit `_loveseat_pairs.js` for showing-awareness in helpers | ⏸️ Followup |
| 12 | Audit `seat_blocks` and `vip_locks` write paths (currently unused but schema has showing_number) | ⏸️ Followup |
| 13 | Run `qa:stress` against prod once a week (currently ad-hoc) | ⏸️ Schedule it |

## Lessons codified

These should make it into Skippy's working memory and/or
project-level coding standards:

1. **A composite-key UNIQUE constraint is not enforcement of that key
   on writes — it's enforcement only at write-conflict time.** If a
   client can ignore a key column on INSERT, the database will
   default it and the constraint won't catch the silent collapse.
   Code review of any new write path should explicitly verify it
   binds every column in the UNIQUE.

2. **"Realistically X" is a comment smell.** When a comment defends a
   shortcut by appealing to current operational reality ("each
   theater plays one showing per night"), the shortcut will outlive
   the reality. Either enforce the assumption with a runtime check
   or do the work properly.

3. **Diagnostic SQL before code.** With production data already
   correct (after the hand fix) and the live API returning correct
   data, the read-fix could ship instantly while the write-fix went
   through proper review. Buying that decoupling is worth a few
   minutes of D1 query-building.

4. **Production state > memory.** Every time memory and the world
   disagree in this session, the world was right. Test sponsor IDs,
   migration status, branch state, working-tree edits — all needed
   live verification. The "double-check before no" rule is a
   special case of this; the broader rule is "double-check before
   anything."

5. **A bug that only manifests in specific row layouts will hide
   indefinitely.** The 2025 gala happened to have one-showing-per-
   theater layout. The 2026 gala doesn't. Test coverage needs to
   include the structural variants that any future event might
   introduce, not just the variants the current event happens to
   use.
