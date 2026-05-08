---
title: Per-sponsor marketing pipeline view (catch-up) — implementation log
status: ✅ Code shipped (awaiting Scott smoke-test on Wicko id 80)
project: gala (ramonscottf/gala)
plan: docs/PLAN-sponsor-catch-up.md
created: 2026-05-08
last_updated: 2026-05-08
---

# IMPL — Sponsor catch-up

Build executed in one chat, picking up the spec from `docs/PLAN-sponsor-catch-up.md` (mirrored at `skippy-plans/plans/2026-05-08-gala-sponsor-catch-up.md`).

## What shipped

### Backend

**`functions/api/gala/admin/sponsor-pipeline.js`** — `GET ?sponsor_id=N` returns the full marketing pipeline (all phases + sends) annotated with per-row status for that sponsor.

- One D1 round-trip for `marketing_sends`.
- One D1 round-trip for `marketing_send_log` rows for this sponsor — matches by `sponsor_id` OR `recipient_email` (legacy fallback for rows written before sponsor_id was added).
- `resolveAudience()` from `_audience.js` is reused, results cached per audience string (most sends share strings like "Confirmed Buyers" / "Platinum Sponsors", so the cache halves D1 calls in practice).
- Status derivation: `sent` / `missed` / `upcoming` / `not-targeted` per the plan spec.
- Date comparison uses `YYYY-MM-DD` string compare against `new Date().toISOString().slice(0,10)` — works because pipeline dates are stored as ISO date strings, not Date objects.

**`functions/api/gala/admin/send-one.js`** — `POST { sponsor_id, send_id, subject_override?, body_override? }` sends one scheduled message to one sponsor.

- Modeled on `marketing-send-now.js` (which writes to `marketing_send_log`), NOT on `sponsor-message.js` (which writes to `outreach_log`). This was a key correction from the plan: the plan said "extend sponsor-message.js" but those two endpoints log to different tables. Catch-ups need to land in `marketing_send_log` so they show as "sent" in the pipeline view.
- Supports both email AND SMS (the pipeline has both channels).
- `send_run_id = manual-{Date.now()}-{sponsor_id}` — distinguishable from batch runs in the existing send-log UI.
- `audience_label` written as the original audience string (for analytical continuity); falls back to `'(catch-up: per-sponsor)'` if the canonical send had no audience.
- Optional `subject_override` / `body_override` for "Apologies for the delay" intros without mutating the canonical pipeline row.
- `replyTo: env.GALA_ADMIN_EMAIL` matches the existing `sponsor-message.js` pattern.

### Frontend

**`src/admin/sponsors/PipelineSection.jsx`** — Collapsed-by-default section inside the expanded sponsor row. Header shows "X of Y received" plus a "{n} missed" warning badge if any. Click expands to a per-phase, per-send list with status pills.

