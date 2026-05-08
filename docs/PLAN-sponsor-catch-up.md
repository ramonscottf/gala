---
title: Gala Sponsor Catch-Up — Per-Sponsor Marketing Pipeline View
status: ✅ Code shipped — awaiting Scott smoke-test on Wicko id 80
project: gala (ramonscottf/gala)
phase: Bridge between Sponsors tab and Marketing tab. Per-sponsor view of which scheduled marketing sends they did/didn't receive, with per-message manual-send escape hatch for late-added sponsors. No actual purchase webhook; sponsors are added by hand via the "+ Add sponsor" button shipped 2026-05-08, then caught up manually.
source_chat: 2026-05-08-gala-twoway-sync (ended at ~75-80% context, handing off cleanly) → 2026-05-08-gala-sponsor-catch-up (this build)
created: 2026-05-08
last_updated: 2026-05-08
---

# Gala Sponsor Catch-Up — Per-Sponsor Marketing Pipeline View

## TL;DR for the new chat

Scott wants to wire the **Sponsors tab** and **Marketing tab** together so that for any given sponsor, an admin can see at a glance which scheduled marketing sends that sponsor *should have* received, which they *actually* received, and which are missing — with the ability to fire any missing ones manually one-by-one.

**Why this matters right now:** the gala has 96 sponsors and growing. New ones come in mid-cycle (Sherry adds them, Wicko closes a deal, a Friends & Family ticket gets purchased). Those late arrivals miss the early-cycle messages — Save the Date, Phase 1 invites, etc. Right now there's no easy way for an admin to look at "Acme Corp who bought a Bronze ticket yesterday" and know what they should be backfilled with.

**The constraint:** there's no purchase webhook, no Bloomerang→D1 trigger, no automatic "new sponsor detected → enroll in cadence." Sponsors are added by hand via the `+ Add sponsor` button (shipped 2026-05-08). The catch-up is also manual — admin sees the gaps, fires the missing emails one at a time. Acceptable trade-off because the sponsor count is small (~100) and the human-in-the-loop is desired (admin can choose to skip a stale message rather than blast it cold).

## What already exists (do not rebuild)

The marketing infrastructure is mature. Read these before touching anything:

- **`functions/api/gala/marketing-pipeline.js`** — single source of truth for the schedule. Returns all sends grouped by phase. Each send has: `send_id`, `phase`, `channel` (email/sms), `date`, `time`, `audience`, `subject`, `body`, `status`. Editable via PATCH.

- **`functions/api/gala/marketing-send-log.js`** — record of what actually went out. Each row has `send_id`, sponsor info, `sent_at`, `status` (sent/failed). Grouped by `send_run_id` for batch context.

- **`functions/api/gala/_audience.js`** — `resolveAudience(audience, db)` translates strings like `"Platinum only"`, `"Confirmed Buyers"`, `"All Sponsors"` into actual recipient lists from D1. Lowercase-substring match on `sponsorship_tier`. **The new endpoint MUST reuse this function** — don't reimplement audience logic.

- **`functions/api/gala/marketing-send-now.js` / `marketing-send-queued.js`** — already handle one-off sends to a tier audience via Cloudflare Queues. The new "send to one sponsor" endpoint will follow the same pattern but with a single recipient.

- **`functions/api/gala/admin/sponsor-message.js`** — already does per-sponsor ad-hoc messaging from the Sponsors EditPanel (the existing "Compose email"/"Compose text" buttons in the right-side drawer). **This is the closest existing primitive to what we want.** May be extendable rather than a new endpoint.

- **`marketing_sends` D1 table** — the scheduled pipeline rows (used by marketing-pipeline.js)
- **`marketing_send_log` D1 table** — actual send records (used by marketing-send-log.js)
- **`sponsors` D1 table** — what we already know

## What the new chat needs to build

### Backend: `GET /api/gala/admin/sponsor-pipeline?sponsor_id=X`

Returns the full pipeline schedule with per-row status for that one sponsor:

```json
{
  "sponsor": { "id": 80, "company": "Wicko Waypoint", "sponsorship_tier": "Bronze" },
  "phases": [
    {
      "phase": 1,
      "title": "Phase 1 — The Reset",
      "sends": [
        {
          "send_id": "s1a",
          "title": "Save the Date — Flavor A",
          "date": "2026-05-07",
          "channel": "email",
          "audience": "Confirmed Buyers",
          "subject": "We're grateful for your sponsorship!",
          "would_have_received": true,    // sponsor's tier matched at this send's audience
          "actually_received": true,       // a marketing_send_log row exists for this send_id + sponsor.email
          "received_at": "2026-05-07T16:30:00Z",
          "status": "sent"                 // 'sent' | 'missed' | 'not-targeted' | 'upcoming'
        },
        ...
      ]
    },
    ...
  ],
  "summary": {
    "total_sends": 23,
    "received": 4,
    "missed": 2,             // would_have_received && !actually_received && date < today
    "not_targeted": 12,      // tier didn't match
    "upcoming": 5            // date >= today
  }
}
```

