---
title: Gala portal — handoff for fresh-eyes audit
status: open
project: gala (gala.daviskids.org)
created: 2026-05-05
last_updated: 2026-05-05
audience: Codex (or any fresh agent)
author: Skippy / Claude (handing off after weekly limit reached)
---

# Gala sponsor portal — handoff for fresh-eyes audit

## TL;DR for Codex

Scott (Davis Education Foundation, marketing coordinator) is shipping a
sponsor portal for the 2026 DEF Annual Gala. Live at
**https://gala.daviskids.org/sponsor/{token}**. The seating-management
flow is functional but has accumulated UX bugs in light mode and a
couple of stale-state issues in the seat picker. Earlier today we
migrated the whole gala app from a monorepo (`def-site`) into its own
repo (`ramonscottf/gala`) — that's why some commit history feels
truncated and why there are vestigial references in `def-site`.

The user (Scott) is now near a weekly Claude usage cap and wants you to
take a fresh-eyes pass. Start by reading the most recent commits and
the open issues below. Don't just re-do work I already did — verify it
worked, and either confirm or fix.

## Live URLs

| Surface | URL |
|---|---|
| Sponsor portal | https://gala.daviskids.org/sponsor/{token} |
| Test sponsor (Scott — Wicko, ID 80) | https://gala.daviskids.org/sponsor/dgu5lwmfmgtecky3 |
| Test sponsor (Kara — DEF Staff, ID 93) | https://gala.daviskids.org/sponsor/sgohonmgwicha15n |
| Pages project | gala (Cloudflare Pages) |
| Pages subdomain | gala-3z8.pages.dev |
| GitHub repo | https://github.com/ramonscottf/gala |
| Source repo (legacy, contains `def-site` skill) | https://github.com/ramonscottf/def-site |
| Skippy plans cross-project index | https://github.com/ramonscottf/skippy-plans |

## Identity

- **User**: Scott Foster (`ramonscottf@gmail.com` for personal,
  `sfoster@dsdmail.net` for DEF). Refers to the assistant as
  "Skippy" — that's a Claude-side persona, you don't need to adopt it.
- **End users of the portal**: gala sponsors and DEF staff who get a
  magic link in email and use it to pick their seats.
- **The seven DEF staff** invited tonight (after the gala-emails
  template lock — see "Email" below). Their tokens are in
  `/tmp/staff_tokens.json` (will not exist in your sandbox; query D1
  if you need them — see "How to query D1" below).

## What the portal does

Magic-link auth (no passwords). Sponsors get an email with a link
containing their token (`?token=…` or `/sponsor/{token}`). The portal
renders three flows:

1. **Welcome** — splash with "Place your N seats across the night"
2. **Showing** — pick early/late + which film + (sometimes) which auditorium
3. **Seats** — interactive seat picker with the cinema layout
4. **Confirm** — review + commit, get boarding pass + QR code

Sponsors can split their block across multiple showtimes/films. Some
sponsors can delegate seats to guests (separate token tree —
`sponsor_delegations` table). DEF Staff is a tier with `seats_purchased=2`
and `payment_status='complimentary'`.

## Architecture

### Frontend
- React + Vite SPA (no Next.js, no SSR)
- Source: `src/portal/`
  - `Mobile.jsx` — mobile (< 800px) shell with bottom tab bar
  - `Desktop.jsx` — desktop wizard (the file with most of the
    legibility bugs)
  - `MobileWizard.jsx` — legacy mobile wizard (still used by some
    deep-link flows)
  - `SeatEngine.jsx` — shared `SeatMap` (SVG seat chart) and
    `SeatLegend` components
  - `components/` — `SeatPickSheet.jsx` (the bottom sheet on mobile),
    `PostPickSheet.jsx`, `AssignTheseSheet.jsx`, `MovieDetailSheet.jsx`,
    `DinnerPicker.jsx`
- Build outputs to `public/sponsor/` (configured in `vite.config.js`
  with `outDir: 'public/sponsor'`, `publicDir: false`, base
  `/sponsor/`)
- Routing: `react-router-dom`, hash-free, served by Pages Functions

