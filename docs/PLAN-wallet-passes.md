---
title: Gala Wallet Passes — Apple + Google with push updates
status: spec
project: gala (ramonscottf/gala)
phase: Wallet v1
source_chat: 2026-05-14 wallet build conversation
created: 2026-05-14
last_updated: 2026-05-14
---

# Gala Wallet Passes — Apple Wallet + Google Wallet, push-updated

## TL;DR

Two "Add to Wallet" buttons already exist in `src/portal/components/TicketDetailSheet.jsx` (lines 466-467) gated behind `mealsComplete`. They render disabled with a "Wallet support is coming. For now, screenshot this ticket." caption. The ConfirmationScreen has a single "Add to Apple Wallet (coming soon)" button at line 355.

We're making the buttons real. Apple `.pkpass` files served from `passes.daviskids.org` (a new Cloudflare Worker), Google Wallet EventTicketObject save links served from the same worker. Meal changes propagate to every issued pass via Apple's APNs-triggered pull web service and Google's server-side PATCH.

QR on every pass = the existing portal magic link (`https://gala.daviskids.org/sponsor/{token}` for sponsors, `/d/{token}` for delegations). Door-side, an usher scans the QR with their phone, the portal opens showing seats + meals + check-in status.

## Decisions locked in this chat (2026-05-14)

| Decision | Choice | Notes |
|---|---|---|
| Apple Developer account | Scott has one | Pass Type ID cert to be generated |
| Pass web service host | `passes.daviskids.org` | New CF Worker, custom domain. **Cannot change later without re-issuing every pass.** |
| QR content | Existing portal magic-link `?t={token}` | Same as email links today. No new door-scan tool in v1. |
| Push updates | Yes, full implementation | Both Apple (APNs → pull) and Google (server PATCH) |
| Visual design | Branded (DEF navy + logo + gradient + hero) | v6 email branding translated to pass format |
| Backfill | Yes, all confirmed sponsors | "Your wallet pass is ready" email blast once live |

## Pass content (front)

**Apple (Boarding Pass style — transitType=PKTransitTypeGeneric):**
- Header: "DEF GALA" (left), "JUNE 10" (right)
- Primary field: Sponsor company name OR guest name
- Secondary fields: "ROW" / "SEAT" or "SEATS" — handles 1 or many
- Auxiliary: "SHOWTIME" with movie + time (e.g. "Paddington 2 — 6:30 PM")
- Strip image: DEF blue→red gradient (the v6 email strip, exported at 1125×432px @3x)
- Logo: DEF logo white-on-navy 160×50px @3x

**Google (EventTicket class):**
- Header logo + DEF navy hero
- Title: "Davis Education Foundation Gala 2026"
- Subtitle: Sponsor name
- Section row: Seat(s), Showtime, Venue
- Hero image: Same gradient strip

## Pass content (back)

