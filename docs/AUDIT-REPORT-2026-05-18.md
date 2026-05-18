# DEF Gala Portal v2 — Audit Report (2026-05-18)

Branch: `claude/audit-project-fvFT6` (forked from `feat/portal-soft-website` + CLAUDE.md).
Auditor: Claude Code. Method: code cross-reference `src/portal/` (v1) vs `src/portal-v2/` (v2)
+ Playwright screenshots of both live URLs at 390px / 1440px.

## Environment constraints (see docs/BLOCKERS.md)

- `CF_API_KEY` / `CF_EMAIL` / `CF_ACCOUNT_ID` / `GALA_DB_UUID` **not set** in this
  environment. Cannot verify Cloudflare Pages deploy status via CF API, and cannot
  query D1 for alternate test sponsors. Verification of fixes is done via local
  `npm run build` + code review + screenshots of the existing live preview. The
  preview URL deploys from `feat/portal-soft-website`, not this audit branch, so
  post-fix live screenshots will not reflect this branch until it is deployed.

## Findings

### P0 — Blocks gala

**P0.1 — No `/finalize` trigger in v2 (sponsors never get confirmation). CONFIRMED.**
- `src/portal-v2/PortalShell.jsx:30` imports `useFinalize` but the hook is **never
  called** anywhere in v2. No `finalize()`, no `canFinalize`, no CTA.
- `src/portal-v2/CelebrationOverlay.jsx` is purely cosmetic (glow + auto-dismiss,
  no network call). After a sponsor places seats they see a celebration and then
  nothing — `/api/gala/portal/{token}/finalize` is never hit.
- Consequence: no confirmation email, no SMS, no QR code is ever issued in v2.
  This is the single most consequential gap.
- v1 reference: `Portal.jsx:2897+` finalize CTA → `ConfirmationScreen.jsx`
  (QR + delivery copy). Server contract `functions/api/gala/portal/[token]/finalize.js`
  requires ≥1 placed seat and every placed seat to have a `dinner_choice`
  (400 `reason:'meals_required'`).
- Fix: surface a persistent "I'm done — send my confirmation" banner when
  `seatMath.placed > 0` and `identity.rsvpStatus !== 'completed'`; tapping fires
  `useFinalize().finalize()`; on success show a confirmation view with the QR;
  mirror the meals-required check client-side for a clear message.

**P0.2 — No help footer / support surface in v2. CONFIRMED.**
- v1 `HelpFooter` (`Portal.jsx:1273`) — "Need help? Text Scott Foster"
  `sms:+18018106642` → "801-810-6642 →".
- v2 `Footer()` (`PortalShell.jsx:806`) is brand-only ("DEF Gala 2026 · …").
  There is **zero** in-portal way to reach Scott.
- Fix: port a v2-styled `HelpFooter` placed above the brand footer, persistent
  (CLAUDE.md P0.2 says persistent; v1 gated it on Platinum but the brief
  explicitly overrides that for v2).

### P1 — Should fix

**P1.1 — No FAQ surface in v2. CONFIRMED.**
- v1 `NightTab` pulls `/api/gala/chat/faq` (34 live entries, search + accordion;
  endpoint verified responding 200 with data).
- v2 `NightOfSection` (`PortalShell.jsx:763`) is three **static** info cards —
  no FAQ, no search, no live data.
- Fix: v2-native FAQ modal fetching `/api/gala/chat/faq`, triggered from a
  "Got questions?" CTA in the new help footer.

**P1.2 — No per-sponsor QR surface in v2. CONFIRMED.**
- v1 `TicketQrCard` (`Portal.jsx:779`): `/api/gala/qr?t={token}&size=220`,
  check-in link `https://gala.daviskids.org/checkin?t={token}`.
- v2 has no QR anywhere. The QR returned by `/finalize` (`qrImgUrl`) is also
  discarded since finalize is never called (see P0.1).
- Fix: show QR inside the post-finalize confirmation view AND as a persistent
  card once `identity.rsvpStatus === 'completed'`.

**P1.3 — v2 "Open / to place" count ignores delegated seats. CONFIRMED + FIXED.**
- Found live on Hughes General Contractors (`8z9351iu5hrzzomr`, 0 placed,
  delegated): v1 shows `OPEN 8` / "8 of 8 still to place"; v2 showed
  `OPEN 20` and "+ Place 20 more seats" / "Pick my seats".
- Root cause: `Hero`, `StatusCard`, `TicketsSection` all computed
  `remaining = Math.max(0, total - placed)`, ignoring delegated seats.
  The server already returns the correct `seatMath.available`
  (`total - placed - delegated`); the seat picker (line ~1177) already
  used it, but the home displays did not.
- A partially/fully-delegating sponsor was perpetually nagged to place
  seats that aren't theirs to place, and the "your night is set" state
  was unreachable for them.
- Fix: all three now use `seatMath.available` (fallback to the
  delegation-aware formula). Headline/sub/CTA gate on the corrected
  count; added a "all N seats are with your guests" state for the
  fully-delegated (placed 0) case so copy isn't wrong.

### P2 — Polish / verify

**P2.1 — Status card "Delegated" label semantics differ from v1 "Assigned".**
- v1 mobile shows `ASSIGNED 12 / to guests`; v2 shows `DELEGATED 0 / To guests`
  for the same sponsor. `seatMath.delegated` counts seats handed to child
  delegations (0 here is correct — this sponsor placed directly). v1's "assigned"
  appears to count placed-to-attendees. Not a data bug; label divergence only.
  Leave as-is unless Scott wants parity wording. Tracking, not fixing yet.

