# HANDOFF — Admin Seat Mover v2: build the MOVE flow (and beyond)

**For:** the next builder (Codex, overnight) · **Written:** 2026-06-08 ~6PM MDT · **Event:** Wed June 10
**Repo:** `ramonscottf/gala` → Cloudflare Pages project `gala` → `gala.daviskids.org` (auto-deploys `main` in ~30–60s, builds Functions + the Vite SPA).

This is Scott's personal night-of seat-management tool. It must be mobile-first and rock-solid. Build in committed slices; verify on the live URL.

---

## What already works (LIVE at `/admin/seatmap/v2.html`, log in `gala2026`)

- **Slice 1 — visual parity.** Renders the REAL guest `SeatMap` (`src/portal/SeatEngine.jsx`) so the admin chart is identical to guests (layout, seat-type colors, loveseats, screen). Auditorium picker + header show **auditorium · movie · real time** from `/api/gala/admin/showtimes`. Live assignments from `/api/gala/admin/seatmap`; occupied seats use the guest "taken" tint; seated/total count.
- **Slice 2 — tap to identify + party highlight.** Tap any seat (occupied included) → dossier bottom sheet (name/company, delegate-vs-sponsor + tier, party seats, dinner). The occupant's whole party lights up gold on the chart.

The **live v1 tool** (`public/admin/seatmap/index.html` + `app.js`) is UNTOUCHED and still works. v2 ships alongside it until it reaches parity; only then do we point `/admin/seatmap` at the island.

---

## YOUR JOB (in order)

### 1) MOVE FLOW (the core — do this first)
From the dossier, "Move party (N) →" and a per-seat "Move just this seat →":
1. Enter move mode for the selected party (keep them highlighted).
2. Let the user pick a destination **room** (reuse the existing auditorium picker; default = current room) — header keeps showing auditorium · movie · time.
3. Pick destination **open** seats equal to the party size. Use the guest selection model: pass `selected` (Set) + `onSelect(ids, action)` to `SeatMap`; render those targets **hollow** (see SeatMap TODO below). Open seats are pickable; occupied are dimmed (except for a single-seat **swap**, which `move-seat` supports).
4. Confirm → call the endpoint → on success, clear state and refetch `/api/gala/admin/seatmap` for the (possibly new) room.

**Endpoints already shipped and gated (use the session cookie; admin pages send it automatically):**

`POST /api/gala/admin/move-seat` — one seat (relocate to open, or swap with occupied), same-room or cross-room:
```
{ "theater_id": <source>, "showing_number": <source>,
  "from": { "row_label": "D", "seat_num": "7" },
  "to":   { "row_label": "E", "seat_num": "9", "theater_id": <dest?>, "showing_number": <dest?> } }
```
- `to.theater_id`/`to.showing_number` default to source. Open dest = relocate (sponsor_id, delegation_id, guest_name, dinner_choice ride along; theater/showing update). Occupied dest = swap.

`POST /api/gala/admin/move-group` — whole party into a block of open seats, same-room or cross-room:
```
{ "theater_id": <source>, "showing_number": <source>,
  "to_theater_id": <dest?>, "to_showing_number": <dest?>,
  "moves": [ { "from": {"row_label","seat_num"}, "to": {"row_label","seat_num"} }, ... ] }
```
- Read the header comment in `move-group.js` for the authoritative `moves[]` shape and rules. Same-room targets must be open OR a seat being vacated in the same batch. Cross-room targets must ALL be open (no swaps cross-room). No two moves may target the same seat.
- Both endpoints bind all FOUR composite-key columns on every write (theater_id, showing_number, row_label, seat_num) — keep that discipline in any new SQL.

### 2) SeatMap TODO (additive — DO NOT change guest behavior)
`src/portal/SeatEngine.jsx` already has admin props: `adminClickable`, `onSeatActivate(id)`, `highlighted` (Set), `highlightColor`. **Add** the same way (optional prop, default preserves current rendering):
- `selectedStyle='fill' | 'hollow'` — when `'hollow'`, render `selected` seats as outline only (no solid fill) so move targets read as "pending," distinct from the gold party highlight. The stroke logic is at the per-seat render (~line 500, `isSel`/`isHi` → `strokeColor`/`sw`); add a hollow branch there + a fill override in `colorFor`/inline.
- Rebuild BOTH the guest portal (`npx vite build`) and the island if you touch SeatEngine, and confirm guests are unaffected (defaults off). Guest portal must stay 200.