**Implementation notes:**

1. Pull all `marketing_sends` rows (same query as `marketing-pipeline.js` GET).
2. For each send, call `resolveAudience(send.audience, db)` to get the tier list — but cache the result per audience string within the request, since most sends use the same audience strings ("Platinum only", "Confirmed Buyers", etc.).
3. For each send, check whether the sponsor's `sponsorship_tier` is in the resolved tier list → that's `would_have_received`.
4. For each send where `would_have_received === true`, check `marketing_send_log` for a row with `send_id = send.send_id AND recipient_email = sponsor.email AND status = 'sent'` → that's `actually_received`.
5. Status derivation:
   - `would_have_received && actually_received` → `'sent'`
   - `would_have_received && !actually_received && send.date < today` → `'missed'`
   - `would_have_received && !actually_received && send.date >= today` → `'upcoming'`
   - `!would_have_received` → `'not-targeted'`

Add this endpoint as `functions/api/gala/admin/sponsor-pipeline.js` (mirrors `sponsor-message.js`).

### Backend: `POST /api/gala/admin/send-one`

Send a single scheduled message to a single sponsor. Reuses `marketing-send-now.js` plumbing but with:
- Body: `{ sponsor_id, send_id }` — pull subject/body/channel from `marketing_sends` row, recipient from `sponsors` row
- Substitute the sponsor's first name into any `{first_name}` template variables (existing template substitution lives in `marketing-format.js`)
- Append a row to `marketing_send_log` with `send_run_id` of `manual-${timestamp}-${sponsor_id}` so it's distinguishable from batch runs
- Return `{ ok, sent_at, send_log_id }`

Decision needed during build: do we let admin edit the subject/body before send (catch-up emails dated weeks ago might need an "Apologies for the delay" intro), or do we send verbatim from the pipeline?
- **My recommendation:** add an optional `{ subject_override, body_override }` to the POST. Default is verbatim. UI-side, show the message in a Composer-style modal with "Send as-is" / "Edit before sending" pattern.

### Frontend: New "Pipeline" tab in the Sponsors EditPanel

Currently the Sponsors React island has the EditPanel with form fields, the touchpoint timeline on the left, and message-compose buttons at the bottom. Add a third surface — a **Pipeline** view inside the same expanded sponsor row.

Two ways to surface this:

**Option A — new tab inside the expanded row.** EditPanel becomes one tab, "Pipeline" becomes another. Less visual clutter.

**Option B — collapsed-by-default section below the touchpoint timeline.** Title like "Pipeline status (X of Y received)" — click to expand into a timeline of sends with status pills.

**Recommendation: Option B.** Pipeline is informational, not always actionable. Tab pattern is heavier. Section pattern keeps EditPanel as the primary action surface and lets pipeline be a glance-and-act surface.

### Pipeline section UI

For each phase:
- Header with phase title and a tiny progress bar (`4/6 sent`)
- Per-send rows. Each row:
  - Status icon (✓ sent | ⊘ missed | ⏰ upcoming | ◌ not-targeted)
  - Send title + date
  - Channel badge (email/sms)
  - For `missed` status: a subtle **"Send now"** button on the right. Clicking opens a Composer modal pre-filled with the message, allows edit, has a "Send to {sponsor.company}" CTA.
  - For `sent` status: timestamp + "Resend" link (rare, but useful)
  - For `upcoming` status: small note "scheduled for {date}", no action
  - For `not-targeted` status: greyed out, label "Tier doesn't match this send"

**Visual treatment:** match the existing `.gs-touchpoint` timeline styling — same row pattern, same padding, same status-pill style. This shouldn't feel like a new feature, it should feel like the touchpoint timeline got smarter.

### Marketing tab cross-link

On the Marketing tab's pipeline view (the existing one), add a small "Recipients" disclosure under each send row that shows the actual sent count vs. the audience-matched count. If `actual < audience`, surface a link "X sponsors missed this — view in Sponsors tab" that opens the Sponsors tab filtered to those sponsors.

This is optional / nice-to-have / deprioritize if time runs short. The primary deliverable is the Sponsors → Pipeline view.

## Test sponsor for QA

Scott uses **Wicko Waypoint, sponsor id 80** as the safe test target. Bronze tier. Real email but Scott controls it. Use this one for end-to-end testing — pull up the pipeline view, fire a missed send manually, verify the email arrives, confirm `marketing_send_log` got a new row with `send_run_id` starting with `manual-`.

## Edge cases the new chat must handle

