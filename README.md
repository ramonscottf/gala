# DEF Gala 2026

Single source of truth for **gala.daviskids.org**.

Five apps share this repo:

| Path | What | Auth |
|---|---|---|
| `/` | Magic-link login landing | Public |
| `/sponsor/{token}` | Sponsor portal SPA (Vite/React) | Permanent token |
| `/admin` | Admin dashboard (Sponsors / Tickets / Movies / Volunteers / Marketing) | Cookie session |
| `/review` | Marketing review tool | Token |
| `/volunteer` | Volunteer signup form | Public |
| `/checkin` | Night-of QR scanner | Cookie session |
| `/checkin/{token}` | Sponsor self-checkin | Token |

## Architecture

- **Cloudflare Pages** project named `gala` deploys from this repo's `main` branch.
- **D1 database** `gala-seating` (id `1468a0b3-cc6c-49a6-ad89-421e9fb00a86`) bound as `GALA_DB`. Same database the def-site Pages project used before this migration — no data moved, just bindings.
- **R2 bucket** `gala-assets` bound as `GALA_ASSETS` for sponsor logos and movie posters.
- **Pages Functions** under `functions/` provide the API at `/api/*`.

## Repo layout

```
public/
├── index.html        ← magic-link login landing
├── admin/            ← admin dashboard (4,282-line HTML monolith)
├── sponsor/          ← sponsor SPA build output (vite outDir)
├── review/           ← marketing review tool
├── volunteer/        ← volunteer signup
├── checkin/          ← night-of scanner
├── data/             ← theater-layouts.json, etc.
└── assets/           ← shared favicons, images, manifest

src/                  ← sponsor SPA source (Vite/React)
├── portal/           ← Mobile, Desktop, MobileWizard, sheets
├── brand/            ← tokens, atoms, styles
└── hooks/            ← usePortal, useSeats, useTheme, useViewport

functions/
├── _middleware.js    ← cookie-session gate for /admin and /checkin
├── api/
│   ├── auth/         ← magic-link request + verify (NEW)
│   └── gala/         ← all the existing API endpoints
```

## Magic-link auth

Front door at `gala.daviskids.org/` is a single email input.

**Sponsors** with their original invitation email open `/sponsor/{token}` directly. The lost-email recovery flow lets them re-request the link by email — same permanent token, just re-sent.

**Admins** get a magic link if their email matches the allowlist:
- Email domain: `@dsdmail.net`
- Username: one of `sfoster`, `smiggin`, `ktoone`, `kbuchi`

The magic link is a short-lived (15min) signed JWT. Clicking it sets the existing `gala_session` cookie and redirects to `/admin`. The cookie auth middleware gating `/admin` and `/checkin` is unchanged from def-site — magic-link is just a new way to GET that cookie.

## Deploy

`git push origin main` triggers Cloudflare Pages auto-deploy. No `wrangler` commands needed for the production site.

For local dev: `npm install && npm run dev` runs the sponsor SPA only. The other 4 apps are static HTML, open them directly.

## Known footguns (read before touching seat code)

**Every seat-keyed write must include `showing_number`.** The schema's
unique constraint is `(theater_id, showing_number, row_label, seat_num)`
across `seat_assignments`, `seat_holds`, `vip_locks`, and `seat_blocks`.
Multiple auditoriums host BOTH an early and late showing of the same
movie (Aud 6, 7, 8, 10 in the 2026 lineup), so dropping `showing_number`
silently collapses both showings into one. This bit us on May 11 2026 —
see `docs/HANDOFF-2026-05-11-showing-number.md` for the full story and
`docs/PLAN-showing-number-fix.md` for the five-phase fix.

If you're adding a new seat-touching endpoint, mirror the pattern in
`functions/api/gala/portal/[token]/pick.js` — there's a
`resolveShowingNumber()` helper at the top that validates a
client-provided showing_number against the showtimes table and falls
back defensively when the theater is single-showing. Regression test
lives at `qa/showing-number.test.mjs`.

**Other minefields:**

- D1 returns SQL `NULL` as Python `None`, which pandas stores as `NaN`.
  Check `bool(norm(v))` not `if row['archived_at']`.
- Cloudflare auth on this account is `X-Auth-Key` + `X-Auth-Email`,
  never `Bearer`.
- The admin chart in `public/admin/seating.html` keys its in-memory
  `assignments` map by `theaterId:row:seat` (no showing) — intentional,
  because it only ever renders one showing at a time. The chart is
  wiped and reloaded on every showing toggle. Don't try to fold both
  showings into one chart view without rethinking the key.

## History

Migrated from `ramonscottf/def-site` on 2026-05-05. Replaces and supersedes:
- `ramonscottf/gala-dashboard` (parallel rewrite, archived)
- The abandoned `gala-dashboard` Cloudflare Worker on `gala.daviskids.org` (deleted)

Migration plan: [skippy-plans](https://github.com/ramonscottf/skippy-plans/blob/main/plans/2026-05-05-gala-repo-migration-everything-to-its-own-repo.md)

### Significant incidents

| Date | What | Resolution |
|---|---|---|
| 2026-05-11 | **Tanner Clinic incident.** Sponsor portal silently collapsed every late-showing seat pick to the early showing because `showing_number` was never threaded through the write path. Terra Cooper (sponsor 77) hit it on first real placement. | Hand-fixed her 20 rows in D1, then shipped 5-phase end-to-end fix (commits `874285e`, `3835806`, `89b41fd`, `2632d7f`, `5ecdf00`). Migration 009 added `showing_number` to `seat_holds`. Regression test at `qa/showing-number.test.mjs`. Post-mortem: `docs/HANDOFF-2026-05-11-showing-number.md`. |