### 3) Then: all-sponsors directory tab (search/filter, placed/purchased, tier, rooms — `/api/gala/admin/sponsor?all=1` exists), auditorium overview cards, mobile polish (sticky aud switcher, pinch-zoom, bottom sheets, pull-to-refresh), night-of safety (check-in tint, undo/recent-moves, flags for no-dinner/orphan/oversubscribed, printable door list).

### 4) When at parity: point `/admin/seatmap` at the island (or 301) and retire vanilla `app.js`.

---

## FILE MAP & BUILD
- Island entry: `src/admin/seatmap/index.jsx` (mounts `#seatmap-mount`, exposes `window.GalaSeatmap.mount`).
- App: `src/admin/seatmap/SeatmapApp.jsx`.
- Shared chart: `src/portal/SeatEngine.jsx` (`SeatMap`, `adaptTheater` exports; self-styled — no external CSS).
- Build island: `npx vite build --config vite.seatmap.config.js` → `public/admin/seatmap/assets/seatmap.js` (IIFE, `emptyOutDir:false` so it never wipes v1).
- Host page: `public/admin/seatmap/v2.html`.
- Build guest portal (only if you edit SeatEngine): `npx vite build` → `public/sponsor/`.
- Layouts: `GET /data/theater-layouts.json` (`{theaters:[{id, rows, cols, ...}]}`); feed each theater through `adaptTheater()`.

## DATA SHAPES
- `GET /api/gala/admin/showtimes` → `{ showtimes: [{ theater_id, showing_number, show_start, dinner_time, movie_title (null→TBD), poster_url }] }`.
- `GET /api/gala/admin/seatmap?theater_id=&showing_number=` → `{ assignments: [{ seat, row, num, sponsor_id, delegation_id, company, tier, guest_name, dinner }], holds: ["E1", ...] }`.
- SeatMap seat id format = `` `${row}-${num}` `` (DASH). Endpoint `seat` field is `${row}${num}` (no dash); build ids from `row`+`num`.
- **Party grouping:** if `delegation_id` → all seats with that `delegation_id`; else sponsor's own seats (`sponsor_id` AND `delegation_id` null). (Per-room; the endpoint is per theater+showing.)

## GUARDRAILS / HAZARDS
- **Container resets between sessions** (local HEAD reverts, `node_modules` vanishes). EVERY session, before editing: `git fetch origin main && git reset --hard origin/main` then `npm ci` if `node_modules` missing. Commit + push every slice; origin is the source of truth.
- Auction-page commits land on `main` constantly — `git fetch && git rebase origin/main` before every push (they're disjoint, rebase clean). Never run two sessions pushing this repo at once.
- D1: account `77f3d6611f5ceab7651744268d434342`, db `gala-seating` `1468a0b3-cc6c-49a6-ad89-421e9fb00a86` (bound `GALA_DB`). Query API: `POST .../d1/database/{db}/query` with `X-Auth-Email` + `X-Auth-Key` (NEVER Bearer), one statement per request.
- Admin endpoints gated by `verifyGalaAuth` (`GALA_DASH_SECRET`); `/admin/*` pages gated by middleware. Login `gala2026`.
- **Test sponsor:** Wicko = sponsor 89, delegation 288, delegate "Alexandra Foster", currently seats **D7/D8** in Theater 2 / late showing, dinner frenchdip. Test against it; restore it to D7/D8 when done.
- `unfinalize` DELETEs the seat row and `finalize` re-INSERTs WITHOUT dinner_choice — do NOT test moves via unfinalize/refinalize on real data (use the admin move endpoints, which carry dinner_choice across).
- Verify deploy: `curl -s -o /dev/null -w '%{http_code}'` the v2 page/asset (gated → 302, not 404) after ~45–55s; confirm guest portal still 200.

## DONE-WHEN
Scott can, on his phone the night of: open any auditorium, tap a seat to see who's there, and move that person or their whole party to other open seats (including a different auditorium/showtime), with the change persisting and the chart refreshing — without ever touching a guest's dinner choice or name.