## Status legend

✅ fixed (commit) · 🔧 in progress · ⏳ queued · ❓ needs Scott

| ID | Sev | Title | Status |
|----|-----|-------|--------|
| P0.1 | P0 | Finalize trigger missing | ✅ FinalizeBanner + ConfirmationView wired via useFinalize; meals-required mirrored client-side |
| P0.2 | P0 | Help footer missing | ✅ HelpFooter (persistent, sms:+18018106642) above brand footer |
| P1.1 | P1 | FAQ surface missing | ✅ FaqModal fetches /api/gala/chat/faq, search + accordion, opened from help footer |
| P1.2 | P1 | QR surface missing | ✅ TicketQrCardV2 when rsvpStatus==='completed' + QR inside ConfirmationView |
| P1.3 | P1 | Open count ignores delegated | ✅ Hero/StatusCard/TicketsSection use seatMath.available (delegation-aware) |
| P2.1 | P2 | Delegated/Assigned label | ❓ (tracking — needs Scott's call on wording) |
| P2.2 | P2 | CSS border review (gutter-cage mandate) | ❓ (needs Scott's eye — see below) |

## Edge-case sweep (2026-05-18, live, real D1)

No console/page errors, no horizontal scroll at 390px or 1440px:

- **Fresh / window-not-open (Bronze, Aetna `6reylk7anku1e44s`)** —
  correct "window opens …" copy, OPEN 12, no pick CTA, no finalize
  banner. PASS.
- **Delegate, 0 seats yet (Lindquist delegate `iVhBCEeFvt7u`)** —
  v2 ReceiveOverlay (a v2 improvement v1 lacks) gracefully shows
  "No seats have been assigned to you yet." Finalize banner correctly
  suppressed for delegates (isSponsor gate). PASS.
- **Fully delegated (Hughes `8z9351iu5hrzzomr`, 0 placed / 12 deleg)** —
  drove out P1.3; post-fix v2 shows OPEN 8 (matches v1), no false
  "place 20" nag. PASS.

## P2.2 — CSS border review (needs Scott)

46 `border:` + 16 `box-shadow:` decls in portal-v2.css. The dominant
pattern is `1px solid var(--p2-rule)` (white @ 0.14α) on `.p2-card`
/modals — the design-system primitive shipped through Phases 1–5. The
new parity components (`.p2-help/.p2-finalize/.p2-qr-card`) reuse
`.p2-card`, so they're consistent with the approved look, not new
cages. A blanket "strip borders" pass without Scott's eye is churn
risk and re-litigates already-shipped design. Recommend Scott does a
visual gutter-cage pass on the live preview; I'll execute specific
calls. Not changing blind.

## Verification (2026-05-18)

`npm run build` clean (3 targets green). Offline preview harness
(`qa/preview-v2`, new `?finalize=1` / `?finalizeblock=1` scenarios)
screenshotted at 390px + 1440px — no page errors, no horizontal scroll:

- `pv-banner-d/m` — FinalizeBanner actionable state ✓
- `pv-banner-block-d` — blocked (meals-required) state, CTA disabled ✓
- `pv-finalized-d` — TicketQrCardV2 + persistent HelpFooter ✓
- `pv-faq-d` — FaqModal chrome (gradient strip, search, accordion, footer) ✓

### LIVE verification (blockers since cleared)

`feat/portal-soft-website` fast-forwarded to `9c8744f` (Scott's
explicit permission). CF API confirms Pages deploy `26183721`
(branch `feat/portal-soft-website`) status **success** @ 00:58Z.
Screenshotted the live preview vs v1 production on real D1 data,
390px + 1440px:

- Wicko Waypoint (`sxnhcj7axdrllaku`, rsvp_status=completed):
  `TicketQrCardV2` renders a **real scannable QR** from `/api/gala/qr`
  + persistent HelpFooter. P1.2 ✅ P0.2 ✅ live.
- Garn Development (`ew23vcs3lgrzuikc`, rsvp_status NULL, 18 placed,
  0 missing dinner): `FinalizeBanner` renders in actionable state
  ("18 seats placed … I'm done — send it"). P0.1 ✅ live. (Did NOT
  tap finalize — that fires a real email/SMS to a live sponsor.)
- FaqModal: `/api/gala/chat/faq` live-confirmed 200 + 34 entries;
  modal opens from the now-live HelpFooter. P1.1 ✅.

Parity note: v1 does **not** surface any finalize CTA on its home
screen (it's buried in the post-pick flow). v2's persistent banner is
strictly better — mission objective ("v2 strictly ≥ v1") met for this
surface.

### P2.1 detail (still needs Scott)

Confirmed again on Garn: v1 stat reads `ASSIGNED 18` (= seats placed
to attendees); v2 reads `DELEGATED 0` (= seats handed to child
delegations). Different metrics, both arguably correct, but a sponsor
glancing at both portals sees "18" vs "0" and may think v2 lost their
seats. Recommend either (a) rename v2 "Delegated" → keep, but add an
"Assigned/Placed" parity or (b) confirm v2's four-stat model
(Total/Placed/Delegated/Open) is the intended replacement. Needs
Scott's wording call — not fixing blind.
