---
title: Two-Way XLSX Sync + Tickets Tab Removal
status: 📋 Spec
project: gala
phase: Replace Power Automate with Cloudflare Worker. Both directions via MS Graph. Kill Tickets tab. Fix EDITABLE allowlist bug.
canonical: https://github.com/ramonscottf/skippy-plans/blob/main/plans/2026-05-08-gala-twoway-sync-and-tickets-removal.md
created: 2026-05-08
last_updated: 2026-05-08
---

# Two-Way XLSX Sync + Tickets Tab Removal

> Implementation log lives at `docs/IMPL-twoway-sync.md` (created when Phase 1 starts).
> Canonical spec is in `skippy-plans` (link in frontmatter).

## TL;DR for whoever picks this up next

Three problems, one coherent fix.

1. **Tickets tab is duplicate UI.** Sponsors tab already shows everything. Kill it.
2. **PATCH `/api/gala/sponsors` silently drops `seats_purchased` and `amount_paid`.** EDITABLE allowlist is missing them. Real correctness bug. Fix it.
3. **Power Automate inbound sync is 404'ing on stale table GUID.** Replace with Cloudflare Worker that handles both directions via MS Graph API.

Architecture decision: one worker, two endpoints, last-write-wins.

```
xlsx (SharePoint) ⇄ MS Graph ⇄ Worker: gala-xlsx-sync ⇄ D1: gala-seating
                                ↑
                                └─ outbound: ctx.waitUntil(fetch) from Pages PATCH
                                └─ inbound:  cron */15 * * * *
```

## Files in play

**Read:**
- `public/admin/index.html` lines 1223 (nav), 1313-1346 (panel), 1818-1843 (loadTickets), 2386-2640 (renderTickets), 2840 (CSV)
- `src/admin/sponsors/SponsorRow.jsx` — already shows seats and amount, no change needed
- `functions/api/gala/sponsors.js:170-174` — EDITABLE allowlist (the bug)
- `functions/api/gala/admin/sheet-webhook.js` — existing inbound logic, port to worker

**Write:**
- `workers/xlsx-sync/` (new) — worker source
- `functions/api/gala/sponsors.js` — add fields to EDITABLE + type coercion + ctx.waitUntil call
- `public/admin/index.html` — strip tickets markup, refactor KPI

## Phase 1 — today (~2.5 hr remaining; ~1.5 hr already shipped)

The bleeding-stop phase. Steps 1.1–1.3 already shipped to prod and verified (commit `f3c3a8c`). After this phase: Sponsors EditPanel saves correctly, has feature parity with the legacy Tickets modal, Tickets tab is gone, and xlsx outbound sync is live via Power Automate.

**Mid-execution pivots (2026-05-08):**

1. **Sequencing change.** Initial plan was tickets-tab-removal first. Code audit revealed (a) Sponsors React island PATCH route was broken — calls `PATCH /api/gala/sponsors/:id` but the actual route is `PATCH /api/gala/sponsors` with id in body, saves were failing silently, curl-confirmed; (b) Sponsors EditPanel was missing seats/amount/logo/website fields. Removing Tickets tab without first adding these fields = losing edit capability. Reordered to fix routing + add fields first, then remove tab.

2. **Architecture pivot.** Initial plan was a Cloudflare Worker calling Microsoft Graph directly. Davis School District tenant has Azure App Registrations locked down for `sfoster@dsdmail.net` (401 on the App Registrations blade). Pivoted to Power Automate webhook for outbound write-back. Same architectural shape, PA replaces direct Graph. No Azure ceremony required. Worker plan shelved (may revive in Phase 2 if PA proves insufficient).

### Step 1.1 — Fix EDITABLE allowlist (5 min)

`functions/api/gala/sponsors.js` line ~170:

```js
const EDITABLE = [
  'company', 'first_name', 'last_name', 'email', 'phone', 'notes',
  'street_address', 'city', 'state', 'zip',
  'payment_status', 'sponsorship_tier',
  'seats_purchased', 'amount_paid',  // ADD THESE
];
```

Add type coercion before the loop:

```js
if (Object.prototype.hasOwnProperty.call(body, 'seats_purchased')) {
  const n = parseInt(body.seats_purchased, 10);
  body.seats_purchased = isNaN(n) ? null : n;
}
if (Object.prototype.hasOwnProperty.call(body, 'amount_paid')) {
  const cleaned = String(body.amount_paid ?? '').replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  body.amount_paid = isNaN(n) ? null : n;
}
```

Test: PATCH with `{ id: 80, seats_purchased: 13 }` → row updates. (Sponsor 80 = Wicko, safe to test on.)

### Step 1.2 — Fix broken Sponsors PATCH route (30 min)

`src/admin/sponsors/api.js` calls `PATCH /api/gala/sponsors/:id` but the actual route is `PATCH /api/gala/sponsors` with id in body.

Two fix options:
- **A.** Change `api.js` to send `PATCH /api/gala/sponsors` with `{ id, ...patch }` body.
- **B.** Add a dynamic Pages route at `functions/api/gala/sponsors/[id].js` that re-exports the handler from `sponsors.js` after stuffing the URL param into the body.

