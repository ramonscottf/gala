---
title: Tier-Window Lockdown + Tier-Open Email Pass
status: 🚧 In progress (gate live in branch, awaiting deploy verify; Gold email ready to send)
project: gala (ramonscottf/gala)
phase: 5.16
source_chat: 2026-05-14 — VCBO seat-pick investigation → tier-window lockdown
created: 2026-05-14
last_updated: 2026-05-14
---

# Tier-Window Lockdown + Tier-Open Email Pass

## Why

On May 13, **VCBO** (Silver, sponsor #85) finalized seat selection for all 14 of their
seats — six days before Silver was supposed to open (May 18). Scott spotted it in
the admin dashboard May 14 and asked Skippy to trace what happened.

Investigation found two compounding holes:

1. **The portal had no server-side tier gate.** `/api/gala/portal/[token]/pick`,
   `/finalize`, `/assign`, and `/delegate` validated seat math (quota, orphan,
   not-already-taken, valid showing) but never checked the sponsor's tier
   against today's date. The May 11/14/18/20/25/28 ladder existed only as
   marketing copy in `marketing_sends.body`, `public/admin/index.html`
   scheduling cards, and `public/review/index.html` email preview templates.
2. **The homepage magic-link self-service form (May 11 launch) handed every
   sponsor their token at any time** — Alex Booth at VCBO used it on May 12
   at 1:04 PM Mountain. The `request-link.js` console-only logging meant the
   send didn't appear in `marketing_send_log`, but the Resend webhook captured
   the delivery (`marketing_email_events`, event 342/343 on May 12 19:04 UTC).

The "tier windows" were honor-system gated only by *when we sent the email
with the link*. Combined with magic-link self-service, that was no gate at all.

Separately, two of the existing tier-open email bodies (s5 Gold, s9 Bronze) had
**broken portal URLs** — pointing at `https://daviskids.org/gala-seats/{TOKEN}`,
which 404s. The canonical URL is `https://gala.daviskids.org/sponsor/{TOKEN}`.
Gold was scheduled to send today (May 14). Catching this before it went out
saved an embarrassing all-Gold-recipients dead-link incident.

## What shipped

### 1. Migration 010 — `tier_windows` table

New D1 table; tier → opens_at (UTC ISO-8601) + `override_open` flag for
admin punch-throughs. Seeded with the canonical ladder:

```
Platinum            2026-05-11T14:00:00Z  (8:00 AM MDT, already open)
Cell Phone          2026-05-11T14:00:00Z  (handshake tier, Platinum-level)
Trade               2026-05-11T14:00:00Z  (paid-in-full, Platinum-level)
Donation            2026-05-11T14:00:00Z  (Platinum-level)
Gold                2026-05-14T14:00:00Z  (8:00 AM MDT)
Silver              2026-05-18T14:00:00Z
Bronze              2026-05-20T14:00:00Z
Friends and Family  2026-05-25T14:00:00Z
Split F&F           2026-05-25T14:00:00Z
Individual Seats    2026-05-28T14:00:00Z
```

**Once opens_at passes, the tier is open forever.** Per Scott (May 14):
*"Nothing ever closes. Their exclusive window closes. they never get
shut off. we just let more people in."* The "closing" language in the
emails refers to the *exclusivity* ending, not access.

Migration applied to prod D1 (`1468a0b3-cc6c-49a6-ad89-421e9fb00a86`) on
May 14 2026 — 10 rows inserted, verified via SELECT.

### 2. Server-side gate (`getTierAccess` / `tierGateError`)

Added to `functions/api/gala/_sponsor_portal.js`:

```js
const access = await getTierAccess(env, resolved);
if (!access.open) return tierGateError(access);
```

Behavior:
- For sponsors, reads `sponsor.sponsorship_tier`; for delegations, reads
  `parent_tier`. Normalized via existing `normalizeSponsorTier()` so aliases
  (`"Bronze Sponsor"`, `"Individual Tickets"`, etc.) all map correctly.
- If a tier has no `tier_windows` row, the gate **fails OPEN** and logs a
  warning. Same if the table doesn't exist yet (during migration windows).
  Rationale: gala write paths predate the gate by months — a config gap
  must never make the portal unusable.
- `override_open = 1` bypasses the date check (Sherry's escape hatch).
- The error response is a friendly 403 with a Mountain-formatted opens_at:
  *"Seat selection for Silver sponsors opens Mon, May 18 at 8:00 AM
  (Mountain). We'll email you a reminder when it does."*

Applied to:
- `pick.js` (hold / release / finalize / unfinalize / set_dinner)
- `finalize.js` (RSVP completion + QR dispatch)
- `assign.js` (multi-seat bulk assign)
- `delegate.js` POST (create / resend) and DELETE (reclaim)

The GET `[token].js` endpoint now also surfaces `tierAccess` in its
payload — the client UI can render a friendly "your window opens..."
overlay before letting the user click, avoiding a 403 round-trip.

### 3. Tier-open email rewrite (s3, s5, s7, s9, s11, s12)

All six tier-open email bodies now share a single consistent structure
matching Kara's Platinum copy verbatim where possible:

1. Bold greeting + thank-you opener (with tier emoji 🥇🥈🥉💛🎟️)
2. Privacy + interface explanation paragraph (unchanged from Kara)
3. "Three main choices" paragraph (session / movie / meal — verbatim)
4. **Brand gradient CTA button** (blue→red `linear-gradient(90deg, #0066ff, #c8102e)`)
5. Booker concierge note + Sherry/Scott contact handoff (verbatim)
6. Next-tier-opens callout for urgency ("opens for the next group on…")
7. Beta-tester feedback ask (slightly softer for tiers 3+)
8. "Can't wait to see you at the movies! 🎟️🍿 — Sherry & Kara"

Dish list updated to match current menu: **French dip sandwich, GF chicken
salad, vegetarian, and kid's meal**. The original Platinum mentioned beef
and chicken; that's been corrected per Scott (May 14).

Portal URL fixed in s5 and s9 — both pointed at the legacy
`https://daviskids.org/gala-seats/{TOKEN}` which 404s. Now all six use
the canonical `https://gala.daviskids.org/sponsor/{TOKEN}` injected by
`marketing-send-now.js` per-recipient.

Subject lines unchanged from Sherry's May 7 approved set.

### 4. Body bodies hot-swapped in prod D1

`scripts/update-tier-open-bodies.mjs` rewrites `marketing_sends.body` for
s3/s5/s7/s9/s11/s12 with the canonical templates. Ran against prod
2026-05-14 — all 6 rows updated. Verified by re-querying `body_preview`
in the admin dashboard.

## What still needs doing

- **Push the branch + verify CF Pages deploy.** Once that's green, the gate
  is live in code. The data side is already in prod D1.
- **Send the Gold email.** Through the admin → Marketing → s5 Preview/Confirm
  flow. (Could also script it via `marketing-send-now`, but the admin flow is
  Sherry-approved and shows the recipient count before commit.)
- **Backfill the tier-emoji + button into the catch-up template inventory.**
  When sponsors use the Sponsor Dashboard's "Resend a marketing piece" flow,
  it pulls the same `marketing_sends.body` — so they get the new copy
  automatically. No follow-up work needed.
- **(Future) Admin UI for tier_windows.** Right now overrides + date edits
  require direct D1 writes. Low priority — the schedule doesn't change after
  it's set, and Sherry can ping Scott to flip `override_open` for a one-off.

## What about VCBO?

Their 14 seats are intact. The user explicitly said *"VCBO's picks stay
first"* (May 14 chat). No reclamation. The gate is forward-looking only;
seats already assigned by `assigned_by='portal'` are not touched.

## Files changed

- `migrations/010_tier_windows.sql` (new)
- `functions/api/gala/_sponsor_portal.js` (+97 lines — `getTierAccess`, `tierGateError`)
- `functions/api/gala/portal/[token].js` (+13 lines — surfaces tierAccess in GET)
- `functions/api/gala/portal/[token]/pick.js` (+8 lines — gate)
- `functions/api/gala/portal/[token]/finalize.js` (+7 lines — gate)
- `functions/api/gala/portal/[token]/assign.js` (+6 lines — gate)
- `functions/api/gala/portal/[token]/delegate.js` (+11 lines — gate on POST + DELETE)
- `scripts/tier-open-email-bodies.mjs` (new — canonical templates)
- `scripts/update-tier-open-bodies.mjs` (new — applies bodies to D1)

## Investigation timeline

- **May 7 17:33 MT** — s1a "We're grateful" email sent to VCBO (no portal link).
- **May 12 13:04 MT** — Alex Booth uses homepage magic-link form, gets portal URL.
  No row in `marketing_send_log` (request-link.js logs to console only) but
  `marketing_email_events` 342/343 record the Resend webhook delivery.
- **May 13 16:39 MT** — VCBO begins picking seats.
- **May 13 17:21 MT** — Finalized. RSVP confirmation 386/387 captured.
- **May 14 ~9:00 AM MT** — Scott spots VCBO Silver tile in admin dashboard.
- **May 14 ~3:30 PM MT** — Investigation complete; gate + email pass shipped.

## Sequel work

The homepage magic-link itself is still wide-open: anyone whose email is
in `sponsors.email` or `sponsors.secondary_email` can request their token
at any moment, regardless of tier. The portal gate now stops them from
*acting* on it before their tier opens, but they will still receive a
working link. Decision deferred — Sherry needs to weigh this UX cost.
Sketch for later: `request-link.js` could check tier-window first and
either (a) still send but lead with "your window opens [date]" instead
of "select your seats now", or (b) outright defer the email until the
window opens (set a `pending_link_request` row, fire from a cron).
