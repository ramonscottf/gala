---
title: Gala Sponsor Dashboard — Childspree-Style Redesign + Touchpoint Tracking
status: spec
project: gala
phase: admin-redesign
source_chat: 2026-05-07 Skippy + Scott — sponsor card teardown
created: 2026-05-07
last_updated: 2026-05-07
related:
  - 2026-05-05-gala-repo-migration-everything-to-its-own-repo.md
  - 2026-05-06-gala-portal-flow-unification.md
  - 2026-05-07-gala-marketing-queue-pipeline.md
---

# Gala Sponsor Dashboard Redesign

> **One sentence:** Replace the current sponsor card-grid + drawer-modal with childspree-style expandable rows, surface a per-sponsor touchpoint timeline (sent → opened → clicked → picked → finalized → replied), and do it on a React island that becomes the foundation for a unified DEF Events admin shell.

## Why this exists

Scott walked the live sponsor dashboard at `gala.daviskids.org/admin/` on May 7 and named three problems:

1. **The card grid wastes the row.** Each card is a fixed-height tile that holds name, tier, payment dot, contact, and 5 buttons. Big Bronze sponsors and tiny Individual seats sponsors get the same footprint. With 79 sponsors, you scroll a lot to find the 2-3 that need attention.
2. **The drawer modal breaks flow.** Clicking a sponsor opens a full-screen overlay. You lose your scroll position, you can't compare two sponsors side-by-side, and editing requires open → edit → save → close → re-find your spot. The childspree admin doesn't do this — it expands inline. That pattern is better and we already use it elsewhere.
3. **There's no view of the journey.** The card shows ONE state ("Not invited" / "Invited" / "Selected seats ✓"). It does not show whether the email was opened, whether the link was clicked, whether the sponsor started picking seats and stalled, or whether they replied to the invite. Scott needs to see "this sponsor opened the email three times but never clicked the portal link" so he can call them, not blast them with a fourth nudge.

The deeper goal: **DEF runs multiple events** (Gala, Golf Tournament, Child Spree, eventually others). Today they live in different repos with different admin UIs. Scott wants one DEF-branded admin shell with an event switcher at the top. Each event keeps its own accent color (gala = navy/red gradient, child spree = pink, golf = green) but everything else feels like one product. **This redesign is phase one of that consolidation.** Pick the stack and patterns now that will carry to the unified shell — don't rewrite the gala admin in vanilla JS just to rewrite it again later.

## What "done" looks like

A DEF staff member opens `gala.daviskids.org/admin/` and lands on the Sponsors tab. They see:

1. **Six KPI cards across the top** — Total / Not Invited / Invited / Opened / Selected / Stalled. Numbers update as data changes.
2. **One row per sponsor**, full width, sorted by status urgency (stalled first, then not invited, then in-progress, then complete).
3. **Each row's collapsed header shows:** sponsor name, tier badge, current status pill, a four-pill mini pipeline (Invite → Opened → Picked → Finalized) where each pill is green ✓ if done, gray if pending, red ⚠️ if started-but-stalled, contact line, contextual quick-action buttons (Text/Email if not invited; Copy link/Resend if invited; Nudge if stalled; Preview if completed).
4. **Click anywhere on the row header to expand inline.** No modal. No overlay. The row grows downward to show two columns: **Touchpoint Timeline** on the left (chronological log of every email send, every open, every click, every seat-pick event, every reply, every finalize) and **Edit Form** on the right (contact info, tier, payment, notes, seat-selector link). Click the row header again to collapse.
5. **The expand/collapse is sticky to the row position.** Scroll position doesn't jump. Two rows can be open at once (or zero — Scott's choice; default to one-open-at-a-time matching childspree).
6. **Filter pills work as today** (All / Platinum / Gold / Silver / Bronze) but are joined by status filters (All / Stalled / Not Invited / Open Loop / Complete).
7. **The "Send invites" dispatcher row stays where it is** at the top of the tab — nothing about that flow changes.