Both platforms support back fields. Use them for:
- **Meals selected** — per seat. If meals not yet picked, says "Pick your meals to unlock seat details — tap below"
- **Venue address**: Megaplex Theatres at Legacy Crossing, 1075 W Legacy Crossing Blvd, Centerville UT 84014
- **Change-meals link**: Deep link back into portal `/sponsor/{token}#meals`
- **Contact**: "Questions? sponsorships@daviskids.org or 801-512-9370" (Sherry's cell)
- **Foundation EIN line**: tasteful, for tax-receipt vibes
- **Auto-updates note**: "Meal changes you make in the portal will sync to this pass automatically."

## QR / Barcode

- **Format**: QR (PKBarcodeFormatQR for Apple, `QR_CODE` for Google)
- **Message**: Full URL to portal — `https://gala.daviskids.org/sponsor/{token}` for sponsors, `/d/{token}` for delegations
- **Alt text** (Apple): "Show this code at the door"

This is the same magic-link that's in their welcome email. Door-side they hand their phone to an usher who scans → portal opens → usher sees the seat assignment and can mark them present. (Door-scan tooling is out of scope for wallet v1, but the QR target supports a future enhancement where `?usher=1` or a separate `/checkin/{token}` mode is added.)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        gala.daviskids.org                       │
│  (existing Pages app — TicketDetailSheet + ConfirmationScreen)  │
│                                                                 │
│   ┌──────────────────────┐    ┌──────────────────────┐          │
│   │  Apple Wallet btn    │    │  Google Wallet btn   │          │
│   │  → GET passes.dk.org │    │  → window.location = │          │
│   │    /apple/{token}    │    │    save_url (JWT)    │          │
│   └──────────┬───────────┘    └──────────┬───────────┘          │
└──────────────┼────────────────────────────┼─────────────────────┘
               │                            │
               ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    passes.daviskids.org                         │
│              (NEW Cloudflare Worker: gala-passes)               │
│                                                                 │
│  PUBLIC ROUTES (token-auth, no Apple/Google secret needed):     │
│  GET  /apple/{token}              → .pkpass file (signed)       │
│  GET  /google/{token}             → 302 to Google save URL      │
│                                                                 │
│  APPLE WEB SERVICE (Apple-spec, called by iPhones):             │
│  POST /v1/devices/.../regs/{ptid}/{serial}  → register device   │
│  DELETE same path                            → unregister       │
│  GET  /v1/devices/.../regs/{ptid}?since=...  → list updated     │
│  GET  /v1/passes/{ptid}/{serial}             → fetch pass       │
│  POST /v1/log                                → Apple error logs │
│                                                                 │
│  INTERNAL ROUTES (called by gala app on meal change):           │
│  POST /sync/{token}               → re-sign Apple pass + APNs   │
│                                     + Google PATCH              │
│                                                                 │
│  BINDINGS:                                                      │
│  - GALA_DB (D1 1468a0b3...) — read sponsors/seats/showings      │
│  - WALLET_DB (D1 NEW) — wallet_devices, wallet_serials          │
│  - APPLE_CERT_KV — Pass Type ID cert + private key + WWDR       │
│  - GOOGLE_SA_KV — service account JSON                          │
│  - APNS_TEAM_ID, APNS_KEY_ID — Apple Push secrets               │
│  - PASS_ASSETS (R2) — logo/strip/icon PNGs                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (silent push)
                     ┌──────────────────┐
                     │  iPhones / APNs  │
                     │  ▶ pull update   │
                     └──────────────────┘
```

### Why a separate worker, not Pages Functions?

- **APNs requires HTTP/2 with cert auth** — feasible from a Worker via `fetch()` with a custom `Authorization: bearer <JWT signed with p8 key>` header. Clean code separation.
- **Pass signing is CPU-heavier than the average Pages function** — signing involves OpenSSL-style PKCS#7 detached signatures. The `node-forge` or `@peculiar/asn1-x509` libs work in Workers but want a dedicated home.
- **Domain isolation**: `passes.daviskids.org` is what's embedded in every issued pass forever. Keeping it as a single-purpose Worker means we can rewrite the gala Pages app freely without breaking passes already in people's wallets.

### New D1 database: `gala-wallet`

```sql
-- Maps issued passes to their canonical token + sponsor
CREATE TABLE wallet_serials (
  serial_number TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('apple','google')),
  token TEXT NOT NULL,               -- sponsor or delegation token
  token_kind TEXT NOT NULL,          -- 'sponsor' | 'delegation'
  google_object_id TEXT,             -- for Google: walletobjects/v1/eventTicketObject/{id}
  issued_at INTEGER NOT NULL,
  last_updated INTEGER NOT NULL,
  updates_revoked INTEGER DEFAULT 0  -- 1 if user removed pass
);

CREATE INDEX idx_wallet_serials_token ON wallet_serials(token);

