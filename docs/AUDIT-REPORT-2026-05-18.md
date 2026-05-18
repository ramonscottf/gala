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
| P2.1 | P2 | Delegated/Assigned label | ❓ (tracking — needs Scott's call on wording) |

## Verification (2026-05-18)

`npm run build` clean (3 targets green). Offline preview harness
(`qa/preview-v2`, new `?finalize=1` / `?finalizeblock=1` scenarios)
screenshotted at 390px + 1440px — no page errors, no horizontal scroll:

- `pv-banner-d/m` — FinalizeBanner actionable state ✓
- `pv-banner-block-d` — blocked (meals-required) state, CTA disabled ✓
- `pv-finalized-d` — TicketQrCardV2 + persistent HelpFooter ✓
- `pv-faq-d` — FaqModal chrome (gradient strip, search, accordion, footer) ✓

Live-deploy verification of these on the audit branch is blocked on CF
creds + branch-deploy mapping — see docs/BLOCKERS.md (B1, B2). The
offline harness uses real component code with mock portal payloads, so
this proves render correctness; it does not exercise the live
`/finalize`, `/api/gala/qr`, or `/api/gala/chat/faq` round-trips
(those were verified to exist/respond independently: faq endpoint
returns 200 + 34 entries; qr + finalize are the same endpoints v1
uses in production).