A sponsor named America First Credit Union who was invited 2 days ago, opened the email twice, clicked the link, picked 4 of 14 seats, and hasn't returned, will appear with these pipeline pills: ✓ Invite, ✓ Opened, ⚠️ Picked seats (yellow — started but not done), ☐ Finalized. Scott sees that at a glance, expands the row, sees the timeline, sees the last activity was 36 hours ago, hits "📱 Nudge" and sends a one-tap text. Total time: 15 seconds. That's the bar.

## Hard rules

- **React island, not vanilla.** Build the new sponsors view as a Vite-built React island that mounts into a `<div id="sponsors-mount"></div>` placeholder inside `public/admin/index.html`. Same pattern as the existing editor mount. The rest of admin/index.html (Overview, Tickets, Movies, Volunteers, Marketing tabs) stays untouched in this phase. Only the Sponsors tab gets replaced.
- **Component library is pulled from childspree, then promoted to a shared workspace later.** In phase 1, the `<SponsorRow>`, `<TouchpointTimeline>`, `<KpiStrip>`, `<StatusPill>` components live in `src/admin/sponsors/` inside the gala repo. In a future phase (out of scope here), those components move to a `defined-events/shared` workspace or npm package and child spree adopts them. **Do not try to share code with childspree in this phase.** That's a future project. Building it now would block this redesign on a much larger refactor.
- **DEF brand tokens live in CSS variables, event accents override them.** Define `--def-navy: #0d1b3d`, `--def-cream`, `--def-text` etc. as the base brand. Event-specific accents — `--event-accent: #dc2626` (gala red), `--event-accent-soft: #fbeaea` — are overridden in a `.event-gala` wrapper class. Child Spree later adds `.event-childspree { --event-accent: #ec4899; }`. Buttons, focus rings, status pills use `var(--event-accent)`. Layout, typography, spacing use `var(--def-*)`. This is the unified-platform foundation.
- **Email tracking goes through `mail.fosterlabs.org` only.** Don't add a new mail provider. The existing `/send` endpoint adds tracking pixel + link rewrites. The existing `/inbox` already receives replies. We just need to expose new endpoints (or extend the response shape of existing ones) that the gala backend can query.
- **Don't break the legacy drawer immediately.** Keep `openSponsorDrawer` callable from anywhere else in the codebase (other tabs may link to it) but stop using it from the new Sponsors view. Mark it `// LEGACY — deprecated by sponsors React island, May 2026` and plan to remove in a follow-up phase once nothing references it.
- **Touchpoint events are stored in their own table**, not bolted onto `sponsors`. New table `sponsor_touchpoints` with columns `(id, sponsor_id, event_type, occurred_at, channel, metadata_json, source)`. Events flow IN from: marketing_send_log inserts (sent), mail.fosterlabs.org webhooks (opened/clicked/replied), portal API events (picked/finalized). The dashboard reads OUT from this table to render the timeline. **Keep touchpoint storage decoupled from `marketing_send_log`** — the latter is "what we sent," the former is "everything that happened." A single send row generates: 1 'sent' touchpoint, eventually N 'opened' touchpoints, eventually 1 or more 'clicked' touchpoints. Don't try to extend marketing_send_log to track opens.
- **Status pills are derived, not stored.** Don't add `email_opened`, `link_clicked`, `last_activity_at` columns to `sponsors`. Compute them on read by joining `sponsor_touchpoints`. Yes, this means every list query joins. With 79 sponsors and ~400 touchpoint rows, this is fine. Only optimize if the dashboard becomes slow with real data — and even then, materialize a view, don't denormalize.
- **No design changes to the sponsor portal**, the seating chart, the volunteer signup, or any other surface. This phase touches `gala.daviskids.org/admin/` and the mail worker only.
- **No pre-existing sponsor data migration.** Touchpoint history starts the day this ships. We do not retroactively populate touchpoints from `marketing_send_log` — the timeline starts blank for past sends and fills forward. (If Scott pushes back on this, it's a 30-min one-time backfill script — call it as a sub-task. But default is no.)

## Phasing

Three sub-phases. Each is independently shippable. Phase A is the visible UI win; Phase B adds the open/click tracking; Phase C adds reply detection.

### Phase A — UI redesign + sent/picked/finalized timeline (the visible win)

**Scope:** New React island for the Sponsors tab. Touchpoint table with `sent`, `picked`, `finalized` event types. Timeline UI shows those three event categories. Quick actions wired up. Inline edit form replaces drawer.

**What's in:**
- New table `sponsor_touchpoints` (migration `004_sponsor_touchpoints.sql`)
- New endpoint `GET /api/gala/admin/sponsors-with-touchpoints` returning sponsors + their touchpoint arrays in one call (avoid N+1)
- New endpoint `GET /api/gala/admin/touchpoints/:sponsor_id` for re-fetching after action
- Hook in `functions/api/gala/admin/send-invites.js` to insert a `sent` touchpoint row alongside the existing `marketing_send_log` insert
- Hook in `functions/api/gala/portal/[token]/pick.js` to insert a `picked` touchpoint row when seats are placed (one row per pick batch, with seat count in metadata)
- Hook in `functions/api/gala/portal/[token]/finalize.js` to insert a `finalized` touchpoint row
- New Vite config `vite.sponsors.config.js` mirroring `vite.admin.config.js` but for the sponsors island, output to `public/admin/assets/sponsors.js`
- New build script `npm run build:sponsors` and add it to the main `build` script
- New source dir `src/admin/sponsors/` with: `index.jsx` (entry), `SponsorsView.jsx`, `SponsorRow.jsx`, `TouchpointTimeline.jsx`, `KpiStrip.jsx`, `StatusPill.jsx`, `PipelinePills.jsx`, `EditForm.jsx`, `api.js`, `theme.css`
- Mount-point swap in `public/admin/index.html`: replace the contents of `<div class="tab-panel" id="panel-sponsors">` with `<div id="sponsors-mount"></div>` and `<script src="/admin/assets/sponsors.js"></script>`
- Status filter additions to the filter bar (Stalled / Not Invited / Open Loop / Complete) — implemented in JSX, no API change needed
- Sort order: stalled first → not invited → invited → opened → picked → finalized. Within each group, sort by `last_activity_at DESC`.
- KPI strip computes counts client-side from the loaded sponsor list

**What's out:**
- Email opens, clicks, replies (Phase B + C)
- Backfilling touchpoints from marketing_send_log
- Cross-event admin shell (`<EventSwitcher>`) — that's a future phase
- Any UI changes to other admin tabs

**Risk + rollback:**
- The new island is gated by the existing tab system (clicking Sponsors tab shows the mount div). If the React build is broken, the tab is empty but the rest of admin works. Easy rollback: revert the index.html change (swap the placeholder div back to the original markup, run `npm run build`, deploy).
- Database migration is additive (new table only), so rollback is "leave the table empty, ignore it."

**Acceptance test:**
1. Scott opens `gala.daviskids.org/admin/`, clicks Sponsors tab. Sees the new layout. KPI strip shows correct counts.
2. Scott clicks a sponsor row. It expands inline (no modal). He sees the timeline (with at least the existing `Sent` events from any new sends post-deploy) and the edit form side-by-side.
3. Scott edits the contact email and clicks Save. Page does not reload. Row updates in place.
4. Scott clicks the row header again. It collapses.
5. Scott sends a new platinum invite via the dispatcher. After ~3 seconds (revalidation), the affected sponsors show a fresh "Sent" touchpoint at the top of their timelines.
6. A test sponsor walks the portal at `gala.daviskids.org/sponsor/{token}`, picks 2 seats, finalizes. Within 5 seconds of refresh, that sponsor's timeline in admin shows `Picked 2 seats` and `Finalized`.

**Estimated effort:** 1–2 sessions of focused build. ~1,400 lines of new JSX, ~200 lines of new functions/api work, one D1 migration.

### Phase B — Email opens + click-through tracking

**Scope:** Update the mail worker to inject a tracking pixel and rewrite outbound links. Receive open/click pings on a webhook. Insert touchpoints. Render in timeline.

**What's in:**
- Mail worker change: when a send goes out, append `<img src="https://mail.fosterlabs.org/track/open/{message_id}.gif" width="1" height="1">` before `</body>` in the HTML
- Mail worker change: rewrite all `<a href="...">` to `<a href="https://mail.fosterlabs.org/track/click/{message_id}?u=...">`
- Mail worker change: new `GET /track/open/:message_id.gif` returns 1x1 transparent gif and POSTs to gala webhook
- Mail worker change: new `GET /track/click/:message_id?u=...` 302s to the original URL and POSTs to gala webhook
- New gala endpoint `POST /api/gala/webhooks/mail-event` accepts `{message_id, event_type, occurred_at, user_agent, ip}`, looks up `marketing_send_log` row by message_id, derives sponsor_id from there, inserts a `sponsor_touchpoints` row
- The mail worker needs to know how to call the gala webhook — add an env var `GALA_WEBHOOK_URL` and a shared secret `GALA_WEBHOOK_SECRET`
- Timeline component picks up `opened` and `clicked` event types and renders new icon variants
- Pipeline pill `Opened` lights up green when at least one `opened` touchpoint exists
- KPI "Opened" count becomes meaningful (was 0 in Phase A)

**What's out (deferred to Phase C):**
- Reply detection
- "Email opened by Outlook prefetch vs by human" disambiguation (it's a known false-positive issue with Microsoft prefetch — call it out, don't try to solve it)

**Risk + rollback:**
- Pixel/link tracking is well-understood territory; the failure mode is "tracking doesn't fire, timeline misses some events" — which is recoverable, not destructive.
- Some corporate email clients strip images by default. That means the pixel won't fire for those recipients. The click-tracking link rewrite still works regardless. So we'll always have at least click-detection.
- Outlook safe-link prefetch will register false-positive opens. Document this in the timeline UI: a tiny `i` next to "Opened" with a tooltip explaining "Some email security systems pre-open emails to scan for threats — opens within 60 seconds of send may be from a security scanner, not the recipient."

**Acceptance test:**
1. Scott sends a test invite to his own gmail. He opens it. Within 30 seconds, the sponsor's timeline shows `Opened`.
2. He clicks the seat-picker link. Within 30 seconds, the timeline shows `Clicked link → Sponsor portal`.
3. He sends a second test to a Microsoft-protected address (e.g. a `dsdmail.net` address). The timeline shows an `Opened` event within 5 seconds of send (this is the prefetch — confirm the warning UI is present).

**Estimated effort:** 1 session. Most of the work is in the mail worker, not gala.

### Phase C — Reply detection

**Scope:** When a sponsor replies to an invite or marketing email, surface that as a `replied` touchpoint at the top of their timeline. The mail worker's `/inbox` already receives inbound mail.

**What's in:**
- Mail worker change: when a new inbound email is received and indexed, check if the From address matches a known gala sponsor's email (via a lookup the gala backend exposes, OR by storing sponsor emails in the mail worker — TBD in Phase C planning)
- If matched, POST to the gala webhook with `event_type: 'replied'` plus a snippet of the reply body
- Reply touchpoint renders in timeline with the reply body preview (first 200 chars) and a "View thread" link to the full thread in the mail worker UI
- New status filter: "Awaiting reply review" — sponsors who replied but no admin has marked the reply as handled
- Per-touchpoint "mark as handled" action that adds a `handled_at` to the touchpoint row

**What's out:**
- AI-summarized replies (could be a Phase D — out of scope)
- Auto-replying (definitely not — Skippy never replies on Scott's behalf without explicit per-message approval)

**Acceptance test:**
1. Scott sends a test invite to a gmail address that's listed as a sponsor's contact email.
2. The recipient replies to the invite.
3. Within 60 seconds, the sponsor's timeline shows `Replied: "Hi, we'd love to come but only need 8 of our 12 seats..."` with a View thread link.
4. Scott clicks "Mark as handled." The touchpoint dims to indicate it's been addressed.

**Estimated effort:** 1 session, mostly worker-side.

## Schema

### `sponsor_touchpoints` (new, migration 004)

```sql
CREATE TABLE IF NOT EXISTS sponsor_touchpoints (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sponsor_id    INTEGER NOT NULL,
  event_type    TEXT NOT NULL,    -- 'sent' | 'opened' | 'clicked' | 'picked' | 'finalized' | 'replied' | 'note'
  channel       TEXT,             -- 'email' | 'sms' | 'portal' | null for portal events
  occurred_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  metadata_json TEXT,             -- JSON blob: subject, snippet, seat_count, click_url, etc.
  source        TEXT,             -- 'send-invites' | 'mail-webhook' | 'portal-pick' | 'admin-manual'
  handled_at    TEXT,             -- nullable, set when admin marks a 'replied' as addressed
  related_send_id TEXT,           -- nullable, links 'opened'/'clicked' back to marketing_send_log
  FOREIGN KEY (sponsor_id) REFERENCES sponsors(id)
);

CREATE INDEX idx_touchpoints_sponsor ON sponsor_touchpoints (sponsor_id, occurred_at DESC);
CREATE INDEX idx_touchpoints_event ON sponsor_touchpoints (event_type, occurred_at DESC);
CREATE INDEX idx_touchpoints_send ON sponsor_touchpoints (related_send_id);
```

### Derived sponsor status (computed in `GET /api/gala/admin/sponsors-with-touchpoints`)

```
status = (
  CASE
    WHEN exists(touchpoint where event_type='finalized')   THEN 'complete'
    WHEN exists(touchpoint where event_type='picked')
         AND last_activity_at < now() - 48h                 THEN 'stalled-picking'
    WHEN exists(touchpoint where event_type='picked')      THEN 'picking'
    WHEN exists(touchpoint where event_type='clicked')
         AND last_activity_at < now() - 72h                 THEN 'stalled-clicked'
    WHEN exists(touchpoint where event_type='clicked')     THEN 'clicked'
    WHEN exists(touchpoint where event_type='opened')      THEN 'opened'
    WHEN exists(touchpoint where event_type='sent')        THEN 'invited'
    ELSE 'pending'
  END
)
```

The `stalled-*` states are the ones that drive the red ⚠️ pill in the UI. Thresholds (48h, 72h) are tunable — start with these, revisit if Scott says they fire too often or too rarely.

## API surface (new endpoints)

| Method | Path | Purpose | Phase |
|--------|------|---------|-------|
| GET | `/api/gala/admin/sponsors-with-touchpoints` | List view payload, sponsors + recent touchpoints | A |
| GET | `/api/gala/admin/touchpoints/:sponsor_id` | Full touchpoint history for one sponsor | A |
| POST | `/api/gala/admin/touchpoints/:sponsor_id/note` | Admin adds a manual note (event_type='note') | A |
| POST | `/api/gala/admin/touchpoints/:tp_id/handle` | Mark a 'replied' touchpoint as handled | C |
| POST | `/api/gala/webhooks/mail-event` | Receives open/click events from mail worker | B |
| POST | `/api/gala/webhooks/mail-reply` | Receives inbound reply events from mail worker | C |

Webhook endpoints require shared-secret auth (`X-Webhook-Secret` header). Existing admin endpoints stay behind the existing admin auth (DSD Microsoft SSO).

## Component tree (Phase A)

```
src/admin/sponsors/
  index.jsx                  // mount, theme provider, error boundary
  SponsorsView.jsx           // top-level: KpiStrip + filter bar + InviteDispatcher + list
  KpiStrip.jsx               // 6 metric cards
  FilterBar.jsx              // tier pills + status pills + search input
  InviteDispatcher.jsx       // existing send-invites action row, ported
  SponsorList.jsx            // virtualized list of SponsorRow (use react-window if >100 sponsors)
  SponsorRow.jsx             // collapsed header + expanded details, owns its open/closed state
  PipelinePills.jsx          // the 4-pill mini-pipeline shown in collapsed state
  StatusPill.jsx             // tier badge, status badge — semantic color from theme
  TouchpointTimeline.jsx     // chronological list of touchpoints with icons
  TouchpointRow.jsx          // single timeline entry
  EditForm.jsx               // contact + tier + payment + notes form (mirrors current drawer)
  QuickActions.jsx           // contextual buttons (Text/Email/Copy/Resend/Nudge/Preview)
  api.js                     // fetch helpers, all endpoints in one place
  theme.css                  // DEF brand variables + .event-gala accent overrides
```

State management: Zustand or `useReducer` + `useContext`. Don't pull in Redux. ~300 lines of state code, no need for the heavy ceremony.

Data fetching: TanStack Query (already common in the React ecosystem) OR a simple `useSWR`-style hook in `api.js`. Pick whichever has lighter bundle impact. Probably the latter, since this is one screen, not an app.

## Mail worker changes (Phase B + C, separate repo)

The mail worker is a separate repo (not in fosterlabs, not in gala — owned by the SkippyMail service). Changes there are:

- Add `injectTrackingPixel(html, message_id)` to `/send` handler
- Add `rewriteLinks(html, message_id)` to `/send` handler
- Add `GET /track/open/:message_id.gif` — returns 1x1 gif, async-fires webhook
- Add `GET /track/click/:message_id` — 302 redirects, async-fires webhook
- Add inbound-reply hook to existing `/inbox` ingest path — looks up sponsor by From address (via gala backend `GET /api/gala/admin/sponsor-by-email/:email`), if matched, fires `/api/gala/webhooks/mail-reply` with body snippet
- Add new env vars: `GALA_WEBHOOK_URL`, `GALA_WEBHOOK_SECRET`, `GALA_LOOKUP_URL`
- Add new env vars: deploy via `wrangler secret put`

These are documented separately when Phase B is started. **The Phase A plan is independent of the mail worker — it ships and is useful before any mail worker changes happen.**

## Open questions (to resolve before starting Phase A)

1. **Two rows open at once, or one-at-a-time?** Childspree is one-at-a-time. Default to that. Scott can change his mind after using it.
2. **Touchpoint timeline retention.** Indefinite? Or roll up old events? Default: indefinite for this event cycle; revisit when 2027 gala starts.
3. **Should "manual notes" be a touchpoint type?** The schema includes `event_type='note'` for admin-added notes that show up in the timeline (e.g. "Called Mandy at 4pm — she'll get back to me Thursday"). This makes the timeline a true CRM-lite log. **Default: yes, ship it in Phase A.** Single new action button in the expanded view.

## Definition of done for the whole plan (all three phases)

Scott can open the gala admin sponsors tab and answer these four questions in under 30 seconds without leaving the page:

1. Which sponsors haven't been invited yet?
2. Which sponsors got the invite but never opened it?
3. Which sponsors opened the invite, started picking seats, and stalled?
4. Which sponsors replied and need a human response?

Today, only Q1 is answerable. Q2–Q4 require checking inboxes, pulling marketing_send_log queries, and guessing. After this plan ships, all four are visible at a glance.

## Plan persistence — REQUIRED before next chat picks this up

This plan lives in two places:
- `ramonscottf/skippy-plans/plans/2026-05-07-gala-sponsor-dashboard-redesign.md`
- `ramonscottf/gala/docs/PLAN-sponsor-dashboard-redesign.md`

Both must be committed and pushed before this chat ends. README in skippy-plans must list this plan with `status: spec`. Status moves to `in-progress` when the next chat starts Phase A; status moves to `live` only after Scott has clicked through the new sponsors tab on production and confirmed it works.
