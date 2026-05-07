// qa/shell-parity.spec.js
//
// Shell-parity gate (v2). Locks in canonical /finalize across both shells.
//
// THREE ASSERTION LEGS — DO NOT add a fourth:
//   (a) /finalize is POSTed exactly once per shell.
//   (b) ConfirmationScreen renders with a QR image after the POST resolves.
//   (c) Normalized /finalize request body is equal across shells.
//
// Without leg (c), legs (a)+(b) could pass while one shell silently smuggled
// a body field the server happened to ignore today. qa/lib/normalize.js is
// the canonicalization layer.
//
// ─────────────────────────────────────────────────────────────────────────
// Endpoint contracts (verified Task 4 v2 against
//   functions/api/gala/portal/[token]/{pick,assign,finalize}.js)
// ─────────────────────────────────────────────────────────────────────────
//
// POST /api/gala/portal/[token]/pick
//   body: {
//     action: 'hold' | 'release' | 'finalize' | 'unfinalize' | 'set_dinner',
//     theater_id: number,
//     row_label: string,        // e.g. "F"
//     seat_num: string|number,  // server casts to integer
//     dinner_choice?: 'brisket'|'turkey'|'veggie'|'kids'|'glutenfree'|null
//                                // ONLY when action === 'set_dinner'
//   }
//   set_dinner is handled INSIDE pick.js (see lines 108-130). There is NO
//   separate /set_dinner endpoint — the action discriminator is the
//   sole switch.
//
// POST /api/gala/portal/[token]/assign
//   body: { theater_id: number, seat_ids: string[], delegation_id: number|null }
//
// POST /api/gala/portal/[token]/finalize
//   body: {} (empty — server reads identity off the URL token).
//   Permissive: only requires >= 1 placed seat. Does NOT gate on dinners.
//   Response shape (consumed by ConfirmationScreen via useFinalize):
//     { ok, finalized, seatCount, checkInUrl, qrImgUrl,
//       email: { sent }, sms: { sent } }
//   Side-effects: marks rsvp_status='completed', sends email + SMS via
//   Twilio. We MOCK this in-test with route.fulfill so the suite doesn't
//   spam the test sponsor on every run.
//
// ─────────────────────────────────────────────────────────────────────────
//
// Stripped fields list in qa/lib/normalize.js (idempotency_key, request_id,
// timestamps, etc) is intentionally defensive — none of these endpoints
// emit them today, but adding a new endpoint that does would silently
// break parity comparisons without that filter.

import { test, expect, devices } from '@playwright/test';
import { QA_BASE_URL, QA_TOKEN, sponsorUrl, preparePage } from './lib/config.js';
import {
  ensureFreshState,
  cleanupToken,
  findSeatBlock,
  pickSeat,
  getPortal,
  apiJson,
} from './lib/portal-api.js';
import { normalizeBody } from './lib/normalize.js';

// FAKE_FINALIZE_RESPONSE shape mirrors the server response in
// functions/api/gala/portal/[token]/finalize.js (lines 114-122). Both
// Mobile.jsx (confirmationData short-circuit at 2973) and Desktop.jsx
// (confirmationData short-circuit at 2330) feed the response straight
// into <ConfirmationScreen data={...} />, which reads
// data.qrImgUrl, data.seatCount, data.email.sent, data.sms.sent.
// Keep the keys in sync with the server contract; if the server contract
// drifts, recapture from a real finalize call against dev.
const FAKE_FINALIZE_RESPONSE = {
  ok: true,
  finalized: true,
  seatCount: 2,
  checkInUrl: `${QA_BASE_URL}/checkin?t=${QA_TOKEN}`,
  qrImgUrl: `${QA_BASE_URL}/api/gala/qr?t=${encodeURIComponent(QA_TOKEN)}&size=400`,
  email: { sent: true },
  sms: { sent: true },
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

// setDinnersForPlacedSeats — set dinner_choice for every currently-placed
// seat owned by the token. Verified against pick.js (lines 108-130):
// /pick accepts action='set_dinner' with the same body shape as other
// pick actions plus an optional dinner_choice field. There is NO separate
// /set_dinner endpoint — the action discriminator is the switch.
//
// NOT used in Task 4 v2's drive (post-pick-done finalizes via PostPickSheet
// without requiring dinners). Kept for Task 6 desktop-legacy re-enable: the
// legacy StepConfirm finalize CTA gates on dinner.allComplete, so the
// legacy run will need this helper to pass dinners before clicking
// legacy-finalize.
//
// eslint-disable-next-line no-unused-vars
async function setDinnersForPlacedSeats(token) {
  const portal = await getPortal(token);
  const dinners = ['brisket', 'turkey', 'veggie', 'kids', 'glutenfree'];
  for (let i = 0; i < (portal.myAssignments || []).length; i += 1) {
    const a = portal.myAssignments[i];
    await apiJson(`/api/gala/portal/${token}/pick`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'set_dinner',
        theater_id: a.theater_id,
        row_label: a.row_label,
        seat_num: a.seat_num,
        dinner_choice: dinners[i % dinners.length],
      }),
    });
  }
}