### Backend (Cloudflare Pages Functions, in `functions/`)
- `functions/api/gala/portal/[token].js` — GET portal data for a token
- `functions/api/gala/portal/[token]/pick.js` — POST hold/release/finalize/unfinalize/set_dinner
- `functions/api/gala/portal/[token]/sms.js` — POST send SMS via Twilio
- `functions/api/gala/admin/refresh-tmdb-scores.js` — admin endpoint to refresh TMDB scores
- `functions/sponsor/[[path]].js` — SPA fallback (serves `index.html`)
- `functions/_lib/` — shared helpers (token resolution, etc.)

### Storage
- D1: **gala-seating** — `1468a0b3-cc6c-49a6-ad89-421e9fb00a86`
  - Tables: `sponsors`, `sponsor_delegations`, `seat_assignments`, `seat_holds`,
    `theaters`, `theater_seats`, `showtimes`, `movies`, `attendees`, etc.
- KV: **GALA_KV** (used for SMS rate-limiting, magic-link nonces if any)
- R2: **def-assets** (assets.daviskids.org) — for poster images, brand
  artwork, etc.

### Auth/secrets stored as Pages env vars (encrypted)
| Var | Purpose |
|---|---|
| `GALA_DASH_SECRET` | dashboard cookie signing |
| `GALA_REVIEW_SECRET` | review-token signing |
| `GALA_MAIL_TOKEN` | bearer for mail.fosterlabs.org/send |
| `GALA_FROM_EMAIL` | gala@daviskids.org |
| `TMDB_API_KEY` | The Movie Database |
| `OMDB_API_KEY` | OMDB fallback (not actively used) |
| `TWILIO_ACCOUNT_SID` | (DEF Twilio account — get from Pages env var or password manager) |
| `TWILIO_AUTH_TOKEN` | (rotate — Scott pasted it in chat earlier) |
| `TWILIO_FROM_NUMBER` | +18019236121 |

The Twilio Auth Token was pasted in chat and should be rotated. Note for
Scott: not urgent but tidy.

## Cloudflare account & deploy mechanics

- **Account ID**: 77f3d6611f5ceab7651744268d434342
- **Zone ID** (`daviskids.org`): e9aac6e9fab72eae9eda35335bc47f40
- **Auth header pattern**: `X-Auth-Email: ramonscottf@gmail.com` +
  `X-Auth-Key: <Scott's Cloudflare Global API Key — stored in his
  password manager / Skippy memory>` (Global API Key). **NEVER use
  Bearer tokens with this account** — Scott's memory rule explicitly
  says so, multiple historical failures.
- **Pages deploy**: `git push` to `main` is the deploy. Do not run
  wrangler from a sandbox; build artifacts go in `public/sponsor/` and
  are committed.
- **CNAME**: `gala.daviskids.org` → `gala-3z8.pages.dev`, proxied.

## How to query D1 from a sandbox

```bash
CF_KEY="$CLOUDFLARE_GLOBAL_API_KEY"  # Scott's Global API key — get from password manager
CF_EMAIL="ramonscottf@gmail.com"
CF_ACCOUNT="77f3d6611f5ceab7651744268d434342"
DB_ID="1468a0b3-cc6c-49a6-ad89-421e9fb00a86"

curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/d1/database/$DB_ID/query" \
  -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT * FROM sponsors WHERE id=?","params":[93]}'
```

For test sponsor data: Kara is sponsor 93 (DEF Staff), Scott is sponsor 80 (Wicko).

## Recent commits (read these before doing anything)

