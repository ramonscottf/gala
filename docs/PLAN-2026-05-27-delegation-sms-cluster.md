---
title: Gala — Delegation, SMS-delivery & sponsor-state UI cluster
status: shipped (code live; awaiting Scott real-device walk on happy-path delegation + resend of MMS-failed invites)
project: gala (ramonscottf/gala)
phase: portal hardening (no number — sits after 2026-05-26 inline sponsor seat admin)
source_chat: this chat (Scott + Shelly/Carver-Florek-James support thread)
created: 2026-05-27
last_updated: 2026-05-27
---

# Gala — Delegation, SMS-delivery & sponsor-state UI cluster (2026-05-27)

Six commits, two weeks before the June 10 gala. All triggered by Scott testing
the Carver/Florek James sponsor portal (Shelly, sponsor 97, token
`c4fdabbffd11583320ddb1c75552b276`) and hitting wall after wall. Mirror:
`gala/docs/PLAN-2026-05-27-delegation-sms-cluster.md`. The seat-transfer piece
also has a standalone postmortem at `gala/docs/PLAN-2026-05-27-seat-transfer.md`.

## The six commits

1. **`3b0501f` — seat_transfer on /delegate (the big one).**
   The May-10 per-seat-invite UI let a sponsor who'd already placed all their
   seats select placed seats to hand to a guest, but the backend `/delegate`
   still enforced `seats > math.available` (= 0 for a fully-placed sponsor).
   **17 sponsors blocked** (Carver/Florek 20, Tanner Clinic 22, VCBO 14,
   Chevron 14, America First 14, +12 more). Fix: optional
   `seat_transfer: [{theater_id,row_label,seat_num}]` on the create path —
   validates each seat is owned + `delegation_id IS NULL`, budget check becomes
   `netNew = seats_allocated - transfer.length`, atomic UPDATE of
   `seat_assignments` (delegation_id + guest_name recomposed to
   "Parent / Delegate"), logs `seat_transferred`. Strictly additive.
   `DelegateForm.submit()` builds it from selectedPills (Mode B) +
   selectedAssignable (Hybrid Mode A).
2. **`64b5e33` — TicketDetailModal second caller.** The portal-v2 per-seat
   "assign to new guest" flow had its own `/delegate` POST with
   `seats_allocated:1` and no seat_transfer — same wall. Patched to send the
   single seat.
3. **`9e138ef` — admin twilio-status endpoint.** `GET /api/gala/admin/twilio-status?phone=N`
   (or `?sid=MM...`) queries Twilio's Messages API for REAL delivery status,
   because `sponsor_invites.status='sent'` only meant Twilio accepted the POST,
   not that it delivered.
4. **`a908714` — disable MMS hero default (the silent incident).** EVERY SMS
   invite today (and likely since the May-13 auto-attach) **failed with Twilio
   err 12300** — carrier rejected the 138 KB MMS hero
   (`assets.daviskids.org/gala-2026/sms-hero.png`). 100% failure rate across 6
   spot-checked recipients. `sponsor_invites` recorded 'sent' the whole time.
   Fix: `sendSMS` no longer auto-attaches the hero (`{withHero:true}` to force).
   Plain SMS delivers reliably under A2P 10DLC. Also added `twilio_sid` +
   `twilio_status` columns to `sponsor_invites` (migration applied to prod) so
   delivery can be audited from D1.
5. **`f2e18de` — Tickets-placed header acknowledges delegated seats.**
   The "{placed} of {total} placed · all set" header read `placedDirect`. A
   sponsor who delegated seats saw "13 of 20 placed · all set" (lie). Now:
   "{placed} placed by you · {delegated} with guests · all {total} placed".
6. **`40134c6` — auction card visible for fully-delegating sponsors.**
   The "Register to bid" card was gated `seatMath.placed > 0` (direct only), so
   Shelly — who delegated all 20 — lost the auction CTA entirely. Gate now
   `isSponsor AND (placedTotal > 0 OR delegated > 0)`.

## Root-cause family
Commits 1, 2, 5, 6 are the **`placed` vs `placedTotal` bug class**: multiple UI
conditions read sponsor-direct placement count when they should count direct +
delegated. A sponsor who delegated their whole block is the MOST engaged, not
the least. Same class as the dashboard-tile fix from a prior session. Worth a
grep sweep for any remaining `seatMath.placed` reads that should be `placedTotal`.

Commits 3 + 4 are the **silent-success bug class**: treating a queue/accept
ACK as delivery confirmation. Any send path that stamps 'sent' on a 2xx without
checking final status can hide a 100% failure. The new twilio-status endpoint
is the audit tool for it.

## Two non-bugs Scott reported (resolved by explanation, not code)
- **"Reclaim didn't work."** It did — delegation 144 went `status='reclaimed'`
  4 seconds before the screenshot. Portal polls ~4s; the screenshot was stale
  state. UX follow-up: when opening the manage modal via the Reclaim menu item,
  scroll/focus the Reclaim button so it's not buried below the seat picker.
- **"Lost the auction button."** Not lost — hidden by the gating bug in commit 6.

## Definition of done / outstanding
- [x] All six commits shipped to main, bundles confirmed live
  (`main-DvuBrfzW.js` final).
- [x] Live API guard tests (unowned seat, count mismatch, back-compat).
- [x] Twilio fix verified — test SMS to Scott `delivered`, num_media 0.
- [ ] **Scott real-device walk** on happy-path delegation (fires real SMS+email,
  writes a real row) — not done in-session to avoid side effects.
- [ ] **Resend the MMS-failed invites** now that plain SMS delivers. ~10+ recent
  delegations. Could script a batch admin resend.
- [ ] **Qgiv skin URL** still points at a preview Pages deploy
  (`feat-portal-soft-website.gala-3z8.pages.dev/qgiv-skin.{css,js}`) instead of
  `gala.daviskids.org`. Same bytes today, but preview URLs aren't permanent.
  60-sec Qgiv admin edit (Form 1097071 → Advanced → Global Page Settings).
- [ ] **Hero MMS** — if we want the image back: shrink to <30 KB or host on a
  Twilio-recognized domain, then re-test with `{withHero:true}`.
- [ ] **Reclaim modal UX** — focus the Reclaim button when entered via that menu.
- [ ] Optional smoke test `qa/sponsor-finalized-then-delegates.spec.js`.