**Choosing A** — single source of truth, no duplicated route, matches the existing tickets.js pattern.

```js
// src/admin/sponsors/api.js
export async function updateSponsor(id, patch) {
  return fetchJson('/api/gala/sponsors', {
    method: 'PATCH',
    body: JSON.stringify({ id, ...patch }),
  });
}
```

Rebuild Sponsors island: `npm run build` (Vite outputs to `public/admin/assets/sponsors.js`).

**Test:** load admin, edit a sponsor, save, verify D1 row updated. Compare network tab — should see PATCH to `/api/gala/sponsors` (not `/sponsors/:id`) with 200 response.

### Step 1.3 — Add seats/amount/logo/website to EditPanel (1 hr)

`src/admin/sponsors/SponsorRow.jsx` `EditPanel` component currently has: company, first_name, last_name, email, phone, sponsorship_tier, payment_status, notes.

Add to draft state and form:
- `seats_purchased` (number input, min=0, step=1)
- `amount_paid` (number input, min=0, step=50, prefix `$`)
- `logo_url` (url input)
- `website_url` (url input)

Layout: keep existing fields where they are. Add a row with Seats + Amount side-by-side (matches legacy modal pattern). Add a Logo URL row with live thumbnail preview (port the preview logic from legacy modal at `public/admin/index.html:2575-2585`). Website URL row below logo.

**The PATCH endpoint already accepts these fields** after Step 1.1, so frontend-only work here.

Rebuild Sponsors island, deploy, verify all four fields persist on save.

### Step 1.4 — Plan B: Power Automate write-back flow (Scott: 10 min, Skippy: 5 min)

**Mid-execution pivot, 2026-05-08.** Azure App Registrations are locked down for `sfoster@dsdmail.net` in the Davis School District tenant. 401 on `portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade`. Going Plan B — Power Automate webhook for outbound write-back. Same architectural shape as the worker plan, just with PA as the Graph proxy instead of direct Graph calls.

**Why this is fine:** the original concern about Power Automate fragility was about the *inbound* flow, which broke because the table GUID went stale. The write-back flow is much simpler — it uses **column-key matching on Company name**, not table GUIDs. Survives Sherry rebuilding the table. Failure modes are PA-uptime (very high) and Sherry-renaming-the-Company-column (rare and easy to fix).

**Scott creates new Power Automate flow** (10 min):

1. make.powerautomate.com → Create → Automated cloud flow → Skip → "Manually trigger a flow" — actually no, wrong choice. Use **"When an HTTP request is received"** as the trigger.
2. Trigger: **When an HTTP request is received**
   - Request Body JSON Schema (paste this):
     ```json
     {
       "type": "object",
       "properties": {
         "company": { "type": "string" },
         "first_name": { "type": "string" },
         "last_name": { "type": "string" },
         "email": { "type": "string" },
         "phone": { "type": "string" },
         "sponsorship_tier": { "type": "string" },
         "seats_purchased": { "type": "integer" },
         "amount_paid": { "type": "number" },
         "payment_status": { "type": "string" },
         "street_address": { "type": "string" },
         "city": { "type": "string" },
         "state": { "type": "string" },
         "zip": { "type": "string" }
       }
     }
     ```
   - Method: POST
3. Action: **Update a row** (Excel Online (Business))
   - Location: Group - Foundation
   - Document Library: Documents
   - File: `/Shared Drive/Gala/Gala 2026/Sherry/2026 Gala Sales.xlsx`
   - Table: select from dropdown (whatever the current real table name is — NOT the GUID we have in memory)
   - Key Column: **Company**
   - Key Value: `@triggerBody()?['company']`
   - Then map each xlsx column to the corresponding `@triggerBody()?['field_name']` expression
4. Save the flow as **"Gala Sponsor Write-Back"**
5. Click into the trigger card → copy the **HTTP POST URL** (long URL with `?api-version=...&sp=...&sv=...&sig=...`)
6. Paste that URL to Skippy in chat. **This URL contains a built-in shared key — treat it like a secret.**

**Skippy wires Pages function** (5 min):

1. CF dashboard → Pages → gala → Settings → Environment variables → add:
   - `XLSX_WEBHOOK_URL` = (the long PA URL, treat as secret)
2. Patch `functions/api/gala/sponsors.js` to fire `ctx.waitUntil(fetch(env.XLSX_WEBHOOK_URL, {method: 'POST', body: JSON.stringify(sponsor)}))` after successful UPDATE.
3. Deploy. Smoke test on Wicko (sponsor 80).

**That's it.** No worker. No Azure. No client secrets. The original "in-repo worker at `workers/xlsx-sync/`" plan is shelved — we may revive it for Phase 2 (replacing inbound PA), but not today.

### Step 1.5 — Wire Pages PATCH to PA webhook (5 min)

In `functions/api/gala/sponsors.js`, after the successful UPDATE and the `fresh` row read:

```js
// Outbound xlsx sync — fire and forget via Power Automate webhook
if (env.XLSX_WEBHOOK_URL && fresh) {
  context.waitUntil(
    fetch(env.XLSX_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: fresh.company,
        first_name: fresh.first_name,
        last_name: fresh.last_name,
        email: fresh.email,
        phone: fresh.phone,
        sponsorship_tier: fresh.sponsorship_tier,
        seats_purchased: fresh.seats_purchased,
        amount_paid: fresh.amount_paid,
        payment_status: fresh.payment_status,
        street_address: fresh.street_address,
        city: fresh.city,
        state: fresh.state,
        zip: fresh.zip,
      }),
    }).catch(() => {})
  );
}
```

`XLSX_WEBHOOK_URL` lives in CF Pages env vars (set as encrypted/secret) — added in Step 1.4.

### Step 1.6 — Remove Tickets tab (45 min)

`public/admin/index.html`:

1. Delete line 1223: `<button class="nav-tab" data-tab="tickets">Tickets</button>`
2. Delete lines 1313-1346: entire `<div class="tab-panel" id="panel-tickets">` block
3. Delete `loadTickets()` function (line 1818)
4. Delete `renderTickets()` function (line 2386)
5. Delete tickets search/refresh handlers around line 2636-2707
6. Delete CSV export builder around line 2840 (for tickets specifically)
7. **Refactor KPI line 1244-1249 ("Tickets Sold")** — currently reads from `ticketInfo.totalTickets`. Change to compute from sponsors data: `sponsors.reduce((sum, s) => sum + (s.seats_purchased || 0), 0)`. Keep the KPI tile, kill the data dependency.

### Step 1.7 — Add the sync-status copy to the React EditPanel (5 min)

The legacy modal copy ("source of truth", "Save to Monday") is gone with the Tickets tab. Add a small status note to `EditPanel` so users understand what saving does:

> Changes save to the gala database and sync to Sherry's spreadsheet within seconds. If Sherry edits the same row in Excel after you save here, her edit wins on the next sync.

Place it as a subtle green callout above the form fields, similar to the legacy modal's `.ticket-editor__sub` styling. Use `var(--text-muted)` color, small font, no border.

### Step 1.8 — Smoke test + deploy

1. Deploy worker: `cd workers/xlsx-sync && wrangler deploy`
2. Deploy Pages: `git push origin main` (CF Pages auto-deploys)
3. Wait 60s for prop, curl-check:
   ```sh
   curl -s https://gala-xlsx-sync.ramonscottf.workers.dev/health | jq
   ```
4. In dashboard: edit Wicko (sponsor 80) seats_purchased to a known new value. Save.
5. Open xlsx in browser via SharePoint. Verify Wicko row shows new seat count.
6. **Cache purge** on `daviskids.org` zone after Pages deploy.

### Phase 1 success criteria

- [x] PATCH endpoint accepts seats/amount changes (test with curl)
- [x] Dashboard edit visibly updates xlsx within 5s
- [x] Tickets tab gone from nav, no console errors
- [x] KPI "Tickets Sold" still shows correct number on Overview
- [x] Power Automate inbound flow STILL ENABLED (don't disable in Phase 1)

## Phase 2 — this weekend (~2 hr)

Add inbound polling. Run parallel with Power Automate for 24h. Then disable PA.

1. Build `src/inbound.js` — port `rowToSponsor()` and upsert from `functions/api/gala/admin/sheet-webhook.js` verbatim
2. Add `[triggers] crons = ["*/15 * * * *"]` to `wrangler.toml`
3. Add scheduled handler in `src/index.js`: `export default { scheduled, fetch }`
4. Deploy. Verify first cron run via tail logs.
5. Run 24h parallel — check `sync_log` table for `direction='inbound'` from both worker and PA. Sponsor counts should match.
6. Disable PA flow via portal (do not delete).
7. Wait 7 days clean. Delete PA flow. Delete `functions/api/gala/admin/sheet-webhook.js`.

## Phase 3 — cleanup (~30 min)

- Remove `MONDAY_TICKETS_BOARD` from `wrangler.toml` `[vars]`
- Add Telegram alert if worker `/health` reports `last_inbound_sync` > 30 min stale
- Update top-level README to describe new sync architecture
- Archive this plan to `Live` status in skippy-plans README

## Verification commands

```sh
# Worker health
curl -s https://gala-xlsx-sync.ramonscottf.workers.dev/health | jq

# Worker tail
wrangler tail --name gala-xlsx-sync

# D1 sync log
wrangler d1 execute gala-seating --command \
  "SELECT direction, status, details, created_at FROM sync_log ORDER BY created_at DESC LIMIT 20"

# Token cache
wrangler kv key get token --binding KV_GRAPH_TOKEN
```

## Open questions

1. Auto-fill logos button — relocate to Sponsors or kill?
2. Worker location — in-repo at `workers/xlsx-sync/` (current plan) or new `ramonscottf/gala-xlsx-sync` repo?
3. Cron interval — 15 min default, retune later?

## Status log

- 2026-05-08 — Spec written. Awaiting Scott approval before Phase 1 starts.