// Pre-place enough seats via direct API so the UI run finishes the rest
// and trips canFinalize=true. canFinalize requires placedCount >=
// blockSize (Mobile.jsx line 2902, Desktop.jsx line 2322), so for the
// post-pick-done CTA to actually fire /finalize the test sponsor needs
// (blockSize - uiPickCount) seats already placed before the UI run.
//
// Strategy: place chunks of up to 4 seats, re-querying portal state each
// chunk so we honor allAssignments + orphan rules. Returns total placed.
async function prePlaceSeats(token, target) {
  if (target <= 0) return 0;
  let placedCount = 0;
  const safetyLimit = target * 2 + 10;
  let safety = safetyLimit;
  while (placedCount < target && safety > 0) {
    safety -= 1;
    const portal = await getPortal(token);
    placedCount = (portal.myAssignments || []).length;
    if (placedCount >= target) break;
    const want = Math.min(target - placedCount, 4);
    let block;
    try {
      // allowOrphan: true — the SERVER's per-seat orphan check at
      // pick.js:230 is the source of truth. The SPA-side orphan check
      // in findSeatBlock can over-reject blocks at row boundaries that
      // the server would actually accept. Pre-place needs maximum
      // throughput; orphan correctness is enforced server-side.
      block = await findSeatBlock({ token, count: want, allowOrphan: true });
    } catch (e) {
      if (want === 1) throw e;
      try {
        block = await findSeatBlock({ token, count: 1, allowOrphan: true });
      } catch {
        // Genuinely no open seats — bail loudly so the test fails with
        // a diagnostic instead of mysteriously timing out at the UI's
        // post-pick-done waitFor.
        throw new Error(
          `prePlaceSeats: cannot find any single seat after ${placedCount}/${target} placed; token may be over-allocated or theater is full`
        );
      }
    }
    for (const seatId of block.seatIds) {
      const res = await pickSeat(token, block.theaterId, seatId, 'finalize');
      if (!res.ok) break; // orphan/race — refetch on next iter
    }
  }
  // Hard guard: silent shortfall here (returning <target) makes the
  // UI run land on PostPickSheet with canFinalize=false, post-pick-done
  // dismisses instead of POSTing /finalize, and leg (a) fails with the
  // SAME signal a Task-2-regression would produce. Throw instead so the
  // root cause is unambiguous.
  if (placedCount < target) {
    throw new Error(
      `prePlaceSeats: only placed ${placedCount}/${target} after ${safetyLimit} attempts. ` +
      `Token may be over-allocated, theater is full, or the orphan check is rejecting all candidates. ` +
      `This is NOT a Task 2-3 regression; investigate the test sponsor's seat availability.`
    );
  }
  return placedCount;
}

// Drive the canonical finalize path on either shell. Mobile.jsx and
// Desktop.jsx both wire PostPickSheet's "I'm done — send my QR" CTA
// (testid post-pick-done) to onFinalize when canFinalize is true.
// canFinalize is "all entitled seats placed" — dinners are NOT part of
// the gate (server is permissive). So the canonical post-Task-2 flow is:
//   click cta-place-seats → SeatPickSheet → click N seats →
//   seat-pick-commit (fires real /pick × N) → host opens PostPickSheet
//   with canFinalize=true → click post-pick-done → useFinalize POSTs
//   /finalize (mocked) → confirmationData set → shell short-circuits to
//   ConfirmationScreen.
async function pickAndFinalizeViaSheet(page, token, block) {
  // eslint-disable-next-line no-console
  console.log(`[shell-parity] driving with block: theater=${block.theaterId} seats=${block.seatIds.join(',')}`);
  // Task 6: on the /seats deep-link path, SeatPickStepWrapper (Desktop.jsx)
  // mounts at step===3 and immediately opens SeatPickSheet via useEffect.
  // The Welcome-step `cta-place-seats` button is hidden behind the modal,
  // so clicking it would target an off-screen element and either fail or
  // toggle state we don't want. Skip the click when the sheet is already
  // visible. Canonical mobile/desktop runs land on Welcome with no sheet
  // open, so the click still fires there.
  const sheetAlreadyOpen = await page
    .getByTestId('seat-pick-sheet')
    .isVisible()
    .catch(() => false);
  if (!sheetAlreadyOpen) {
    await page.getByTestId('cta-place-seats').first().click();
  }
  await page.getByTestId('seat-pick-sheet').waitFor({ timeout: 15_000 });
  // SeatPickSheet auto-navigates to the theater of myAssignments[0] on
  // mount. Wait a beat for that effect to settle so [data-seat] targets
  // the right theater.
  await page.waitForTimeout(300);
  for (const seatId of block.seatIds) {
    const loc = page.locator(`[data-seat="${seatId}"]`).first();
    await loc.waitFor({ state: 'visible', timeout: 10_000 });
    await loc.click();
  }
  await page.getByTestId('seat-pick-commit').click();
  // PostPickSheet renders after onCommitted. canFinalize=true (all
  // entitled seats placed), so post-pick-done → /finalize.
  await page.getByTestId('post-pick-done').waitFor({ timeout: 20_000 });
  await page.getByTestId('post-pick-done').click();
}

