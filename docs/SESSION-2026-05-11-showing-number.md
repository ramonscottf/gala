# Session Note — 2026-05-11 Tanner Clinic + meta-lessons for future Skippy

This is a **behavioral** handoff, not a technical one. The technical
post-mortem lives at `docs/HANDOFF-2026-05-11-showing-number.md` and
the five-phase plan at `docs/PLAN-showing-number-fix.md`. This file
captures what FUTURE-SKIPPY needs to know about how THIS CHAT actually
went, so the patterns are visible the next time they show up.

## What we built

Terra Cooper (Tanner Clinic, sponsor 77, Platinum 20 seats) texted Scott
that her ticket card was showing the wrong showtime — she picked 7:40
PM Star Wars in Aud 8, the card said 4:50 PM. Investigation revealed
the whole seat-placement pipeline had been silently collapsing
`showing_number` for over a year. We shipped a five-phase fix in one
chat session: migration + plan, read-path hotfix, full write-path fix,
admin endpoints + chart, regression test + post-mortem. All live, all
verified against production. See the dedicated plan + post-mortem for
detail.

## What WENT well

1. **Plan first.** When Scott said "make a plan, commit the plan, then
   start working," that was the right call. The plan got committed in
   ~10 minutes (Phase 1) and survived everything that came after,
   including the moments when chat-internal state got confusing. The
   plan was the anchor. If this chat had timed out at any point, the
   next Skippy could have read `docs/PLAN-showing-number-fix.md` and
   resumed cleanly. **This is the artifact-dies-with-chat rule paying
   real dividends. Always pay it.**

2. **Read-fix-before-write-fix ordering** got Terra a working ticket
   page within ~30 minutes (during the diagnosis chat earlier in the
   day, before Phase 1 was even written). The DB had already been
   hand-corrected via SQL; only the render path needed to land. This
   decoupling — small targeted read fix shipped immediately, full
   write-path overhaul shipped behind it — is a pattern worth
   repeating for any data-integrity bug.

3. **Test the fix against the actual bug.** The regression test at
   `qa/showing-number.test.mjs` exercises the exact scenario Terra
   hit (placement at LATE showing of dual-showing auditorium) against
   live production, with cleanup. All 4 scenarios passed on theater
   7. If this bug ever resurfaces, the test will catch it.

## What DIDN'T go well — patterns to watch for

### 1. Earlier-in-chat state drift

**Three times in this session, I rediscovered work I had already
done earlier in the same chat:**

- The Phase 2 commit (`874285e`) had been pushed earlier in the day,
  before the Phase 1 plan was even written. I wrote the plan
  treating it as "future work" and only caught it when I ran
  `git log`.
- Migration 009 had already been applied to production D1 by an
  earlier-in-chat tool call. I almost re-applied it.
- The working tree had partial Phase 3 + Phase 4 edits that I
  initially mistook for stray modifications and considered stashing
  away. They were actually correct work that needed to ship.

**Pattern:** In long chat sessions with many file edits and tool
calls, the most recent memory of "what's done" becomes unreliable.
The compaction tool helps with the conversation history but doesn't
extend to "have I run this command in this terminal yet."

**Defense:** Before doing destructive or assumption-loaded work,
check `git log`, `git status`, production state, and DB schema. Use
the live system as ground truth, not the chat's recollection of what
the live system should look like. This is the same memory-staleness
rule that applies cross-session, just at a finer time scale. (See
memory `28` — "verify-before-acting" — which was updated this
session to include this case as the third pillar.)

### 2. Memory drift on test sponsor

Memory said Wicko Waypoint = sponsor 80, token `dgu5lwmfmgtecky3`.
Reality: Wicko = sponsor 89, token `sxnhcj7axdrllaku`. Sponsor 80 is
Town Dental of Bountiful. Memory has been corrected (`m27`).

**Lesson:** Test tokens rotate. IDs can shift if sponsors get merged
or re-sorted. Verify any sponsor/token reference against live D1
before acting. The query is cheap:

```sql
SELECT id, company, rsvp_token FROM sponsors WHERE company LIKE '%Wicko%'
```

### 3. The optimistic comment

In `src/hooks/useSeats.js` there was a line that said:

> *"Realistically each theater plays one showing per night so this
> is a no-op"*

It actively `void`ed the `showingId` before the POST. It was wrong,
and it was written with confidence. The 2025 gala had one showing per
theater. The 2026 gala doesn't. This was the central failure point in
the whole pipeline.

**Pattern:** Comments that defend a shortcut by appealing to current
operational reality ("realistically X", "in practice Y", "for now Z")
are technical debt with a long fuse. They outlive the reality that
justified them and become silent bugs.

**Defense:** Either enforce the assumption with a runtime check that
would scream if violated, or do the work properly. New memory `m29`
captures this pattern.

### 4. UNIQUE constraint as theater (not enforcement)

The DB schema had `UNIQUE(theater_id, showing_number, row_label,
seat_num)` for over a year. Every write ignored `showing_number`.
The constraint never fired because no two writes ever conflicted on
the silent-default — they just all collapsed to the same row.

**Pattern:** A composite-key UNIQUE constraint is not enforcement of
that key on writes. It's enforcement of write-conflict detection
*given that the key is fully supplied*. If a column is droppable,
the DB will default it and the constraint becomes decorative.

**Defense:** When reviewing any composite-key write path, explicitly
check that every column in the UNIQUE is bound by the caller. New
memory `m29` captures this.

## Commit chain reference

| SHA | What |
|---|---|
| `874285e` | Phase 2 read-path hotfix (shipped earlier in chat) |
| `3835806` | Phase 1 plan + migration 009 |
| `89b41fd` | Phase 3 write-path fix |
| `2632d7f` | Phase 4 admin endpoints + chart |
| `5ecdf00` | Phase 5 regression test + QA helper updates + post-mortem |
| `05ef78b` | Plan status final |
| `(this commit)` | Session note + README footguns + memory update |

## What's left for Scott (not Skippy)

1. Text Terra Cooper: "Refresh your tickets page when you get a
   chance. Star Wars Aud 8 should now show 7:40 PM like you picked.
   Sorry for the confusion!"
2. Optional: schedule `npm run qa:stress` to run weekly against
   production with the Wicko token.

## What's left for future Skippy (followups, not blocking)

1. Audit `seat_blocks` and `vip_locks` write paths — both schemas have
   `showing_number` but no current code paths use them. If they ever
   get wired up, they need to land showing-aware from day one.
2. Audit `_loveseat_pairs.js` partner-lookup helpers for showing-
   awareness. Used by pick.js, appears fine, but worth a sweep.
3. The admin chart in `public/admin/seating.html` is a 4,000-line
   HTML monolith. The seat code inside it is now correct but the
   pattern of inline JS in a giant HTML page makes it hard to test.
   At some point this should get vite-ified like the sponsor portal
   was. Not urgent, just brittle.