```
680c5cb Light mode: faint card backgrounds promote to var(--surface) so cards are visible
26581f1 Light mode legibility round 3: cover rgba whites + fix SeatEngine auto-detect
3920504 Light mode legibility: one CSS rule scoped to .wizard-body
8400ec6 Desktop light-mode legibility: 9 hardcoded #fff → var(--ink-on-ground)  (later partially reverted)
213e129 Fix stale-state bugs in seat picker: refresh on open + clear errors on select
df6f65a Defensive: same off-by-one fix on finalize path
b29cbbc Fix off-by-one in pick.js seat-budget hold check
2a1f578 Two regressions: button overflow + movie sheet missing data
bb7261d SMS: /api/gala/portal/[token]/sms endpoint (kind=self + kind=guest)
d649003 TMDB scores: schema + endpoint + UI badges
7ea8f5e Round 3: dinner picker + MovieDetailSheet scroll + smaller mobile backdrop hero
df89660 Light mode legibility: ticket cards + tab pill highlight (Mobile.jsx)
6ea556d Tab bar: dropped solid paper bg behind glass pill
363abe4 Megaplex wordmark FIX: replaced broken outline asset with proper solid wordmark
12b431c Boarding pass polish: Megaplex logo + visible gold name
647c92e Fix mobile movie cards — wired MovieDetailSheet onMovieDetail prop
17488fa Light-mode high-contrast white-and-navy redesign + 3 polish items
8d857b8 Real DEF logo + light-mode-readable accent text  ← this introduced the
                                                          --accent-text /
                                                          --ink-on-ground
                                                          / --surface CSS vars
174af6b Fix sponsor SPA routing — explicit functions/sponsor/[[path]].js
a71326b Sponsor portal orphan-seat validation
```

## The light-mode legibility war (what's been done, what remains)

Earlier today (over many turns), Scott reported the desktop view was
illegible in light mode. This kicked off a multi-pass fix because I
kept solving it the wrong way. The history matters:

### Pass 1: Surgical hand-fixes (commit 8400ec6)
I changed 9 individual hardcoded `color: '#fff'` inline styles in
Desktop.jsx to `var(--ink-on-ground)`. This was the wrong tool for the
job — there were ~30 such inline whites in that file, plus shared
components, plus rgba forms I missed. Every screenshot revealed more.
Scott called it: "we are thinking too hard on this. this should be an
easy fix."

### Pass 2: One CSS rule (commit 3920504)
Reverted the 9 surgical fixes and replaced with **one CSS rule** in
`src/brand/styles.css`, scoped to `.wizard-body`:

```css
@media (prefers-color-scheme: light) {
  .wizard-body [style*="color: rgb(255, 255, 255)"]:not(.force-dark)…,
  .wizard-body [style*="color: #fff"]:not(.force-dark)… {
    color: var(--ink-on-ground) !important;
  }
}
```

Two `className="wizard-body"` markers added in Desktop.jsx (the
stepper strip line ~2240 and the wizard middle column line ~2278).
Three `className="force-dark"` opt-outs on dark-backdrop elements:
`Avatar`, `PosterMini`, the rating pill on `BRAND.ink`.

### Pass 3: rgba whites + matchMedia (commit 26581f1)
The Pass 2 selector missed `rgba(255,255,255,0.85)` — used for the
welcome step body copy. Added one more selector to catch all rgba
alphas:
```css
.wizard-body [style*="color: rgba(255, 255, 255"]…
```

Also fixed `SeatEngine.jsx` `theme='auto'` mode. The previous
implementation read `document.documentElement[data-theme]` — but
**nothing in this app sets that attribute**. The theme is purely
`prefers-color-scheme`-driven. Switched to
`window.matchMedia('(prefers-color-scheme: light)')` with both
`addEventListener` and the legacy `addListener` fallback. Also dropped
the `dark` prop from the Desktop SeatLegend call site so it follows
the page theme.

### Pass 4: Card backgrounds (commit 680c5cb — most recent)
Scott reported "still cant see the cards" with a screenshot showing
the showing-step movie cards floating with no visible container. Root
cause: card backgrounds use `rgba(255,255,255,0.03)` (a lift effect
designed for dark navy grounds) which is invisible on white. Added a
companion CSS rule:
```css
.wizard-body [style*="background: rgba(255,255,255,0.03)"]…,
.wizard-body [style*="background: rgba(255, 255, 255, 0.08)"]… {
  background: var(--surface) !important;
}
```

### What I think is still potentially wrong (verify these!)

1. **Mobile light-mode** got an earlier sweep (commit df89660) that
   was hand-surgical. It might still have gaps similar to what desktop
   had — Scott didn't test mobile this round. Worth doing a quick
   `grep -n "color: '#fff'" src/portal/Mobile.jsx` and visually
   inspecting in light mode.
