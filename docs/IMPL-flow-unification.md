# Flow Unification Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobile and desktop run the same finite-state machine for the sponsor flow. The canonical flow (`SeatPickSheet` → `PostPickSheet` → `ConfirmationScreen`) must reach `/finalize` from BOTH shells. Then delete the legacy desktop `StepShowing`+`StepSeats` stepper, decide MobileWizard's fate, add `PlacedTicketsPreview` reward beat. Net code change negative.

**Architecture (v2):** The defect is **a missing `/finalize` call in the canonical flow**, not an API-sequence divergence between two flows. Verified on `main`:

- **Mobile canonical** (`Mobile.jsx` + `SeatPickSheet`) has NO `/finalize` call. `PostPickSheet`'s "Done" is dismissal-only (`PostPickSheet.jsx:124-128`).
- **Desktop canonical** (`StepWelcome` + `SeatPickSheet`) has NO `/finalize` call. "Review & finalize" just re-opens `SeatPickSheet` via `setSeatPickOpen(true)` (`Desktop.jsx:2326`).
- **Desktop legacy `StepConfirm`** (step 4) IS the only `/finalize` call site (`Desktop.jsx:1707`), gated on `dinner.allComplete` AND blocked by `onPlaced` bouncing back to step 2 after each batch (`Desktop.jsx:2232`).
- **Mobile legacy `MobileWizard.jsx:2136`** IS another `/finalize` call site, on the `/seats` deep link only.

