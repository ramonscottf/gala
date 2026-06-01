---
title: Admin Seat Mover tool (/admin/seatmap)
status: live
project: gala
phase: admin rebuild v1 (event ops, June 10)
source_chat: 2026-06-01 Skippy session (admin seating rebuild)
created: 2026-06-01
last_updated: 2026-06-01
deploy: 7bb95b9 → CF Pages production (green)
supersedes: (eventually) /admin/seating — kept live as backup for now
---

# Admin Seat Mover — /admin/seatmap

## Why
The legacy /admin/seating chart has three disconnected models (sponsor
queue, seat map, assignments panel) that don't talk to each other and
no clean "move this person" action. Scott couldn't relocate Brett
Singleton to free seats for Kellee Belnap without dropping to D1. On
gala night he needs to make moves in seconds, on his phone.

Decision (Scott, 2026-06-01): build a NEW tool that mirrors the guest
seat view but with admin move powers; tap-to-move AND drag; leave the
old chart live as backup, decide later whether to retire it.

## What shipped (v1)
- `public/admin/seatmap/index.html` + `app.js` — self-contained page
  (vanilla, no React-admin tangle). Auditorium + showing pickers, full
  seat map color-coded per sponsor (stable HSL by sponsor_id so a group
  reads as one block), search box highlights a company's seats and
  scrolls to them. Legend. Mobile bottom-sheet side panel for phone use.
  Brand-matched (Inter/Fraunces, navy/gold), no entrance animation.
  - **Tap-to-move:** tap a seat → side panel shows occupant + dinner →
    "Move X →" → map enters destination mode (open seats glow green,
    occupied dim) → tap target. Open = relocate; occupied = swap.
  - **Drag:** in Drag mode, drag an occupied seat onto any seat.
  - Both call the same commit path.
- `functions/api/gala/admin/seatmap.js` — GET assignments + sponsor
  company/tier + active holds for a theater/showing (admin-auth).
- `functions/api/gala/admin/move-seat.js` — POST atomic move OR swap,
  admin-auth (verifyGalaAuth / GALA_DASH_SECRET), every composite-key
  column bound, NO orphan nudge (deliberate arrangement), audit-logged
  to sponsor_actions_log. Swap uses a two-phase parked coordinate
  (__SWAP__) to dodge the UNIQUE(theater,showing,row,seat) constraint;
  best-effort unpark on failure.

## Auth / routing
- Page lives under /admin/* → gated by existing `_middleware.js` session
  cookie. app.js is a static asset (middleware doesn't block static).
- Endpoints under /api/* → each checks verifyGalaAuth itself.
- Layout geometry from static /data/theater-layouts.json (rows w/
  label/numbers/cols/type; minCol..maxCol grid).

## Verified live (prod, 7bb95b9)
- Admin login → cookie OK.
- Read: 39 assignments for theater 7 showing 1.
- Move A17→A19 (Wicko test sponsor) → ok, guest preserved; restored A19→A17.
- Unauthenticated move → 401.
- No residue (Wicko back at A17/A18).
- Local Playwright: map renders (168 seats Aud 1), select→Move→destination
  mode visuals correct (source gold, open=green, occupied dim, held dashed).

## Known v1 limits / next
- Showing dropdown labels are generic ("Early 5:00 / Late 7:50"); real
  per-aud times differ — cosmetic only (DB key is showing_number).
- No cross-auditorium move yet (move within a theater+showing). Moving a
  sponsor to a different auditorium = next increment.
- No undo button (D1 is source of truth; a move back is the manual undo).
- Drag on touch devices relies on native HTML5 DnD; tap-to-move is the
  reliable mobile path and is the recommended gala-night flow.
- Decide later: retire /admin/seating or keep as power-user/export view.

## TODO
- Mirror to skippy-plans/plans/2026-06-01-gala-admin-seat-mover.md (done in same session).
- Scott to click through on the real portal before we mark the old chart
  for retirement.

## Update 2026-06-01 — sponsor-centric dossier (shipped, deploy 31780b5+)
Scott: tapping a seat showed no context. Now tapping an occupied seat (or
searching a company) opens a full dossier: contact, tier, placed/purchased,
EVERY seat across ALL auditoriums+showings grouped by movie with dinner +
whose seat (sponsor vs named guest), and an invited-guest rollup. Each
dossier seat is tappable -> jumps the map to that auditorium and selects it.
New endpoint: /api/gala/admin/sponsor (?id dossier, ?q search). Verified
live against Bank of Utah (#4): 5 aud/showing groups, 5 guests, surfaced
from one tap; spotted a 'no dinner' pair (Cherie Hanson K20/K21).