-- Apple-only: iPhones register here for push updates
CREATE TABLE wallet_devices (
  device_library_id TEXT NOT NULL,
  pass_type_id TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  push_token TEXT NOT NULL,
  registered_at INTEGER NOT NULL,
  PRIMARY KEY (device_library_id, pass_type_id, serial_number)
);

CREATE INDEX idx_wallet_devices_serial ON wallet_devices(pass_type_id, serial_number);

-- For Apple's "passesUpdatedSince" query
CREATE TABLE wallet_update_tags (
  pass_type_id TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  update_tag INTEGER NOT NULL,       -- monotonic timestamp
  PRIMARY KEY (pass_type_id, serial_number)
);

-- Backfill / send tracking
CREATE TABLE wallet_backfill_log (
  token TEXT PRIMARY KEY,
  email_sent_at INTEGER,
  apple_added_at INTEGER,
  google_added_at INTEGER
);

-- Audit trail for sync events
CREATE TABLE wallet_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  trigger TEXT NOT NULL,             -- 'meal_change' | 'seat_change' | 'manual'
  status TEXT NOT NULL,              -- 'ok' | 'apns_fail' | 'google_fail'
  detail TEXT,
  ts INTEGER NOT NULL
);
```

---

## Phase 0 — Apple credentials (Scott, before code)

**Scott does this in browser/Keychain. 15 minutes. Block on code starting until done.**

1. Apple Developer → Certificates, Identifiers & Profiles → Identifiers → `+`
   - Type: **Pass Type IDs**
   - Description: "DEF Gala 2026 Wallet Pass"
   - Identifier: `pass.org.daviskids.gala`
2. Back to Certificates → `+` → **Pass Type ID Certificate** → choose the Pass Type ID just created
3. On Mac: Keychain Access → Certificate Assistant → Request Certificate from CA → save CSR
4. Upload CSR to Apple, download the `.cer` file
5. Double-click `.cer` to install in Keychain
6. Right-click → Export → save `.p12` (Scott picks a password — going into KV as secret)
7. Download Apple WWDR intermediate cert: https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
8. APNs: Apple Developer → Keys → `+` → name "DEF Gala APNs" → check **Apple Push Notifications service** → Download `.p8` (one-time download, save now). Note the Key ID and Team ID.

**Deliverable to Skippy (next session):**
- `pass-cert.p12` + password (paste as Worker secret via `wrangler secret put`)
- `AppleWWDRCAG3.cer`
- `AuthKey_{KEYID}.p8`
- Key ID, Team ID, Pass Type ID (`pass.org.daviskids.gala`)

## Phase 1 — Google Wallet (ship first, ~2 hours)

No certs, just a service account. Simplest possible thing first.

### 1.1 Google Cloud setup
1. Console → APIs & Services → Enable **Google Wallet API**
2. IAM → Service Accounts → Create — name "gala-wallet-issuer"
3. Grant role **Wallet Object Issuer**
4. Create JSON key, save securely
5. Apply for an Issuer ID at https://pay.google.com/business/console (takes minutes for test mode, ~1 day for production approval — apply NOW even before building so it's approved by go-live)

### 1.2 EventTicketClass (created once, upfront)
One class for the whole gala. Created via REST one time:
```
POST https://walletobjects.googleapis.com/walletobjects/v1/eventTicketClass
```
- `id`: `{issuerId}.defgala2026`
- `eventName`: "Davis Education Foundation Gala 2026"
- `venue`: Megaplex Legacy Crossing, full address
- `dateTime.start`: 2026-06-10T18:30:00-06:00 (adjust to actual movie start window)
- `hexBackgroundColor`: `#0b1b3c` (DEF navy)
- `logo`: hosted on R2 at `assets.daviskids.org/gala-2026/wallet-logo.png` (480×480, white-on-transparent variant)
- `heroImage`: gradient strip at `assets.daviskids.org/gala-2026/wallet-hero.png` (1860×600)

