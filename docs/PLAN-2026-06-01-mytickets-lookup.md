---
title: /mytickets walk-up ticket lookup page (event signage)
status: live
project: gala
phase: event ops (June 10)
source_chat: 2026-06-01 Skippy session (event landing/lookup page)
created: 2026-06-01
last_updated: 2026-06-01
deploy: 7d6e743 → CF Pages production (green)
---

# /mytickets — walk-up "find my tickets" page

## Why
Scott needs a QR / NFC target to print on signs at the gala so guests can
look up their own seats + dinner without staff. Print-locked URL:
**https://gala.daviskids.org/mytickets**

## What shipped
- `public/mytickets/index.html` — standalone brand-matched page (Inter +
  Fraunces, navy/gold/red, no entrance animation). Mobile-first, large tap
  targets. Two modes via tabs: **By email** / **By company**. Shows seats
  on-screen instantly, grouped by showing (movie, movie time, dinner time,
  auditorium), each seat with its dinner label.
- `functions/api/gala/mytickets/lookup.js` — read-only lookup.
  - `POST {mode:'email'|'company', value}` and `GET ?id=` (after multi-match pick).
  - email → sponsors.email / secondary_email; company → 3-pass match.
  - Joins seat_assignments → showtimes → movies. Dinner label map mirrors
    the portal (frenchdip/salad/veggie/kids).

## Company search — 3 passes (real guests misspell)
Surfaced live: the school is **"Mueller Park"** but everyone writes
**"Muller"** (the seat guest_name is even spelled that way). So:
1. contains/prefix LIKE (exact-ish)
2. word-token LIKE (dropped words / one word typed; skips org filler)
3. bounded-Levenshtein fuzzy over the ~100-row sponsor set (single/double
   letter errors that share no substring, e.g. Muller→Mueller). Early-exit
   ceiling; tolerance 1 (≤5 chars) else 2. Verified 7/7 incl. unrelated
   names correctly missing. "Muller" → multi {Mueller Park, Miller Family
   Foundation} → guest disambiguates.

## Security model (deliberate)
- Seats are **non-secret** (visible in the room that night) → shown
  read-only for both email and company lookups.
- The portal token is an **edit credential** → NEVER returned on screen.
  - email match → page offers one-tap "email me my link" via the existing
    `/api/gala/portal/request-link` (link lands in the inbox, not on screen).
  - company match → `canEdit:false`; page tells guest to use the email path.
    Only a **masked** on-file email is shown (e.g. n••••••@dsdmail.net).
- No contact info beyond the masked hint is exposed.

## Routing
`/mytickets` is NOT in `_routes.json` include → served static (CF Pages
308s `/mytickets` → `/mytickets/`, final 200). The endpoint hits Functions
via the existing `/api/*` include. No `_routes.json` change needed.

## Verified live (prod, commit 7d6e743)
- Page loads 200 at gala.daviskids.org/mytickets.
- Email lookup (Wicko) → seats grouped by showing, dinner labels correct.
- Company "Mueller Park" → single match, F15–F20, canEdit=false, masked email.
- Company "Muller" (misspelled) → fuzzy multi-match, disambiguates.
- (Bonus) confirms yesterday's Mueller Park consolidation held: F15–F20 contiguous.

## TODO
- Mirror to skippy-plans/plans/2026-06-01-gala-mytickets-lookup.md (dual-commit).
- Optional: add a "By email" deep prefill when arriving from a company
  multi-match so editing is one fewer step.
- Optional: rate-limit the lookup endpoint if signage drives abuse (KV
  sliding window) — currently relies on CF edge throttling; volume is tiny.
