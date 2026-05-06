# Flow Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the legacy desktop seat-pick stepper (`StepShowing` + `StepSeats`) so mobile and desktop share one canonical flow: `SeatPickSheet` → `PostPickSheet` → `ConfirmationScreen`. Add a missing reward beat (`PlacedTicketsPreview`) on top of `PostPickSheet`. Net code change must be negative.

**Architecture:** Both shells already share `SeatPickSheet` from the home/welcome surface (Mobile's TabBar Home and Desktop's StepWelcome both call `setSeatPickOpen(true)`). The divergence is the **deep-link path** at `/sponsor/{token}/seats`:
- **Desktop** routes the deep link through the legacy `StepShowing`+`StepSeats`+`StepConfirm` stepper (`initialStep={onSeatsRoute ? 3 : 1}` in `App.jsx`).
- **Mobile** routes the deep link through `MobileWizard`, a separate component with its own finalize call (`MobileWizard.jsx:2136`).

This PR deletes the desktop stepper, collapses the desktop wizard to Welcome+Confirm, and routes `/seats` through `SeatPickSheet` from Welcome on Desktop (spec option `(b)`). The mobile `MobileWizard` fate is **Task 6 — decision point** (delete vs. refactor). `PlacedTicketsPreview` is a new shared component rendered at the top of `PostPickSheet` on both shells.

**Tech Stack:** React 18 + Vite. Cloudflare Pages Functions for `/api/gala/portal/[token]/*`. D1 (`GALA_DB`). Playwright for E2E + a11y + visual regression. No CSS framework — inline styles + `BRAND` tokens from `src/brand/tokens.js`.

