---
title: IMPL — Two-way XLSX sync abandoned, D1 made canonical, Tickets tab removed
status: ✅ Code shipped
project: gala
phase: Plan resolution. See PLAN-twoway-sync-and-tickets-removal.md for the full reasoning chain (three architectural pivots in one chat) and skippy-plans for the cross-project canonical version.
created: 2026-05-08
last_updated: 2026-05-08
---

# Implementation Log — 2026-05-08

> **TL;DR for next session:** Pivoted from "build two-way xlsx sync" to "make D1 canonical, kill xlsx sync entirely" mid-execution after exhausting the simpler alternatives. Tickets tab gone. Sponsors EditPanel has full feature parity with the legacy modal plus sync-status copy. New "Add sponsor" button + modal for creating sponsors directly. Snapshot CSV export upgraded for board reports. Inbound Power Automate flow needs to be turned off by Scott in the PA UI.

## What shipped

Three commits over the course of the session, in this order:

### Commit `f3c3a8c` — Phase 1 Steps 1.1–1.3 (early in session)

**`functions/api/gala/sponsors.js`** — PATCH endpoint hardening:
- Added `seats_purchased`, `amount_paid`, `logo_url`, `website_url` to the EDITABLE allowlist. Previously these fields were silently dropped on PATCH because they weren't in the list — a real correctness bug.
- Added type coercion for `seats_purchased` (parseInt) and `amount_paid` (parseFloat with `$`/comma stripping).