### 1.3 EventTicketObject (created per pass on save click)
When user taps "Google Wallet" button:
1. Frontend: `window.location = await fetch('/google/{token}').then(r => r.json()).then(j => j.save_url)`
2. Worker `GET /google/{token}`:
   - Looks up sponsor + seats from `GALA_DB`
   - Creates/upserts an EventTicketObject:
     - `id`: `{issuerId}.{token_hash}`
     - `classId`: `{issuerId}.defgala2026`
     - `seatInfo`: row + seat from D1
     - `ticketHolderName`: sponsor company name
     - `barcode`: QR with portal URL
   - Stores in `wallet_serials` table
   - Signs a JWT with `iss=service_account_email`, `aud=google`, `typ=savetowallet`, `origins=[gala.daviskids.org]`, `payload.eventTicketObjects=[{id}]`
   - Returns 302 to `https://pay.google.com/gp/v/save/{jwt}`

### 1.4 Update on meal change
Internal endpoint `POST /sync/{token}` triggered by gala app:
```js
PATCH https://walletobjects.googleapis.com/walletobjects/v1/eventTicketObject/{id}
{ textModulesData: [{ id: 'meals', body: 'Seat 14: Roast Beef\nSeat 15: Salad' }] }
```
Done. Google pushes to every device that has the pass.

## Phase 2 — Apple Wallet (~4 hours)

### 2.1 Cert ingestion
```bash
wrangler secret put APPLE_PASS_P12_BASE64 --name gala-passes
wrangler secret put APPLE_PASS_P12_PASSWORD --name gala-passes
wrangler secret put APPLE_WWDR_PEM --name gala-passes
wrangler secret put APNS_AUTH_KEY_P8 --name gala-passes
wrangler secret put APNS_KEY_ID --name gala-passes
wrangler secret put APNS_TEAM_ID --name gala-passes
```

### 2.2 Pass generation flow
On `GET /apple/{token}`:

1. Resolve token → sponsor + seats + meals (read GALA_DB)
2. Build `pass.json`:
   ```json
   {
     "formatVersion": 1,
     "passTypeIdentifier": "pass.org.daviskids.gala",
     "teamIdentifier": "{TEAM_ID}",
     "serialNumber": "{token_hash}",
     "organizationName": "Davis Education Foundation",
     "description": "DEF Gala 2026 Ticket",
     "logoText": "DEF Gala",
     "foregroundColor": "rgb(255,255,255)",
     "backgroundColor": "rgb(11,27,60)",
     "labelColor": "rgb(255,255,255)",
     "webServiceURL": "https://passes.daviskids.org/",
     "authenticationToken": "{16+ char random per pass, stored in wallet_serials}",
     "boardingPass": {
       "transitType": "PKTransitTypeGeneric",
       "headerFields": [{ "key": "date", "label": "DATE", "value": "JUN 10" }],
       "primaryFields": [
         { "key": "from", "label": "DEF GALA", "value": "{Sponsor name}" }
       ],
       "secondaryFields": [
         { "key": "seats", "label": "SEATS", "value": "Row D · 14, 15, 16" }
       ],
       "auxiliaryFields": [
         { "key": "show", "label": "SHOWING", "value": "Paddington 2 · 6:30 PM" }
       ],
       "backFields": [
         { "key": "meals", "label": "Your Meals", "value": "..." },
         { "key": "venue", "label": "Venue", "value": "Megaplex Legacy Crossing\n1075 W Legacy Crossing Blvd\nCenterville UT 84014" },
         { "key": "edit", "label": "Change Meals", "value": "Open portal", "attributedValue": "<a href='https://gala.daviskids.org/sponsor/{token}#meals'>Open portal</a>" },
         { "key": "ein", "label": "Davis Education Foundation", "value": "501(c)(3) · EIN 87-0386379" }
       ]
     },
     "barcodes": [
       {
         "format": "PKBarcodeFormatQR",
         "message": "https://gala.daviskids.org/sponsor/{token}",
         "messageEncoding": "iso-8859-1",
         "altText": "Show at the door"
       }
     ]
   }
   ```
