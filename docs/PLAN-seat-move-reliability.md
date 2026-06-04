---
title: Gala seat-move reliability — diagnosis + admin group-move
status: live
project: gala
phase: gala-2026-prep
source_chat: 2026-06-04 gala seat-move fixes (John Lee / Chevron)
created: 2026-06-04
last_updated: 2026-06-04
---

# Seat-move reliability (DEF Gala 2026)

## What triggered this
Chevron delegate **John Lee** (delegation 275, his 4 seats in Aud 1 / showing 2)
could not move his block via the portal; neither could admin via Chevron's
master link. Error: *"You've already placed your full 0 seats. And we could
not restore your original seats either."* John was moved by hand (E7–E10 →
H9–H12) and notified by email + SMS.

## Root cause (two distinct things)
1. **Master-link quota math.** `getSeatsAvailableToPlace` gives a sponsor
   `quota = seats_purchased − delegated`. Chevron delegated all 14 seats out,
   so the master token's own quota is **0** — it can place/move nothing. Worse,
   `unfinalize` on the master token is scoped to `delegation_id IS NULL`, so it
   doesn't even match a delegate's seats. Moving a delegate's block via the
   master link is therefore impossible — but it's really an **admin** action.
2. **The self-serve path is actually fine.** `MoveGroupModal.commit()` releases
   the old block *then* places the new one. For a delegate using their **own**
   link this nets to zero and works. Verified live on John's delegate token
   (`u8bz40Ksfgy1`): unfinalize H12 → finalize H8 → reversed cleanly. So the
   portal isn't broadly broken; the trap was John/Scott using the master link.

## Shipped (commit a419f40, live on gala.daviskids.org)
**`POST /api/gala/admin/move-group`** — admin-only. Relocates a whole party
(every seat a sponsor/delegate holds in one theater+showing) to a contiguous
open block in one call. Body: `{ theater_id, showing_number, moves:[{from,to}] }`.
- Validates each `from` occupied, each `to` open **or** part of the vacating set
  (so overlapping blocks like E7–E10 → E5–E8 are allowed), no held targets, no
  dup targets.
- Two-phase: park all sources to row `__MOVE__` (seat = row id), then place to
  targets — dodges the UNIQUE(theater,showing,row,seat) key on overlap.
  Best-effort restore on mid-flight failure. All composite-key cols bound.
- Audit → `audit_log` (action `move_group`).

**Seatmap UI** (`public/admin/seatmap/app.js`, vanilla, no build): tap an
occupied seat → **"Move whole party (N) →"** appears in the dossier when that
seat's party (same sponsor_id + delegation_id, in view) has >1 seat → tap the
left-most destination seat → the whole block relocates, kept contiguous.

### Tested live (reversibly, on John)
overlap move + reverse ✅ · open-target ✅ · collision guard (other-owned → 409) ✅
· auth-guarded (401) ✅. John ends at H9–H12, untouched.

## Open / optional next step — portal master-link move
To let the **sponsor portal master link** move a delegate's group (so a sponsor
can self-serve it without admin), `MoveGroupModal` must auto-engage on-behalf
(`onBehalfOfDelegationId`) when the moved group is delegate-owned. The on-behalf
machinery already exists (`resolveWriteScope`, `behalfOf` prop). This is a
**React change → `npm run build:sponsors` → committed bundle**, so it should go
out on a feature branch → CF Pages preview → browser-verify → merge. Deferred:
admin group-move now covers the operational need, and this is sponsor-facing
code 6 days from the event.

## Known minor bug (not yet fixed)
`admin/move-seat.js` logs to `sponsor_actions_log (sponsor_id, …)` but that
table has **no `sponsor_id` column** — the audit insert silently fails (wrapped
in try/catch; the move itself is fine). `move-group.js` logs to `audit_log`
correctly instead. Fold a `sponsor_actions_log` schema fix in when convenient.