**`src/admin/sponsors/api.js`** — fixed broken Sponsors React island PATCH route. Was calling `PATCH /api/gala/sponsors/:id` (route doesn't exist), now calls `PATCH /api/gala/sponsors` with `{ id, ...patch }` body. Saves from the Sponsors edit panel had been failing silently — curl-confirmed before fix.

**`src/admin/sponsors/SponsorRow.jsx`** — `EditPanel` parity with legacy Tickets modal:
- Added Seats, Amount ($), Logo URL (with live thumbnail preview), Website URL fields
- Improved `dirty` check via new `cmp()` function to handle null/undefined/numeric coercion correctly across initial load → edit → revert cycles

### Commit (this commit) — Tickets removal + D1 canonical + Add Sponsor

**`public/admin/index.html`** — Tickets tab fully removed:
- Nav button at line 1223 (`<button data-tab="tickets">`)
- Entire `<div id="panel-tickets">` block (was lines 1313–1346)
- 165 lines of dead `.ticket-editor` and `.tickets-*` CSS
- 325 lines of JS: `loadTickets()`, `renderTickets()`, `openTicketEditor()`, `ensureTicketEditor()`, `saveTicketEditor()`, `initialsOf()`, `displayHost()`, `escapeHtmlD()`, the `ticket-search`/`autofill-logos`/`export-tickets-btn` event handlers
- `ticketsData` state declaration

**KPI refactor:** `loadAllData()` was reading `totalAmount` and `totalTickets` from `loadTickets()`'s response. Refactored to compute both from the sponsors data the function already loads. The "Tickets Sold" KPI tile on the Overview tab still renders correctly with no API change.

**Snapshot CSV upgrade:** the existing `export-sponsors-btn` handler now produces a 13-column CSV including phone, address, city, state, zip — sufficient for Sherry's board reports. UTF-8 BOM added so Excel renders accents and ampersands correctly. Filename now dated: `gala-sponsors-2026-05-08.csv`. Button label changed from "Export CSV" to "Download snapshot" to make purpose clearer.

**`src/admin/sponsors/SponsorRow.jsx`** — added a green callout above the EditPanel form:

> Saved to the gala database. As of May 2026, this dashboard is the canonical source — Sherry's spreadsheet is no longer kept in sync. Use **Download snapshot** on the Sponsors tab when you need a snapshot for board reports.

**`src/admin/sponsors/AddSponsor.jsx`** — NEW component, 290 lines. Modal for creating sponsors / ticket purchases. Field set matches EditPanel + Logo URL with live thumbnail. Validates: company name required, blocks duplicate emails and duplicate company names with a clear 409 error. Same `.gs-modal-bg`/`.gs-modal` styling as Composer for visual consistency.

**`src/admin/sponsors/SponsorsView.jsx`** — wired AddSponsor:
- `+ Add sponsor` primary button on the searchbar row (always visible, doesn't scroll out of view)
- Click opens the modal
- On successful create, the modal closes, toast confirms, list refreshes, and the new row auto-expands so the user immediately sees what they just created

**`src/admin/sponsors/api.js`** — added `createSponsor(data)` helper.

**`functions/api/gala/sponsors.js`** — NEW `onRequestPost` handler for `POST /api/gala/sponsors`:
- Validates `company` is non-empty
- Normalizes tier via existing `normalizeSponsorTier()`
- Type-coerces `seats_purchased` and `amount_paid`
- Lowercases email to match existing convention
- Pre-flight duplicate check: 409 if email already exists, 409 if company name already exists (case-insensitive). Error messages include the existing record's id and company so the user knows where to find it.
- INSERT with `created_at`/`updated_at` set to `datetime('now')`
- Returns `{ sponsor, id }` so the caller can immediately navigate to the new record

## What did NOT ship (and why)

**Two-way xlsx sync.** Three pivots happened during the session before landing on "don't do it":

| Pivot | Trigger | Decision |
|---|---|---|
| A — Sequencing | Code audit revealed Sponsors React PATCH route was broken AND missing seats/amount/logo/website fields | Reorder: fix routing + add fields first, THEN remove tickets, THEN sync |
| B — Architecture | Davis tenant locks Azure App Registrations for sfoster@dsdmail.net (401 on the App Registrations blade) | Pivoted from Worker+MS Graph to Power Automate webhook for outbound write-back |
| C — Whole approach | Sherry's xlsx has no formal Excel Table object — Power Automate can't see a table to update if it isn't formatted as one. Could have run Claude in Excel to add the Table format, but Scott talked it through with Kara mid-chat | Made D1 canonical. Sherry stops editing the xlsx. Dashboard is the working tool. xlsx becomes an on-demand snapshot via the upgraded CSV export. Eliminates the entire sync problem. |

**Cloudflare Worker `gala-xlsx-sync`** — abandoned with Pivot B. Never created.

**Power Automate `Gala Sponsor Write-Back` flow** — half-built earlier in session, abandoned with Pivot C. Scott needs to manually delete from make.powerautomate.com.

**MS Graph integration** — entirely abandoned with Pivot B.

## What Scott still has to do (manual)

1. **Disable the broken inbound flow.** make.powerautomate.com → My flows → "Gala Sponsors Sync" → "Turn off" in the top toolbar. Don't delete (we keep it for ~30 days as a column-mapping reference). It's been failing every 2 hours all day with a 404 on a stale Excel table GUID.

2. **Delete the half-built Write-Back flow.** make.powerautomate.com → My flows → "Gala Sponsor Write-Back" → Delete. It has a trigger but no functional action. Pointless now.

3. **Phase 2: Tell Sherry.** Per v5 system instructions on Sherry sensitivity, frame this forward-looking, never as a comparison to her prior process. Talking points:
   - Dashboard is the source of truth now
   - She doesn't need to maintain `2026 Gala Sales.xlsx` as a working file
   - "Download snapshot" button on the Sponsors tab gives her a fresh CSV whenever she needs one for board reports
   - Her edits to the xlsx going forward won't flow anywhere — the inbound sync is disabled

## Phase 3 cleanup (queued, not blocking)

- Delete `functions/api/gala/admin/sheet-webhook.js` (no longer receives anything)
- Delete `functions/api/gala/tickets.js` (tickets tab gone, only used by the deleted modal)
- Remove `MONDAY_TICKETS_BOARD` from `wrangler.toml` `[vars]`
- After 30 days clean: delete the disabled `Gala Sponsors Sync` PA flow
- Update top-level README to describe new "D1 canonical, dashboard primary, xlsx is a snapshot" architecture

## Verification commands

```sh
# After deploy, check bundle size
curl -sI https://gala.daviskids.org/admin/assets/sponsors.js | grep -i content-length

# D1: confirm new sponsor inserts work via the new endpoint
# (run from Scott's machine via wrangler — uses GALA_DASH_SECRET cookie auth in browser)

# Cache purge for daviskids.org zone (already automated in deploy step)
curl -X POST "https://api.cloudflare.com/client/v4/zones/e9aac6e9fab72eae9eda35335bc47f40/purge_cache" \
  -H "X-Auth-Email: ramonscottf@gmail.com" \
  -H "X-Auth-Key: $CF_AUTH_KEY" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://gala.daviskids.org/admin/assets/sponsors.js","https://gala.daviskids.org/admin/assets/sponsors.css","https://gala.daviskids.org/admin/"]}'
```

## Files touched this commit

```
M public/admin/index.html        (-490 lines: tickets tab + CSS + JS, +20: KPI refactor + snapshot upgrade)
M src/admin/sponsors/SponsorRow.jsx  (+13 lines: D1-canonical callout)
M src/admin/sponsors/SponsorsView.jsx  (+25 lines: Add Sponsor wiring)
M src/admin/sponsors/api.js      (+7 lines: createSponsor)
A src/admin/sponsors/AddSponsor.jsx  (+290 lines: new modal)
M functions/api/gala/sponsors.js  (+115 lines: onRequestPost CREATE handler)
M public/admin/assets/sponsors.js  (rebuilt: 167KB → 174KB)
M public/admin/assets/sponsors.css  (rebuilt: unchanged)
M docs/PLAN-twoway-sync-and-tickets-removal.md  (rewritten for Pivot C)
A docs/IMPL-twoway-sync-resolution.md  (this file)
```

## Key learnings (for the canonical record)

1. **Memory-staleness rule paid off.** The plan repeatedly said "verify against live repo before acting." Every pivot was triggered by reality not matching the plan: broken PATCH route, missing fields, locked Azure tenant, missing Excel Table format. Cloning fresh and grep'ing was the difference between shipping working code and shipping plausible-looking code.

2. **Three pivots in one chat is a lot.** The pattern that made this OK: each pivot was committed to both repos before moving on, README status updated each time, IMPL log written before the final push. Future sessions reading this won't have to retrace the reasoning.

3. **The simplest answer is often the right one.** The original plan was a Cloudflare Worker, MS Graph API, KV-cached tokens, retry logic, conflict resolution, dual-direction sync, parallel-run with PA for verification. The actual answer was: stop syncing, make one side authoritative, export snapshots on demand. Same business outcome, ~15% of the code.

4. **Sherry sensitivity is real and matters.** The plan calls out specifically: forward-looking framing, no comparison to prior process. The Phase 2 conversation Scott has with Sherry is more important than any of the technical work.