3. Bundle:
   - `pass.json` (above)
   - `icon.png` @1x/@2x/@3x (29×29 base, navy w/ white logo glyph)
   - `logo.png` @1x/@2x/@3x (160×50 base, white-on-navy DEF wordmark)
   - `strip.png` @2x/@3x (375×123 base, blue→red gradient)
   - `manifest.json` — SHA-1 of every file above
4. Sign: PKCS#7 detached signature of `manifest.json` using Pass Type ID cert + WWDR intermediate. Library: `node-forge` (works in Workers) or `@peculiar/asn1-cms`. **This is the part most likely to require iteration — budget extra time.**
5. Zip everything together → return as `application/vnd.apple.pkpass`

### 2.3 Web service endpoints (Apple-spec, called by iPhones)

All require `Authorization: ApplePass {authenticationToken}` header which we issued in step 2.2.

- **Register device for updates**
  ```
  POST /v1/devices/{deviceLibraryId}/registrations/pass.org.daviskids.gala/{serialNumber}
  Body: { "pushToken": "{hex}" }
  ```
  Insert into `wallet_devices`. Return 201.

- **Unregister**
  ```
  DELETE /v1/devices/{deviceLibraryId}/registrations/pass.org.daviskids.gala/{serialNumber}
  ```
  Delete from `wallet_devices`. Return 200.

- **List updated serials**
  ```
  GET /v1/devices/{deviceLibraryId}/registrations/pass.org.daviskids.gala?passesUpdatedSince={tag}
  ```
  Query `wallet_update_tags` joined to `wallet_devices`. Return `{ serialNumbers: [...], lastUpdated: "..." }`.

- **Fetch updated pass**
  ```
  GET /v1/passes/pass.org.daviskids.gala/{serialNumber}
  ```
  Re-run pass generation, return current `.pkpass`. Set `Last-Modified` header.

- **Apple posts error logs**
  ```
  POST /v1/log
  ```
  Just log to `wallet_sync_log`. Useful for debugging signing issues.

### 2.4 APNs trigger on meal change

`POST /sync/{token}` (internal, from gala app):
1. Look up all serials for token + platform=apple
2. For each, increment `wallet_update_tags.update_tag` (set to `Date.now()`)
3. Look up all `wallet_devices` for those serials
4. For each pushToken, send empty APNs payload:
   ```
   POST https://api.push.apple.com/3/device/{pushToken}
   Headers:
     apns-topic: pass.org.daviskids.gala   ← THE PASS TYPE ID (not bundle id!)
     authorization: bearer {JWT signed with .p8 key, alg=ES256, iss=teamId, kid=keyId}
   Body: {}
   ```
5. Log to `wallet_sync_log`

The empty payload tells iOS "wake up and ask the web service what changed." iPhone then hits `GET /v1/devices/.../passesUpdatedSince=...`, sees the serial, hits `GET /v1/passes/.../{serial}`, gets the fresh pass.

## Phase 3 — Wire to gala portal (~1 hour)

### 3.1 Replace disabled `WalletButton` with functional version

`src/portal/components/TicketDetailSheet.jsx`:

