---
title: Per-sponsor marketing replay (catch-up sends)
status: shipped
project: gala
phase: 5.16
source_chat: 2026-05-12 admin compose-email catch-up request
created: 2026-05-12
last_updated: 2026-05-12
shipped: 2026-05-12
commit: c9fcf2d
---

# Per-sponsor marketing replay (catch-up sends) — SHIPPED 2026-05-12

## What shipped

Phase 5.16 of the gala admin/marketing tooling, in one commit (`c9fcf2d`).

When a sponsor's tier changes after a marketing wave has already gone
out (today's trigger: Big West Oil promoted from Individual Seats to
Platinum on 2026-05-12 after the Platinum Opens email shipped
2026-05-11), admin can now replay the exact same email to just that
one sponsor from the sponsor card's "Compose email" surface.

## Live URLs

- Admin: <https://gala.daviskids.org/admin/> → Sponsors tab → click
  into a sponsor → **Compose email** → **📨 Resend a marketing piece**
- List endpoint: `GET /api/gala/marketing-catch-up-list`
- Send endpoint: `POST /api/gala/marketing-catch-up-send`
  - Body: `{ sponsorId: number, sendId: string }`
  - Auth: gala_session cookie (admin SSO)

## Files

- `functions/api/gala/marketing-catch-up-list.js` (new) — GET endpoint
- `functions/api/gala/marketing-catch-up-send.js` (new) — POST endpoint
- `functions/api/gala/marketing-test.js` — exported `SENDS` const so
  the list endpoint can use it for title/audience fallback
- `src/admin/sponsors/api.js` — added `loadCatchUpSends()` and
  `sendCatchUp(sponsorId, sendId)` helpers
- `src/admin/sponsors/Composer.jsx` — full rewrite. Adds tab toggle
  between 'Custom message' (existing) and 'Resend a marketing piece'
  (new). ReplayMode subcomponent fetches the list, renders rows
  with audience badge / total-sent count / date / subject preview /
  'Matches tier' soft hint, and a per-row send button that fires a
  confirm modal before sending.
- `src/admin/sponsors/SponsorsView.jsx` — added `onCatchUpSent`
  callback that fires success toast + 800ms refresh after a
  replay, so the sponsor's timeline picks up the new entry.

## Key design decisions

- **No test banner.** The replay endpoint deliberately doesn't add
  the `⚠️ TEST SEND` yellow banner or `[TEST]` subject prefix that
  `marketing-test.js` adds. This is a real customer-facing send.
- **No schema changes.** `marketing_send_log` already had everything
  we need (`send_id`, `sponsor_id`, `audience_label`, `sent_by`,
  `resend_id`). New `sent_by='admin-catchup'` value distinguishes
  catch-up rows from bulk-run rows (`sent_by='admin'`) in analytics.
- **SMS catch-up blocked at preflight.** Sponsors table has no
  `sms_opt_in` column yet. TCPA forbids guessing — endpoint refuses
  with a clear error message rather than risking an unconsented
  text. When sponsor opt-in is modeled (likely Phase 5.17 of the
  marketing pipeline), unblock that branch.
- **Confirm modal, not fire-and-undo.** Real customer email, no real
  undo. The confirm modal shows the recipient email in a mono box
  and explicitly says "This is a real send. There's no undo."
- **Audience-match badge is soft.** It just visually highlights
  rows whose audience contains the sponsor's tier (e.g. Big West Oil
  is now Platinum → "Platinum Opens" row gets a "Matches tier" pill).
  Doesn't change behavior — admin can still send any row.
- **Empty state handled.** If no marketing sends have been fired
  yet, the replay tab shows a friendly "use Custom message" message.

## Verified against live data

Pre-deploy D1 query confirmed:
- `s3` (Platinum Opens) — 16 sponsors received it on 2026-05-11 22:08 UTC
- `sms1` (Platinum SMS) — 11 on 2026-05-11 22:42 UTC
- `s1a` (Save the Date — Confirmed Buyers) — 97 on 2026-05-08

These are exactly the sends that should appear in the catch-up list
when admin opens it.

## Post-deploy verification

- Bundle is live at `gala.daviskids.org/admin/assets/sponsors.js`
  with content-length 181264 (matches the build output 181.14 kB).
- List endpoint `/api/gala/marketing-catch-up-list` returns HTTP 401
  for unauthenticated requests (correct — gala_session cookie required).
- Send endpoint `/api/gala/marketing-catch-up-send` returns HTTP 401
  for unauthenticated requests (correct).

## Big West Oil — how to use it

1. Open <https://gala.daviskids.org/admin/>
2. Sponsors tab → click into Big West Oil (now Platinum tier).
3. Click **Compose email**.
4. Click **📨 Resend a marketing piece** tab.
5. The list should show **Platinum Opens** with a "Matches tier"
   pill since Big West Oil is now Platinum.
6. Click **Send to this sponsor**.
7. Confirm modal shows `rocky.edelman@bigwestoil.com`. Click
   **Yes, send it**.
8. Toast confirms, modal closes, sponsor card refreshes.
9. Touchpoint timeline now shows "Email sent — Catch-up: Platinum
   Sponsors" entry at the top.

## Out of scope (future)

- Bulk catch-up (send Platinum Opens to all newly-added Platinum
  sponsors since the original send). Riskier — deferred.
- "Mark as sent" without actually sending (for when admin manually
  forwards). Defer until requested.
- Visual indicator on the marketing dashboard ("3 sponsors received
  catch-up sends on this touchpoint"). Future polish.
- Sponsor SMS opt-in modeling. Phase 5.17+.

## Rollback

If anything breaks: revert commit `c9fcf2d`. Two new endpoint files
disappear, Composer reverts to single-mode custom-only, no DB
changes to undo. `marketing_send_log` rows with
`sent_by='admin-catchup'` are correct audit records of sends that
actually happened — don't delete them.
