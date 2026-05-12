---
title: Per-sponsor marketing replay (catch-up sends)
status: proposed
project: gala
phase: pre-implementation
source_chat: 2026-05-12 admin compose-email catch-up request
created: 2026-05-12
last_updated: 2026-05-12
---

# Per-sponsor marketing replay (catch-up sends)

## TL;DR

When a sponsor's tier changes after marketing has already gone out
(e.g. Big West Oil promoted from Individual Seats to Platinum on
2026-05-12, but the Platinum Opens email shipped 2026-05-11),
admin needs to **re-send the exact emails that audience already
received, to just that one sponsor**, from the sponsor card's
Compose Email surface.

Pattern: rendered with the canonical copy (whatever Sherry edited
into `marketing_sends` and shipped), the recipient's real
`rsvp_token`, their first name, and a logged entry on their
touchpoint timeline so we know it went.

The good news: **90% of the machinery is already built.** The
`marketing-test` endpoint already loads any sendId, pulls the
live `marketing_sends` row (Sherry's edits), substitutes
`{TOKEN}` per-recipient, and ships via SkippyMail. We just need
to (1) accept a `sponsorId` instead of a hardcoded name, (2) log
to `marketing_send_log` so the timeline picks it up, and (3)
surface this in the Composer.

## Why this is needed

- **Concrete trigger:** Big West Oil (the Call Foundation family,
  same donors that own 2N Town, both Platinum) was paying $1,500
  for 20 seats under "Individual Seats" tier. Sherry told Scott
  2026-05-12 to roll them up to Platinum even though they pay
  less than the canonical Platinum amount, because they're family
  with another Platinum sponsor. But the **Platinum Opens — May 11**
  email already went out yesterday. Big West Oil needs that email
  retroactively. The "Platinum SMS — May 11" same day. Possibly
  any future Platinum-tier touchpoints they missed before promotion.
- **Same pattern recurs:** every time a sponsor tier changes mid-
  cycle, every time a sponsor is added after their tier's window
  opened, every time a re-resend is needed because an email
  bounced and we fixed the address. The marketing pipeline is
  audience-keyed — once a touchpoint has fired, anyone who joins
  the audience later gets nothing automatically. This tool closes
  that gap.

## What "the right answer" looks like

From the sponsor card in admin:
1. Click into the sponsor (e.g. Big West Oil).
2. Click **Compose email** at the bottom (existing button).
3. The composer opens with two modes — a tab or section toggle:
   - **Custom message** (current behavior: type a one-off email).
   - **Resend a marketing piece** (new): a list of previously-
     sent marketing touchpoints. Each row shows date, channel,
     audience, title, and a "Send to this sponsor" button.
4. Hitting "Send to this sponsor" on, say, "Platinum Opens — May 11":
   - Renders the email server-side using the LIVE copy from
     `marketing_sends` (whatever Sherry approved + shipped).
   - Substitutes `{TOKEN}` with `sponsor.rsvp_token`.
   - Uses `sponsor.first_name` for the "Hi Rocky," greeting.
   - Sends via SkippyMail.
   - Writes a row to `marketing_send_log` so it appears on
     the sponsor's touchpoint timeline ("Email sent — Catch-up
     Platinum Opens — May 11").

SMS counterpart: same flow with the SMS touchpoints — but only
fires for sponsors who have a phone on file AND have opted in.
(Default surfacing only shows email rows; SMS shows when toggled.)

## What we are NOT doing

- **No new editor surface** — copy is whatever's in
  `marketing_sends`. If Sherry didn't edit a send, the in-code
  default in `SENDS` registry is used (same fallback chain as
  the existing test sends and bulk sends).
- **No tier autodetect** — every send is presented; admin
  decides what's relevant. We can sort/highlight by audience
  match later. Two reasons: (a) "What did this audience get?"
  is a question even when the sponsor isn't in that audience
  (e.g. resending Confirmed Buyers to a brand-new sponsor); (b)
  audience evaluation is recursive enough that getting clever
  here would slow shipping.
- **No bulk catch-up** — one sponsor at a time only. Bulk catch-
  up (e.g. "send Platinum Opens to all Platinum sponsors added
  after May 11") is a separate, riskier feature. Out of scope.
- **No retroactive analytics** — the catch-up rows in
  `marketing_send_log` will show up in per-send tallies, which
  is *correct* (they were sent), but if anyone tries to compute
  "Platinum Opens open rate" they'll see catch-ups mixed in.
  Acceptable — we tag them with a different `sent_by` so they
  can be filtered if needed.

## Architecture

### Data flow

```
sponsor card
  └─ Compose email button
      └─ Composer modal
          ├─ Custom message tab (existing)
          └─ Marketing replay tab (NEW)
              ├─ GET /api/gala/marketing-catch-up-list
              │   → list of sendIds that have rows in
              │     marketing_send_log (i.e. "have been sent")
              │     joined with marketing_sends (live copy)
              │     + SENDS registry (for fallback title/audience)
              └─ POST /api/gala/marketing-catch-up-send
                  body: { sponsorId, sendId }
                  → resolves sponsor row, renders, sends,
                    writes marketing_send_log entry with
                    sent_by='admin-catchup', returns
                    { ok, sent_at, recipient }
```

### Files to touch / create

**New: `functions/api/gala/marketing-catch-up-list.js`**
GET. Returns the list of sends that have actually been fired
historically (i.e. `marketing_send_log` has at least one row
with `status='sent'` for that sendId). Joins with the live
`marketing_sends` row to get current subject + audience.
Falls back to the in-code `SENDS` registry from
`marketing-test.js` for title/audience metadata (so the UI
can show "Platinum Opens — May 11" without re-implementing
date math). Channel = email and sms both included; UI filters
to email-only by default.

Shape:
```json
{
  "sends": [
    {
      "sendId": "s3",
      "title": "Platinum Opens",
      "channel": "email",
      "audience": "Platinum Sponsors",
      "subject": "Platinum sponsors: your seat selection is now open",
      "lastSentAt": "2026-05-11T13:00:00Z",
      "totalSent": 28
    },
    ...
  ]
}
```

**New: `functions/api/gala/marketing-catch-up-send.js`**
POST. Accepts `{ sponsorId, sendId }`. Auth-gated like the
others. Logic:
1. Verify gala auth.
2. Load sponsor row by id. 400 if archived, has no email
   (for email sends), or no `rsvp_token` (would ship dead-link).
   For SMS, require phone + future TCPA opt-in flag.
3. Load send copy: `marketing_sends` first (live), then
   `marketing_edits` (legacy), then in-code `SENDS` fallback.
   Same priority chain as `marketing-test.js`.
4. Substitute `{TOKEN}` in subject + body with
   `sponsor.rsvp_token`.
5. Render via `galaEmailHtml({ firstName: sponsor.first_name
   || sponsor.company, body, footerLine: null })`. **Do not
   add the yellow `⚠️ TEST SEND` banner** — this is a real
   send, not a test.
6. Send via `sendEmail()` (or `sendSMS()` if channel='sms').
7. Write `marketing_send_log` row with:
   - `send_id` = the original sendId
   - `send_run_id` = new UUID prefixed `catchup-` for filterability
   - `sponsor_id` = sponsor.id
   - `recipient_email` = sponsor.email
   - `recipient_name` = `displayName(sponsor)`
   - `audience_label` = `'Catch-up: ' + originalAudienceLabel`
   - `status` = 'sent' or 'failed'
   - `sent_by` = 'admin-catchup' (distinguishable from
     'admin' for the bulk sends and 'system' for automated)
8. Return `{ ok: true, sentAt, sendId, recipient }` or
   `{ ok: false, error }`.

**Modify: `src/admin/sponsors/Composer.jsx`**
- Add a tab control at the top: "✏️ Custom message" |
  "📨 Resend a marketing piece".
- Default to "Custom message" (preserves existing behavior).
- When user clicks "Resend a marketing piece":
  - Fetch `/api/gala/marketing-catch-up-list` (cache per
    composer-open).
  - Render a list of rows: title, audience, last-sent date,
    "Send to this sponsor" button.
  - On click, fire `/api/gala/marketing-catch-up-send` with
    `{ sponsorId, sendId }`. Show a confirm modal first
    ("Send the May 11 Platinum Opens email to Rocky Edelman
    at rocky.edelman@bigwestoil.com?") because this is a
    real send to a real customer — no undo.
  - On success: toast confirms, close composer, parent
    re-fetches sponsor row to update the timeline.
- Empty state: if no sends have been fired yet → "No
  marketing pieces have been sent yet. Use Custom message."

**Modify: `src/admin/sponsors/SponsorsView.jsx`**
- `handleSend` extension: if `composer.mode === 'replay'`,
  call `marketing-catch-up-send` instead of `sendMessage`.
- After successful replay, refetch the sponsor to update
  `last_send` so the timeline shows the new entry.

**No schema changes.** `marketing_send_log` already has every
column we need (`send_id`, `sponsor_id`, `audience_label`,
`sent_by`). The `sent_by='admin-catchup'` tag is the only
new convention.

### Why a separate endpoint vs reusing `marketing-test`

`marketing-test` is intentionally scoped to internal addresses
(Scott / Sherry / Kara) and **prepends `⚠️ TEST SEND` banner +
`[TEST]` subject prefix**. A real catch-up send to a sponsor
must NOT carry that styling. Branching the test endpoint on
`recipients === <sponsorId>` would be a sharp knife — easy to
accidentally test-flag a real send. A dedicated endpoint with
no test-banner code path is safer.

## Risk + edge cases

- **Sponsor with no email or no rsvp_token:** Refuse with
  400. Surface in UI as disabled "Send" button with hover
  reason ("No email on file" / "No portal token — re-issue
  invite first"). Big West Oil has both, so happy path.
- **Sponsor who's already received this send through normal
  pipeline:** Allow with confirm prompt that surfaces the
  prior send timestamp ("Big West Oil received this on
  2026-05-11 at 1:00 PM. Send again?"). Useful in error-
  recovery scenarios.
- **SMS catch-up to sponsor without TCPA opt-in:** Refuse.
  Surface as disabled with explanation. Same rule as the bulk
  sender — never send SMS to anyone who hasn't opted in.
- **Sends that haven't been fired yet:** Not listed.
  Catch-up is "replay what's already happened," not "send
  early." The list endpoint filters to sendIds with at least
  one `marketing_send_log` row.
- **Composer used immediately after creating a new sponsor:**
  The composer fetches the catch-up list on open, not on
  modal mount. List always reflects current pipeline state.
- **Race: two admins replay the same send to the same sponsor
  simultaneously:** Both succeed, both log. The sponsor gets
  two emails. Acceptable — vanishingly rare and visibly
  detectable (two timeline entries). Don't add a lock.
- **Token regeneration:** If a sponsor's `rsvp_token` was
  rotated after the original send, the catch-up uses the
  current token. This is actually correct — we want the
  link to work now, not the dead old link.
- **Audience label drift:** if Sherry renames `Platinum
  Sponsors` audience between original send and catch-up,
  the catch-up logs with the original send's audience label
  prefixed `Catch-up: `. The list endpoint reads from
  `marketing_sends.audience` (live), so it always shows the
  current label. Minor inconsistency, accepted.

## Phasing

### Phase 1 — Backend endpoints (~45 min)

1. Create `functions/api/gala/marketing-catch-up-list.js`
   - Modeled on `marketing-send-log.js` for the DB query
   - Joins log → marketing_sends → SENDS registry
2. Create `functions/api/gala/marketing-catch-up-send.js`
   - Modeled on `marketing-test.js` minus test banner
   - Modeled on `marketing-send-now.js` for log-writing
3. Smoke test with curl: list endpoint returns reasonable
   data, send endpoint dry-runs against a non-prod address.

**Acceptance:**
- `GET /api/gala/marketing-catch-up-list` returns at least
  the `s3` (Platinum Opens) entry with `lastSentAt` matching
  the 2026-05-11 send.
- `POST /api/gala/marketing-catch-up-send` with Scott's
  sponsor id + `s3` sends a real (non-test-banner) Platinum
  Opens email to his sandbox address, logs one row.

### Phase 2 — Composer UI (~60 min)

1. Add tabs to `Composer.jsx`: "Custom message" / "Resend
   a marketing piece".
2. On Resend tab mount: fetch list, render rows.
3. Per-row "Send to this sponsor" button with confirm modal.
4. Wire success → toast + parent refetch.

**Acceptance:**
- Open Big West Oil → Compose email → Resend tab → list
  shows Platinum Opens — May 11 with audience badge and
  date.
- Click Send → confirm modal shows recipient email →
  Confirm → toast "Sent." → close → sponsor card timeline
  shows new "Email sent — Catch-up Platinum Opens — May 11"
  row at the top.

### Phase 3 — Polish (~30 min)

1. SMS toggle in the Resend list (default email-only).
2. Disabled-state explanations on the Send buttons.
3. Empty state when no sends have fired yet.
4. Sort: most recent first, group by phase.
5. Audience-match highlight: if the sponsor's tier matches
   the send's audience, badge it ("Matches this sponsor's
   tier"). Soft hint, doesn't change behavior.

**Acceptance:** Scott + Sherry can use it without asking
clarifying questions on first try.

### Phase 4 — Documentation (~15 min)

1. Append to gala README under "Marketing operations":
   when/why to use Resend.
2. Mirror plan to `skippy-plans/plans/`.
3. Note in `CLAUDE.md` style guide that `sent_by='admin-
   catchup'` is reserved for this path.

## Verification checklist (pre-deploy)

- [ ] List endpoint returns only sends that have actually
      been fired (no upcoming or unsent rows).
- [ ] Send endpoint produces an email that's visually
      identical to the original bulk send — no test banner,
      no `[TEST]` subject prefix.
- [ ] `{TOKEN}` substitution works — portal link in catch-up
      email opens the sponsor's actual portal.
- [ ] Timeline updates after replay.
- [ ] SMS replay refuses non-opted-in sponsors with a clear
      error message.
- [ ] Replay to a sponsor with no email returns 400.
- [ ] Replay to a sponsor with archived_at returns 400.
- [ ] Two replays of the same send to the same sponsor both
      succeed and log separately.

## Context-budget assessment (for handoff decision)

**Current chat:** Already covered Phases 1-5 of showing_number,
Phase 5.14 welcome popup, Phase 5.15 step-jump. This is a
~4-5 hour body of work this session. Token usage is heavy but
manageable.

**This feature's scope:** ~2.5 hours of work. Three new files
(two endpoints + one Composer tab), one Composer.jsx
modification, one SponsorsView.jsx wiring change, plus
documentation. No DB migrations. No portal-side changes. No
breaking changes to existing endpoints.

**Recommendation: ship it in this chat.** Reasons:

1. Context is loaded and warm on exactly the right files —
   `marketing-test.js`, `marketing-send-now.js`,
   `marketing-send-log.js`, `Composer.jsx`. A fresh chat
   would have to re-read all of them.
2. The pattern is well-defined and the risk is low — we're
   composing existing primitives, not inventing anything.
3. You're catching live customer issues (Big West Oil
   promoted today). Faster ship = fewer manual workarounds.

**If the user prefers a fresh chat:** This plan is detailed
enough that a new Claude instance can pick it up cold. All
the file references are absolute. The SENDS registry pattern
is documented. The schema is in `marketing_send_log.js` and
referenced inline. Hand off to a new chat by:

> "Read `skippy-plans/plans/2026-05-12-gala-per-sponsor-
> marketing-replay.md` and implement Phase 1 + 2."

## Open questions for Scott before implementation

1. **Confirm flow:** show a "send to rocky.edelman@bigwestoil.com?"
   confirm modal, OR fire-and-toast with an undo window? I lean
   confirm modal because this is a customer-visible send with no
   true undo.
2. **List default filter:** email-only by default, with an SMS
   toggle? Or show both inline?
3. **"Mark as sent" without sending:** sometimes admin manually
   forwards the email from their own inbox. Worth adding a
   "mark as sent" link to create a timeline row without
   actually sending? My instinct: not yet. Add only if it
   comes up.
4. **Visual indicator on the original pipeline:** should the
   marketing dashboard show "X sponsors received catch-up
   sends" next to each fired touchpoint? Future work, not
   needed for v1.

## Rollback

- Each phase is independently revertible.
- Phase 1: delete the two new endpoint files. Zero impact —
  nothing yet calls them.
- Phase 2: revert `Composer.jsx` + `SponsorsView.jsx`. The
  composer goes back to single-mode custom-message.
- `marketing_send_log` rows with `sent_by='admin-catchup'`
  remain in the DB after rollback; they're correct audit
  records of sends that actually happened. Don't delete.
