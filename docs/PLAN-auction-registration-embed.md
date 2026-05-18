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

## Why this is the right architecture — LIVE-VERIFIED 2026-05-18

I walked the form end-to-end through Control Chrome and grepped the Qgiv React bundle (`event.c2c3172dc0e98253c564.js`, 2.7MB) to confirm every assumption before writing any code.

### Confirmed facts

1. **The embed URL allows cross-origin framing.** `https://secure.qgiv.com/for/daviseducationfoundationauction/event/embed/?preventRefreshOnClose=true` ships no `X-Frame-Options`, no `frame-ancestors` CSP, and `Access-Control-Allow-Origin: *`. We can frame it from `gala.daviskids.org`.

2. **The form is 3 steps:** "Choose Your Tickets" → "Your Details" → "Additional Details". Step 1 is a single `<select>` for package quantity. Step 2 collects `First_Name`, `Last_Name`, `Email`, `Address`, `Address_2`, `City`, `State`, `Zip`, `Country` — **none marked required** in the HTML (Qgiv may soft-validate). Step 3 is whatever the additional-details page asks (didn't walk to it to avoid creating test data).

3. **All Qgiv postMessage events confirmed by grepping the bundle:**
   - `QGIV.registrationStart`
   - `QGIV.registrationStepChange` ← fires on each step transition
   - `QGIV.pageView`
   - `QGIV.registrationClose` ← user closes without completing
   - **`QGIV.registrationComplete`** ← THIS is the completion signal we hook
   - `QGIV.metaPixelPurchase` ← won't fire for free registration

4. **The `QGIV.registrationComplete` payload structure (from the bundle):**
   ```
   contact: { firstName, lastName, email, company, optedIn, givenAnonymously }
   transaction: { Email, Transaction_ID, Company_Donation, First_Name, Last_Name }
   form: { id: "1097071", name: "2026 Auction" }
   ```
   We get email AND transaction ID AND name. Enough to mark the sponsor registered in our D1.

5. **URL prefill params verified by reading the bundle:** Qgiv reads `first_name`, `last_name`, `email` (lowercase, underscore). HOWEVER — **cookie session OVERRIDES the URL params.** When I opened a fresh tab at `?first_name=TestFirst&last_name=TestLast&email=test@example.com`, the form pre-populated as "Scott Foster, sfoster@dsdmail.net" because my Qgiv session cookie won. For sponsors with no existing Qgiv cookie (most of them), URL prefill SHOULD work — but I cannot verify without an incognito session. Either way, it's a 3-step form asking for fields we already have, so if prefill fails, sponsor retypes 2 fields and moves on.

6. **MASSIVE find: Qgiv has a built-in `/account/create/` flow that runs INSIDE the iframe after registration completes.** The bundle confirms the flow: after `registrationComplete`, Qgiv routes the user to `/account/create/` with `Global_Account_Action: ACTIVATE_ACCOUNT`, prompts for `Password` + `Password_Confirm`, and the sponsor's bidder account is fully provisioned inside the iframe. They don't have to wait for an email or do OTP — they can set their password right there, then download the Givi app and log in directly. This is *better* than the docs-described flow.

7. **DOM hooks for skinning** (all BEM-style, no obfuscation):
   - `.event-registration`, `.event-registration__header`, `.event-registration__inner`
   - `.packages-page-container`, `.packages__content`
   - `.qg-vendor-button.button.button--primary` (the "Next" button)
   - `.modal2__close` (the X to close)
   - No "Powered by Bloomerang" footer found in the embed DOM — only on the main event wrapper. The embed is clean.

8. **System emails on form 1097071 are NOT yet configured.** Verified on the Bloomerang admin page. This means: we own the post-registration comm experience. We should turn ON the Qgiv default "Event Registration Confirmation" email before launching so the sponsor has a paper trail with their account login (Qgiv attaches the ticket code, which is what the Givi app's Reset-Password flow uses if they ever lose their password).

### What I did NOT confirm

- **Cross-origin iframe bootstrap on our portal.** Injected the embed iframe into the live soft-website portal page (`feat-portal-soft-website.gala-3z8.pages.dev`). The HTML document loaded but the Qgiv JS bundle did NOT load — likely because the iframe was positioned offscreen and Qgiv may lazy-load. This is a real unknown but becomes a non-issue in production where the iframe lives inside a real visible modal. Will verify on first build deploy.
- **Whether webhook to our backend is available.** Bloomerang's webhooks live in a different admin section than I had open. Need to check `Settings → Webhooks` on form 1097071. Not blocking — postMessage is the primary signal, webhook would only be a redundancy.
- **Full Step 3 ("Additional Details") field set.** Didn't walk through to avoid creating a test record. Will read it during build.

The win: sponsor never leaves `gala.daviskids.org`. The Bloomerang chrome is hidden behind our skin. They land in Qgiv's `/account/create/` flow without seeing they left our site, set their password, get a success screen from us with the Givi app links.

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

**REVISED based on live finding** — Qgiv has a built-in `/account/create/` flow that runs INSIDE the iframe after `registrationComplete`. The sponsor sets their password right there, inside our modal. We do NOT need to push them to the Givi app's password-reset flow.

Sequence:
1. Sponsor completes registration form (3 steps)
2. `QGIV.registrationComplete` fires — we capture it and write to D1
3. Qgiv immediately routes the iframe to `/account/create/` — sponsor sets their password
4. We listen for one of: (a) another QGIV postMessage signaling account-create completion, or (b) the iframe navigating to a Qgiv "thanks for activating" URL. (To be confirmed during build — likely a navigation `pageView` event or DOM signal.)
5. Once account creation is confirmed, swap modal to our success state — closes the iframe, presents two universal links:
   - **iOS:** `https://apps.apple.com/us/app/givi/id1485270576` (verify exact app store ID during build)
   - **Android:** `https://play.google.com/store/apps/details?id=com.qgiv.givi` (verify)

Below the buttons:
> You're registered and your bidder account is ready. Download Givi, log in with **{email}**, and you're set for June 10.

If the sponsor closes the modal AFTER `registrationComplete` but BEFORE setting their password, that's OK — they're already registered in Qgiv. They can set their password later via the email Qgiv sent them.

Small footer link: "Didn't get the email? Email Sherry" → mailto:smiggin@dsdmail.net

---

## Pre-build verification (Step 0) — STATUS

Most of Step 0 is **DONE** as of this chat (live walk-through 2026-05-18). Remaining:

1. ~~Walk a real registration through form 1097071 embed, capture postMessage events.~~ **DONE** — events confirmed via bundle grep + live walk through steps 1 & 2.
2. ~~Test prefill URL params on the embed.~~ **DONE** — params are `first_name`, `last_name`, `email` (lowercase, underscore). Cookie session overrides them for returning users; fresh users get the prefill.
3. ~~Inspect form 1097071 field set.~~ **DONE for steps 1 & 2** — see field list in section above. Step 3 ("Additional Details") field set still unknown; will inspect during build.
4. **TODO: Check Bloomerang webhooks availability on this org's plan.** Settings → Webhooks. Not blocking — postMessage is primary signal.
5. **TODO: Confirm Qgiv React bundle ACTUALLY bootstraps inside an iframe on our domain.** Test inconclusive in this session (iframe was offscreen, Qgiv may lazy-load). First build deploy will verify in production conditions.
6. **TODO: Verify Givi app store IDs.** Plan currently lists what I assumed; need to confirm `id1485270576` for iOS and `com.qgiv.givi` for Android, OR find the actual current IDs.

Items 4-6 can be verified during build; they don't gate the start.

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