2. **`MobileWizard.jsx`** is the legacy mobile flow. I never touched
   it for light mode. If anyone deep-links to `?step=seats` on mobile,
   they hit MobileWizard, not Mobile, and might see the same broken
   light-mode rendering.
3. **The .wizard-body class is only on Desktop.jsx**. On Mobile.jsx
   it's a different shell. The CSS rule won't fire there. If the
   mobile shell needs the same treatment, you'd add the marker on the
   mobile root or generalize the selector.
4. **Rating pill on BRAND.ink** has `className="force-dark"`. If you
   spot any other dark-backdrop card with white text children that
   isn't marked force-dark, add the marker.
5. **`The Breadwinner` movie has `tmdb_id` pointing at a 2026 film
   with 0 votes** — likely the wrong tmdb mapping. The TMDB score
   refresh endpoint exists; just need to fix the mapping. Low
   priority.

## Other open issues (non-light-mode)

### Seat picker stale state (commit 213e129)
Earlier issues: opening the seat picker with stale portal data caused:
(a) user could click their own already-placed seats and add them to
selection, (b) couldn't see other sponsors' fresh placements, (c)
errors persisted across selection changes. Fixed by: refreshing
portal data on `goSeats()` and clearing error in `onSelect`. **Verify
this works** — Scott reported confusion from the screenshots about
"why am I still getting these errors when I changed my picks?"

### Off-by-one in pick.js seat-budget check (commits b29cbbc, df6f65a)
Earlier: the server's seat-quota check was off-by-one in both the
hold and finalize paths. Fixed; verify by trying to hold one more
seat than the sponsor's quota.

### Twilio Auth Token rotation
Scott pasted it in chat earlier today. Not urgent but should be
rotated whenever convenient.

### Apple Wallet pass — unimplemented
Future work. Scott has an Apple Developer account. Open question:
Dutchman-hosted (his Mac Studio) signer vs. Worker-native PKCS#7
signer. Half-day work. Don't start unless asked.

### def-site teardown (commits 10/11 from migration plan)
After the May 5 migration, the legacy gala code in `def-site` and
the `gala-dashboard` repo/Worker should be deleted. Plan path:
- delete `def-site/public/gala-*`
- delete `def-site/functions/api/gala/`
- delete `def-site/functions/gala-*`
- archive `ramonscottf/gala-dashboard`
- delete `gala-dashboard` Worker
Don't do this without Scott's explicit go-ahead — verify the new
gala app handles every flow first.

## Email — DO NOT MISS THIS

There is a **locked v6 email template** stored as a skill at
`def-site/.claude/skills/gala-emails/SKILL.md` (in the source repo, not
this gala repo). Critical rules:

- ALL gala marketing emails go FROM `gala@daviskids.org`
- Reply-To: `smiggin@dsdmail.net` (Sherry Miggin, DEF Executive Director)
- Sign-off: "Sherry, Kara, and the entire DEF team"
- **Val Pound is GONE** (left DEF Apr 28, 2026) — never include her
- Send via `mail.fosterlabs.org/send` with `Bearer SkippyMail2026`
- The email template is words-only masthead on dark navy
  (#0d1b3d), GALA 2026 wordmark + date line, blue→red gradient strips
  top/bottom, white page bg, gray card (#f3f5f9). NO IMAGE in email.
- Image (`sms-hero.png`) is for SMS/MMS only at
  `assets.daviskids.org/gala-2026/sms-hero.png`.

The 7 DEF Staff invite emails were sent earlier today; their Resend
message IDs are in the recent updates section of the parent context.

## DEF personnel (in case email comes up)

- **Sherry Miggin** — Executive Director (`smiggin@dsdmail.net`,
  cell 801-512-9370). All comms reply-to her.
- **Kara Toone** — DEF Director (new, replaced Val) (`ktoone@dsdmail.net`).
- **Karah Crosby** — CTE program coordinator (`kcrosby@dsdmail.net`).
- **Justine Pritchett** — Foundation Financial Assistant
  (`jpritchett@dsdmail.net`).
- **Val Pound** — quit (April 28). DO NOT include in any email.
- **Scott Foster** — Marketing Coordinator (`sfoster@dsdmail.net`).

## File map (where to look first)

If you need to fix… | Open this file
---|---
desktop wizard chrome / steps | `src/portal/Desktop.jsx`
mobile shell | `src/portal/Mobile.jsx`
mobile bottom-sheet seat picker | `src/portal/components/SeatPickSheet.jsx`
the SVG seat map | `src/portal/SeatEngine.jsx` (`SeatMap`, `SeatLegend`)
post-pick assign/dinner sheet | `src/portal/components/PostPickSheet.jsx`
guest assignment sheet | `src/portal/components/AssignTheseSheet.jsx`
movie detail sheet (with TMDB scores) | `src/portal/MovieDetailSheet.jsx`
hold/release/finalize server logic | `functions/api/gala/portal/[token]/pick.js`
SMS sender | `functions/api/gala/portal/[token]/sms.js`
TMDB score refresh | `functions/api/gala/admin/refresh-tmdb-scores.js`
SPA routing fallback | `functions/sponsor/[[path]].js`
CSS variables + light-mode rescue rules | `src/brand/styles.css`
brand tokens (BRAND object) | `src/brand/tokens.js`
brand atoms (Btn, etc.) | `src/brand/atoms.jsx`
hooks for portal/seats state | `src/hooks/useSeats.js`

## How to test locally

The Vite cache occasionally produces stale builds — wipe both
`node_modules/.vite` and `public/sponsor/assets` if a CSS change
doesn't appear after build.

```bash
cd /path/to/gala
rm -rf node_modules/.vite public/sponsor/assets
npm install
npm run build
# build outputs to public/sponsor/
# git push origin main to deploy to gala.daviskids.org
```

Wait for Pages deploy (~30s, check via Cloudflare API). Hard refresh
browser (Cmd+Shift+R).

## What I'd suggest you do, in order

1. Hard refresh `https://gala.daviskids.org/sponsor/sgohonmgwicha15n`.
   Toggle OS between light and dark. Check every step (Welcome →
   Showing → Seats → Confirm) on both desktop AND mobile. Document
   what's still broken.
2. Read commits 680c5cb, 26581f1, 3920504, 213e129 in that order.
3. Decide whether the CSS-rule approach in styles.css is the right
   architecture or whether we should instead make the inline styles
   theme-aware via `useTheme()` calls. The CSS approach is pragmatic
   but it's not clean — ideally `BRAND.gold` and `'#fff'` literals
   would be CSS vars to begin with. Talk to Scott before any
   architectural change.
4. Audit `MobileWizard.jsx` — I never touched it, it might still have
   the same problems.
5. Verify the seat-picker fixes from 213e129 actually worked.
   Specifically: does the picker's left-rail "PLACED" count update
   when the user commits seats and then reopens the picker?

## Things to NOT do

- Do NOT use `wrangler pages publish` from a sandbox. Always `git
  push` to main.
- Do NOT use Bearer tokens with the Cloudflare API for this account
  — use `X-Auth-Key` + `X-Auth-Email`.
- Do NOT touch `hiresbigh` or any of Scott's other repos. Stay in
  `ramonscottf/gala`.
- Do NOT include Val Pound in any DEF emails.
- Do NOT have two Claude/Codex sessions push to the same repo
  simultaneously — Scott's hard rule.
- Do NOT run `sed` on production HTML. CSS-only edits, reviewed
  before deploy.
- Do NOT regenerate the boarding pass styling unless Scott asks —
  it's locked.
- Do NOT regenerate the Megaplex wordmark — fixed in 363abe4 and
  asset is at `public/assets/brand/megaplex-{dark,light}.png`.

## Contact handoff

Scott is on iOS, prefers visual presentations for research/comparisons
(cards, badges, side-by-side layouts), reads fast (don't truncate for
mobile), and prefers a clarifier question over building the wrong
thing twice. ADHD-direct: answer first, then structure, no preamble.
He'll bounce back into a chat with you after his usage resets in ~5
hours from when this was written.

If something is genuinely ambiguous (which photo, which yellow,
irreversible action), ASK rather than guess.

Good luck.

— Skippy / Claude (handing off 2026-05-05 ~6:50pm MT)
