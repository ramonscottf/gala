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

## Phase 1 — today (~4.5 hr)

The bleeding-stop phase. After this: Sponsors EditPanel saves correctly, has feature parity with the legacy Tickets modal, Tickets tab is gone, and xlsx outbound sync is live. Power Automate inbound STILL RUNS (safety net).

**Revised sequencing (2026-05-08, mid-execution):** Initial plan was to remove Tickets tab first. Discovered two issues during code audit:
1. Sponsors React island PATCH route is broken — calls `PATCH /api/gala/sponsors/:id` but the actual route is `PATCH /api/gala/sponsors` with id in body. Saves from Sponsors edit panel currently fail silently. (curl-confirmed.)
2. Sponsors EditPanel doesn't have seats / amount / logoUrl / websiteUrl fields. The legacy Tickets modal is the only place to edit those. Removing Tickets tab without first adding these fields = losing that capability entirely.

New sequence: fix routing, add missing fields to EditPanel, verify parity, THEN remove Tickets tab, THEN build xlsx sync.

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

### Step 1.4 — Provision Azure app (30 min)

Decision tree:
- Try Child Spree app (`ddf5d2a5-...`, tenant `3d9cf274-...`) first.
- portal.azure.com → App registrations → find Child Spree app → API permissions
- If `Files.ReadWrite.All` (Application, admin-consented) is listed → reuse. Generate new client secret in Certificates & secrets, 24-month expiry.
- If not listed → register new app `gala-xlsx-sync`, add `Files.ReadWrite.All` Application permission, click "Grant admin consent."
- Store credentials:
  ```
  wrangler secret put MS_CLIENT_ID
  wrangler secret put MS_CLIENT_SECRET
  wrangler secret put MS_TENANT_ID
  ```

### Step 1.5 — Build worker (~90 min)

Skeleton at `workers/xlsx-sync/`:

```
workers/xlsx-sync/
├── wrangler.toml
├── src/
│   ├── index.js          # router
│   ├── graph.js          # MS Graph token + PATCH helpers
│   ├── outbound.js       # /sync-from-d1 handler
│   └── (inbound.js Phase 2)
└── package.json
```

`wrangler.toml`:
```toml
name = "gala-xlsx-sync"
main = "src/index.js"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "GALA_DB"
database_name = "gala-seating"
database_id = "1468a0b3-cc6c-49a6-ad89-421e9fb00a86"

[[kv_namespaces]]
binding = "KV_GRAPH_TOKEN"
id = "TBD"  # create with: wrangler kv namespace create GRAPH_TOKEN

[vars]
XLSX_DRIVE_PATH = "Shared Drive/Gala/Gala 2026/Sherry/2026 Gala Sales.xlsx"
```

Token caching pattern (Cloudflare Workers MS Graph idiom):

```js
async function getGraphToken(env) {
  const cached = await env.KV_GRAPH_TOKEN.get('token');
  if (cached) return cached;

  const params = new URLSearchParams({
    client_id: env.MS_CLIENT_ID,
    client_secret: env.MS_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', body: params }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error(`Graph auth failed: ${JSON.stringify(data)}`);

  // Cache for 50 min (tokens are 60 min, leave 10 min buffer)
  await env.KV_GRAPH_TOKEN.put('token', data.access_token, { expirationTtl: 3000 });
  return data.access_token;
}
```

Outbound handler:

```js
// POST /sync-from-d1  body: { sponsor_id }
async function handleSyncFromD1(request, env) {
  const { sponsor_id } = await request.json();
  const sponsor = await env.GALA_DB.prepare(
    'SELECT * FROM sponsors WHERE id = ?'
  ).bind(sponsor_id).first();
  if (!sponsor) return new Response('not found', { status: 404 });

  const token = await getGraphToken(env);
  const driveItemUrl = await resolveXlsxDriveItem(token, env); // GET /drives/{id}/root:/{path}:
  const tableName = await resolveTableName(token, driveItemUrl, env); // GET /tables, cached in KV

  // Find row by Company column
  const rowsRes = await fetch(
    `https://graph.microsoft.com/v1.0/${driveItemUrl}/workbook/tables/${tableName}/rows`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { value: rows } = await rowsRes.json();

  // Need column index for "Company" — pull from /columns
  const colsRes = await fetch(
    `https://graph.microsoft.com/v1.0/${driveItemUrl}/workbook/tables/${tableName}/columns`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const cols = (await colsRes.json()).value;
  const companyColIdx = cols.findIndex(c => c.name.toLowerCase() === 'company');

  const matchIdx = rows.findIndex(r => 
    String(r.values[0][companyColIdx]).trim().toLowerCase() === 
    String(sponsor.company).trim().toLowerCase()
  );

  if (matchIdx === -1) {
    await logSync(env, 'outbound', 'sponsor', 'skipped_no_match', { sponsor_id, company: sponsor.company });
    return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
  }

  // Build new row values in column order
  const newRow = cols.map(col => {
    const name = col.name.toLowerCase().replace(/\s+/g, '_');
    return mapSponsorToColumn(sponsor, name);
  });

  await fetch(
    `https://graph.microsoft.com/v1.0/${driveItemUrl}/workbook/tables/${tableName}/rows/itemAt(index=${matchIdx})`,
    {
      method: 'PATCH',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [newRow] }),
    }
  );

  await logSync(env, 'outbound', 'sponsor', 'success', { sponsor_id, row_index: matchIdx });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
```

`mapSponsorToColumn(sponsor, columnName)` is the inverse of the existing `rowToSponsor()` in sheet-webhook.js. Same column names, opposite direction.

### Step 1.6 — Wire Pages PATCH to worker (10 min)

In `functions/api/gala/sponsors.js`, after the successful UPDATE:

```js
// Outbound xlsx sync — fire and forget, don't block response
if (env.XLSX_SYNC_WORKER_URL) {
  context.waitUntil(
    fetch(`${env.XLSX_SYNC_WORKER_URL}/sync-from-d1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsor_id: id }),
    }).catch(() => {}) // failures logged in worker, don't surface to user
  );
}
```

Add `XLSX_SYNC_WORKER_URL` to Pages env vars in CF dashboard.

### Step 1.7 — Remove Tickets tab (45 min)

`public/admin/index.html`:

1. Delete line 1223: `<button class="nav-tab" data-tab="tickets">Tickets</button>`
2. Delete lines 1313-1346: entire `<div class="tab-panel" id="panel-tickets">` block
3. Delete `loadTickets()` function (line 1818)
4. Delete `renderTickets()` function (line 2386)
5. Delete tickets search/refresh handlers around line 2636-2707
6. Delete CSV export builder around line 2840 (for tickets specifically)
7. **Refactor KPI line 1244-1249 ("Tickets Sold")** — currently reads from `ticketInfo.totalTickets`. Change to compute from sponsors data: `sponsors.reduce((sum, s) => sum + (s.seats_purchased || 0), 0)`. Keep the KPI tile, kill the data dependency.

### Step 1.8 — Add the sync-status copy to the React EditPanel (5 min)

The legacy modal copy ("source of truth", "Save to Monday") is gone with the Tickets tab. Add a small status note to `EditPanel` so users understand what saving does:

> Changes save to the gala database and sync to Sherry's spreadsheet within seconds. If Sherry edits the same row in Excel after you save here, her edit wins on the next sync.

Place it as a subtle green callout above the form fields, similar to the legacy modal's `.ticket-editor__sub` styling. Use `var(--text-muted)` color, small font, no border.

### Step 1.9 — Smoke test + deploy

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