test.describe('shell parity', () => {
  // Three contexts × full pick-and-finalize flow easily exceeds the
  // playwright config default (75s). Bump for this suite only.
  test.setTimeout(180_000);

  test.beforeEach(async ({}, testInfo) => {
    // The test owns its own browser contexts (one per shell), so running
    // it once per playwright project would just re-do the same N
    // contexts. Pin to a single project so the cost is paid once per
    // qa:parity invocation.
    test.skip(
      testInfo.project.name !== 'desktop-light',
      'shell-parity owns its own contexts; pinned to desktop-light project'
    );
    await ensureFreshState(QA_TOKEN);
  });
  test.afterEach(async () => { await cleanupToken(QA_TOKEN); });

  test('canonical completion fires /finalize exactly once on both shells', async ({ browser }) => {
    // Task 5 wired canonical SeatPickSheet into desktop's case-2/3 via
    // SeatPickStepWrapper, which mounts at step===3 (App.jsx hands
    // initialStep={3} for the /seats deep link) and immediately opens
    // SeatPickSheet on mount. The legacy /seats deep link is now
    // functionally identical to the canonical path — same sheet, same
    // PostPickSheet → /finalize wiring. So pickAndFinalizeViaSheet drives
    // all three legs; the only delta is the sheet is already open on
    // mount for desktop-legacy (handled inside the helper).
    const runs = [
      {
        label: 'mobile',
        context: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
        path: '',
        drive: pickAndFinalizeViaSheet,
      },
      {
        label: 'desktop-canonical',
        context: { viewport: { width: 1365, height: 900 } },
        path: '',
        drive: pickAndFinalizeViaSheet,
      },
      {
        label: 'desktop-legacy',
        context: { viewport: { width: 1365, height: 900 } },
        path: '/seats',
        drive: pickAndFinalizeViaSheet,
      },
    ];

    // Determine the test sponsor's blockSize so we can pre-place enough
    // seats per run that the UI's 2-seat placement trips canFinalize.
    const portalSnapshot = await getPortal(QA_TOKEN);
    const id = portalSnapshot.identity || {};
    const blockSize = id.seatsPurchased || id.seatsAllocated || 0;
    const UI_PICK_COUNT = 2;
    if (blockSize < UI_PICK_COUNT) {
      throw new Error(`Test sponsor blockSize ${blockSize} < ${UI_PICK_COUNT}; cannot run parity flow`);
    }

    const captures = {};
    for (const run of runs) {
      // Fresh per-shell state: cleanup, then pre-place (blockSize - 2)
      // seats so the UI run's 2-seat placement is the final batch and
      // post-pick-done sees canFinalize=true. findSeatBlock for the UI
      // run finds an open 2-seat block among what's left.
      await cleanupToken(QA_TOKEN);
      if (blockSize > UI_PICK_COUNT) {
        await prePlaceSeats(QA_TOKEN, blockSize - UI_PICK_COUNT);
      }
      // SeatPickSheet auto-navigates to the theater where myAssignments[0]
      // lives (line 158 of SeatPickSheet.jsx). Find a UI block in the SAME
      // theater so the data-seat selectors match what's rendered.
      const portalAfter = await getPortal(QA_TOKEN);
      const homeTheater = portalAfter.myAssignments?.[0]?.theater_id;
      // Avoid orphan-rule races: useSeats.place() POSTs each seat in
      // parallel to /pick action=finalize, and the SERVER's per-seat
      // orphan check (pick.js:230) considers each request in isolation.
      // If we pick contiguous seats adjacent to pre-placed seats (e.g.
      // B-1..B-6 placed, UI picks B-7+B-8), one of the parallel requests
      // can land first and create a transient 2-step gap that triggers
      // a 409. The SPA-side batch check (SeatPickSheet:231) sees the
      // whole batch and would pass, but the server doesn't.
      //
      // Workaround: find a UI block in a row that has ZERO pre-placed
      // seats in the home theater. Falls back to the default
      // findSeatBlock if no such row exists (small block or full
      // theater).
      const placedRowsInHomeTheater = new Set(
        (portalAfter.myAssignments || [])
          .filter((a) => a.theater_id === homeTheater)
          .map((a) => a.row_label)
      );
      let block = null;
      try {
        const layouts = await (await fetch(`${QA_BASE_URL}/data/theater-layouts.json`)).json();
        const theater = (layouts.theaters || []).find((t) => Number(t.id) === Number(homeTheater));
        for (const row of theater?.rows || []) {
          if (placedRowsInHomeTheater.has(row.label)) continue;
          if (row.type === 'blocked') continue;
          const nums = (
            row.type === 'mixed'
              ? (row.segments || []).filter((s) => s.type !== 'blocked' && s.type !== 'gap').flatMap((s) => s.seats || [])
              : row.numbers || []
          )
            .map(Number)
            .filter((n) => !Number.isNaN(n))
            .sort((a, b) => a - b);
          for (let i = 0; i <= nums.length - UI_PICK_COUNT; i += 1) {
            const slice = nums.slice(i, i + UI_PICK_COUNT);
            const contiguous = slice.every((n, idx) => idx === 0 || n === slice[idx - 1] + 1);
            if (!contiguous) continue;
            block = {
              theaterId: homeTheater,
              row: row.label,
              seatIds: slice.map((n) => `${row.label}-${n}`),
            };
            break;
          }
          if (block) break;
        }
      } catch {
        // fall through to findSeatBlock fallback
      }
      if (!block) {
        block = await findSeatBlock({
          token: QA_TOKEN,
          count: UI_PICK_COUNT,
          ...(homeTheater ? { theaterId: homeTheater } : {}),
        });
      }

      const ctx = await browser.newContext({ ...run.context, baseURL: QA_BASE_URL });
      // Wrap the per-run drive + capture in try/finally so a Playwright
      // timeout, network blip, or assertion mid-iteration still hits
      // cleanupToken. Otherwise pre-placed + UI-placed seats stay claimed
      // on the test sponsor and the next iteration's beforeEach has to
      // wrestle with leftover state.
      try {
        const page = await ctx.newPage();
        await preparePage(page);
        const cap = await captureFinalize(page);
        await page.goto(sponsorUrl(QA_TOKEN, run.path), { waitUntil: 'networkidle' });
        await run.drive(page, QA_TOKEN, block);
        // Brief settle so any in-flight /finalize lands before we read cap.
        await page.waitForTimeout(800);
        // Diagnostic: log count BEFORE the QR waitFor. If the canonical
        // wiring is broken (e.g. on main, before Tasks 2-3) /finalize was
        // never POSTed → cap.count===0 here. The QR waitFor below then
        // times out (leg b), but this log makes the count===0 evidence
        // visible even when leg (b) is the symptom that fails first.
        // eslint-disable-next-line no-console
        console.log(`[shell-parity] ${run.label}: count=${cap.count} body=${JSON.stringify(cap.body)}`);
        // Leg (b): ConfirmationScreen renders with a QR image after
        // /finalize resolves. This is the visible-success guard — if the
        // mock response shape ever stops matching what
        // ConfirmationScreen.jsx reads (data.qrImgUrl), this .waitFor()
        // is what fails first.
        await page.locator('img[alt*="QR" i]').first().waitFor({ timeout: 15_000 });
        captures[run.label] = cap;
      } finally {
        await ctx.close().catch(() => {});
        // Clean up regardless of what threw above. Best-effort: if the
        // cleanup itself fails (network blip, D1 hiccup), swallow so the
        // original error reaches the test runner instead of being masked.
        await cleanupToken(QA_TOKEN).catch(() => {});
      }
    }

    // Leg (a): /finalize POSTs exactly once per shell.
    expect(captures['mobile'].count, 'mobile fired /finalize exactly once').toBe(1);
    expect(captures['desktop-canonical'].count, 'desktop-canonical fired /finalize exactly once').toBe(1);
    expect(captures['desktop-legacy'].count, 'desktop-legacy fired /finalize exactly once').toBe(1);

    // Leg (b): ConfirmationScreen rendered. Already asserted above via
    // `await page.locator('img[alt*="QR" i]').waitFor(...)` per shell —
    // if the QR didn't render the test would have failed at .waitFor()
    // before this point.

    // Leg (c): normalized request bodies are equal across shells.
    // Catches wire-level divergence that legs (a)+(b) miss (e.g. one
    // shell smuggling a body field the server happens to ignore today).
    expect(
      captures['desktop-canonical'].body,
      'desktop-canonical body equals mobile body after normalization'
    ).toBe(captures['mobile'].body);
    expect(
      captures['desktop-legacy'].body,
      'desktop-legacy body equals mobile body after normalization'
    ).toBe(captures['mobile'].body);
  });
});