- Lazy-loads pipeline data on first expand (don't pay the D1 cost for every row, even unopened ones).
- Re-fetches when `refreshKey` prop changes (after a catch-up send).
- Filters out phases where every send is `not-targeted` for this sponsor — keeps the view focused on what matters.
- "Send now" button on `missed` rows (primary). "Resend" link on `sent` rows (text button, less prominent).
- Phone/email-missing disables the action button with a tooltip rather than hiding it (admin can see why they can't send).

**`src/admin/sponsors/CatchUpComposer.jsx`** — Modal pre-filled with the canonical pipeline message. Subject and body are editable. Channel auto-detected from the send row (email / SMS).

- Tracked-changes UI: an "edited" tag appears next to the Message label when admin has typed.
- Submit button label changes to "Send edited email/text" vs "Send to {company}" depending on whether overrides are set.
- SMS char/segment counter for SMS sends.
- Email hint clarifies that the gala wrapper auto-prepends "Hi {first_name},".

**`src/admin/sponsors/api.js`** — Added `loadSponsorPipeline(sponsorId)` and `sendOneToSponsor(sponsorId, sendId, { subjectOverride, bodyOverride })`.

**`src/admin/sponsors/SponsorRow.jsx`** — `<PipelineSection>` inserted between the existing `.gs-exp-grid` (Timeline + EditPanel) and `.gs-exp-footer`. New props: `onSendNow`, `pipelineRefreshKey`.

**`src/admin/sponsors/SponsorsView.jsx`** — New state: `catchup`, `pipelineRefreshKey`. New handlers: `handleSendNow` (opens the composer), `handleCatchupSend` (calls the API, refreshes pipeline + sponsor list). `<CatchUpComposer>` rendered alongside `<Composer>` when active.

**`src/admin/sponsors/theme.css`** — Appended ~150 lines of CSS for `.gs-pipe-*` classes. Reuses existing `--def-*` tokens (no new color decisions). Visual treatment intentionally matches the touchpoint timeline pattern (`.gs-tl-*`) — small circular status icons, two-line rows with title + subtitle.

## What did NOT ship (yet)

**Marketing tab cross-link** — the plan flagged this as nice-to-have. Skipped to keep the build focused on the primary deliverable. Easy follow-up: add a "Recipients" disclosure under each Marketing tab pipeline row showing actual-vs-targeted, with a "view in Sponsors" link.

## Decisions logged

- **Catch-ups land in `marketing_send_log`, not `outreach_log`.** Plan said extend `sponsor-message.js`; in practice that endpoint logs to a different table and would not feed back into the pipeline view. Created a new `send-one.js` that mirrors `marketing-send-now.js` instead.
- **Status uses CURRENT tier, not tier-at-time-of-send.** Documented in the plan as a known trade-off. If a sponsor changed tiers mid-cycle, past sends to "Platinum only" might show as `not-targeted` even though tier was Platinum at the time. Fix path if it bites: snapshot `tier_at_send` into `marketing_send_log` going forward.
- **Email match is case-insensitive.** Used `LOWER(recipient_email) = ?` for the legacy-row fallback. Most production rows have `sponsor_id` set (the `marketing-send-now.js` insert always sets it), so this fallback only kicks in for edge cases.
- **`resend_id` is NOT set on catch-up sends.** The current `_notify.js / sendEmail()` doesn't return the Resend message ID in a way that the calling endpoint captures. Email-event tracking (open / click) won't work for catch-ups until `sendEmail` is updated to return the resend_id. Non-blocking — the catch-up itself sends, gets logged, and shows as `sent` in the pipeline. Added to the project's "future polish" list (informally, here).
- **`audienceCache.has(key)` keys on the audience STRING, not the resolved tiers.** Slightly wasteful if two different audience strings resolve to the same tier list ("All Sponsors" vs "Paid Sponsors" both → P/G/S/B), but vastly simpler than canonicalizing. Acceptable.

## Bug spotted but NOT fixed (out of scope)

`src/admin/sponsors/api.js`'s existing `sendMessage()` (line 47-58) sends `{ message: body }` to `/api/gala/admin/sponsor-message`, but the endpoint reads `body.body` (line 30 of `sponsor-message.js`). The existing Composer flow has been broken since whenever this mismatch was introduced. Did NOT fix in this build — out of scope, doesn't affect catch-up. Flagging here so it's findable. Likely fix: change `message: body` to `body: body` in `api.js`.

## Verification plan

1. Build cleanly (✅ done — `npm run build` passes, all three vite bundles).
2. Push to a branch, open PR, deploy preview.
3. Smoke test on Wicko (sponsor id 80, Bronze tier, Scott's controlled email):
   - Open the Wicko row, expand, click "Pipeline status" → list loads
   - Find a `missed` row → click "Send now" → composer opens with canonical copy
   - Click "Send to Wicko Waypoint" without edits → toast shows "Catch-up sent"
   - Refresh pipeline → that row should now be `sent` with received timestamp
   - Verify `marketing_send_log` row exists with `send_run_id` starting `manual-`
   - Verify email arrives at Scott's inbox

## File layout

```
ramonscottf/gala
├── functions/api/gala/admin/
│   ├── sponsor-pipeline.js          ← NEW
│   └── send-one.js                  ← NEW
└── src/admin/sponsors/
    ├── PipelineSection.jsx          ← NEW
    ├── CatchUpComposer.jsx          ← NEW
    ├── api.js                       ← EXTENDED (loadSponsorPipeline, sendOneToSponsor)
    ├── SponsorRow.jsx               ← EXTENDED (Pipeline section inserted)
    ├── SponsorsView.jsx             ← EXTENDED (catchup state, handlers, modal)
    └── theme.css                    ← EXTENDED (.gs-pipe-* styles)
```

## Status log

- 2026-05-08 — Backend + frontend code complete, builds clean. Awaiting branch push + PR + Scott smoke test.
