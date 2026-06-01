---
title: Seat swap/move blocked by orphan-creation guard
status: in-progress
project: gala
phase: post-launch fix (pre-event, June 10)
source_chat: 2026-06-01 Skippy session (ticketing — Muller Park consolidation)
created: 2026-06-01
last_updated: 2026-06-01
---

# Seat swap/move blocked by the orphan-creation guard

## Symptom
A principal (Muller Park Jr. High, sponsor 63) called: their 6 seats were
split (F15–F18 together, K4 + K5 stranded) and **neither the sponsor nor the
admin could move them together** from the portal. "I cannot change them. He
cannot. I cannot."

## Root cause
The post-purchase **Change Seat** flow (`SwapSeatModal` → `useSeats.place` →
`POST /pick` `finalize`) and the **admin** seat-change flow (`api.js`
`claimSeat` → same `/pick`) both run the server-side `checkOrphanCreation`
guard in `functions/api/gala/portal/[token]/pick.js`.

That guard is a **fresh-picking nudge**: when a sponsor first picks seats it
stops them from leaving a single empty seat sandwiched between two occupied
ones. It inspects only the seat being **filled** — never the seat being
**vacated**. On a *relocation* that's wrong: moving a seat into an existing
gap (exactly what consolidating a split group requires) gets rejected with
"would leave seat N alone in row R," while the gap the move just opened on the
vacate side is ignored.

Worked example — row F, Aud 8, showing 1 (occupied 9–12, 15–18 Muller, 22–25;
open 13, 14, 19, 20, 21). Moving a seat in:
- F19 → gap 18 filled → **allowed** (the only legal target)
- F20 → gap 21 open (bracket 22) → **rejected**
- F14 → gap 13 open (bracket 12) → **rejected**
- F13 → gap 14 open (bracket 15) → **rejected**

4 of 5 adjacent open seats throw, so it reads as "can't move them at all."

## Fix (opt-in bypass, backward-compatible)
Added `skip_orphan_check` to the `/pick` body. When `true`, the orphan loop is
skipped in both `hold` and `finalize`. **All other guards stay** (capacity,
ownership, already-taken, held-by-other, loveseat). Fresh self-service picking
(`SeatPickSheet`) never sets the flag, so its orphan protection is unchanged.

Set the flag from the two deliberate-relocation surfaces:
- `src/portal-v2/SwapSeatModal.jsx` — swap = deliberate move; set on place + recovery re-place.
- `src/admin/sponsors/api.js` (`pickAction`) — admin arrangement tool.
- `src/hooks/useSeats.js` — `callPick` forwards `extras.skipOrphanCheck` → `body.skip_orphan_check`.

Files: `functions/api/gala/portal/[token]/pick.js`, `src/hooks/useSeats.js`,
`src/portal-v2/SwapSeatModal.jsx`, `src/admin/sponsors/api.js` (+ rebuilt
`public/` bundles, since Pages serves `public/` directly — no CI build).

Tradeoff: sponsors/admin can now intentionally create a single-seat gap via a
move. Acceptable in the finishing phase — consolidation matters more than
gap-avoidance, and the admin must never be blocked.

## Verification
- `npm run build` clean (sponsor + admin editor + admin sponsors).
- Logic traced against live row-F data above.
- Not yet deployed — branch `fix/seat-swap-orphan-guard`, awaiting Scott's
  green-light on deploy timing (57 sponsors were just emailed to the live
  portal; merging to `main` auto-deploys to gala.daviskids.org in ~45s).

## TODO on merge
- Mirror this doc to `skippy-plans/plans/2026-06-01-gala-seat-swap-orphan-guard.md`.
- Flip status → live after Scott confirms a real swap works on the portal.
- Update README status table.