The fix sequence:
1. **Tasks 2-3**: add canonical finalize on both shells (PostPickSheet's "Done" + Welcome's "Review & finalize").
2. **Task 4**: lock it in with a parity test (now a real TDD-red — fails on `main` because canonical flows don't finalize).
3. **Tasks 5-7**: wire SeatPickSheet into desktop's case-2/3, run parity green, delete the legacy stepper.
4. **Task 8**: MobileWizard decision (delete vs refactor).
5. **Tasks 9-10**: PlacedTicketsPreview reward beat.
6. **Task 11**: App.jsx routing collapse.
7. **Task 12**: final QA + PR.

## Revision history

**2026-05-06 v2 (mid-execution revision):**
- Task 1 (`QA_TOKEN` fix) shipped as planned (commits `9059482` + `0bf40c8`).
- Task 2 v1's failing parity test surfaced that the original spec mis-diagnosed the defect. Both runs emitted byte-identical `[/pick, /pick]` sequences and never hit `/finalize`. The bug is "canonical flow doesn't finalize," not "two finalize paths produce different responses."
- Re-scoped Tasks 2-3 to **add canonical finalize**. Renumbered Tasks 2-11 (v1) → 4-12 (v2) with Task 4 assertion updates.
- Working-tree changes from Task 2 v1 (testids, `qa/lib/normalize.js`, `qa/shell-parity.spec.js` scaffold, `package.json` reordering, `qa/README.md` docs) are **stashed as `task-2-v1-scaffold-preserve`** (`git stash list`). Tasks 2-4 v2 unstash relevant pieces piecewise.

**2026-05-06 v1:** Original plan derived from `docs/PLAN-flow-unification.md` and `docs/REVIEW-2026-05-06-qa-harness.md`. See git commit `8866534` for the full v1 task body — Tasks 5-12 in v2 are renumbered v1 Tasks 3-11 (8-line summaries below; full step-by-step in `8866534:docs/IMPL-flow-unification.md`).

---

**Inherited from review:**
- Important #4 (`QA_TOKEN` leak) → fixed in Task 1 ✅
- Important #1 (commit-split discipline) → every commit has a focused message
- Important #2 (visual baseline flake) → `qa:visual` failures DO NOT BLOCK this PR; advisory only
- Other 7 review follow-ups → out of scope

**Hard rules:**
1. Don't change visual styling. Different chrome per shell stays.
2. Don't touch sibling apps under `public/admin`, `public/review`, `public/volunteer`, `public/checkin`.
3. Net line count goes DOWN.
4. Cloudflare API: `X-Auth-Key` + `X-Auth-Email`. Never `Bearer`.

**Test sponsors:**
- Wicko (Scott, ID 80): `dgu5lwmfmgtecky3`
- DEF Staff (Kara, ID 93): `sgohonmgwicha15n`

⚠️ **Finalize is one-way.** Once `/finalize` is POSTed against a token, `rsvp_status` flips to `finalized` server-side. The QA harness's `cleanupToken` un-claims seat rows but does NOT reset finalize state. Strategy:
- Tasks 2 & 3 use **Kara** for manual verification (one-shot finalize). Wicko stays un-finalized for Task 4.
- Task 4 uses **Wicko**, mocking `/finalize` via Playwright `route.fulfill` so the server never sees the request.
- After the PR ships, Scott runs a wrangler D1 script to reset both tokens for next round.

**Pages preview:** `gala-3z8.pages.dev`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `qa/lib/config.js` | ✅ Modified (Task 1) | `QA_TOKEN` validation, throws on prod without token. |
| `.env.example` | ✅ Created (Task 1) | Required env vars. |
| `qa/lib/config.test.mjs` | ✅ Created (Task 1) | Validates throw-on-prod path. |
| `qa/README.md` | Modify (Tasks 1 ✅, 4) | Setup section + `qa:parity` doc + new `qa:all` order. |
| `src/hooks/useFinalize.js` | **CREATE (Task 2)** | Shared `/finalize` POST handler used by both shells. |
| `src/portal/components/PostPickSheet.jsx` | Modify (Tasks 2, 10) | Accept `onFinalize` + `canFinalize`; render `<PlacedTicketsPreview>` on top. |
| `src/portal/Mobile.jsx` | Modify (Tasks 2, 3) | Wire PostPickSheet's `onFinalize` via `useFinalize`. Fix Home's analogous Review CTA. |
| `src/portal/Desktop.jsx` | Modify (Tasks 2, 3, 5, 7) | Wire PostPickSheet's `onFinalize`; fix Welcome's "Review & finalize"; wire SeatPickStepWrapper; delete StepShowing+StepSeats+StepConfirm. |
| `src/brand/atoms.jsx` | Modify (Tasks 2, 3) | `Btn` accepts `testId` prop forwarding to `data-testid`. (From Task 2 v1 stash.) |
| `qa/shell-parity.spec.js` | Create (Task 4) | Asserts canonical completion → `/finalize` once + ConfirmationScreen on both shells. |
| `qa/lib/normalize.js` | Create (Task 4) | Body normalizer. |
| `package.json` | Modify (Task 4) | Add `qa:parity`; reorder `qa:all`. |
| `src/portal/MobileWizard.jsx` | **DECISION POINT (Task 8)** | Delete or refactor. |
| `src/portal/components/PlacedTicketsPreview.jsx` | Create (Task 9) | Reward-beat boarding-pass mini-card. |
| `src/App.jsx` | Modify (Task 11) | `initialStep={onSeatsRoute ? 3 : 1}` → `openSheetOnMount={onSeatsRoute}`. |
| `docs/IMPL-flow-unification.md` | Modify (state log) | Tick checkboxes as tasks complete. |

---

## Pre-flight ✅ (already done)

P-1 through P-6 ran on `main` before the v1 commits. Branch `feat/flow-unification` exists. Plan v2 lives on this branch.

---

## Task 1 ✅ COMPLETE: Fix `QA_TOKEN` leak

Shipped as commits `9059482` + `0bf40c8`. Code-reviewed clean.

---

## Task 2 (NEW v2): Add canonical finalize via PostPickSheet's "Done" CTA

**Why:** PostPickSheet's "Done — back to overview" is dismissal-only. The canonical flow has no path to `/finalize`. Add a `useFinalize` hook + wire PostPickSheet's "Done" to call it when conditions are met (all seats placed + dinner choices set if applicable).

**Files:**
- Read first: `src/portal/Desktop.jsx:1696-1720` (existing `finalize()`); `src/portal/MobileWizard.jsx:2126-2160` (existing mobile finalize).
- Create: `src/hooks/useFinalize.js`
- Modify: `src/portal/components/PostPickSheet.jsx`, `src/portal/Mobile.jsx`, `src/portal/Desktop.jsx`
- Apply (from stash): testid additions on `PostPickSheet.jsx`, `SeatPickSheet.jsx`, `atoms.jsx`.

**Steps:**

- [x] **Step 1: Restore the testid scaffolding from the v1 stash (component-level only).**

```bash
git stash show -p stash@{0} -- src/brand/atoms.jsx src/portal/components/SeatPickSheet.jsx src/portal/components/PostPickSheet.jsx | git apply
git diff --stat
```
Expected: 3 files modified, ~6 single-line `data-testid` additions.

- [x] **Step 2a: Verify server-side `/finalize` contract before building the hook.**

The client gate (`canFinalize = allPlaced && allDinnersSet`) only matters if the server actually enforces those conditions. If the server is permissive, our client gate may be over-restrictive. If the server is stricter, our gate is missing checks.

```bash
cat functions/api/gala/portal/\[token\]/finalize.js
```

Read end-to-end. Look specifically for:
- Dinner-related logic: does the server check `dinner_choice` is set on every assignment before flipping `rsvp_status = 'completed'`? If yes, our `allDinnersSet` gate matches server contract.
- Seat-count logic: does the server check `placedCount >= entitled_seats` before allowing finalize? If yes, our `allPlaced` gate matches.
- Other preconditions we might be missing (e.g. delegation completeness, payment status).

**Three reconciliation outcomes:**
- **Server requires dinners** → our gate `allPlaced && allDinnersSet` is correct. Document.
- **Server permissive (no dinner check)** → loosen our gate to `allPlaced` only. Sponsors can finalize without dinners; they pick later via the dinner picker on Welcome/Home. Document the change.
- **Server gated server-side with a different rule** → match exactly. Document the rule.

Capture the finding in the Step 9 commit body as a one-line "Server-side contract: <permissive | gated on X | gated on dinners + seats>" so the gate decision is traceable.

- [x] **Step 2b: Read the existing client finalize implementations.**

Read `Desktop.jsx:1696-1724` and `MobileWizard.jsx:2126-2160`. Document:
- Request: POST `${apiBase}/api/gala/portal/${token}/finalize`, body `{}`
- Response: sets a local `confirmationData`/`finalizeData` state; ConfirmationScreen short-circuits at `Desktop.jsx:2188` and `Mobile.jsx:2837`.
- Differences between Desktop's and MobileWizard's finalize (likely error handling). The hook absorbs the union.

- [x] **Step 3: Create `src/hooks/useFinalize.js`.**

```jsx
// src/hooks/useFinalize.js
//
// Shared /finalize POST handler. Replaces the duplicated finalize
// logic in Desktop.jsx (line 1696) and MobileWizard.jsx (line 2136).
// Both canonical shells consume this hook.

import { useState } from 'react';

export function useFinalize({ apiBase, token, onRefresh }) {
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState(null);
  const [confirmationData, setConfirmationData] = useState(null);

  const finalize = async () => {
    setFinalizing(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Finalize failed: HTTP ${res.status} ${text}`);
      }
      const data = await res.json();
      setConfirmationData(data);
      if (onRefresh) await onRefresh();
      return data;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setFinalizing(false);
    }
  };

  return { finalize, finalizing, error, confirmationData, setConfirmationData };
}
```

- [x] **Step 4: Modify `PostPickSheet.jsx`.**

Add props `canFinalize` (boolean, default false) and `onFinalize` (function, default null). Replace the third `<ActionCard>` (the "Done — back to overview" one):

```jsx
<ActionCard
  testId="post-pick-done"
  icon="check"
  title={canFinalize ? "I'm done — send my QR" : "Done — back to overview"}
  sub={canFinalize ? "We'll email and text your QR code" : "Return to your tickets"}
  onClick={canFinalize && onFinalize ? onFinalize : onDone}
  primary
/>
```

Same icon both states (avoids needing a `send` icon if it doesn't exist; the title+sub copy carries the meaning).

- [x] **Step 5: Modify `Mobile.jsx`.**

```jsx
import { useFinalize } from '../hooks/useFinalize.js';
// inside Mobile component:
const { finalize, finalizing, confirmationData, setConfirmationData } =
  useFinalize({ apiBase, token, onRefresh });

// Compute canFinalize:
const placedCount = (portal?.myAssignments || []).length;
const entitledCount = portal?.seatMath?.entitled ?? portal?.entitled_seats ?? 0;  // verify shape
const allPlaced = placedCount >= entitledCount;
const allDinnersSet = (portal?.myAssignments || []).every((a) => a.dinner_choice);
const canFinalize = allPlaced && allDinnersSet;
```

Pass to `<PostPickSheet>`:
```jsx
<PostPickSheet
  placed={postPick}
  missingDinnerCount={...existing...}
  onAssign={...existing...}
  onPickDinners={...existing...}
  onDone={...existing...}
  canFinalize={canFinalize}
  onFinalize={finalize}