```jsx
function WalletButton({ tone, label, href }) {
  const dark = tone === 'black';
  return (
    <a href={href} style={{ /* same styles, remove `disabled`, `cursor: pointer`, `opacity: 1` */ }}>
      <div>Add to</div>
      <div>{label}</div>
    </a>
  );
}

// Usage:
<WalletButton tone="black" label="Apple Wallet" href={`https://passes.daviskids.org/apple/${token}`} />
<WalletButton tone="white" label="Google Wallet" href={`https://passes.daviskids.org/google/${token}`} />
```

Remove the "Wallet support is coming. For now, screenshot this ticket." italic caption — but leave a tiny "Screenshot this ticket if you'd rather not use a wallet" fallback line for the non-wallet crowd.

### 3.2 Replace ConfirmationScreen Apple Wallet button

`src/portal/ConfirmationScreen.jsx` line 355 area: same swap, real link to `passes.daviskids.org/apple/{token}`, and add the Google button next to it.

### 3.3 Hook meal-change to sync endpoint

Wherever meal selection writes to D1 (find in `pick.js` or wherever the meal save endpoint lives — was touched in showing_number fix):
```js
// After successful meal write:
ctx.waitUntil(
  fetch(`https://passes.daviskids.org/sync/${token}`, {
    method: 'POST',
    headers: { 'X-Internal-Auth': env.WALLET_SYNC_SECRET }
  })
);
```

Add `WALLET_SYNC_SECRET` as a shared secret in both workers.

## Phase 4 — Branding polish (~2 hours)

Pass assets — produce at @1x, @2x, @3x:

| Asset | @1x dimensions | Use |
|---|---|---|
| `icon.png` | 29×29 | Lock screen, notification |
| `logo.png` | 160×50 max | Top-left of pass face |
| `strip.png` | 375×123 | Behind primary fields (boarding pass style) |
| `thumbnail.png` (optional) | 90×90 | Right side near primary |

For Google:
| Asset | Dimensions | Use |
|---|---|---|
| Logo | 480×480 PNG | Pass logo |
| Hero | 1860×600 PNG | Wide banner |

**Asset sources:**
- White DEF wordmark already in R2 (used in TicketHero post-1.10-patch-3)
- Gradient strip — can lift from email v6 (blue→red horizontal)
- Need a 29×29 favicon-style glyph that reads at thumbnail scale — likely a stylized "DEF" monogram or theater-seat icon

All produced, optimized, uploaded to R2 bucket `gala-pass-assets`. Worker reads from there at pass-build time.

## Phase 5 — Backfill (~1 hour, once live)

Query: every sponsor where `seat_assignments.sponsor_id` exists and meals are complete OR the deadline hasn't passed.

Email template (uses existing SkippyMail v6 branding):
```
Subject: Your DEF Gala wallet pass is ready 🎟️

Hi {firstName},

Skip the email lookup on June 10 — your gala ticket is now available in
Apple Wallet and Google Wallet.

[Add to Apple Wallet] [Add to Google Wallet]

Both buttons link straight to your tickets — no login required.
The pass updates automatically if you change your meal selection.

Questions? Reply to Sherry at sponsorships@daviskids.org

