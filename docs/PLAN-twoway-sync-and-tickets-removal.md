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

## Phase 1 — today (~1.5 hr remaining)

The bleeding-stop phase. Steps 1.1–1.3 already shipped (commit `f3c3a8c`). Three pivots happened during execution today (2026-05-08); leaving the trail because future sessions will benefit from the reasoning.

**Pivot A (sequencing):** Code audit revealed (1) Sponsors React island PATCH route was broken — calls `PATCH /api/gala/sponsors/:id` but the actual route is `PATCH /api/gala/sponsors` with id in body, saves were failing silently, curl-confirmed; (2) Sponsors EditPanel was missing seats/amount/logo/website fields. Reordered to fix routing + add fields first.

**Pivot B (architecture):** Original plan was a Cloudflare Worker calling MS Graph directly. Davis tenant locks Azure App Registrations for sfoster@dsdmail.net (401). Pivoted to Power Automate webhook for outbound write-back.

**Pivot C (whole approach — Scott + Kara decision):** While trying to set up the PA write-back, hit another wall — Sherry's xlsx has no formal Excel Table object, just rows of data. Power Automate can't see a "table" to update if it isn't formatted as one. Could have asked Sherry to convert via Excel, or run Claude in Excel against it, but Scott talked it through with Kara and they made the better call: **D1 becomes the canonical source of truth. Sherry stops editing the xlsx. The dashboard is the working tool.** This eliminates the entire xlsx sync problem.

**Final scope for Phase 1:**

1. ✅ EDITABLE allowlist + type coercion (commit `f3c3a8c`)
2. ✅ Sponsors PATCH route fix (commit `f3c3a8c`)
3. ✅ EditPanel seats/amount/logo/website fields (commit `f3c3a8c`)
4. ❌ Power Automate write-back flow — abandoned, delete the half-built flow at make.powerautomate.com
5. ❌ Worker `gala-xlsx-sync` — abandoned
6. **NEXT** — Disable the broken `Gala Sponsors Sync` inbound flow (it's been failing every 2 hours all day)
7. **NEXT** — Remove Tickets tab from dashboard
8. **NEXT** — Add explanatory copy to EditPanel: "Saved to dashboard. Sherry's spreadsheet is no longer used."
9. **NEXT** — Add a "Download spreadsheet snapshot" button on the Sponsors tab that exports current D1 state as xlsx for board reports
10. **NEXT** — Smoke test, deploy, cache purge

### Step 1.4 — Disable the broken inbound PA flow (2 min)

You navigate to make.powerautomate.com → My flows → "Gala Sponsors Sync" → click "Turn off" in the top toolbar. Don't delete it yet. We keep it disabled-but-extant for 30 days as a "in case we need to look at the column-mapping logic" reference, then delete.

Also delete the half-built "Gala Sponsor Write-Back" flow you started today — it's pointless now.

### Step 1.5 — Remove Tickets tab (45 min, Skippy)

`public/admin/index.html`:

1. Delete line 1223: `<button class="nav-tab" data-tab="tickets">Tickets</button>`
2. Delete `<div class="tab-panel" id="panel-tickets">` block (lines 1313-1346)
3. Delete `loadTickets()` function (~line 1818)
4. Delete `renderTickets()` function (~line 2386)
5. Delete tickets search/refresh handlers (~line 2636-2707)
6. Delete CSV export builder for tickets (~line 2840) and the auto-fill logos handler that follows it
7. Delete the entire ticket-editor overlay markup (line ~2480-2575) and `saveTicketEditor()` function (~line 2596)
8. Refactor "Tickets Sold" KPI on Overview (line 1244-1249): compute from sponsors data — `sponsors.reduce((sum, s) => sum + (s.seats_purchased || 0), 0)` — instead of from ticketInfo

### Step 1.6 — Add D1-canonical copy to EditPanel (5 min, Skippy)

In `src/admin/sponsors/SponsorRow.jsx`, add a small status callout at the top of `EditPanel`:

> Saved to the gala database. As of May 2026, this dashboard is the canonical source of sponsor data — Sherry's spreadsheet is no longer kept in sync.

Subtle styling — green callout, small text, not alarming.

### Step 1.7 — Add D1 → xlsx snapshot export (30 min, Skippy)

So Sherry can still pull a board-report-ready spreadsheet on demand:

1. New API endpoint: `GET /api/gala/admin/sponsors-export.xlsx`
2. Reads all sponsors from D1, generates xlsx via SheetJS or similar in the Pages function
3. Returns with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment`
4. Add "Download Excel" button on Sponsors tab next to the existing "Export CSV" button
5. Filename: `gala-sponsors-{YYYY-MM-DD}.xlsx`

Column order should match Sherry's existing xlsx so when she downloads it, the layout is familiar:
Company, First Name, Last Name (blank header preserved? or actually labeled now?), Sponsorship, Seats, Amount, Payment, Email, Phone, Street Address, City, State, Zip

**Decision needed during build:** keep Sherry's quirks (blank-header for last name, "Street Adress" typo) for visual familiarity, or fix them since this is a new export not the old file? Lean toward fixing — fresh start.

### Step 1.8 — Smoke test + deploy

1. Build sponsors island: `npm run build:sponsors`
2. Deploy via git push (Pages auto-deploy)
3. Wait 60s, curl admin assets to verify new bundle size
4. Cache purge on daviskids.org zone
5. Open `gala.daviskids.org/admin`, verify:
   - No Tickets tab in nav
   - Overview KPI "Tickets Sold" still shows correct count
   - Sponsors tab edit panel has all fields including seats/amount/logo/website
   - Save works (smoke-test on Wicko, sponsor 80)
   - Download Excel button produces a valid xlsx

### Phase 1 success criteria

- [x] Sponsors saves work (commit f3c3a8c)
- [x] All fields editable (commit f3c3a8c)
- [ ] Tickets tab gone
- [ ] EditPanel has D1-canonical copy
- [ ] Download Excel button works
- [ ] Broken PA inbound flow disabled
- [ ] Sherry knows the new arrangement (Scott communicates separately)

## Phase 2 — Sherry communication (Scott, ~15 min, today or tomorrow)

Not technical work but mission-critical. Scott communicates the change to Sherry directly:

- Dashboard is now the source of truth for sponsor data
- She no longer needs to maintain `2026 Gala Sales.xlsx` as a working file
- When she needs a spreadsheet for board reports or export, she clicks "Download Excel" on the Sponsors tab and gets a fresh snapshot from current data
- Her edits to the xlsx going forward will not flow anywhere — the inbound sync is disabled
- Per the v5 system instructions: never frame this as a comparison to her prior process. Forward-looking, matter-of-fact, "here's the new tool, here's what it does for you."

This is sensitive. Sherry has owned this xlsx for years. The pitch is "less work for you, fresh data anytime you need it" not "your old way wasn't working."

## Phase 3 — Cleanup (~30 min, after Phase 2)

1. Delete `functions/api/gala/admin/sheet-webhook.js` (no longer receives anything)
2. Delete `functions/api/gala/tickets.js` (Tickets tab is gone)
3. Remove `MONDAY_TICKETS_BOARD` from `wrangler.toml`
4. After 30 days clean: delete the disabled `Gala Sponsors Sync` PA flow
5. Update top-level README to describe new architecture