**Inherited context (from prior session):**
- `docs/PLAN-flow-unification.md` (the spec — Skippy's strategy doc)
- `docs/REVIEW-2026-05-06-qa-harness.md` (code review of the QA harness on `main`)
  - **Important #4** (`QA_TOKEN` leak in `qa/lib/config.js:5`) is fixed in **Task 1**.
  - **Important #1** (commit-split discipline) — every commit in this PR has its own focused message.
  - **Important #2** (visual baseline flake) — `npm run qa:visual` failures **DO NOT BLOCK** this PR. Diffs are noted in the PR description for awareness only. Real regressions are caught by `qa:smoke` + `qa:a11y` + the new `qa/shell-parity.spec.js`. The visual harness is treated as a flaky leading indicator until the cross-machine baseline policy (review follow-up #2) is fixed in a separate PR.
  - The other 7 review follow-ups are **out of scope**; file follow-up issues if you want.

**Hard rules (from spec):**
1. Don't change visual styling. Different chrome per shell stays.
2. Don't touch sibling apps under `public/admin`, `public/review`, `public/volunteer`, `public/checkin`.
3. Net line count goes DOWN.
4. One Code session at a time on this repo. Pre-flight checks for in-flight branches.
5. Cloudflare API: `X-Auth-Key` + `X-Auth-Email`. Never `Bearer`.
6. Production tokens must produce identical OR clearly-better visible output until merged.

**Test sponsors (both real, both go in developer `.env.local` — neither is a hardcoded default after Task 1):**
- Wicko (Scott, ID 80): `dgu5lwmfmgtecky3`
- DEF Staff (Kara, ID 93): `sgohonmgwicha15n`

The fix in Task 1 is "no default token at all" — `qa/lib/config.js` throws when `QA_TOKEN` is unset against a non-localhost `QA_BASE_URL`. Developers paste either token (whichever is theirs to test against) into their own `.env.local`. This isn't about retiring Kara's token; it's about removing the hardcoded fallback that made `npm run qa:smoke` hit prod with a known sponsor by default.

**Pages preview:** `gala-3z8.pages.dev`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `qa/lib/config.js` | Modify | Strip `QA_TOKEN` default; throw if missing against non-localhost. |
| `.env.example` | Create | Document required env vars (`QA_TOKEN`, `QA_BASE_URL`, optional `QA_RIVAL_TOKEN`, `QA_FIXED_NOW`). |
| `qa/README.md` | Modify | Document the env-var contract. |
| `qa/lib/config.test.mjs` | Create | Node `--test` unit covering the throw-on-prod path. |
| `qa/shell-parity.spec.js` | Create | Playwright test that captures `/finalize` request from both shells, asserts parity. |
| `package.json` | Modify | Add `qa:parity` script targeting the new spec. |
| `src/portal/components/PlacedTicketsPreview.jsx` | Create | Shared "you just placed these" boarding-pass mini-card. |
| `src/portal/components/PostPickSheet.jsx` | Modify | Render `<PlacedTicketsPreview>` at top of sheet body. |
| `src/portal/Desktop.jsx` | Modify | Delete `StepShowing` (~line 942) + `StepSeats` (~line 1242) + their wizard render cases (~lines 2326–2380) + dead state hooks. |
| `src/portal/Mobile.jsx` | Modify | (No-op for the unification itself; `PostPickSheet` change picks up `PlacedTicketsPreview` automatically.) |
| `src/portal/MobileWizard.jsx` | **DECISION POINT** | Delete entirely OR refactor finalize to share the canonical path. Pause for Scott. |
| `src/App.jsx` | Modify | Replace `initialStep={onSeatsRoute ? 3 : 1}` with `initialStep={1}` + new `openSheetOnMount={onSeatsRoute}` prop on `Desktop`; do the same for Mobile if `MobileWizard` is deleted. |
| `docs/IMPL-flow-unification.md` | Modify (state log) | This document. Tick checkboxes as tasks complete. The plan is the recovery surface if the session dies mid-flight — the next session reads the file, finds the lowest unchecked box, and resumes there. |

---

## Pre-flight (run before Task 1)

- [ ] **P-1:** `git status` — clean working tree on `main`.
- [ ] **P-2:** `git log --oneline origin/main..HEAD` — empty (no in-flight local commits).
- [ ] **P-3:** Check for in-flight PRs that could conflict.

Three theme branches exist on origin from yesterday's theme contest (visible in `git fetch` output): `theme/ios-native`, `theme/linear`, `theme/editorial` (plus the Claude-namespaced equivalents). These branches sit on top of `main` from before this PR. If any has an open PR that touches `src/portal/Desktop.jsx`, `src/portal/Mobile.jsx`, or `src/portal/components/SeatPickSheet.jsx`, this PR will conflict.

Run:
```bash
gh pr list --repo ramonscottf/gala --state open --json number,title,headRefName,files \
  --jq '.[] | {pr: .number, title, branch: .headRefName, files: (.files[]?.path | select(test("Desktop|Mobile|SeatPickSheet|MobileWizard")))}'
```

This returns one line per open PR that touches any of the four flow files. If the result is empty, proceed. If anything appears, **stop and tell Scott**: list the PR number, title, branch, and the conflicting file. Decide together whether to wait or rebase.

Also confirm there's no open PR already named/branded `feat/flow-unification`:
```bash
gh pr list --repo ramonscottf/gala --state open --head feat/flow-unification
```
Empty result → safe to create the branch. Non-empty → another agent or session is mid-flight; stop.
- [ ] **P-4:** `curl -sI https://gala.daviskids.org/sponsor/dgu5lwmfmgtecky3 | head -1` — expect `HTTP/2 200`. Production is up.
- [ ] **P-5:** `git checkout -b feat/flow-unification`. All work happens on this branch. **Do not push to `main`.**
- [ ] **P-6:** Confirm Node + Playwright installed: `npm run qa:install` (idempotent — installs Chromium if missing).

---

## Task 1: Fix `QA_TOKEN` leak

**Why first:** The current `qa/lib/config.js:5` defaults `QA_TOKEN` to a real production sponsor token (`'sgohonmgwicha15n'`). Anyone running `npm run qa:smoke` with no env vars hits prod with a known token. Inherited from review #4. Must land before any new QA work to prevent the leak from spreading.

**Files:**
- Modify: `qa/lib/config.js` (line 5 plus a new validation block)
- Create: `.env.example`
- Modify: `qa/README.md`
- Test: `qa/lib/config.test.mjs`

- [x] **Step 1: Read current `qa/lib/config.js`.**

Already known; the relevant excerpt is:
```js
export const QA_BASE_URL = (process.env.QA_BASE_URL || 'https://gala.daviskids.org').replace(/\/+$/, '');
export const QA_TOKEN = process.env.QA_TOKEN || 'sgohonmgwicha15n';
```

- [x] **Step 2: Write the failing test.**

Create `qa/lib/config.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function importFresh() {
  const url = new URL(`./config.js?t=${Date.now()}`, import.meta.url);
  return import(url);
}

test('throws when QA_TOKEN is missing and QA_BASE_URL points at prod', async () => {
  delete process.env.QA_TOKEN;
  process.env.QA_BASE_URL = 'https://gala.daviskids.org';
  await assert.rejects(importFresh(), /QA_TOKEN/);
});

test('does not throw when QA_BASE_URL points at localhost (no token)', async () => {
  delete process.env.QA_TOKEN;
  process.env.QA_BASE_URL = 'http://localhost:8788';
  const mod = await importFresh();
  assert.equal(mod.QA_TOKEN, '');
});

test('uses the provided QA_TOKEN when set', async () => {
  process.env.QA_TOKEN = 'abc123';
  process.env.QA_BASE_URL = 'https://gala.daviskids.org';
  const mod = await importFresh();
  assert.equal(mod.QA_TOKEN, 'abc123');
});
```

- [x] **Step 3: Run test to verify it fails.**

Run: `node --test qa/lib/config.test.mjs`
Expected: FAIL — first test does not reject because `config.js` currently defaults to `'sgohonmgwicha15n'` instead of throwing.

- [x] **Step 4: Implement the fix in `qa/lib/config.js`.**

Replace lines 1–8 with:
```js
function isLocalhost(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

export const QA_BASE_URL = (process.env.QA_BASE_URL || 'https://gala.daviskids.org').replace(
  /\/+$/,
  ''
);

const rawToken = process.env.QA_TOKEN || '';
if (!rawToken && !isLocalhost(QA_BASE_URL)) {
  throw new Error(
    'QA_TOKEN is required when QA_BASE_URL points at a non-localhost host. ' +
    'Copy .env.example, set QA_TOKEN to a dedicated test sponsor token, and re-run. ' +
    'See qa/README.md.'
  );
}
export const QA_TOKEN = rawToken;
export const QA_RIVAL_TOKEN = process.env.QA_RIVAL_TOKEN || '';
export const QA_FIXED_NOW = process.env.QA_FIXED_NOW || '2026-05-05T18:00:00-06:00';
export const SPONSOR_PATH = `/sponsor/${QA_TOKEN}`;
```

(Preserve the `sponsorUrl`, `freezeClockScript`, and `preparePage` exports below this — only the top block changes.)

- [x] **Step 5: Run test to verify it passes.**

Run: `node --test qa/lib/config.test.mjs`
Expected: 3/3 PASS.

- [x] **Step 6: Create `.env.example`.**

```bash
# Sponsor portal QA — required env vars when targeting non-localhost.
# Copy to .env.local (which is .gitignored) and fill in.

# Base URL for the portal. Defaults to prod.
QA_BASE_URL=https://gala.daviskids.org

# Test sponsor token. REQUIRED when QA_BASE_URL is non-localhost.
# Use a dedicated test sponsor — never a real attendee's token.
# Production /finalize against this token will send real email + SMS.
QA_TOKEN=__YOUR_TEST_SPONSOR_TOKEN__

# Optional: second test token for cross-sponsor race scenarios in qa:stress.
QA_RIVAL_TOKEN=

# Optional: ISO timestamp the visual harness freezes the page clock to.
QA_FIXED_NOW=2026-05-05T18:00:00-06:00
```

- [x] **Step 7: Update `qa/README.md`.**

Replace the "Default target" + first override block (lines 5–14) with:
```markdown
## Setup

Copy `.env.example` to `.env.local` (or export the vars in your shell) before running any `qa:*` script. `QA_TOKEN` is **required** unless `QA_BASE_URL` points at `localhost`. See `.env.example` for the full list.

Run against prod (default base URL):
\`\`\`bash
QA_TOKEN=<your-test-sponsor-token> npm run qa:smoke
\`\`\`

Run against local wrangler:
\`\`\`bash
QA_BASE_URL=http://localhost:8788 npm run qa:smoke
\`\`\`
```
(Keep the rest of the README intact.)

- [x] **Step 8: Verify the existing harness still loads.**

Run: `QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:smoke -- --list`
Expected: Playwright lists tests without throwing config errors. (We're not running them — `--list` only resolves config.)

- [x] **Step 9: Commit.**

```bash
git add qa/lib/config.js qa/lib/config.test.mjs qa/README.md .env.example
git commit -m "fix: move QA_TOKEN default out of source

Prevents npm run qa:smoke from hitting prod with a known sponsor
token when QA_TOKEN is unset. Throws if missing against a
non-localhost QA_BASE_URL. Adds .env.example.

Addresses code review follow-up #4 from
docs/REVIEW-2026-05-06-qa-harness.md."
```

---

## Task 2: Failing shell-parity Playwright test (TDD red)

**Why:** Lock in the divergence as a test before fixing it. The legacy desktop stepper produces a different **sequence** of POST request bodies than the canonical `SeatPickSheet` path. The "identical end state" criterion from the spec means identical sequence of state mutations — so the test captures every POST in the seat-pick → finalize flow (`/pick`, `/assign`, `/set_dinner`, `/finalize`), not just `/finalize`. Divergence might land upstream of finalize.

**Why request capture (not response):** Real `/finalize` POSTs send email + SMS to the sponsor. Running this test repeatedly would spam Wicko. Route interception captures request bodies; finalize is fulfilled with a stable mock response so the UI's post-finalize transition completes without server side effects. Pick/assign/set_dinner are passed through (they're reversible via `cleanupToken`). **Deliberate deviation from spec wording** ("response payloads byte-equal") — request-sequence parity is the actually-testable signal of the bug.

**Why testids, not text matchers:** Text changes during normal copy edits; testids don't. We add `data-testid` attributes to the relevant components in this same task — single-line additions, no behavior change. Bundled with the test commit because the test depends on them.

**Files:**
- Read first: `functions/api/gala/portal/[token]/finalize.js`, `pick.js`, `assign.js` (if present), `set_dinner.js` (if present) — confirm request schemas before writing assertions.
- Read first: `src/portal/components/SeatPickSheet.jsx`, `Desktop.jsx` (StepSeats + StepConfirm + Welcome CTAs), `Mobile.jsx` (Home finalize CTA), `SeatEngine.jsx` — find existing testids; identify what to add.
- Create: `qa/shell-parity.spec.js`
- Create: `qa/lib/normalize.js`
- Modify: `package.json` (add `qa:parity`, reorder `qa:all`)
- Modify: `qa/README.md` (document `qa:parity` + new `qa:all` order)
- Modify (testid attrs only, no behavior change): `src/portal/components/SeatPickSheet.jsx`, `src/portal/components/PostPickSheet.jsx`, `src/portal/Desktop.jsx`, `src/portal/Mobile.jsx`, `src/portal/SeatEngine.jsx`

- [ ] **Step 1: Read the server-side endpoint contracts.**

Open every endpoint that the seat-pick → finalize flow calls and document the request schema:
```bash
ls functions/api/gala/portal/\[token\]/
```
Read the full source of:
- `finalize.js` — confirm method, body shape, what fields the server reads
- `pick.js` — schema for `action: 'finalize' | 'unfinalize' | 'set_dinner' | 'assign'` (some endpoints multiplex through `/pick` with an `action` discriminator — verify)
- `assign.js` (if it exists; if not, note assignment goes through `/pick` with `action: 'assign'`)
- `set_dinner.js` (same — likely multiplexed through `/pick`)

In the test file's top-of-file comment, paste each endpoint's signature: HTTP method, URL pattern, required fields, optional fields, and **server-generated fields that vary across calls** (timestamps, idempotency tokens, request UUIDs). The normalization layer in Step 4 must strip exactly those fields — get the list right here.

If `/finalize` accepts an empty body, document that explicitly. If it accepts `{idempotency_key}` per request, that's a stripped field. **Don't guess.**

- [ ] **Step 2: Inventory existing data-testid coverage.**

```bash
grep -rn "data-testid\|data-seat-id" src/portal/ src/brand/
```

Record every existing testid. Then identify the testids the parity test will need:

| Component | Element | testid |
|---|---|---|
| SeatPickSheet root container | outermost `<div>` | `seat-pick-sheet` |
| SeatPickSheet commit button | sticky CTA at bottom | `seat-pick-commit` |
| PostPickSheet "Done — back to overview" | the third action card | `post-pick-done` |
| Welcome (Desktop) "Place seats" / Home (Mobile) "Place seats" | the CTA that calls `setSeatPickOpen(true)` | `cta-place-seats` |
| Welcome (Desktop) "Review & finalize" / Home (Mobile) "Send my QR" | the canonical-path finalize CTA | `cta-finalize` |
| Legacy `StepSeats` commit button | the "Continue" / "Place" button | `legacy-seats-commit` |
| Legacy `StepConfirm` "Done — send me my QR" button | the legacy finalize CTA | `legacy-finalize` |
| Each seat in `SeatMap` | already `data-seat-id="row-num"` per `SeatEngine.jsx` | (verify exists; add if not) |

If any of these are already testid'd under a different name, **use the existing name** and update the table in this plan accordingly. Do not rename.

- [ ] **Step 3: Add missing testid attributes.**

For each missing testid, edit the relevant JSX file to add `data-testid="..."` as an attribute on the existing element. **Single-line addition. No behavior change. No structural edits.**

Example (SeatPickSheet root, around line 36–48 of `src/portal/components/SeatPickSheet.jsx`):
```jsx
// before
<div style={{ ... }}>

// after
<div data-testid="seat-pick-sheet" style={{ ... }}>
```

After each file edit, run `npm run build` to confirm no syntax break. Do NOT commit yet — testids commit alongside the test in Step 9.

- [ ] **Step 4: Add the normalization helper.**

Create `qa/lib/normalize.js`:
```js
// qa/lib/normalize.js
//
// Canonicalizes a POST request body for shell-parity comparison.
//
// Strips fields that vary run-to-run on the same logical request:
//   - timestamps (ISO 8601 strings, epoch numbers in known time fields)
//   - UUIDs (RFC 4122 v4 — used for idempotency keys, request IDs)
//   - explicit time/id field names (created_at, updatedAt, request_id, etc.)
// Sorts object keys deeply so insertion order doesn't break equality.
//
// Confirm the stripped-key list matches the server's "vary per request"
// fields documented in the spec file's top-of-file comment.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const STRIPPED_KEYS = new Set([
  'idempotency_key', 'idempotencyKey',
  'request_id', 'requestId',
  'created_at', 'createdAt',
  'updated_at', 'updatedAt',
  'timestamp', 'ts',
]);

function isStrippableValue(v) {
  if (typeof v !== 'string') return false;
  return UUID_RE.test(v) || ISO_TS_RE.test(v);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (STRIPPED_KEYS.has(key)) continue;
      const v = value[key];
      if (isStrippableValue(v)) continue;
      out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

export function normalizeBody(rawBody) {
  if (!rawBody) return '';
  let parsed;
  try { parsed = JSON.parse(rawBody); }
  catch { return rawBody; }
  return JSON.stringify(canonicalize(parsed));
}
```

The stripped-key list must match the "varies per request" fields documented in Step 1. If the server uses different field names (e.g. `req_id` instead of `request_id`), add them.

- [ ] **Step 5: Write the failing parity test.**

Create `qa/shell-parity.spec.js`. Paste the endpoint contract block from Step 1 at the top as a comment. Then:
```js
import { test, expect, devices } from '@playwright/test';
import { QA_BASE_URL, QA_TOKEN, sponsorUrl, preparePage } from './lib/config.js';
import { ensureFreshState, cleanupToken, findSeatBlock } from './lib/portal-api.js';
import { normalizeBody } from './lib/normalize.js';

const FAKE_FINALIZE_RESPONSE = {
  ok: true,
  seatCount: 2,
  qrImgUrl: `${QA_BASE_URL}/api/gala/portal/${QA_TOKEN}/qr.png?test=1`,
  email: { sent: true },
  sms: { sent: true },
  myAssignments: [],
};

async function captureSequence(page) {
  const sequence = [];
  await page.route('**/api/gala/portal/*/**', async (route, request) => {
    if (request.method() !== 'POST') return route.continue();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop();
    sequence.push({
      endpoint,
      method: request.method(),
      body: normalizeBody(request.postData() || ''),
    });
    if (endpoint === 'finalize') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FAKE_FINALIZE_RESPONSE),
      });
    } else {
      await route.continue();  // /pick, /assign, /set_dinner: real DB writes (reversible via cleanupToken)
    }
  });
  return sequence;
}

async function pickAndFinalizeViaSheet(page, block) {
  await page.getByTestId('cta-place-seats').first().click();
  await page.getByTestId('seat-pick-sheet').waitFor();
  for (const seatId of block.seatIds) {
    await page.locator(`[data-seat-id="${seatId}"]`).click();
  }
  await page.getByTestId('seat-pick-commit').click();
  await page.getByTestId('post-pick-done').click();
  await page.getByTestId('cta-finalize').click();
}

async function pickAndFinalizeViaLegacy(page, block) {
  for (const seatId of block.seatIds) {
    await page.locator(`[data-seat-id="${seatId}"]`).click();
  }
  await page.getByTestId('legacy-seats-commit').click();
  await page.getByTestId('legacy-finalize').click();
}

test.describe('shell parity', () => {
  test.beforeEach(async () => { await ensureFreshState(QA_TOKEN); });
  test.afterEach(async () => { await cleanupToken(QA_TOKEN); });

  test('full POST sequence is identical across shells', async ({ browser }) => {
    const block = await findSeatBlock({ token: QA_TOKEN, count: 2 });
    const runs = [
      { label: 'mobile', context: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }, path: '', drive: pickAndFinalizeViaSheet },
      { label: 'desktop-canonical', context: { viewport: { width: 1365, height: 900 } }, path: '', drive: pickAndFinalizeViaSheet },
      { label: 'desktop-legacy', context: { viewport: { width: 1365, height: 900 } }, path: '/seats', drive: pickAndFinalizeViaLegacy },
    ];

    const sequences = {};
    for (const run of runs) {
      const ctx = await browser.newContext({ ...run.context, baseURL: QA_BASE_URL });
      const page = await ctx.newPage();
      await preparePage(page);
      sequences[run.label] = await captureSequence(page);
      await page.goto(sponsorUrl(QA_TOKEN, run.path), { waitUntil: 'networkidle' });
      await run.drive(page, block);
      await page.waitForTimeout(500);
      await ctx.close();
      await cleanupToken(QA_TOKEN);
    }

    // Each run produces the same SEQUENCE of POSTs:
    //   [{ endpoint, method, body: normalizedJSON }, ...]
    //
    // Today, desktop-legacy diverges. After Task 9, all three sequences match.
    expect(sequences['desktop-canonical']).toEqual(sequences['mobile']);
    expect(sequences['desktop-legacy']).toEqual(sequences['mobile']);
  });
});
```

- [ ] **Step 6: Update `package.json` — add `qa:parity` and reorder `qa:all`.**

In the `scripts` block:
```json
"qa:parity": "playwright test -c qa/playwright.config.js qa/shell-parity.spec.js",
"qa:all": "npm run qa:smoke && npm run qa:a11y && npm run qa:parity && (npm run qa:visual || true) && npm run qa:lighthouse && npm run qa:stress"
```

New order: **smoke → a11y → parity → visual (advisory, won't short-circuit) → lighthouse → stress.**

The `(npm run qa:visual || true)` shell wrap is a narrow fix for this PR (review follow-up #10). Full `npm-run-all` rework is out of scope.

- [ ] **Step 7: Update `qa/README.md`.**

Add to the Commands list (in script-execution order):
```markdown
- `npm run qa:parity` — shell-parity gate. Drives mobile, desktop-canonical, and desktop-legacy paths through pick → finalize and asserts identical normalized POST sequences. Hard fail. Catches divergence between seat-pick codepaths.
```

Add a paragraph after the Commands list:
```markdown
`qa:all` runs in this order: smoke → a11y → **parity** → visual (advisory; wrapped to never short-circuit the chain) → lighthouse → stress. Visual is intentionally tolerant of cross-machine pixel drift; real regressions are caught by smoke + a11y + parity.
```

- [ ] **Step 8: Run the parity test against current `main`.**

```bash
QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:parity 2>&1 | tee qa/output/parity-failure-on-main.txt
```

Expected: FAIL on the desktop-legacy assertion. Capture the full output to `qa/output/parity-failure-on-main.txt` (gitignored — used for the commit body only). The output should show the divergent sequences side-by-side. If Playwright's diff format is hard to read, run:
```bash
QA_TOKEN=dgu5lwmfmgtecky3 npx playwright test -c qa/playwright.config.js qa/shell-parity.spec.js --reporter=line 2>&1 | tee qa/output/parity-failure-on-main.txt
```

Verify the output contains:
- The `mobile` sequence (the canonical baseline)
- The `desktop-legacy` sequence
- The first diverging element (likely either a different `endpoint` ordering or a different `body` payload)

If the test passes unexpectedly: stop, investigate. The bug should be reproducible — either selectors aren't actually finding the legacy elements (selector bug, fix and retry) or the divergence is more subtle than the spec assumed (in which case the test is still a regression gate, but document the finding for Scott).

- [ ] **Step 9: Commit.**

The commit body **must include** the captured failure output as the receipt for the bug.

```bash
git add qa/shell-parity.spec.js qa/lib/normalize.js package.json qa/README.md \
  src/portal/components/SeatPickSheet.jsx src/portal/components/PostPickSheet.jsx \
  src/portal/Desktop.jsx src/portal/Mobile.jsx src/portal/SeatEngine.jsx
git commit -m "$(cat <<'EOF'
test: add failing shell-parity check for full POST sequence divergence

Drives mobile, desktop-canonical, and desktop-legacy paths through
seat pick → finalize and asserts identical sequences of normalized
POST request bodies (/pick, /assign, /set_dinner, /finalize).

The desktop-legacy run (via /sponsor/{token}/seats deep link →
StepSeats → StepConfirm) diverges from the canonical SeatPickSheet
path. Task 9 in docs/IMPL-flow-unification.md fixes this by routing
the deep link through SeatPickSheet from Welcome.

Includes:
- qa/lib/normalize.js — strips timestamps, UUIDs, idempotency keys;
  sorts keys deeply for byte-equal comparison.
- data-testid attributes on SeatPickSheet, PostPickSheet, the
  Welcome/Home CTAs, and the legacy StepSeats/StepConfirm buttons.
  No behavior change.
- qa:all reordered: smoke → a11y → parity → visual (advisory) →
  lighthouse → stress. Visual won't short-circuit the chain.

Failure output on main (proves the bug exists):

<paste qa/output/parity-failure-on-main.txt — show the divergent
endpoint/body between mobile and desktop-legacy>

Run: npm run qa:parity
EOF
)"
```

The `<paste ...>` placeholder is literal — the implementer replaces it with the actual captured output before running `git commit`.

---

## Task 3: Wire `SeatPickSheet` into Desktop's case-2 wizard step

**Why:** The spec asks the legacy `StepSeats` to be replaced by a wrapper that opens `SeatPickSheet` immediately. This is the **safe intermediate state** before deletion: case-2 still exists in the wizard render block, but it now mounts `SeatPickSheet` inside it instead of the legacy seat picker. After verifying it works, Task 5 deletes case-2 entirely.

**Files:**
- Modify: `src/portal/Desktop.jsx` (the `case 2`/`case 3` JSX block at ~line 2326–2380)

- [ ] **Step 1: Read `Desktop.jsx` lines 2200–2400.**

Open the file and inspect the wizard render. Confirm:
- `step === 1` renders `<StepWelcome>` with all three callbacks calling `setSeatPickOpen(true)`.
- `step === 2` renders `<StepShowing ...>`.
- `step === 3` renders `<StepSeats ...>`.
- `step === 4` renders `<StepConfirm>` (or similar).
- The `<Modal open={seatPickOpen}>` block (line ~2495) already mounts `<SeatPickSheet>` correctly.

If any of these don't match, **stop and reconcile with the spec before proceeding.**

- [ ] **Step 2: Replace `case 2`'s `<StepShowing>` with a wrapper that opens the sheet.**

Inside the wizard render block, where `step === 2 && (<StepShowing ... />)` lives, replace with:
```jsx
{step === 2 && (
  <SeatPickStepWrapper
    onClose={() => setStep(1)}
    seatPickOpen={seatPickOpen}
    setSeatPickOpen={setSeatPickOpen}
  />
)}
```

Define `SeatPickStepWrapper` as a small component at the top of the file (next to the other Step components, ~line 940 area), or inline near the wizard render:
```jsx
// Replaces StepShowing — opens the canonical SeatPickSheet on mount.
// Closing without a placement returns to Welcome.
const SeatPickStepWrapper = ({ onClose, seatPickOpen, setSeatPickOpen }) => {
  useEffect(() => {
    if (!seatPickOpen) setSeatPickOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--mute)' }}>
      Opening seat picker…
    </div>
  );
};
```

The placeholder text shows briefly before the sheet animates in. The actual seat picker is the existing `<Modal>` already mounted at line 2495.

- [ ] **Step 3: Remove the `case 3` `<StepSeats>` render.**

Replace the `step === 3 && (<StepSeats ... />)` block with:
```jsx
{step === 3 && (
  <SeatPickStepWrapper
    onClose={() => setStep(1)}
    seatPickOpen={seatPickOpen}
    setSeatPickOpen={setSeatPickOpen}
  />
)}
```

(Same wrapper handles both case 2 and case 3 — both should open the sheet.)

- [ ] **Step 4: Verify the SeatPickSheet `onClose` returns to Welcome.**

In the existing `<Modal open={seatPickOpen}>` block at ~line 2495, find the `onClose={() => setSeatPickOpen(false)}` prop. Add `setStep(1)` so closing the sheet without committing returns to Welcome:
```jsx
<Modal
  open={seatPickOpen}
  onClose={() => {
    setSeatPickOpen(false);
    if (step === 2 || step === 3) setStep(1);
  }}
  title="Place seats"
  maxWidth={760}
>
```

(Same change inside the inner `<SeatPickSheet onClose={...}>` callback.)

- [ ] **Step 5: Build to verify no syntax errors.**

Run: `npm run build`
Expected: Vite builds without errors. Bundle size shouldn't change much yet (we haven't deleted the legacy components — they're just unreferenced).

- [ ] **Step 6: Manual browser verification — three explicit scenarios.**

Run `npm run dev`. Before each scenario, clean up:
```bash
node -e "import('./qa/lib/portal-api.js').then(m => m.cleanupToken('dgu5lwmfmgtecky3'))"
```
(Or use `ensureFreshState` from a quick scratch script.)

**Scenario A — canonical URL:** Open `http://localhost:5173/sponsor/dgu5lwmfmgtecky3` at desktop width (1365px).
- Welcome renders normally with placed-seat count = 0.
- Click the Welcome "Place seats" CTA → `SeatPickSheet` opens (the canonical Branch B path, not via `SeatPickStepWrapper`).
- Pick 2 seats → click commit → sheet closes → `PostPickSheet` appears showing the placed pair.
- Click "Done — back to overview" → returns to Welcome with placed-seat count = 2.
- Click the canonical finalize CTA on Welcome ("Review & finalize") → `ConfirmationScreen` renders with the QR.

**Scenario B — deep-link URL:** Open `http://localhost:5173/sponsor/dgu5lwmfmgtecky3/seats` at desktop width.
- Page loads. The wizard mounts at step 3 (legacy `StepSeats` route, but case-3 now renders `SeatPickStepWrapper`).
- `SeatPickStepWrapper`'s `useEffect` fires → `SeatPickSheet` opens automatically.
- Pick 2 seats → commit → sheet closes → `PostPickSheet` appears (same as Scenario A from this point).
- Click "Done" → wizard returns to step 1 (Welcome) — **not** a blank case-3 placeholder.
- Continue Scenario A from "Click the canonical finalize CTA…"

**Scenario C — cancel path (the likely break point):** Reopen `http://localhost:5173/sponsor/dgu5lwmfmgtecky3/seats`.
- Page loads → `SeatPickSheet` opens automatically.
- Click the sheet's close (X) without picking any seats.
- Wizard MUST land on Welcome (step 1). **Not** a blank placeholder reading "Opening seat picker…" forever (which would mean `SeatPickStepWrapper`'s `useEffect` re-fires on the same mount).
- Click "Place seats" again → sheet should reopen normally (no state corruption).

Scenario C is the most likely failure: `SeatPickStepWrapper`'s `onClose` and the `<Modal>`'s `onClose` both need to cooperate — `setSeatPickOpen(false)` AND `setStep(1)` together. Verify both fire by adding a temporary `console.log` if needed.

If any scenario breaks, fix before committing.

- [ ] **Step 7: Commit.**

```bash
git add src/portal/Desktop.jsx
git commit -m "feat: wire SeatPickSheet into desktop wizard cases 2-3

Replaces the StepShowing and StepSeats render blocks with a
SeatPickStepWrapper that immediately opens the canonical
SeatPickSheet modal on mount. The legacy components are now
unreachable from the wizard render path.

Closing the sheet without a placement returns to Welcome.
Committing routes through the existing PostPickSheet chain.

Legacy StepShowing and StepSeats are still defined in the file —
deleted in the next commit (task 5)."
```

---

## Task 4: Run shell-parity test (TDD green for the wiring)

**Why:** Verify Task 3 wired the desktop-legacy path through `SeatPickSheet`. The Task 2 test should now pass for the seat-pick portion. Some assertions in the legacy run might still fail because StepConfirm is still the desktop finalize CTA — we accept that for now and tighten in Task 9.

- [ ] **Step 1: Run the parity test.**

Run: `QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:parity`
Expected: The mobile and desktop-canonical runs PASS. The desktop-legacy run may still differ in finalize behavior (StepConfirm-driven vs Welcome-driven). That's OK at this stage.

- [ ] **Step 2: If desktop-legacy still fails, capture the exact diff.**

Save the diagnostic to `/tmp/parity-diff-task4.txt` with this structure:
```
=== Task 4 — desktop-legacy parity diff after wiring ===

Mobile sequence (canonical baseline):
<paste sequences['mobile'] from the test failure output, JSON-pretty>

Desktop-canonical sequence:
<paste sequences['desktop-canonical'], JSON-pretty>

Desktop-legacy sequence:
<paste sequences['desktop-legacy'], JSON-pretty>

First diverging entry (index N):
  endpoint: <e.g. "finalize">
  mobile.body:        <normalized JSON>
  desktop-legacy.body: <normalized JSON>
  diff: <specific keys that differ — e.g. legacy includes "showing_number"
         that canonical doesn't, or legacy omits "delegation_id">

Upstream diffs (any /pick or /assign body differences):
<list each, by index>
```

Reference this file in **Task 9, Step 4** as the acceptance criterion: after Task 9, every line in this diff must reconcile (no diverging entries; no upstream diffs). Until then, the file is the receipt that Task 9 has remaining work.

- [ ] **Step 3: No commit yet.**

Task 5 deletes the legacy code; commit at end of Task 5. `/tmp/parity-diff-task4.txt` is gitignored — it lives only as long as the implementer needs it.

---

## Task 5: Delete the dead legacy code

**Why:** `StepShowing` and `StepSeats` are now unreferenced (Task 3 routed the wizard render through `SeatPickStepWrapper`). Their state hooks (`theaterId`, `movieId`, `showingNumber`, `sel`, etc.) might also be unused if they were only consumed by the deleted components. We delete everything that's now orphaned.

**Files:**
- Modify: `src/portal/Desktop.jsx`

- [ ] **Step 1: Identify the deletion ranges.**

```bash
grep -n "^const StepShowing\|^const StepSeats\|^// ── Step 2\|^// ── Step 3" src/portal/Desktop.jsx
```
Use the line numbers to find the closing brace of each component. Read the file at those ranges to confirm the boundaries.

- [ ] **Step 2: Delete `StepShowing`.**

Cut from the `// ── Step 2: Showing picker ──` comment through the closing `);` of the component. Verify the next non-blank line is `// ── Step 3: Seats ──` (or similar).

- [ ] **Step 3: Delete `StepSeats`.**

Same pattern. Cut from `// ── Step 3: Seats ──` through the component's closing brace. Next non-blank line should be the next component or `// ── Step 4 ──`.

- [ ] **Step 4: Find dead code — full sweep.**

The obvious set:
```bash
grep -n "useState\|theaterId\|showingNumber\|movieId\|setSel\|setMovieId\|setShowingNumber\|setTheaterId" src/portal/Desktop.jsx | head -50
```

But also check these less-obvious dead-code categories:

**(a) `useState` whose setter is no longer called.** A hook like `const [theaterId, setTheaterId] = useState(null)` is dead if `setTheaterId` no longer appears anywhere. Eslint `no-unused-vars` catches this if both halves go unused, but if `theaterId` is still read (e.g. in a stale `useMemo` dep array), eslint will keep both alive. Manually verify each setter has at least one live caller.

**(b) `useMemo` whose computed value is no longer read.** Search for the assigned variable name; if it appears only in the `useMemo` declaration line, the memo is dead.

```bash
grep -n "useMemo\|useCallback" src/portal/Desktop.jsx
```
For each, check the LHS variable name has live readers elsewhere in the file.

**(c) Helper functions that only `StepShowing`/`StepSeats` called.** Functions defined inside `Desktop.jsx` (top-level `function foo()` or `const foo = () => ...`) that took the legacy components' state (e.g. helpers reading `theaterId`/`showingNumber`).

```bash
grep -nE "^(function|const) [A-Za-z]+ ?=? ?(\(|function)" src/portal/Desktop.jsx | head -40
```
Spot-check each function — if it's no longer called anywhere, delete it.

**(d) Unused imports.** Eslint `no-unused-vars` does NOT flag unused imports by default in many configs. After deleting the components, scan the import block at the top of `Desktop.jsx` visually. Common candidates: `SeatMap`, `SEAT_TYPES`, `adaptTheater`, `autoPickBlock` from `SeatEngine.jsx` if they were only used by `StepSeats`. Other suspects: any helper from `useSeats`, `usePortal`, or local utility imports that the legacy components owned.

```bash
grep -n "^import" src/portal/Desktop.jsx
```
For each import line, verify at least one named import on that line is still referenced in the file body. Drop unused names.

**Conservative rule:** If you can't tell whether something is dead, leave it AND record it under a "## Ambiguous dead code" section appended to `docs/IMPL-flow-unification.md` with file:line and reason. Follow-up cleanup PR sweeps these.

Run lint to catch what tooling can:
```bash
npx eslint src/portal/Desktop.jsx --rule 'no-unused-vars: error' 2>&1 | head -30
```

- [ ] **Step 5: Verify the build and capture the bundle delta.**

Before this task, capture the baseline:
```bash
git stash  # if any uncommitted changes
git checkout main -- public/sponsor/assets/  # reset the assets to main's build
ls -la public/sponsor/assets/index-*.js
gzip -k public/sponsor/assets/index-*.js && ls -la public/sponsor/assets/index-*.js.gz
# Record both the raw KB and gzipped KB. Then:
rm public/sponsor/assets/index-*.js.gz
git checkout HEAD -- public/sponsor/assets/  # back to current
git stash pop  # if you stashed
```

Then run the new build:
```bash
npm run build
ls -la public/sponsor/assets/index-*.js
gzip -k public/sponsor/assets/index-*.js && ls -la public/sponsor/assets/index-*.js.gz
rm public/sponsor/assets/index-*.js.gz
```

Record both numbers (raw + gzipped) for the commit body. Format:
```
Bundle size: <main raw KB> KB → <new raw KB> KB (-<delta> KB)
Gzipped:     <main gz KB> KB → <new gz KB> KB (-<delta> KB)
```

If the bundle did NOT shrink: investigate. The deletion was real (~600 lines from a single file), so size MUST drop. If it didn't, you missed dead code in Step 4.

- [ ] **Step 6: Run all QA scripts.**

Run in order:
```bash
QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:smoke
QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:a11y
QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:parity
```
Expected: smoke + a11y pass. Parity may still have a desktop-legacy failure (Task 9 finishes that). Record output.

- [ ] **Step 7: Commit.**

The commit body **must include** the captured bundle size delta from Step 5.

```bash
git add src/portal/Desktop.jsx
# If the "Ambiguous dead code" section was appended in Step 4:
git add docs/IMPL-flow-unification.md
git commit -m "$(cat <<'EOF'
chore: remove legacy desktop seat-pick stepper

Deletes StepShowing and StepSeats components plus their dead state
hooks (theaterId, showingNumber, movieId, sel, etc.), associated
useMemo derivations, and imports that only those components used.
The wizard's case-2 and case-3 now mount SeatPickStepWrapper from
the prior commit, which opens the canonical SeatPickSheet.

StepConfirm (step 4) is intentionally retained — it's still the
desktop legacy finalize CTA that /sponsor/{token}/seats traverses.
Task 9 collapses the deep link to Welcome and renders StepConfirm
unreachable, at which point a follow-up commit can delete it.

Bundle size: <RAW MAIN KB> KB → <RAW NEW KB> KB (-<DELTA> KB)
Gzipped:     <GZ MAIN KB> KB → <GZ NEW KB> KB (-<DELTA> KB)
Net deletion in Desktop.jsx: <N> lines.
EOF
)"
```

The `<RAW MAIN KB>` etc. are placeholders the implementer fills in from Step 5 before running `git commit`.

---

## Task 6: MobileWizard fate — DECISION POINT

**Why pause:** The spec says "If MobileWizard is now redundant, consider deleting it entirely. Decision point — flag for Scott if you reach it." Per the user's brief, **pause here and let Scott decide.**

**Files:**
- Read: `src/portal/MobileWizard.jsx` (2252 lines)
- Read: `src/App.jsx` lines 107–130 (the `if (isMobile)` branch)

- [ ] **Step 1: Targeted read of `MobileWizard.jsx` (do not read all 2,252 lines).**

Read only:
- Lines 1–80 (imports + top-level component signature + props)
- Lines 2086–2186 (the `finalize` handler at line 2136 ± 50 lines for surrounding state + callers)
- The component's bottom export

Then grep for the internal helpers the finalize handler depends on:
```bash
grep -n "finalize\|/finalize\|finalizeError\|setFinalizeError" src/portal/MobileWizard.jsx
```
Pull each referenced helper's location and read just that line range. This usually surfaces the full finalize dependency graph in <300 lines of reading instead of 2,200.

Verify nothing outside `App.jsx` imports `MobileWizard`:
```bash
grep -rn "from.*MobileWizard\|import.*MobileWizard" src/
```
Expected: only `src/App.jsx:16`.

- [ ] **Step 2: Compare to Mobile.jsx's seat-pick + finalize path.**

In `Mobile.jsx` (3273 lines), find:
- The `<SeatPickSheet>` mount (line ~3124)
- The finalize CTA + handler (search `/finalize`)

Determine whether `Mobile.jsx` + `SeatPickSheet` already cover the `/sponsor/{token}/seats` deep-link case. If yes: MobileWizard can be deleted. If no: refactor needed.

- [ ] **Step 3: Write a decision summary.**

Add a section at the top of this plan (or in the PR description) titled `## MobileWizard decision`, with one of:

**Option A — Delete:**
> Mobile.jsx + SeatPickSheet fully covers /sponsor/{token}/seats. The boarding-pass shell handles the deep link by opening SeatPickSheet on mount when onSeatsRoute. MobileWizard.jsx is redundant. Deleting it removes ~2,200 lines.

**Option B — Refactor:**
> Mobile.jsx doesn't currently handle the deep-link case (specifically: <REASON>). MobileWizard's finalize call at line 2136 differs from Mobile's at line <X> in <WAY>. Refactoring MobileWizard to share Mobile.jsx's finalize handler and removing duplicate state. Net deletion: ~<N> lines.

- [ ] **Step 4: STOP. Tell Scott which option you've chosen and wait for sign-off.**

Do not proceed to Task 7 until Scott confirms.

- [ ] **Step 5: Execute the chosen option.**

**If Option A (delete):**
```bash
git rm src/portal/MobileWizard.jsx
```
Update `src/App.jsx`: remove the `import MobileWizard` line and the `if (onSeatsRoute) { return <MobileWizard ... />; }` branch. The mobile branch becomes:
```jsx
if (isMobile) {
  return (
    <Mobile
      portal={portal.state}
      token={token}
      theaterLayouts={layouts}
      seats={seats}
      isDev={dev}
      onRefresh={portal.refresh}
      openSheetOnMount={onSeatsRoute}  // new prop
    />
  );
}
```

**Verify the `openSheetOnMount` deps before settling on the pattern.** The `useEffect(() => { setSeatPickOpen(true) }, [])` shape only fires once on mount. If a sponsor navigates from `/sponsor/{token}` → `/sponsor/{token}/seats` *without a remount* (just a route change with the same `<Mobile>` instance), the effect won't re-fire and the sheet won't open.

Read `src/App.jsx` carefully — the `<PortalContainer>` is wrapped in `<Routes>` with two distinct `<Route path>` entries (`/:token` and `/:token/seats`) both rendering `<PortalContainer />`. React Router treats these as the same component instance when only the path differs (same element type), so a route change typically does NOT remount.

Test it: in the dev server, click a link that navigates from canonical to deep-link without a hard reload, and watch console logs. Document the finding inline in this plan under Step 5:

```
Findings:
- React Router behavior on /:token <-> /:token/seats: <REMOUNTS | DOES NOT REMOUNT>
- Pattern chosen: <one-shot useEffect with [] deps | useEffect with [openSheetOnMount] | other>
```

If route changes do **not** remount, use `useEffect(() => { if (openSheetOnMount) setSeatPickOpen(true) }, [openSheetOnMount])` so the effect re-fires when the prop flips. Then in `Mobile.jsx`, accept `openSheetOnMount` and apply the verified pattern.

**If Option B (refactor):**
- Extract the canonical finalize handler from `Mobile.jsx` into a shared hook (`src/hooks/useFinalize.js`?) or a method on `usePortal`.
- Make `MobileWizard.jsx` import + use it.
- Verify the refactored MobileWizard's `/finalize` request body matches Mobile's exactly.

**If Option B (refactor):**
- Extract the canonical finalize handler from `Mobile.jsx` into a shared hook (`src/hooks/useFinalize.js`?) or a method on `usePortal`.
- Make `MobileWizard.jsx` import + use it.
- Verify the refactored MobileWizard's `/finalize` request body matches Mobile's exactly.

- [ ] **Step 6: Commit.**

For Option A:
```bash
git add src/App.jsx src/portal/Mobile.jsx
git rm src/portal/MobileWizard.jsx
git commit -m "chore: remove MobileWizard, route /seats through Mobile + SeatPickSheet

The boarding-pass shell + SeatPickSheet now serves the
/sponsor/{token}/seats deep link via openSheetOnMount. MobileWizard
duplicated state and had a divergent finalize path; deleting it
removes ~2,200 lines and one source of shell drift.

Decision recorded in PR description."
```

For Option B:
```bash
git add src/portal/MobileWizard.jsx src/hooks/useFinalize.js src/portal/Mobile.jsx
git commit -m "refactor: share canonical finalize between Mobile and MobileWizard

Extracts the /finalize POST handler into useFinalize so both shells
hit the endpoint with identical request bodies. MobileWizard kept
as the deep-link surface; finalize call site updated to use the
shared hook.

Decision recorded in PR description."
```

---

## Task 7: Build `PlacedTicketsPreview` component

**Why:** The reward beat. After a sponsor places seats, `PostPickSheet` should show a "here are the tickets you just locked in" mini boarding-pass at the top. Single source of truth across both shells.

**Files:**
- Create: `src/portal/components/PlacedTicketsPreview.jsx`
- Test: a small Playwright snapshot via `qa/component-preview.spec.js` (covered in Step 6)

- [ ] **Step 1: Define the component contract.**

```jsx
// src/portal/components/PlacedTicketsPreview.jsx
//
// Reward beat — rendered at the top of PostPickSheet on both shells.
// Shows the just-placed seats as a mini boarding-pass card. Single
// source of truth for the "you just placed these" visual.
//
// Props:
//   placed: {
//     theaterId: number,
//     theaterName: string,
//     movieTitle: string,
//     showLabel: string,
//     showTime: string,
//     seatIds: string[],   // "A-3", "A-4"
//     posterUrl: string | null,
//   }
//
// Renders ~140px tall on mobile, ~180px on desktop. Gold edge,
// perforated divider, MEGAPLEX wordmark, seat list, showtime row.
// No interactivity — purely visual.

import { BRAND, FONT_DISPLAY, FONT_UI } from '../../brand/tokens.js';

export default function PlacedTicketsPreview({ placed }) {
  if (!placed || !placed.seatIds?.length) return null;
  const seatLabels = [...placed.seatIds].sort().map((s) => s.replace('-', ''));
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 14,
        background: 'linear-gradient(180deg, #1a1730 0%, #0f0d22 100%)',
        border: `1px solid ${BRAND.gold}55`,
        boxShadow: `0 8px 24px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.04)`,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: BRAND.gold,
          borderTopLeftRadius: 14,
          borderBottomLeftRadius: 14,
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div
          style={{
            fontFamily: FONT_UI,
            fontSize: 9,
            letterSpacing: 2.4,
            color: BRAND.gold,
            fontWeight: 800,
          }}
        >
          MEGAPLEX · DEF GALA 2026
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.65)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {placed.showLabel} · {placed.showTime}
        </div>
      </div>

      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 18,
          color: '#fff',
          lineHeight: 1.2,
        }}
      >
        {placed.movieTitle}
      </div>

      <div
        aria-hidden="true"
        style={{
          height: 1,
          background: `repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 6px, transparent 6px 12px)`,
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: FONT_UI,
        }}
      >
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          {placed.theaterName}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: 0.6,
          }}
        >
          {seatLabels.join(' · ')}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify `BRAND.gold` exists AND match the existing boarding-pass format.**

Token check:
```bash
grep -n "gold" src/brand/tokens.js | head -5
```
If `BRAND.gold` isn't defined, replace with the closest existing brand color (e.g. `BRAND.indigoLight` or whatever the existing boarding-pass card uses). Don't introduce new colors.

Format check — find how the existing boarding-pass card on Mobile + the movie sheet display showLabel + showTime:
```bash
grep -n "showLabel\|showing_number\|formatShowTime\|Early\|Late" \
  src/portal/Mobile.jsx \
  src/portal/components/MovieDetailSheet.jsx 2>/dev/null \
  src/portal/components/PostPickSheet.jsx
```

Look at the actual rendered string. Common patterns in this codebase:
- Combined string: `{showLabel} · {showTime}` → "Early · 4:30 PM"
- Two-line: showLabel above, showTime below
- Inline with separator: `{showLabel} • {showTime}` (different bullet)

**Match the existing pattern exactly** in `PlacedTicketsPreview`. If the boarding-pass card on `Mobile.jsx` renders "Early · 4:30 PM" (middle-dot separator), use that. If it uses an em-dash or different glyph, use that.

Update the component code from Step 1 to match. The point: this is reward-beat polish — it must look like family with the existing boarding-pass card, not a new design language.

If the file `MovieDetailSheet.jsx` doesn't exist (the grep returned no results), search for the show label rendering in the home boarding-pass card directly:
```bash
grep -n "showLabel\|showing_number" src/portal/Mobile.jsx | head -10
```
Look at the surrounding JSX and copy the exact format string.

- [ ] **Step 3: Verify the component imports build.**

Run: `npm run build`
Expected: Builds cleanly. The component is unused at this point but Vite tree-shakes — won't bloat output.

- [ ] **Step 4: Create a tiny preview harness page (test scaffolding).**

For component-isolation testing, create `qa/preview/placed-tickets.html` (a static HTML test page that mounts the component with mock data). This is the cheapest way to snapshot the component without spinning up the full app.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>PlacedTicketsPreview preview</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: #0a0820;
      font-family: -apple-system, sans-serif;
    }
    #root { max-width: 480px; margin: 0 auto; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/qa/preview/placed-tickets.jsx"></script>
</body>
</html>
```

```jsx
// qa/preview/placed-tickets.jsx
import { createRoot } from 'react-dom/client';
import PlacedTicketsPreview from '../../src/portal/components/PlacedTicketsPreview.jsx';

const mock = {
  theaterId: 5,
  theaterName: 'Auditorium 5',
  movieTitle: 'Wicked: Part Two',
  showLabel: 'Late',
  showTime: '8:30 PM',
  seatIds: ['F-12', 'F-13'],
  posterUrl: null,
};

createRoot(document.getElementById('root')).render(<PlacedTicketsPreview placed={mock} />);
```

(Vite serves these in dev because they live under the project root and import existing source.)

- [ ] **Step 5: Visual smoke test in the browser.**

Run: `npm run dev`
Open: `http://localhost:5173/qa/preview/placed-tickets.html`
Expected: Renders a single boarding-pass card with movie title, theater, seat numbers F12 · F13, gold edge, perforation. ~180px tall.

If broken, fix and re-test before committing.

- [ ] **Step 6: Add a Playwright snapshot test.**

Create `qa/component-preview.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { preparePage } from './lib/config.js';

test.describe('component previews', () => {
  test('PlacedTicketsPreview renders correctly @desktop-light', async ({ page }) => {
    await preparePage(page);
    // Assumes vite dev server is running. For CI/baseline, build first
    // and serve `public/sponsor/` instead — out of scope for this PR.
    await page.goto('http://localhost:5173/qa/preview/placed-tickets.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#root')).toHaveScreenshot('placed-tickets.png', {
      maxDiffPixelRatio: 0.04, // looser than visual.spec.js — advisory
    });
  });
});
```

Run: `npm run dev` in one terminal, then:
```bash
npx playwright test -c qa/playwright.config.js qa/component-preview.spec.js --update-snapshots
```
This generates the baseline. Visually inspect `qa/__screenshots__/.../placed-tickets.png` — does it match what you saw in Step 5? If yes, commit the baseline.

- [ ] **Step 7: File a follow-up ticket for CI-runnable preview harness.**

The harness in `qa/preview/` is **local-dev-only** for this PR — it requires `npm run dev` (vite serving). Make it CI-runnable by serving `public/sponsor/` build output instead. Out of scope for this PR; file the follow-up as:
```bash
gh issue create --repo ramonscottf/gala --title "Make qa/preview/ harness CI-runnable" --body "$(cat <<'EOF'
The PlacedTicketsPreview snapshot test (qa/component-preview.spec.js) currently requires \`npm run dev\` running locally to serve qa/preview/placed-tickets.html. CI doesn't have a vite dev server.

Make the harness CI-runnable by:
- Building public/sponsor/ via npm run build
- Serving it via a static file server (Playwright's built-in webServer config?)
- Updating the spec to point at the built URL

Filed from docs/IMPL-flow-unification.md Task 7.
EOF
)"
```
Capture the issue number and reference it in the Task 7 commit body.

- [ ] **Step 8: Commit.**

```bash
git add src/portal/components/PlacedTicketsPreview.jsx qa/preview/ qa/component-preview.spec.js qa/__screenshots__/
git commit -m "feat: add PlacedTicketsPreview reward-beat component

Mini boarding-pass card rendered after seat placement. Single
source of truth for the 'you just placed these' visual; both
shells will render it via PostPickSheet (next commit).

Includes a static preview harness (qa/preview/) and a Playwright
component snapshot baseline. Component is unwired to the portal
flow until task 8.

Note: qa/preview/ harness is local-dev-only — requires npm run dev.
CI-runnable follow-up tracked in #<ISSUE-N from Step 7>."
```

---

## Task 8: Wire `PlacedTicketsPreview` into `PostPickSheet`

**Why:** Make the new component visible at the top of `PostPickSheet`. Both shells render it automatically once the component is added — no per-shell wiring.

**Files:**
- Modify: `src/portal/components/PostPickSheet.jsx`

- [ ] **Step 1: Add the import.**

At the top of `PostPickSheet.jsx`:
```jsx
import PlacedTicketsPreview from './PlacedTicketsPreview.jsx';
```

- [ ] **Step 2: Render it at the top of the sheet body.**

Inside the outer `<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>` (line 33–34), add `<PlacedTicketsPreview>` as the first child, *before* the existing success header:
```jsx
return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <PlacedTicketsPreview placed={placed} />
    {/* Success header */}
    <div ... existing success header ...>
```

- [ ] **Step 3: Build and visually verify both shells.**

Run: `npm run dev`. Test in two browser windows:
- Mobile width 414px: place seats → verify the new mini-card appears at the top of PostPickSheet.
- Desktop width 1280px: same.

The card should be visible above the green-checkmark "N seats placed" header in both shells.

- [ ] **Step 4: Run `qa:visual` and document expected diffs — DO NOT regenerate baselines.**

The prior code review (Important #2) flagged that visual baselines flake cross-machine. Regenerating from this laptop would produce noise on every other machine that runs `qa:visual` (CI, other devs). The right path:

1. Run `QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:visual 2>&1 | tee qa/output/visual-task8.txt`.
2. Expected: diffs in placed-state `PostPickSheet` shots (the new reward beat is visible). All other shots should pass within `maxDiffPixelRatio: 0.02` tolerance.
3. **Do NOT run `qa:visual:update`.** Leave baselines untouched.
4. Capture the diff PNG paths from the output (Playwright writes them to `qa/output/playwright-test/`).
5. Add an entry to the PR body's "Visual diff advisory" section (Task 11): name each diff PNG and confirm it's the expected `PlacedTicketsPreview` addition.

The visual policy follow-up — "pin baselines to a CI Docker image, regenerate from a stable environment" — is filed as a **separate ticket per the prior review's recommendation #2**. Out of scope for this PR.

- [ ] **Step 5: Commit.**

```bash
git add src/portal/components/PostPickSheet.jsx
# DO NOT add qa/__screenshots__/ — baselines stay as they are.
git commit -m "feat: wire PlacedTicketsPreview into PostPickSheet

Both shells now show the just-placed tickets as a mini boarding-
pass card at the top of PostPickSheet. Closes the missing reward
beat between SeatPickSheet commit and the next-steps cards."
```

---

## Task 9: Update `App.jsx` routing (Option b — collapse the wizard)

**Why:** Delete the dependence on `initialStep={onSeatsRoute ? 3 : 1}` since the case-3 step no longer exists. Per spec option (b), `/sponsor/{token}/seats` deep links open `SeatPickSheet` from Welcome.

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/portal/Desktop.jsx` (accept new `openSheetOnMount` prop, drop unused `initialStep` if applicable)

- [ ] **Step 1: Update `App.jsx`.**

Find the `<Desktop ...>` JSX (line 134–143). Replace `initialStep={onSeatsRoute ? 3 : 1}` with:
```jsx
<Desktop
  portal={portal.state}
  token={token}
  theaterLayouts={layouts}
  seats={seats}
  isDev={dev}
  apiBase={config.apiBase}
  onRefresh={portal.refresh}
  openSheetOnMount={onSeatsRoute}
/>
```

(Drop `initialStep` entirely — Desktop should always start at step 1 unless overridden by an explicit prop.)

- [ ] **Step 2: Update `Desktop.jsx` to accept and apply `openSheetOnMount`.**

Find the function signature for the `Desktop` component. Add `openSheetOnMount = false` to the destructured props. Add a one-shot effect at the top of the component body:
```jsx
useEffect(() => {
  if (openSheetOnMount) setSeatPickOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

If the existing `initialStep` prop was used elsewhere in the component body (e.g. `const [step, setStep] = useState(initialStep)`), simplify to `useState(1)` since we're collapsing the wizard.

- [ ] **Step 3: Verify deep links on both shells.**

Run: `npm run dev`. Test:
- `http://localhost:5173/sponsor/dgu5lwmfmgtecky3` (no /seats) at desktop and mobile widths → lands on Welcome / Home, no sheet.
- `http://localhost:5173/sponsor/dgu5lwmfmgtecky3/seats` at desktop and mobile widths → lands on Welcome / Home with `SeatPickSheet` already open. Closing it returns to Welcome / Home.

- [ ] **Step 4: Re-run shell-parity test — should now PASS for all three runs.**

Run: `QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:parity`
Expected: All three runs (mobile, desktop-canonical, desktop-legacy) capture the same `/finalize` request body. The desktop-legacy assertion that failed in Tasks 4/5 now passes.

If it still fails: dig in. The most likely cause is a remaining shell-specific finalize CTA whose handler builds a divergent request body.
```bash
grep -n "/finalize" src/portal/Desktop.jsx src/portal/Mobile.jsx
```
Compare the two finalize functions byte-for-byte. They should hit the endpoint with the same method, headers, and body. If they differ, extract a shared helper (e.g. `src/hooks/useFinalize.js`) and have both call sites consume it.

**If you extracted a helper, commit it as its own focused commit BEFORE the routing-collapse commit** — same scope-discipline we've enforced everywhere else (review Important #1):

```bash
git add src/hooks/useFinalize.js src/portal/Desktop.jsx src/portal/Mobile.jsx
git commit -m "refactor: extract shared finalize helper

Both shells now hit /api/gala/portal/{token}/finalize via a single
useFinalize hook. Previously Desktop's StepConfirm and Mobile's
home CTA constructed slightly different request bodies — this
unifies them so npm run qa:parity passes for all three runs.

Pulled out as its own commit (not bundled with the routing
collapse) so 'why does Desktop's finalize look different from
Mobile's after May 2026?' is findable in git blame."
```

- [ ] **Step 5: Commit the routing collapse.**

```bash
git add src/App.jsx src/portal/Desktop.jsx
git commit -m "refactor: collapse desktop wizard to Welcome + SeatPickSheet

App.jsx now passes openSheetOnMount instead of initialStep.
/sponsor/{token}/seats deep link opens SeatPickSheet from Welcome
on both shells. The wizard's case-2 and case-3 steps are unreachable
and were already deleted in earlier commits.

Closes the shell-parity divergence: npm run qa:parity passes for
mobile, desktop-canonical, and desktop-legacy paths."
```

---

## Task 10: Final QA pass

**Why:** Verify the whole suite before opening the PR. This is the gate — anything that fails here gets fixed before Task 11.

- [ ] **Step 1: Smoke + a11y must pass.**

```bash
QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:smoke
QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:a11y
```
Both must report 0 failures.

- [ ] **Step 2: Visual is advisory.**

```bash
QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:visual
```
If failures: inspect each diff PNG. If the only changes are the new `PlacedTicketsPreview` card on placed-state screens (expected) or trivial text rendering deltas: note in PR description, do not block. If there's an unexpected layout shift on a fresh-state screen: investigate.

- [ ] **Step 3: Shell-parity must pass.**

```bash
QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:parity
```
All three runs equal. No exceptions.

- [ ] **Step 4: Manual side-by-side walkthrough.**

Open Wicko's portal in two browser windows:
- Window A: 414px wide (mobile breakpoint)
- Window B: 1280px wide (desktop)

In each, walk:
1. Land on portal → Home / Welcome.
2. Place 2 seats via `SeatPickSheet`.
3. PostPickSheet appears with `PlacedTicketsPreview` at the top.
4. Click "Done — back to overview".
5. Click "Send my QR" / "Review & finalize".
6. ConfirmationScreen appears with QR.
7. Each window's behavior matches the other's at every step (different chrome, same flow).

If the two diverge at any step: stop and fix.

- [ ] **Step 5: Bundle size check.**

```bash
npm run build
ls -la public/sponsor/assets/index-*.js
```
Compare to the size before this PR (capture from `git show main:public/sponsor/assets/` if needed). The new bundle must be SMALLER than `main`'s — we deleted ~600 lines from Desktop.jsx and possibly all of MobileWizard (~2200 lines). Record both sizes and the delta.

- [ ] **Step 6: Net line count.**

```bash
git diff --shortstat main..HEAD
```
Confirm `deletions > insertions`.

If deletions don't outpace insertions: review the diff for accidental code expansion. Common culprits: comment bloat, oversized component prop docs.

Task 10 ends here. The production-token sanity check moves to Task 11 because it requires the Pages preview URL (which only exists after `git push`).

---

## Task 11: Open the PR

**Files:**
- None. Pure git + GitHub.

- [ ] **Step 1: Push the branch.**

```bash
git push -u origin feat/flow-unification
```

- [ ] **Step 2: Production token sanity check on Pages preview.**

After the push, Cloudflare Pages builds a preview at `https://gala-3z8.pages.dev/sponsor/{token}` (or a branch-specific URL like `https://feat-flow-unification.gala-3z8.pages.dev/...` — check `gh run list --workflow="Cloudflare Pages"` or the Pages dashboard for the actual URL).

Open both test sponsors on the preview:
- Wicko: `gala-3z8.pages.dev/sponsor/dgu5lwmfmgtecky3`
- Kara: `gala-3z8.pages.dev/sponsor/sgohonmgwicha15n`

For each, verify:
- Portal loads (no FullScreenMessage error)
- Correct sponsor name renders in the header
- No JavaScript console errors (open DevTools → Console)
- The boarding-pass / Welcome card shows the sponsor's actual placed-seat state from the live D1
- Clicking around (without finalizing) doesn't throw

If either portal breaks: stop, investigate, fix in another commit before opening the PR.

- [ ] **Step 3: Capture before/after screenshots.**

For the PR description: take three viewport-sized screenshots at 414px, 880px, 1280px on both `main` (open `https://gala.daviskids.org/sponsor/dgu5lwmfmgtecky3`) and the Pages preview (`https://gala-3z8.pages.dev/sponsor/dgu5lwmfmgtecky3` after the branch builds).

Capture:
- Welcome / Home
- SeatPickSheet open
- PostPickSheet with `PlacedTicketsPreview` at top
- ConfirmationScreen

Save under `qa/output/before/` and `qa/output/after/` (gitignored — these go in the PR body via GitHub upload).

- [ ] **Step 4: Compute deletion stats.**

```bash
git diff --stat main..HEAD | tail -5
```
Note the total: `N files changed, X insertions(+), Y deletions(-)`. The headline number for the PR title is `Y - X`.

- [ ] **Step 5: Open the PR.**

```bash
gh pr create --title "Flow unification — one seat-pick path, ticket-preview reward beat" --body "$(cat <<'EOF'
## Summary

Eliminates the legacy desktop seat-pick stepper (`StepShowing` + `StepSeats`) so mobile and desktop share one canonical flow:

`SeatPickSheet` → `PostPickSheet` → `ConfirmationScreen`

Adds the missing reward beat: a new `PlacedTicketsPreview` component renders at the top of `PostPickSheet` on both shells.

Net code change: **-NNN lines** (deletions > insertions).

## What changed

| Area | Change |
|---|---|
| `qa/lib/config.js` | Stripped `QA_TOKEN` default. Throws if missing against non-localhost. (Review follow-up #4.) |
| `.env.example` | New — documents required env vars. |
| `qa/shell-parity.spec.js` | New Playwright test asserting `/finalize` request parity across shells. Failed before Task 9, passes now. |
| `qa/component-preview.spec.js` | New Playwright snapshot for `PlacedTicketsPreview` in isolation. |
| `src/portal/components/PlacedTicketsPreview.jsx` | New shared boarding-pass mini-card. |
| `src/portal/components/PostPickSheet.jsx` | Renders `<PlacedTicketsPreview>` at the top. |
| `src/portal/Desktop.jsx` | Deleted `StepShowing` + `StepSeats` + dead state hooks (~600 lines). Wizard's case-2/case-3 mount `SeatPickStepWrapper`. |
| `src/portal/MobileWizard.jsx` | **DECISION: <Option A: deleted (~2200 lines) | Option B: refactored to share canonical finalize>** |
| `src/App.jsx` | `initialStep={onSeatsRoute ? 3 : 1}` → `openSheetOnMount={onSeatsRoute}`. |

## Before / After

[Insert 414px / 880px / 1280px screenshots — Welcome, SeatPickSheet, PostPickSheet (with PlacedTicketsPreview), ConfirmationScreen]

## MobileWizard decision

<paste the Option A or Option B summary from Task 6>

## Visual diff advisory

`npm run qa:visual` shows N diffs after this PR. M of them are the expected `PlacedTicketsPreview` addition on placed-state screens. The remaining (N-M) are <describe>. Per the prior code review's recommendation #2 (visual baselines flake cross-machine), these are not blockers.

## Test plan

- [x] `npm run qa:smoke` passes
- [x] `npm run qa:a11y` passes
- [x] `npm run qa:parity` passes (all three runs identical)
- [x] `npm run qa:visual` — diffs reviewed and noted above
- [x] Manual side-by-side walkthrough at 414px and 1280px with Wicko token
- [x] `/sponsor/{token}/seats` deep link opens `SeatPickSheet` on both shells
- [x] Bundle size delta is negative

## Out of scope

Code review follow-ups #2 (visual baseline policy), #3 (entitlement assertion), #5 (race scenario), #6–10, #11–19 from `docs/REVIEW-2026-05-06-qa-harness.md`. Filed as separate issues.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Tag Scott in the PR.**

```bash
gh pr edit --add-reviewer ramonscottf
```

- [ ] **Step 7: Do NOT merge.**

The plan ends here. Scott reviews on GitHub. Wait for his sign-off.

---

## Self-review checklist (run after writing the plan, before execution)

- [x] **Spec coverage.** Every requirement in `docs/PLAN-flow-unification.md` "Build sequence" maps to a task here. (1 → P-1..P-5; 2 → P-5; 3 → Task 3 Step 1; 4 → Task 3; 5 → Task 3 Step 6; 6 → Task 5; 7 → Task 7; 8 → Task 8; 9 → Task 6; 10 → Task 9 Step 3; 11 → Task 10 Step 4; 12 → Task 10 Step 5; 13 → Task 11; 14 → Task 11 Step 6.)
- [x] **No placeholders.** Every code block contains real code or real test assertions.
- [x] **Type consistency.** `PlacedTicketsPreview` props match the `placed` shape consumed by `PostPickSheet` (theaterId, theaterName, movieTitle, showLabel, showTime, seatIds, posterUrl).
- [x] **Inherited issues.** Review #4 (QA_TOKEN) handled in Task 1. Reviews #1, #2 acknowledged in plan header. Other reviews explicitly out of scope.

---

## Execution handoff

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh implementer subagent per task, code-reviewer subagent after each. Two-stage review per Superpowers methodology. Pause at Task 6 for the MobileWizard decision.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch with checkpoints.

**The user already specified Subagent-Driven** — plan execution proceeds with fresh subagent per task once they sign off on each chunk.