/>
```

The existing ConfirmationScreen short-circuit at `Mobile.jsx:2837` already handles `confirmationData`. Wire it to read from the hook.

Verify the `seatMath.entitled` shape via `grep -n "seatMath\|entitled" src/portal/Mobile.jsx`. Use whatever the existing `placedCount`/`tier` logic uses.

- [x] **Step 6: Modify `Desktop.jsx`.**

```jsx
import { useFinalize } from '../hooks/useFinalize.js';
// inside Desktop component:
const { finalize, finalizing, confirmationData, setConfirmationData } =
  useFinalize({ apiBase, token, onRefresh });
```

Replace the local `finalize()` function (lines 1701-1724). Update the line 1984 `onClick={finalize}` reference (it now binds to the hook's `finalize`, no source change needed). Update the `finalizing` state reference at line 1985 to use the hook's value.

Compute `canFinalize` near the existing `placedCount` declaration (line ~2230):
```jsx
const allPlaced = placedCount >= (blockSize || 0);
const allDinnersSet = dinnerCompleteness?.allComplete ?? true;
const canFinalize = allPlaced && allDinnersSet;
```

Pass to `<PostPickSheet>` at line ~2527:
```jsx
canFinalize={canFinalize}
onFinalize={finalize}
```

- [x] **Step 7: Build.**

```bash
npm run build
```
Must succeed without errors. If TS-style errors appear, the `useFinalize` import path may be off — verify `src/hooks/useFinalize.js` location and `import` paths.

- [x] **Step 8: Manual browser verification — use Kara, not Wicko.**

⚠️ **This step finalizes Kara's RSVP server-side.** After this step, Kara is `rsvp_status='completed'` (or whatever the server flips it to) until reset.

**Pre-verification state check.** Before driving the UI, query Kara's current state:

```bash
npx wrangler d1 execute gala-seating --remote --command="SELECT id, name, rsvp_status FROM sponsors WHERE id = 93;"
```

If `rsvp_status` is already `completed` (or non-NULL): the verification will hit the `confirmationData` short-circuit on page load, NOT the new `useFinalize` hook. **That tests the wrong thing.** Reset before proceeding:

```bash
npx wrangler d1 execute gala-seating --remote --command="UPDATE sponsors SET rsvp_status = NULL WHERE id = 93;"
# Verify the reset:
npx wrangler d1 execute gala-seating --remote --command="SELECT id, rsvp_status FROM sponsors WHERE id = 93;"
```

⚠️ Use `X-Auth-Key` + `X-Auth-Email` for any wrangler operations that need REST API auth (not Bearer). `wrangler d1 execute` uses local credentials from `~/.wrangler/config/default.toml` so this is implicit — but flag if any wrapper script uses Bearer.

Document Kara's pre-test `rsvp_status` in the Step 9 commit body so we know what state was actually exercised.

Run `npm run dev`. Open `http://localhost:5173/sponsor/sgohonmgwicha15n` (Kara). Walk:

