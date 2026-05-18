# Gala Auction Registration — Embed Bloomerang form 1097071 inside the portal

**Status:** 📋 Spec — building today, ship before Silver invite email goes out  
**Project:** gala (ramonscottf/gala), branch `feat/portal-soft-website` (active soft-website preview)  
**D1:** `gala-seating` (1468a0b3-cc6c-49a6-ad89-421e9fb00a86) — adds one column `auction_registered_at`  
**Mirror:** `gala/docs/PLAN-auction-registration-embed.md`  
**Source chat:** This chat (2026-05-18)

---

## TL;DR

Sponsors land on the soft-website portal → place their seats → pick their meals → hit the confirmation screen → that screen presents one CTA: **"Register to bid in the auction."** Tapping it opens a full-screen modal containing the Bloomerang/Qgiv form 1097071 embedded as an iframe (served from `secure.qgiv.com`, skinned via Qgiv's Page Specific Header CSS injection so it inherits our brand). Sponsor completes Qgiv's registration form. We capture `QGIV.transactionComplete` via postMessage, mark them registered in D1, and show a success screen with two CTAs: **Download Givi (iOS)** and **Download Givi (Android)**. The Qgiv ticket-code email still fires from Qgiv's side — that's the credential the app uses for first sign-in.

We do NOT collect bidding info, do NOT show auction items, do NOT route money. The whole point of this build is: get every sponsor's account created inside Qgiv 3 weeks before the gala so they have the Givi app installed and logged in before the night-of.

---

## Why this is the right architecture

I confirmed (live, via Control Chrome in the source chat):

1. **Qgiv's `/event/embed/?preventRefreshOnClose=true` URL is designed to be embedded** and has no `X-Frame-Options`, no `frame-ancestors` CSP, and `Access-Control-Allow-Origin: *`. We can frame it from any domain.
2. **Qgiv broadcasts every funnel stage as postMessage events** of shape `{event: "createDataLayerEvent", data: {event: "QGIV.pageView" | "QGIV.registrationStart" | ..., QGIV: {contact, form, transaction, utm}}}`. We can listen from our parent window and react.
3. **Form 1097071 is the "2026 Auction" form** — packages include "Silent Auction Registration" priced $0.00, 1 ticket included. Free.
4. **Qgiv's account flow** (confirmed via their docs): sponsor registers → receives a ticket code by email → opens Givi app → "Join + Find Event" → enters email → OTP → sets a password → account live. The account creation lives entirely in Qgiv's auth — we cannot fake it and have the app accept the credentials. So we don't try.
5. **System emails on form 1097071 are not yet configured.** This means we own the post-registration user comm. Our success screen and our follow-up email is the experience the sponsor sees, not a Bloomerang receipt.

The win: sponsor never leaves `gala.daviskids.org`. The Bloomerang chrome is hidden behind our skin. The only thing that has to come from Qgiv is the ticket-code email — which is fine, because that email is what the Givi app asks for on first login anyway.

---

## What ships

### 1. D1 schema migration

```sql
-- migrations/010-auction-registration.sql
ALTER TABLE sponsors ADD COLUMN auction_registered_at TEXT;        -- ISO timestamp
ALTER TABLE sponsors ADD COLUMN auction_registration_email TEXT;   -- email used to register (may differ from sponsor primary)
ALTER TABLE sponsors ADD COLUMN auction_registration_txn TEXT;     -- Qgiv transaction id if available from postMessage
```

Three new columns on `sponsors`. Null = not yet registered. Timestamp = registered. Email and txn captured for cross-reference when Sherry/Kara need to look up "did this person register."

### 2. New API endpoints

`POST /api/gala/portal/auction-register`  
Body: `{ token, email, transaction_id?, registered_at }`  
Auth: portal magic-link token must resolve via `resolveToken(env, token)` (existing helper) — sponsor or delegation.  
Writes: `auction_registered_at`, `auction_registration_email`, `auction_registration_txn` on the sponsor row.  
Idempotent: if already registered, no-op + return current state. No re-write.

`GET /api/gala/portal/auction-status?token=...`  
Returns: `{ registered: bool, registered_at: string|null }`  
Used by the portal to determine which state to render (CTA vs ✓ Registered).

### 3. Portal UI changes (branch `feat/portal-soft-website`)

**New component: `AuctionRegistrationCard.jsx`**

States:
- **Hidden** — sponsor has placed 0 seats. Don't pressure registration before they engage.
- **CTA (unregistered)** — sponsor has placed ≥1 seat OR is on the confirmation screen. Card title: "Register to bid in the silent auction." Subtext: "Your bidder account works in the Givi app on auction night. Takes 30 seconds." Primary button: "Register now."
- **Modal-open** — full-screen modal containing the Qgiv iframe.
- **Success** — card title: "✓ You're registered to bid." Two buttons: App Store, Play Store. Subtext: "Check your email for your Qgiv ticket code — you'll need it the first time you open the Givi app."

Placement on the portal:
- Main page: appears below the "Your tickets to the gala" section once `firstSeatPlaced` is true; shows above tickets if `registered_at != null` AND sponsor has not yet downloaded app (we can't know this for sure, but we keep the card visible as a reminder).
- Confirmation screen (post-final-seat-pick): appears as the dominant CTA below "✓ All seats placed." This is the moment of highest momentum.

**New component: `AuctionRegistrationModal.jsx`**

- Full-screen overlay (`position: fixed; inset: 0; z-index: 1000`).
- Header: small DEF logo top-left, close button top-right ("Close — your registration won't save if you exit").
- Iframe takes the rest of the viewport. `src` = `https://secure.qgiv.com/for/daviseducationfoundationauction/event/embed/?preventRefreshOnClose=true&prefill_email={sponsor.email}&prefill_firstName={sponsor.firstName}&prefill_lastName={sponsor.lastName}` (Qgiv's prefill param names need verification in step 0 below — if they differ, fall back to no prefill and accept the sponsor retypes).
- postMessage listener: handles `resizeFullScreenModal` (adjusts iframe height), watches for `QGIV.transactionComplete` or `QGIV.registrationComplete` (exact name TBD by step 0). On completion: POST to `/api/gala/portal/auction-register`, swap modal content to success state.
- Fallback: if completion postMessage never fires (Qgiv changes behavior), modal also listens for the user closing it AFTER they've seen the Qgiv "Thank you" screen. We poll `/api/gala/portal/auction-status` on close to see if Qgiv's webhook to us beat them — see step 5.

### 4. Qgiv-side configuration (manual, Scott does this in the Qgiv admin)

a. **Page Specific Header injection** on the embed view of form 1097071:
   ```html
   <link rel="stylesheet" href="https://gala.daviskids.org/qgiv-skin.css">
   ```

b. **Receipt email** — enable form-level system email "Event Registration Confirmation" with default Qgiv template (it carries the ticket code). We do not customize this in v1 — Qgiv-side templating is sketchy.

c. **Webhooks** (if Qgiv supports it on this plan — verify in step 0): point a "transaction completed" webhook at our backend so we have a backup completion signal independent of postMessage. Endpoint: `POST /api/gala/portal/auction-webhook` (HMAC-verified if Qgiv signs).

### 5. New file: `gala.daviskids.org/qgiv-skin.css`

CSS hosted on our Pages site, loaded INSIDE the Qgiv iframe via the Page Specific Header injection above. Targets known Qgiv DOM hooks (`.qgiv-form`, `.ui-button`, `.option-label`, `.heading-alpha`, `.form-section-title`, etc — confirmed in the source chat from the live DOM walk).

Goals:
- Background: DEF navy `#0b1b3c`.
- Buttons: blue→red gradient on primary, off-white on secondary.
- Typography: Fraunces (display) + Inter (body) — already loaded on Pages, served via same origin so iframe can hit them.
- Hide: `.price-display`, `.subtotal-display`, `.total-display` (Scott confirmed: registration is free, no need to show $0.00 line). Hide the "Powered by Bloomerang" footer if their TOS allows; otherwise soften it (low opacity, small text).
- Hide: the auction-event "SILENT AUCTION" banner image (their Hogan/AFCU logos are still in the master event but not relevant to this registration-only flow).

Conservative CSS — every rule is a single override on a single semantic class, no `!important` unless required by their inline styles.

### 6. App-download success screen

Two universal links:
- **iOS:** `https://apps.apple.com/us/app/givi/id1485270576` (verify exact app store ID at step 0)
- **Android:** `https://play.google.com/store/apps/details?id=com.qgiv.givi` (verify)

Below the buttons:
> Open Givi, tap **Join + Find Event**, enter the email you just used to register. Givi will send you a one-time passcode to set your password. After that, you're in your bidder account and ready for June 10.

A small "Resend my Qgiv ticket code email" link — POSTs to a new helper endpoint that asks Qgiv via API to resend (if their API supports `resendReceipt`) OR drops to a mailto: link addressed to Sherry as a fallback.

---

## Pre-build verification (step 0, BEFORE code)

These four items need live-browser verification and have to happen before I commit React code:

1. **Walk a real registration through form 1097071 embed**, capture every postMessage event, and confirm:
   - The completion event name (`QGIV.transactionComplete` or similar)
   - Whether the payload includes email, transaction_id, ticket_code
   - The full event sequence so the listener has accurate state machine logic

2. **Test prefill URL params on the embed.** Qgiv historically accepts `first_name`, `last_name`, `email` as query params on `/for/{org}/event/embed/`. Confirm or invalidate.

3. **Inspect form 1097071 field set.** What does it ACTUALLY ask for? Email + name only? Or address, phone, employer, etc? If it asks for everything, we set sponsor-data prefill expectations accordingly.

4. **Check Qgiv webhooks availability** on this org's plan. If available, set up the backup signal. If not, postMessage is the only signal and we live with that (rare-edge fallback = sponsor closes modal without seeing success, we offer them a "Mark me as registered, I'll trust you" override that requires admin re-verification later).

These four can be done in ~15 minutes of live Chrome time when the MCP servers come back up. If they're still down, Scott can do them manually and paste results.

---

## Definition of done

- [ ] Step 0 verifications complete; postMessage event names confirmed
- [ ] Migration 010 applied to prod D1 `gala-seating`
- [ ] `POST /api/gala/portal/auction-register` and `GET /api/gala/portal/auction-status` deployed and verified with curl using Wicko Waypoint sponsor 89 token `sxnhcj7axdrllaku`
- [ ] `AuctionRegistrationCard.jsx` + `AuctionRegistrationModal.jsx` shipped on `feat/portal-soft-website` branch
- [ ] `qgiv-skin.css` deployed to Pages root, verified loading INSIDE iframe via DevTools
- [ ] Page Specific Header injection set in Qgiv admin (Scott confirms)
- [ ] Smoke test: Scott walks his own portal end-to-end, registers a test account, sees success screen, gets ticket-code email from Qgiv
- [ ] Smoke test: Open Givi app with the test email, confirms account works
- [ ] Pages preview URL passed to Scott
- [ ] Plan marked ✅ in this file + README + parent plan if applicable

---

## Cohort rollout

- **Silver (today, 3 sponsors):** First batch to receive the email inviting them to the portal. Card is live in their experience. We watch the 3 transactions land in Qgiv to verify the postMessage handler works in the wild.
- **Bronze (Wednesday, ~20 sponsors):** Polished version with whatever we learn from Silver. Higher volume = better signal on edge cases.
- **General sponsors after Bronze:** roll out to all remaining tiers as scheduled.

---

## Out of scope (v1)

- Auction item browsing on our site — not building. Items live in Qgiv.
- Bidding on our site — not building. Bidding happens in the Givi app on night-of.
- Custom Qgiv receipt template — using their default. Customize later if needed.
- Auto-resend of ticket code email from our portal — placeholder link goes to mailto:Sherry. Real API integration deferred unless many sponsors lose the email.
- Cross-form linking between ticket purchase form (separate flow, future) and auction registration — auction registration is standalone and independent.

---

## Open questions for Scott (does not block start)

1. **"Powered by Bloomerang" attribution** — Qgiv's TOS likely requires it visible somewhere. Confirm whether we can hide it entirely or just soften it.
2. **Success-screen copy tone** — current draft is informational ("Check your email for your ticket code"). Want it warmer? More excited? "You're in! 🎬 See you June 10."
3. **Modal close behavior mid-registration** — if sponsor closes the modal halfway through, do we (a) show a confirmation "are you sure," (b) silently close and let them try again later, or (c) auto-save their progress (Qgiv may handle this itself — to verify).