1. **Sponsor changes tier.** Bronze → Gold mid-cycle. Past sends to "Platinum only" become `not-targeted` (tier didn't match at send time, fine), past sends to "All Sponsors" remain `sent`/`missed` correctly because tier matched at the time. **Decision: status uses CURRENT tier, not tier-at-time-of-send.** Documented because it's debatable. If this becomes a problem, snapshot the tier at send time in `marketing_send_log`.

2. **Email changed.** Sponsor updated email after some sends went out. The old email is still in `marketing_send_log` for those past sends. `actually_received` lookup should match by `marketing_send_log.recipient_email = sponsor.email OR marketing_send_log.sponsor_id = sponsor.id` — preferably the latter if the schema has it. **Check:** does `marketing_send_log` store `sponsor_id`? If yes, use that. If not, this is a known edge case; document in the IMPL log.

3. **Audience string typos.** If `marketing_sends.audience = "Platnium only"` (typo), `resolveAudience()` returns empty. The pipeline view will show "not-targeted" for everyone. Easy to spot but worth a sanity-check pass during build.

4. **Sponsor is in a tier that wasn't a target.** Cell Phone, Donation, Silent Auction, Trade. These tiers rarely match audience presets. Pipeline view will show mostly "not-targeted." That's correct, not a bug. UI should make this clear — maybe show "This sponsor isn't targeted by any pipeline send" as an empty state if every send is `not-targeted`.

## Out of scope (do NOT build in this chat)

- **Auto-enroll new sponsors in a cadence.** No purchase webhook means no auto-trigger. Manual catch-up is the intentional design.
- **Fix the broken inbound Power Automate sync.** Already disabled (Phase 1 of the previous plan). Stays off.
- **Bloomerang integration.** Separate plan, not blocking.
- **Bulk catch-up ("send all missed sends to all sponsors").** Tempting but dangerous. Per-sponsor manual is the design. Revisit only if catching up 50 sponsors at once becomes a real workflow problem.

## File layout reminder

```
ramonscottf/gala
├── functions/api/gala/
│   ├── _audience.js                  ← READ. resolveAudience() reused.
│   ├── marketing-pipeline.js         ← READ. Schedule source.
│   ├── marketing-send-log.js         ← READ. Log query patterns.
│   ├── marketing-send-now.js         ← READ. Send-fire pattern.
│   ├── marketing-format.js           ← READ. Template substitution.
│   ├── admin/
│   │   ├── sponsor-message.js        ← READ. Closest existing primitive.
│   │   ├── sponsor-pipeline.js       ← NEW. The catch-up endpoint.
│   │   └── send-one.js               ← NEW. Single-recipient send. (Or extend sponsor-message.js)
├── src/admin/sponsors/
│   ├── SponsorRow.jsx                ← EXTEND. Add Pipeline section to expanded row.
│   ├── PipelineSection.jsx           ← NEW. Per-sponsor pipeline UI.
│   ├── api.js                        ← EXTEND. Add loadSponsorPipeline(), sendOneToSponsor().
│   └── theme.css                     ← MAYBE. New status-pill colors if existing don't fit.
└── docs/
    ├── PLAN-sponsor-catch-up.md      ← NEW. (this file, mirrored to project repo)
    └── IMPL-sponsor-catch-up.md      ← NEW. Created when build starts.
```

## Estimated build time

- Backend endpoint (`sponsor-pipeline.js`): 1.5 hr — straightforward join-and-derive logic
- Backend endpoint (`send-one.js` or extend sponsor-message): 1 hr — most logic exists in send-now
- Frontend `PipelineSection.jsx`: 2 hr — phase grouping, status pills, per-row send-now button
- Composer modal pre-fill + send wire-up: 1 hr
- Marketing tab cross-link (optional): 1 hr
- Smoke testing on Wicko: 30 min
- Plan + IMPL log: 30 min

**Total: ~6.5–7.5 hr.** Doable in one focused chat.

## Starter prompt for the new chat

Paste this at the top of the new chat to bootstrap:

```
Continuing the gala dashboard work from a previous chat (2026-05-08).
That chat made D1 the canonical source of truth, killed the xlsx sync,
removed the Tickets tab, and shipped the "+ Add sponsor" button + modal.
PR #32 was merged to main and is live on prod.

This chat's job: build the per-sponsor marketing pipeline view so admins
can see which scheduled sends a given sponsor did/didn't receive and
manually fire missed ones for late-added sponsors.

Read first:
- skippy-plans/plans/2026-05-08-gala-sponsor-catch-up.md (this plan)
- gala/docs/IMPL-twoway-sync-resolution.md (what just shipped)

Then verify the live state of:
- functions/api/gala/marketing-pipeline.js
- functions/api/gala/_audience.js
- functions/api/gala/admin/sponsor-message.js
- src/admin/sponsors/SponsorRow.jsx (last commit f3c3a8c added the EditPanel parity)

Memory-staleness rule applies. Verify before building.

Test target: Wicko Waypoint (sponsor id 80, Bronze tier).
```

## Status log

- 2026-05-08 — Spec written. Awaiting new chat. Previous chat (xlsx sync resolution) hit ~75-80% context and Scott chose to wrap rather than start this build there. Sound call.
