---
title: Admin Seat Mover — night-of rebuild (visual parity + usability)
status: in-progress
project: gala
phase: "gala-night readiness (Wed June 10 2026) — Scott's command-center page"
source_chat: 2026-06-08 gala-admin-seatmap-nightof
created: 2026-06-08
last_updated: 2026-06-08
supersedes_notes: extends docs/PLAN-2026-06-01-admin-seat-mover.md (v1 vanilla tool, live at /admin/seatmap)
---

# Admin Seat Mover — night-of rebuild

## Why
`/admin/seatmap` (v1, vanilla JS) works but is crude and does NOT look like
what guests see. Scott will run gala night off this page, on his phone. It
needs to be dead-simple, mobile-first, and visually identical to the guest
seat chart. "We will make this page our life that night." (Scott, 2026-06-08)

## Locked decisions (Scott, 2026-06-08)
- **Visual parity:** the map must be 100% the same as guests — same layout,
  same seat-type colors, loveseats, screen, fonts. Achieved by rendering the
  ACTUAL guest `SeatMap` component (src/portal/SeatEngine.jsx), not a re-port.
  Both guest + admin already read the same `/data/theater-layouts.json`.
- **Selected seats = HOLLOW** (outline only, not filled gold like guests).
- **Group highlight:** when a sponsor/group is selected (tap or search), that
  group's seats highlight in a SEPARATE distinct color so the block pops —
  on top of the base guest coloring.
- **Always show auditorium · movie name · time** in the picker and header.
  Real per-auditorium show_start times (they differ: Aud 8 = 4:50, Aud 10 =
  4:30, etc.), not generic labels.
- Build everything in the recommended order; "just go" (TTA).

## Architecture
- New React island under `src/admin/seatmap/` built by a dedicated vite config
  (mirror the `vite.sponsors.config.js` IIFE pattern → single script in
  `public/admin/seatmap/assets/`). Reuses `SeatEngine.jsx` SeatMap.
- `SeatMap` gets two small new optional props so admin parity is exact without
  forking it: `selectedStyle="hollow"` (outline selected) and a
  `highlighted`/`highlightColor` overlay for the active group. Guest behavior
  unchanged when props are omitted.
- Data: existing `/api/gala/admin/seatmap` (assignments+sponsor+tier+holds) and
  `/api/gala/admin/sponsor` (dossier / search / ?all=1). NEW
  `/api/gala/admin/showtimes` returns theater_id, showing_number, show_start,
  movie_title for picker/header labels. Move endpoints gain cross-room support.
- Auth unchanged: page under /admin/* (session cookie middleware); /api/* each
  verifyGalaAuth. Layout geometry from /data/theater-layouts.json.

## Build order (refined to avoid throwaway vanilla)
Backend first (framework-agnostic, survives the rebuild), then the React island
becomes the home for ALL new UI (no rebuilding views twice).

1. **Backend — movie/time data + cross-room moves**
   - `GET /api/gala/admin/showtimes` → [{theater_id, showing_number, show_start,
     movie_title}] (join showtimes+movies; null title → "TBD").
   - `move-seat.js`: accept optional `to.theater_id` / `to.showing_number`
     (default = same room). Cross-room = relocate into another auditorium.
     Composite-key-safe (bind EVERY column), swap park-coordinate, audit-logged.
   - `move-group.js`: same cross-room support for a whole party.
2. **React island foundation** — render guest SeatMap for a chosen
   auditorium/showing with admin assignments; picker + header show
   auditorium · movie · time. Coloring model: guest base + hollow selected +
   group highlight.
3. **Views Scott asked for**
   - All-groups-in-this-room roster (every sponsor block here: company, #seats,
     labels, dinner mix, swatch; tap → highlight + scroll).
   - All-sponsors directory tab (search/filter; placed/purchased, tier, rooms;
     tap → dossier → jump to seats).
   - Auditorium overview / "whole night" cards (movie, time, filled/total, #groups).
4. **Mobile-first** — sticky aud/movie/showing switcher; search front-and-center;
   pinch-zoom + pan; big bottom-sheet panels + thumb-reachable Move; one-tap
   room switch; auto/pull-to-refresh (guests self-move now, so state drifts).
5. **Night-of speed & safety** — cross-aud move UI (person + party);
   check-in tint (arrived); undo last move / recent-moves feed; flags
   (no-dinner, orphan singles, oversubscribed); printable per-aud door list.

## Move flow (mobile, the night-of path)
Tap occupant → bottom sheet (dossier) → "Move →" (or "Move whole party (N) →")
→ optional destination auditorium/movie picker → map enters destination mode
(open=glow, occupied=dim) → tap target. Open=relocate, occupied=swap.
Tap-to-move is the reliable path; drag is secondary.

## Known IDs / facts
- D1 gala-seating 1468a0b3-cc6c-49a6-ad89-421e9fb00a86 (GALA_DB).
- Admin auth: verifyGalaAuth / GALA_DASH_SECRET; page gated by /admin _middleware
  session cookie; login pw gala2026.
- Test sponsor: Wicko #89 (delegation_id 288), seats T2/S2 E1+E2. Test moves on
  this sponsor only; restore after.
- Move endpoints audit-log to sponsor_actions_log. Swap parks at __SWAP__.
- Backend allows cross-room placement: /pick finalize counts capacity as a
  GLOBAL total (no per-theater lock); showtime existence validated.

## Verification discipline
Each increment: build → confirm bundle has the change → git fetch+rebase →
commit source + built assets → push → verify live → test move + swap on Wicko
test sponsor (restore after). VERIFY-BEFORE-ACTING; world > memory.

## TODO
- [ ] Mirror this plan to skippy-plans/plans/2026-06-08-gala-admin-seatmap-nightof.md
- [ ] Backend: showtimes endpoint + cross-room move-seat/move-group
- [ ] React island foundation (parity + picker/header)
- [ ] Rosters + directory + overview
- [ ] Mobile polish + safety


## Status snapshot — 2026-06-09 (day before event)

| Phase | Status |
|---|---|
| 1 — Move flow (party move, cross-room) | ✅ done |
| 2 — Gala-brand re-skin | ✅ done |
| 3 — No-zoom chat + 3.5 self-service tickets (Text/Email/QR) | ✅ done |
| 4 — Directory search + tonight-at-a-glance overview | ✅ done (2026-06-09) — `/api/gala/admin/directory`, search→jump→dossier, per-room cards w/ checked-in counts |
| 5 — Mobile polish + night-of safety | ◻️ open (check-in tint now cheap: directory carries checked_in) |
| 6 — Cutover v2 → /admin/seatmap | ◻️ open — DECIDE BEFORE DOORS which tool ambassadors use |