— The DEF Gala team
```

Buttons link to `passes.daviskids.org/apple/{token}` and `/google/{token}` — same as in-portal.

Log to `wallet_backfill_log` so we don't double-send.

---

## File layout (new worker)

```
gala-passes/                     ← new repo: ramonscottf/gala-passes
├── src/
│   ├── index.ts                 ← router
│   ├── apple/
│   │   ├── build-pass.ts        ← pass.json + asset bundling
│   │   ├── sign-pass.ts         ← PKCS#7 signing
│   │   ├── web-service.ts       ← /v1/* endpoints
│   │   └── apns.ts              ← push trigger
│   ├── google/
│   │   ├── ticket-object.ts     ← class + object creation
│   │   ├── jwt.ts               ← save-link signing
│   │   └── patch.ts             ← update endpoint
│   ├── sync.ts                  ← /sync/{token} fan-out
│   ├── db.ts                    ← D1 queries
│   └── assets.ts                ← R2 fetches
├── migrations/
│   └── 0001_wallet_tables.sql
├── wrangler.toml
└── package.json
```

## wrangler.toml

```toml
name = "gala-passes"
main = "src/index.ts"
compatibility_date = "2026-05-14"

route = "passes.daviskids.org/*"

[[d1_databases]]
binding = "GALA_DB"
database_id = "1468a0b3-cc6c-49a6-ad89-421e9fb00a86"

[[d1_databases]]
binding = "WALLET_DB"
database_id = "{NEW — create via wrangler d1 create gala-wallet}"

[[r2_buckets]]
binding = "PASS_ASSETS"
bucket_name = "gala-pass-assets"

# Secrets (set via `wrangler secret put`):
#   APPLE_PASS_P12_BASE64
#   APPLE_PASS_P12_PASSWORD
#   APPLE_WWDR_PEM
#   APNS_AUTH_KEY_P8
#   APNS_KEY_ID
#   APNS_TEAM_ID
#   GOOGLE_SA_JSON
#   GOOGLE_ISSUER_ID
#   WALLET_SYNC_SECRET
```

## Open questions for next session

1. **Google Issuer ID approval status** — Scott applies via pay.google.com/business/console NOW so it's approved by build time
2. **Door scan workflow** — out of scope for v1 (QR → portal opens), but is anyone at DEF going to want a usher-facing app? If yes, that's a separate plan
3. **iOS Safari "add to wallet" UX** — on iPhone, tapping `.pkpass` link auto-opens Wallet add UI. On other browsers it downloads. May want platform sniff for cleaner copy ("Add to Apple Wallet" disabled on non-iOS? or just let it download?)
4. **PassKit JS button styling** — Google publishes official "Add to Google Wallet" button SVGs that should replace our custom WalletButton component for brand-compliance. Apple too. Asset swap, not a code change.

## Risks

- **PKCS#7 signing in Workers** is the highest-risk part. If `node-forge` doesn't behave in the V8 runtime, fall back to `@peculiar/asn1-cms` + `@peculiar/x509`. Worst case we host signing on a Render or Fly worker (cheap), but keep the rest on CF.
- **Apple Issuer review** — usually instant for Pass Type ID certs but can take a day. Scott should kick this off Phase 0 immediately.
- **Google production approval** — test mode works instantly with `state: 'PENDING_REVIEW'` saves. Production approval can take 1-3 days. Apply NOW.
- **passes.daviskids.org embedded forever** — if we ever decide to redo the wallet stack, every issued pass stops updating. v1 buyers in. Mitigation: route on a CF Worker means we can swap the backend implementation freely; only the hostname is locked.

## Estimated timeline

| Phase | Effort | Calendar |
|---|---|---|
| 0 — Apple cert generation (Scott) | 15 min | Same day |
| 0 — Google Issuer apply (Scott) | 5 min | Apply now, approval 1-3 days |
| 1 — Google Wallet end-to-end | ~2 hr | Day 1 |
| 2 — Apple Wallet end-to-end | ~4 hr | Day 1-2 |
| 3 — Wire to gala portal | ~1 hr | Day 2 |
| 4 — Branding polish | ~2 hr | Day 2 |
| 5 — Backfill blast | ~1 hr | Day 3 |
| **Total** | **~10 hr build + cert wait** | **Live within 3-5 days of go-ahead** |

Gala is June 10 — we have ~4 weeks of buffer. Plenty of runway.

## Out of scope for v1

- Door-scanning app for ushers (separate plan if needed)
- Multi-language passes (English only)
- Apple Pay or Google Pay payment integration (separate from wallet passes — that's the Bloomerang bridge plan)
- Wallet-only "tap and go" entry (would need NFC + scanner hardware at venue)
- Custom pass per-seat (one pass per sponsor token covers all their seats — meaning if a sponsor brings 8 guests, ONE person presents the pass for all 8)

The per-seat question is worth flagging: do we want one pass per token (current spec) or one pass per seat? Current spec is simpler — sponsor presents their phone, usher sees all seats, party walks in. Per-seat would mean emailing the magic-link to each guest and letting each guest add their own pass. **Decision deferred — current spec is one-pass-per-token, which is the screenshotted-ticket equivalent today.**