1. Place 2 seats via SeatPickSheet → PostPickSheet appears.
2. Without setting dinners: PostPickSheet's "Done" reads "Done — back to overview". Click → returns to Welcome/Home (dismiss only).
3. Open the in-sheet dinner picker (PostPickSheet's "Pick dinners" CTA), set choices for both seats. Close.
4. Re-trigger PostPickSheet (e.g., re-pick seats or via a "Place" → SeatPickSheet → cancel → PostPickSheet flow). Now "Done" should read "I'm done — send my QR".
5. Click "I'm done — send my QR" → `/finalize` fires → ConfirmationScreen renders with QR.
6. Verify Kara's D1 row finalized state (optional): use Cloudflare dashboard or wrangler with `X-Auth-Key`+`X-Auth-Email`.

Repeat at desktop width (1280px) on a fresh tab. Should land directly on ConfirmationScreen via the `confirmationData` short-circuit (Kara is already finalized — server returns the existing confirmation).

If anything breaks: stop and debug before committing.

- [x] **Step 9: Commit.**

```bash
git add src/hooks/useFinalize.js src/portal/components/PostPickSheet.jsx \
  src/portal/Mobile.jsx src/portal/Desktop.jsx src/brand/atoms.jsx \
  src/portal/components/SeatPickSheet.jsx
git commit -m "$(cat <<'EOF'
feat: wire canonical finalize through PostPickSheet's "Done" CTA

PostPickSheet now accepts canFinalize + onFinalize props. When the
sponsor has placed all entitled seats and set dinner choices, the
"Done" card reads "I'm done — send my QR" and fires /finalize.
Otherwise it stays as the existing dismiss-to-Welcome behavior.

Both shells use the new useFinalize hook so the request body and
response handling are byte-identical. Replaces the local finalize()
in Desktop.jsx (line 1701) — kept the legacy StepConfirm wiring
to the same hook for now (deleted in Task 7).

This addresses the May 6 walkthrough finding: canonical mobile
+ canonical desktop both lacked any /finalize call site. Legacy
desktop StepConfirm and MobileWizard still finalize via their
own paths (collapsed in Tasks 7-8).

Includes the Task 2 v1 testid scaffolding (data-testid on
PostPickSheet's done card, SeatPickSheet's root + commit btn,
plus testId-prop forwarder on atoms.jsx Btn).
EOF
)"
```

---

## Task 3 (NEW v2): Fix Welcome's "Review & finalize" button

**Why:** Welcome's "Review & finalize" button currently calls `setSeatPickOpen(true)` (`Desktop.jsx:2326`), which just re-opens the seat picker — broken UX. Wire it to fire `useFinalize`'s `finalize` directly when conditions are met.

**Files:**
- Modify: `src/portal/Desktop.jsx`, `src/portal/Mobile.jsx`
- Apply (from stash): testid additions on Desktop.jsx Welcome buttons + Mobile.jsx Home CTA + legacy stepper buttons (`cta-place-seats`, `cta-finalize`, `legacy-seats-commit`, `legacy-finalize`).

**Steps:**

- [x] **Step 1: Restore the testid scaffolding from the v1 stash (shell-level files).**

```bash
git stash show -p stash@{0} -- src/portal/Desktop.jsx src/portal/Mobile.jsx | git apply
git diff --stat
```
Expected: 2 files modified. If the apply conflicts with Task 2's edits, resolve manually — testids are additive single-line attrs, conflicts should be trivial.

- [x] **Step 2: Modify `Desktop.jsx` Welcome's onReview handler — DO NOT fall back to opening SeatPickSheet.**

The current `setSeatPickOpen(true)` fallback is **the bug we're fixing**. A sponsor who clicks "Review & finalize" expects something resembling finalize — sending them back to seat-picking is the exact disorienting UX that surfaced this PR. **Do not preserve it.**

**Preferred (state-aware label):** the button's label and behavior change based on the sponsor's progress.

| State | Label | Behavior |
|---|---|---|
| 0 seats placed | "Place seats" | opens SeatPickSheet |
| Some seats placed, more remaining | "Place remaining seats" | opens SeatPickSheet |
| All placed, dinners not set | (disabled) "Set dinners to finalize" | tooltip |
| All placed AND dinners set | "Review & finalize" | calls `finalize` |

This requires editing `StepWelcome`'s render to accept a `mode` prop (or compute internally from `placedCount`/`canFinalize`/dinner state) and conditionally render the right label + onClick. Read `StepWelcome` end-to-end first to scope the change:

```bash
grep -n "^const StepWelcome\|^function StepWelcome" src/portal/Desktop.jsx
```

If `StepWelcome` is small (<100 lines) and only references the props passed from Desktop's render: state-aware label is in scope. Implement.

**Acceptable fallback (if state-aware label is genuine scope creep):** disable + tooltip.
```jsx
onReview={finalize}
reviewDisabled={!canFinalize}
reviewTooltip={!canFinalize ? "Place all your seats and set dinner choices to finalize" : null}
```
And update `StepWelcome` to render the Review button with `disabled={reviewDisabled}` + a `title={reviewTooltip}` (or `<button title=...>`). Single-line additions.

**Forbidden (never ship):** `onReview={canFinalize ? finalize : () => setSeatPickOpen(true)}`. This recreates the exact bug-feel.

Pick state-aware if `StepWelcome` is small enough to edit cleanly. Pick disabled+tooltip if not. Document the decision in the Step 5 commit body.

- [x] **Step 3: Mobile.jsx — investigate analogous CTA.**

```bash
grep -n "Send my QR\|send my QR\|Send me my QR\|Review.*finalize\|Review &amp; finalize" src/portal/Mobile.jsx
```

If grep returns no results: Mobile has no Home-level finalize CTA. Canonical mobile finalize goes ONLY through PostPickSheet (Task 2). No code change needed in Mobile.jsx beyond the v1-stashed `cta-place-seats` testid.

If grep returns a result: that's the analogous CTA. Wire to `finalize` when `canFinalize` is true, similar to Desktop's pattern.

- [x] **Step 4: Manual browser verification.**

⚠️ **This step finalizes Wicko if you proceed past dinner picks.** Coordinate with Scott so he can reset both tokens after the verification window.

1. Open `http://localhost:5173/sponsor/dgu5lwmfmgtecky3` (Wicko) at 1280px. Wicko has placed seats from prior verification but no dinners.
2. Welcome shows. Click "Review & finalize" → falls back to opening SeatPickSheet (because `canFinalize` is false). Verify behavior matches the fallback path.
3. Set dinners via the in-portal dinner picker. Return to Welcome.
4. Click "Review & finalize" → /finalize fires → ConfirmationScreen.
5. Stop here. Wicko is now finalized.

- [x] **Step 5: Commit.**

```bash
npm run build
git add src/portal/Desktop.jsx src/portal/Mobile.jsx
git commit -m "$(cat <<'EOF'
feat: wire Welcome's "Review & finalize" to actually finalize

Desktop.jsx:2326's onReview previously called setSeatPickOpen(true)
— a no-op for sponsors who'd already placed seats and set dinners.
Now: when canFinalize is true (all seats placed + dinners set),
the button fires the canonical /finalize via the useFinalize hook
from Task 2. Otherwise it falls back to opening SeatPickSheet so
the sponsor can verify what's placed.

Mobile.jsx had <no analogous Home-level finalize CTA | a CTA at
line N which is now wired the same way>. <Comment recording the
investigation result.>

Includes the Task 2 v1 testid scaffolding for Desktop's Welcome
buttons (cta-place-seats, cta-finalize) and the legacy stepper
buttons (legacy-seats-commit, legacy-finalize) which Task 7 deletes.
EOF
)"
```

---

## Task 4 (REVISED v2): Failing parity test → green via Tasks 2-3

**Why:** Lock in canonical-finalize with a regression test. The test has **three assertion legs**:

1. **(a) `/finalize` POSTs exactly once per shell** — necessary; proves the canonical flow reaches the endpoint at all.
2. **(b) ConfirmationScreen renders with the QR image + delivery copy** — necessary; proves the response is consumed and the success state is visible.
3. **(c) Normalized `/finalize` request body is equal across all three shells** — sufficient; proves no smuggled wire-level divergence (different headers, different body shape, alternate endpoint variants). `qa/lib/normalize.js` from the v1 stash is the right tool here.

Without leg (c), the test could pass (a) + (b) while masking a real divergence (e.g. one shell sends `{}`, another sends `{"foo": "bar"}` and the server happens to ignore the extra key today). All three legs hold, or the test fails.

Today (on `main`, before Tasks 2-3) leg (a) fails for canonical Mobile + Desktop (`count === 0`). After Tasks 2-3, all three legs pass.

**Test scaffold from v1 reused.** Assertions rewritten.

**Files:**
- Apply (from stash): `qa/lib/normalize.js`, `qa/shell-parity.spec.js` (rewrite assertions), `package.json`, `qa/README.md`.

**Steps:**

- [x] **Step 1: Restore the QA scaffolding from the stash.**

```bash
git stash show -p stash@{0} -- qa/lib/normalize.js qa/shell-parity.spec.js \
  package.json qa/README.md | git apply
git status --short
```
Expected: 2 created, 2 modified.

⚠️ Do NOT apply `docs/IMPL-flow-unification.md` from the stash — v1's checkbox ticks don't match v2's task structure.

- [x] **Step 2: Re-confirm endpoint contracts (top-of-spec comment block).**

The comment block at the top of `qa/shell-parity.spec.js` already documents the contracts. Re-verify by re-reading `functions/api/gala/portal/[token]/finalize.js` and `pick.js`. Update the spec's contract block if anything changed.

- [x] **Step 3: Rewrite the test body in `qa/shell-parity.spec.js`.**

Replace the v1 test (which asserted byte-identical sequences) with v2 (which asserts each run hits /finalize once and renders ConfirmationScreen):

```js
import { test, expect, devices } from '@playwright/test';
import { QA_BASE_URL, QA_TOKEN, sponsorUrl, preparePage } from './lib/config.js';
import { ensureFreshState, cleanupToken, findSeatBlock, pickSeat, getPortal } from './lib/portal-api.js';
import { normalizeBody } from './lib/normalize.js';

// FAKE_FINALIZE_RESPONSE shape was captured from a real /finalize call against
// the dev environment using a test sponsor. To re-capture if the contract
// drifts:
//   1. Reset a test sponsor: wrangler d1 execute gala-seating --remote
//      --command="UPDATE sponsors SET rsvp_status = NULL WHERE id = <test-sponsor-id>;"
//   2. Walk through the canonical flow on the branch with DevTools network
//      tab open. Copy the /finalize response body.
//   3. Paste the shape (NOT real QR URL or PII) below; replace the QR URL
//      with a deterministic pattern under QA_BASE_URL.
// The mock must match the response shape Mobile.jsx:2837 and Desktop.jsx:2188
// short-circuits expect — otherwise leg (b) (ConfirmationScreen renders) fails.
const FAKE_FINALIZE_RESPONSE = {
  ok: true,
  seatCount: 2,
  qrImgUrl: `${QA_BASE_URL}/api/gala/portal/${QA_TOKEN}/qr.png?test=1`,
  email: { sent: true },
  sms: { sent: true },
  myAssignments: [],
};

async function captureFinalize(page) {
  const captured = { count: 0, body: null };
  await page.route('**/api/gala/portal/*/finalize', async (route, request) => {
    captured.count += 1;
    captured.body = normalizeBody(request.postData() || '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FAKE_FINALIZE_RESPONSE),
    });
  });
  return captured;
}

// setDinnersForPlacedSeats — confirmed against functions/api/gala/portal/[token]/pick.js
// (Task 4 Step 1): <FILL IN — either uses /pick action=set_dinner with body
// discriminator, or calls /set_dinner directly>. Implementer verifies and
// updates this comment + the implementation.
async function setDinnersForPlacedSeats(token) {
  const portal = await getPortal(token);
  for (const a of portal.myAssignments || []) {
    await pickSeat(token, a.theater_id, `${a.row_label}-${a.seat_num}`, 'set_dinner');
    // Implementer: if pickSeat doesn't pass dinner_choice through, either
    // (a) extend pickSeat in qa/lib/portal-api.js to accept it, or
    // (b) call apiJson('/api/gala/portal/${token}/set_dinner', {body: {...}}).
  }
}

async function pickAndFinalizeViaSheet(page, token, block) {
  await page.getByTestId('cta-place-seats').first().click();
  await page.getByTestId('seat-pick-sheet').waitFor();
  for (const seatId of block.seatIds) {
    await page.locator(`[data-seat="${seatId}"]`).click();
  }
  await page.getByTestId('seat-pick-commit').click();
  await setDinnersForPlacedSeats(token);
  await page.reload();
  await page.waitForLoadState('networkidle');
  // After Tasks 2-3, Welcome's "Review & finalize" fires finalize directly
  // when canFinalize is true. Use the testid Task 3 added.
  await page.getByTestId('cta-finalize').click();
}

async function pickAndFinalizeViaLegacy(page, token, block) {
  for (const seatId of block.seatIds) {
    await page.locator(`[data-seat="${seatId}"]`).click();
  }
  await page.getByTestId('legacy-seats-commit').click();
  await setDinnersForPlacedSeats(token);
  await page.reload();
  await page.waitForLoadState('networkidle');
  // After reload, navigate back to /seats and through to step 4. Implementation
  // depends on existing wizard nav — verify by inspecting Desktop.jsx step controls.
  await page.getByTestId('legacy-finalize').click();
}

test.describe('shell parity', () => {
  test.skip(({ project }) => project.name !== 'desktop-light', 'parity owns its own contexts');
  test.setTimeout(180_000);

  test.beforeEach(async () => { await ensureFreshState(QA_TOKEN); });
  test.afterEach(async () => { await cleanupToken(QA_TOKEN); });

  test('canonical completion fires /finalize exactly once on both shells', async ({ browser }) => {
    const block = await findSeatBlock({ token: QA_TOKEN, count: 2 });

    // INTENTIONAL SEQUENCING: desktop-legacy is skipped here in Task 4. The
    // legacy /seats deep link currently routes through StepSeats → StepConfirm
    // (separate code path). Driving it would require a programmatic step-control
    // hack to bypass onPlaced's bounce-to-step-2. Task 5 wires the canonical
    // SeatPickSheet into desktop's case-2/3 — at that point /seats deep link
    // becomes desktop-canonical-via-SeatPickSheet, no separate testid needed.
    // Task 6 re-enables this leg by removing the .skip after Task 5 lands.
    const runs = [
      { label: 'mobile', context: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }, path: '', drive: pickAndFinalizeViaSheet },
      { label: 'desktop-canonical', context: { viewport: { width: 1365, height: 900 } }, path: '', drive: pickAndFinalizeViaSheet },
      // { label: 'desktop-legacy', context: { viewport: { width: 1365, height: 900 } }, path: '/seats', drive: pickAndFinalizeViaLegacy },  // re-enable in Task 6
    ];

    const captures = {};
    for (const run of runs) {
      const ctx = await browser.newContext({ ...run.context, baseURL: QA_BASE_URL });
      const page = await ctx.newPage();
      await preparePage(page);
      const cap = await captureFinalize(page);
      await page.goto(sponsorUrl(QA_TOKEN, run.path), { waitUntil: 'networkidle' });
      await run.drive(page, QA_TOKEN, block);
      await page.waitForTimeout(1000);
      // ConfirmationScreen renders → QR image visible.
      await page.locator('img[alt*="QR" i], [data-testid="confirmation-qr"]').first().waitFor({ timeout: 10_000 });
      captures[run.label] = cap;
      await ctx.close();
      await cleanupToken(QA_TOKEN);
    }

    // Leg (a): /finalize POSTs exactly once per shell.
    expect(captures['mobile'].count, 'mobile fired /finalize once').toBe(1);
    expect(captures['desktop-canonical'].count, 'desktop-canonical fired /finalize once').toBe(1);
    // Task 6 re-enables: expect(captures['desktop-legacy'].count, 'desktop-legacy fired /finalize once').toBe(1);

    // Leg (b): ConfirmationScreen rendered. Already asserted above
    // via `await page.locator('img[alt*="QR" i] ...').waitFor(...)` per shell —
    // if the QR didn't render the test would have failed at .waitFor().

    // Leg (c): normalized request bodies are equal across shells. Catches
    // wire-level divergence that legs (a)+(b) would miss (e.g. one shell
    // smuggling a body field the server happens to ignore today).
    expect(captures['desktop-canonical'].body, 'canonical body matches mobile').toBe(captures['mobile'].body);
    // Task 6 re-enables: expect(captures['desktop-legacy'].body, 'legacy body matches mobile').toBe(captures['mobile'].body);
  });
});
```

**Selector caveat:** the `setDinnersForPlacedSeats` helper assumes `/pick` accepts `action: 'set_dinner'`. Confirm against `functions/api/gala/portal/[token]/pick.js`. If `/set_dinner` is a separate endpoint, call it directly via `apiJson`.

**Caveat 2:** `legacy-finalize` testid lives on a button in `StepConfirm` which is gated on `dinner.allComplete` AND requires the user to be on step 4. The `onPlaced` bounce-to-step-2 (`Desktop.jsx:2232`) is the obstacle. The driver may need to programmatically navigate to step 4 via `page.evaluate(() => window.__setStep?.(4))` if the wizard exposes a step-control hook, OR click through the step controls. Verify by inspecting Desktop.jsx's step-control buttons.

- [x] **Step 4: Run against the WIP branch (Tasks 2-3 applied) — should pass.**

```bash
QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:parity 2>&1 | tee qa/output/parity-result-task4.txt
```

Expected: all three runs PASS. Each hit /finalize exactly once with body `{}`.

If a run fails:
- (a) `count !== 1` for canonical mobile/desktop → Tasks 2-3 didn't wire correctly. Stop, debug.
- (b) Selector timeout on the legacy run → testid placement issue. Verify.
- (c) `count === 0` for legacy → couldn't navigate to step 4. Add a step-control workaround.

- [x] **Step 5: Run against `main` (TDD-red receipt for the commit body).**

```bash
git stash push -u -m "task-4-validate-against-main"
git checkout main -- src/hooks/useFinalize.js src/portal/components/PostPickSheet.jsx \
  src/portal/Mobile.jsx src/portal/Desktop.jsx 2>&1 || echo "files don't exist on main, OK"
git checkout feat/flow-unification -- qa/shell-parity.spec.js qa/lib/normalize.js \
  package.json qa/README.md src/brand/atoms.jsx src/portal/components/SeatPickSheet.jsx
QA_TOKEN=dgu5lwmfmgtecky3 npm run qa:parity 2>&1 | tee qa/output/parity-failure-on-main.txt
git checkout feat/flow-unification -- src/hooks/useFinalize.js src/portal/components/PostPickSheet.jsx \
  src/portal/Mobile.jsx src/portal/Desktop.jsx
git stash pop
```

Expected: mobile and desktop-canonical FAIL (`count === 0` because no canonical finalize CTA exists on main). Legacy may pass or fail depending on testid placement.

`qa/output/parity-failure-on-main.txt` is the TDD-red receipt — paste into Step 6's commit body.

- [x] **Step 6: Commit.**

```bash
git add qa/shell-parity.spec.js qa/lib/normalize.js package.json qa/README.md
git commit -m "$(cat <<'EOF'
test: add shell-parity check for canonical /finalize across shells

Asserts that after canonical completion on either shell:
  - /finalize is POSTed exactly once
  - ConfirmationScreen renders with a QR image

Mocks /finalize via route.fulfill so the test sponsor's rsvp_status
stays 'pending' across runs.

ON THIS BRANCH (Tasks 2-3 applied): all three runs pass — mobile,
desktop-canonical, desktop-legacy each hit /finalize once with body '{}'.

ON MAIN (without Tasks 2-3): mobile and desktop-canonical fail
because PostPickSheet's "Done" doesn't finalize and Welcome's
"Review & finalize" just re-opens the seat picker. TDD-red output:

<paste qa/output/parity-failure-on-main.txt — show count===0 for
mobile and desktop-canonical>

Reorders qa:all to smoke → a11y → parity → visual (advisory) →
lighthouse → stress so a flaky visual diff doesn't short-circuit.

Run: npm run qa:parity
EOF
)"
```

---

## Task 5 (was Task 3 v1): Wire `SeatPickSheet` into Desktop's case-2 wizard step

**Reference:** v1 plan body in commit `8866534`, "Task 3" section. No v2 changes to step-by-step.

Summary: replace `<StepShowing>` (case 2) and `<StepSeats>` (case 3) renders with `<SeatPickStepWrapper>` that opens `SeatPickSheet` on mount. Modal `onClose` returns to step 1. Three-scenario manual verification (canonical, deep-link, cancel-path). Single commit: `feat: wire SeatPickSheet into desktop wizard cases 2-3`.

- [x] Task 5 complete — see commit on `feat/flow-unification`.

---

## Task 6 (was Task 4 v1): Run shell-parity test (TDD green for wiring)

**Reference:** v1 plan body in commit `8866534`, "Task 4" section. No v2 changes.

Summary: run `qa:parity`. Mobile + desktop-canonical should pass (already passing post-Task 4 v2). Desktop-legacy should also pass — Task 5 just re-routes the legacy step renders through `SeatPickSheet`, finalize CTA remains the legacy `cta-finalize` button on Welcome (now wired by Task 3). No commit.

- [x] Task 6 complete — `qa:parity` 3-of-3 green against `localhost:5173` (1.7m). Re-enabled the desktop-legacy leg in `qa/shell-parity.spec.js` and adapted `pickAndFinalizeViaSheet` to skip the `cta-place-seats` click when the sheet is already visible (deep-link path mounts with the sheet open). Receipt: `qa/output/parity-result-task6.txt`.

---

## Task 7 (was Task 5 v1, expanded): Delete legacy `StepShowing` + `StepSeats` + `StepConfirm` + dead code

**Reference:** v1 plan body in commit `8866534`, "Task 5" section.

**Two v2 changes:**
1. Also delete `StepConfirm` (its `finalize()` was replaced by `useFinalize` in Task 2, so it's now dead).
2. **StepConfirm is more than a finalize CTA** — it also hosts the per-seat dinner picker UI on desktop and gates finalize on `dinner.allComplete`. Before deleting, **explicitly verify desktop sponsors can still reach `DinnerPicker.jsx` via the canonical sheet flow** (likely PostPickSheet's "Pick dinners" ActionCard at `PostPickSheet.jsx:111-121`).

Updated step list:

- [x] **Step 1: Verify StepConfirm's dinner-picker dependency.** Outcome (c) — duplicated. `DinnerPicker` was mounted both inline in StepConfirm (Desktop.jsx:2031) and as a Modal at the Desktop component level (Desktop.jsx:2697-2753) reachable via `PostPickSheet`'s `onPickDinners` CTA at Desktop.jsx:2646. Deleting StepConfirm removes the duplicate; canonical access remains.

```bash
grep -n "DinnerPicker\|dinner_choice\|dinnerCompleteness\|allComplete" src/portal/Desktop.jsx | head -30
grep -n "DinnerPicker" src/portal/components/PostPickSheet.jsx
```

Trace where `DinnerPicker` is mounted on desktop today. Likely paths:
- (a) `StepConfirm` mounts `<DinnerPicker>` inline as part of its render (then deleting StepConfirm strands the picker on canonical desktop).
- (b) `PostPickSheet`'s "Pick dinners" CTA opens a separate `<DinnerPicker>` modal/sheet that's mounted at the Desktop component level (then deleting StepConfirm is safe — the sheet flow already covers it).
- (c) Both — duplicated picker UI between StepConfirm and the sheet flow.

Read `Desktop.jsx` around lines 1700-2000 (StepConfirm region) to determine which.

**If (a):** STOP. This task can't run as scoped. Surface a **Task 6.5 — bridge dinner picker into the canonical flow** before Task 7 can proceed. Task 6.5 would mount `<DinnerPicker>` modal at the Desktop component level, wired to PostPickSheet's "Pick dinners" CTA. Then Task 7 can safely delete StepConfirm.

**If (b):** safe to delete StepConfirm in Task 7. Document the verification in the commit body: "Verified DinnerPicker is reachable via PostPickSheet's `onPickDinners` CTA (Desktop.jsx:NNNN); deleting StepConfirm doesn't strand the picker."

**If (c):** safe to delete StepConfirm in Task 7. Bonus: the duplicated picker mount in StepConfirm goes away with the deletion. Note as a "deduplication" win in the commit body.

- [x] **Step 2: Identify and delete `StepShowing`, `StepSeats`, `StepConfirm` from `Desktop.jsx`.** Plus the now-orphan `FormatBadge`, `buildContext`, `STEPS[3]` (Confirm step), and the wizard switch's `step === 4` case.
- [x] **Step 3: Full dead-code sweep** — removed `theaterId`/`setTheaterId`, `showingNumber`/`setShowingNumber`, `movieId`/`setMovieId`, `sel`/`setSel`, `theaterChoices`, `moviesHere`, `adaptedTheater`, `otherTaken`, `movie`, `theaterMeta`, `onPlaced`, `useNavigate`/`navigate`, `didInitFromAssignments` ref + effect, the `ctx` useMemo, `buildContext`, the chained showing/movie/theater normalization effects. Imports removed: `useRef`, `useNavigate`, `SeatMap`/`SeatLegend`/`adaptTheater`/`seatById`, `otherTakenForTheater`/`checkBatchOrphans`, `SHOWING_NUMBER_TO_ID`/`formatBadgeFor`, `formatShowTime`. Dinner-warning chip rewired: new `onSetDinners` prop on `StepWelcome` synthesizes a `postPick` from `dinnerCompleteness.missingSeats` and opens the canonical dinner Modal.
- [x] **Step 4: Bundle delta** — main: 186.33 KB raw / 47.04 KB gzip → Task 7: 168.35 KB raw / 43.31 KB gzip. **−17.98 KB raw, −3.73 KB gzipped.**
- [x] **Step 5: QA scripts** — `qa:smoke` 8/8 green, `qa:parity` 1/1 (3 skipped per project pin) green, `qa:a11y` failures pre-existing on `feat/flow-unification` baseline (Stepper color-contrast violations on `#9194a3` foreground over `#fff` background — verified by stash + re-run of the same test against the un-edited tree). Receipt: `qa/output/parity-result-task7.txt`.
- [x] **Step 6: Manual verification (headless Playwright on Wicko)** — place 2 seats → PostPickSheet renders → click "Pick dinners" → DinnerPicker Modal opens with 2 selects → set both to `brisket` → close dialog → `post-pick-done` clickable. Dinner-picker reachability confirmed.
- [ ] **Step 7: Commit. Message:**

```
chore: remove legacy desktop seat-pick stepper + StepConfirm

Deletes StepShowing, StepSeats, and StepConfirm components plus
their dead state hooks (theaterId, showingNumber, movieId, sel,
finalizing local), associated useMemo derivations, and imports
that only those components used.

Safe to delete because Task 2's useFinalize hook supplies the
canonical /finalize call from PostPickSheet's "Done" CTA. The
wizard's case-2 and case-3 mount SeatPickStepWrapper.

Bundle size: <RAW MAIN> KB → <RAW NEW> KB (-<DELTA> KB)
Gzipped:     <GZ MAIN> KB → <GZ NEW> KB (-<DELTA> KB)
Net deletion in Desktop.jsx: <N> lines.
```

---

## Task 8 (was Task 6 v1): MobileWizard fate — DECISION POINT (PAUSE for Scott)

**Reference:** v1 plan body in commit `8866534`, "Task 6" section. No v2 changes to step-by-step.

**Bias-toward-Option-A note (NEW v2):** With Task 2 building canonical finalize on PostPickSheet's "Done" CTA, **Mobile + SeatPickSheet covers the `/seats` deep-link case by definition.** The deep-link flow becomes: open sheet (via `openSheetOnMount` from Task 11) → pick seats → "Done — back to overview" or "I'm done — send my QR" → ConfirmationScreen if finalized. That's the entire `MobileWizard` flow rebuilt out of canonical pieces.

Don't overthink the analysis. The task should still verify by reading `MobileWizard.jsx:2136 ± 50 lines` plus the import block, but **Option A (delete ~2,200 lines) is the strongly-biased default.** Only fall back to Option B if the targeted read surfaces something `Mobile.jsx` + `SeatPickSheet` genuinely can't do.

**Simplification from v1:** Option B (refactor) is now trivial — Mobile.jsx already uses `useFinalize` from Task 2. If Option B is chosen for any reason, MobileWizard just imports `useFinalize` and replaces its local finalize call.

Summary: targeted read of MobileWizard.jsx (imports + signature + finalize ±50 lines + grep for helpers — do NOT read all 2,252 lines). Compare to Mobile.jsx finalize. Write decision summary (Option A delete strongly preferred vs Option B refactor only if A is genuinely blocked). HARD STOP — wait for Scott. Verify `openSheetOnMount` `useEffect` deps via route-change behavior.

---

## Task 9 (was Task 7 v1): Build `PlacedTicketsPreview` component

**Reference:** v1 plan body in commit `8866534`, "Task 7" section. No v2 changes.

Summary: mini boarding-pass card. Match existing `showLabel`+`showTime` format from `Mobile.jsx`. Static preview harness at `qa/preview/placed-tickets.html`. Component snapshot test (local-only). File CI-runnable follow-up issue.

- [x] **Step 1: Component contract.** Created `src/portal/components/PlacedTicketsPreview.jsx` (~125 lines) per v1 Task 7 Step 1 JSX.
- [x] **Step 2: Verify `BRAND.gold` + match boarding-pass format.** `BRAND.gold = '#f4b942'` exists. `Mobile.jsx:1164,2570` renders `(showLabel || '').toUpperCase() · {showTime}` (uppercase + middle-dot). Component now uppercases `showLabel` to match family.
- [x] **Step 3: Component file written.**
- [x] **Step 4: `npm run build`** succeeds cleanly. Bundle unchanged (component tree-shaken; unused until Task 10).
- [x] **Step 5: Static preview harness** at `qa/preview/placed-tickets.html` + `qa/preview/placed-tickets.jsx`. Reachable via vite dev at `http://localhost:5173/sponsor/qa/preview/placed-tickets.html` (vite `base: '/sponsor/'` prefix required).
- [x] **Step 6: Visual smoke** — verified via Playwright snapshot test in Step 7.
- [x] **Step 7: Playwright snapshot baseline** generated at `qa/__screenshots__/{project}/component-preview.spec.js/placed-tickets.png` for all 4 projects (desktop-light/dark, mobile-light/dark). All 4 pass on second run with `maxDiffPixelRatio: 0.04`.
- [x] **Step 8: CI-runnable harness follow-up filed** as #2.
- [x] **Step 9: Commit** — see Task 9 commit on `feat/flow-unification`.

---

## Task 10 (was Task 8 v1): Wire `PlacedTicketsPreview` into `PostPickSheet`

**Reference:** v1 plan body in commit `8866534`, "Task 8" section. No v2 changes.

Summary: import + render at top of `PostPickSheet`. Both shells get the reward beat. Run `qa:visual` but DO NOT regenerate baselines — capture diffs as expected for PR body.

---

## Task 11 (was Task 9 v1): Collapse desktop wizard, route `/seats` through `SeatPickSheet`

**Reference:** v1 plan body in commit `8866534`, "Task 9" section. No v2 changes.

Summary: `App.jsx` `openSheetOnMount={onSeatsRoute}` replaces `initialStep`. `Desktop.jsx` accepts prop with `[openSheetOnMount]` deps. The shared finalize helper extraction note from v1 is now a no-op — Task 2's `useFinalize` already covers it.

- [x] Task 11 complete — `App.jsx` drops the `MobileWizard` import + the `if (onSeatsRoute) { return <MobileWizard ... />; }` branch. Both `<Mobile>` and `<Desktop>` now accept `openSheetOnMount={onSeatsRoute}`. `Desktop.jsx` drops the `initialStep` prop (replaced by the new `openSheetOnMount` + `useEffect` pattern). `Mobile.jsx` adds the same prop + effect (`useEffect` newly imported). Deps `[openSheetOnMount]` (NOT `[]`) so SPA route changes from `/:token` → `/:token/seats` re-fire the effect even when React Router preserves the component instance — verified via Playwright SPA-nav probe (sheet opens after `pushState` + `popstate` flips the URL). Hard navigations also work. `qa:parity` 1/1 (3 skipped per project pin) green; all three legs (mobile, desktop-canonical, desktop-legacy) report `count=1 body=""`. The legacy `SeatPickStepWrapper` (cases 2/3 of the wizard) stays on disk — it's no longer reachable via App.jsx but the wizard render block still defines it; deleting cases 2/3 is out of scope. Bundle delta: 170.17 → 135.00 KB raw (−35.17 KB), 43.66 → 35.84 KB gzip (−7.82 KB) — MobileWizard.jsx is no longer imported, so vite tree-shakes the entire ~2,200-line module out of the bundle. The file remains on disk for Task 8's clean `git rm`.

---

## Task 12 (was Tasks 10 + 11 v1, merged): Final QA + open PR

**Reference:** v1 plan body in commit `8866534`, "Task 10" and "Task 11" sections.

### Phase A — Final QA gate

- [ ] `qa:smoke` passes. Zero failures.
- [ ] `qa:a11y` passes. Zero failures.
- [ ] `qa:parity` passes. All three runs.
- [ ] `qa:visual` — advisory. Inspect each diff PNG.
- [ ] Manual side-by-side at 414px + 1280px on Wicko.
- [ ] Bundle size delta is negative.
- [ ] `git diff --shortstat main..HEAD` — deletions > insertions.

### Phase B — PR

- [ ] `git push -u origin feat/flow-unification`.
- [ ] Production token sanity check on Pages preview (Wicko + Kara).
- [ ] Capture before/after screenshots at 414/880/1280.
- [ ] `gh pr create` with structured body. Title: `Flow unification — canonical finalize, ticket-preview reward beat`.
- [ ] Tag `ramonscottf` as reviewer.
- [ ] **DO NOT MERGE.** Plan ends. Scott reviews and merges.

---

## Self-review checklist

- [x] **Spec coverage:** Every requirement in `docs/PLAN-flow-unification.md` "Build sequence" maps to a task here. v2 also covers the canonical-finalize gap surfaced by v1 execution.
- [x] **No placeholders** in v2 task definitions. v1 tasks are referenced by commit hash for full content.
- [x] **Type consistency:** `useFinalize` props match what `Mobile.jsx`, `Desktop.jsx`, and `PostPickSheet.jsx` consume.
- [x] **Inherited issues:** review #4 → Task 1 ✅; reviews #1, #2 → acknowledged; others → out of scope.
- [x] **Revision history** documents the v1→v2 transition for future archeology.
