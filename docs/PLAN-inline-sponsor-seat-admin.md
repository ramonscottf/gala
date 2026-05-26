---
title: Inline sponsor seat admin (Sponsors tab)
status: in-progress
project: gala
phase: 3 of 3 (3a shipped, 3b next)
source_chat: 2026-05-26 gala admin session
created: 2026-05-26
last_updated: 2026-05-26 (3a shipped)
---

# Inline sponsor seat admin

## Goal
Do all per-sponsor seat work from the **Sponsors tab** sponsor card, scoped to
that one sponsor — never the venue-wide seating chart (Scott finds it
overwhelming) and never by logging into the sponsor's own portal. The card is
where you're already looking at their stuff; the edits belong there.

The three things sponsors ask for: change their meals, change their seats, move
them to another show.

## Hard constraint — reuse the portal mutation engine
Every seat write goes through the existing portal endpoint
`POST /api/gala/portal/{token}/pick` (actions: hold, release, finalize,
unfinalize, set_dinner), using the sponsor's own rsvp_token. That endpoint:
- resolves showing_number defensively and scopes every query to the full
  composite key (theater_id, showing_number, row_label, seat_num) — this is
  what protects us from the composite-key collapse bug (UNIQUE constraint does
  NOT force the write to supply showing_number; pick.js does).
- enforces collision (409), orphan-seat prevention, and loveseat-partner rules.
Admin must NOT hand-write seat SQL. If the portal refuses a move, admin refuses
it too, identically.

## Data sources (confirmed 2026-05-26)
- Read a sponsor's picks: GET /api/gala/portal/{token} → myAssignments,
  showtimes (theater+showing → movie), childDelegationAssignments.
- Seat geometry: static `public/data/theater-layouts.json`
  (venue, seatTypes, theaters[].rows[].seats[] with id + type).
- Existing pickers to mine for logic (do not import wholesale):
  src/portal/components/SeatPickSheet.jsx (~1876 lines, v1),
  src/portal-v2/SeatPickerModal.jsx (106), src/portal-v2/MoveGroupModal.jsx (371).
- Valid meal codes: frenchdip, salad, veggie, kids, '' (none).

## Phases
### Phase 1 — Read view  ✅ LIVE (commit 667d0ef, 2026-05-26)
"Seats & movies selected" section at top of expanded sponsor card. Picks
grouped by movie → showing, seat chips, portal-style cards, ⋯ menu
(View in seating chart, Copy seat list). Reuses GET portal endpoint by token.

### Phase 2 — Meals inline  ✅ LIVE (commit 90c3e7e, 2026-05-26)
Each seat chip has a meal dropdown writing through set_dinner. Optimistic
update + revert-on-error + toast.

### Phase 3 — Change seats + move show  🚧 3a SHIPPED, 3b next
Scott's choice (2026-05-26): build BOTH — a mini seat-map for picking seats,
and a list control for moving shows.

**3a. Mini seat-map picker (change seats)  ✅ SHIPPED**
- Reuses portal SeatEngine (adaptTheater + SeatMap) — loveseat pairing handled
  by SeatMap.onSelect. New SeatChangeModal.jsx opened from the seat-card ⋯ menu.
- Taken-set scoped to (theater, showing) — required adding showing_number to
  allAssignments + allHolds in portal/[token].js (additive read).
- Apply: claims (hold+finalize) then releases (unfinalize), each through the
  guarded endpoint; stops + reports on first failure, reloads the card.

_Original spec:_
- New modal opened from a seat-card / ⋯ "Change seats".
- Renders ONE auditorium (the showing's theater) from theater-layouts.json —
  not the venue. Their seats highlighted; taken seats (from portal
  allAssignments) greyed; open seats clickable. Reuse seatTypes coloring.
- Swap flow per seat: hold new → finalize new → release old, all with
  showing_number bound. Respect loveseat pairs + orphan rules (let pick.js
  reject; surface the 409 reason inline).
- Atomic-ish UX: stage selection, then "Apply" runs the writes; on any failure,
  stop and report which seat failed, leave already-applied writes in place
  (or roll back — decide during build; lean on pick.js semantics).

**3b. Move to another show (list)**
- "Move to [show ▾]" control listing other showings from showtimes.
- Same-auditorium target (e.g. 5pm → 7:50pm): try same row/seat in target
  showing; release source, claim target. Clean common case.
- Cross-auditorium target (different movie/room): seat numbers won't line up →
  hand off to the 3a map for the target showing to pick seats, then move.
- All via release + hold + finalize, showing_number bound explicitly.

**Risks to watch**
- Live data, ~2 weeks to event — every write is real.
- Loveseat pairs: releasing/claiming one half must respect the partner.
- Orphan rule: pick.js's checkOrphanCreation will reject moves that strand a
  single seat; surface that clearly rather than failing silently.
- Tier gate: pick.js blocks pre-open actions; all tiers open since May 15 so
  fine for current sponsors, but handle the tierGateError shape.

## Done-when
Scott can, from a sponsor card alone: change any seat's meal (done), change
which seats they hold via a scoped map, and move their group to another show —
without opening the seating chart or the sponsor's portal.
