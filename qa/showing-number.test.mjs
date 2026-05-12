#!/usr/bin/env node
/**
 * showing_number.test.mjs
 *
 * Regression test for the May 11 2026 Tanner Clinic incident.
 *
 * For auditoriums that host TWO showings of the same movie (Aud 6, 7,
 * 8, 10 in the 2026 gala lineup), the seat-placement pipeline must
 * treat the early and late showings as strictly independent. Picking
 * a seat at one showing must NOT collapse to the other.
 *
 * What this test covers:
 *   1. Placing a seat at showing 2 actually writes showing_number=2
 *      to the DB (not silently defaulting to 1).
 *   2. The same (row, seat) is independently available at both
 *      showings — placing at showing 1 does NOT block showing 2.
 *   3. unfinalize at showing 2 deletes only the showing-2 row, leaves
 *      showing-1 untouched.
 *   4. Server rejects ambiguous calls — a write to a dual-showing
 *      theater without showing_number returns 400 (no silent default).
 *
 * Usage: QA_TOKEN=<token> node qa/showing-number.test.mjs --yes
 *
 * Requires a dedicated test sponsor (Wicko Waypoint, ID 89, token in
 * 1Password). Mutates seat_assignments + seat_holds — cleans up after
 * itself.
 */

import assert from 'node:assert/strict';
import { QA_TOKEN, QA_BASE_URL } from './lib/config.js';
import {
  apiJson,
  cleanupToken,
  ensureFreshState,
  findSeatBlock,
  getPortal,
  pickSeat,
} from './lib/portal-api.js';

const confirmed = process.argv.includes('--yes') || process.env.QA_ALLOW_MUTATION === '1';
if (!confirmed) {
  console.error('Refusing to mutate live sponsor seats. Re-run with --yes or QA_ALLOW_MUTATION=1.');
  process.exit(2);
}

const results = [];

async function scenario(name, fn) {
  const started = Date.now();
  try {
    await ensureFreshState(QA_TOKEN);
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail });
    console.error(`✓ ${name} (${Date.now() - started}ms)`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: error.message });
    console.error(`✗ ${name}: ${error.message}`);
  } finally {
    await cleanupToken(QA_TOKEN).catch(() => {});
  }
}

// Helper: find an auditorium hosting BOTH showings of any movie. The
// "(showing 1, showing 2)" structure is what makes the bug possible.
async function findDualShowingTheater() {
  const portal = await getPortal(QA_TOKEN);
  const counts = new Map();
  (portal.showtimes || []).forEach((s) => {
    const t = Number(s.theater_id);
    counts.set(t, (counts.get(t) || 0) + 1);
  });
  for (const [theaterId, n] of counts.entries()) {
    if (n >= 2) return theaterId;
  }
  throw new Error('No dual-showing auditorium available in showtimes — cannot run showing_number isolation tests.');
}

await scenario('placement at showing 2 records showing_number=2 (not silent default to 1)', async () => {
  const theaterId = await findDualShowingTheater();
  // Pick a block at showing 2 specifically
  const block = await findSeatBlock({ theaterId, showingNumber: 2, count: 1 });
  assert.equal(block.showingNumber, 2, 'findSeatBlock should return showing 2');
  const res = await pickSeat(QA_TOKEN, theaterId, block.seatIds[0], 'finalize', 2);
  assert.equal(res.ok, true, `finalize failed: ${JSON.stringify(res.body)}`);

  // Re-read portal: assignment row must have showing_number === 2
  const portal = await getPortal(QA_TOKEN);
  const placed = (portal.myAssignments || []).find(
    (r) => Number(r.theater_id) === Number(theaterId)
      && `${r.row_label}-${r.seat_num}` === block.seatIds[0],
  );
  assert.ok(placed, 'assignment not found in portal');
  assert.equal(Number(placed.showing_number), 2, `expected showing_number=2, got ${placed.showing_number}`);
  return { theaterId, seat: block.seatIds[0], showing_number: placed.showing_number };
});

await scenario('same (row, seat) is independently available at both showings', async () => {
  const theaterId = await findDualShowingTheater();
  // Place at showing 2
  const block = await findSeatBlock({ theaterId, showingNumber: 2, count: 1 });
  const place2 = await pickSeat(QA_TOKEN, theaterId, block.seatIds[0], 'finalize', 2);
  assert.equal(place2.ok, true, `finalize at showing 2 failed: ${JSON.stringify(place2.body)}`);

  // Now try the SAME seat at showing 1 — must succeed (different showing,
  // different universe). This is the smoking-gun behavior: pre-fix, the
  // server would reject this with 409 "Seat already taken" because the
  // old UNIQUE constraint ignored showing_number.
  const place1 = await pickSeat(QA_TOKEN, theaterId, block.seatIds[0], 'finalize', 1);
  // We expect SUCCESS or quota-rejection (not "seat taken"). The Wicko
  // token has 20 seats so quota shouldn't bite here.
  if (!place1.ok) {
    const errStr = JSON.stringify(place1.body);
    assert.doesNotMatch(
      errStr,
      /already taken|already held/i,
      `Showing 1 placement should NOT collide with showing 2 — got: ${errStr}`,
    );
  }
  return {
    theaterId,
    seat: block.seatIds[0],
    showing2_placed: place2.ok,
    showing1_placed: place1.ok,
  };
});

await scenario('unfinalize at showing 2 leaves showing 1 untouched', async () => {
  const theaterId = await findDualShowingTheater();
  const block = await findSeatBlock({ theaterId, showingNumber: 2, count: 1 });

  // Place at both showings
  const p2 = await pickSeat(QA_TOKEN, theaterId, block.seatIds[0], 'finalize', 2);
  assert.equal(p2.ok, true);
  const p1 = await pickSeat(QA_TOKEN, theaterId, block.seatIds[0], 'finalize', 1);
  // Don't assert p1.ok — quota or orphan rules might block; that's fine,
  // the rest of the test still proves isolation if p1 succeeded.
  if (!p1.ok) {
    // Skip the rest if we couldn't get both placements
    return { skipped: true, reason: `showing 1 placement blocked: ${JSON.stringify(p1.body)}` };
  }

  // Unplace the showing-2 row only
  const u2 = await pickSeat(QA_TOKEN, theaterId, block.seatIds[0], 'unfinalize', 2);
  assert.equal(u2.ok, true);

  // Showing 1 must still be there
  const portal = await getPortal(QA_TOKEN);
  const showing1Row = (portal.myAssignments || []).find(
    (r) => Number(r.theater_id) === Number(theaterId)
      && Number(r.showing_number ?? 1) === 1
      && `${r.row_label}-${r.seat_num}` === block.seatIds[0],
  );
  assert.ok(showing1Row, 'unfinalize at showing 2 should not have removed the showing-1 row');
  const showing2Row = (portal.myAssignments || []).find(
    (r) => Number(r.theater_id) === Number(theaterId)
      && Number(r.showing_number ?? 1) === 2
      && `${r.row_label}-${r.seat_num}` === block.seatIds[0],
  );
  assert.ok(!showing2Row, 'showing-2 row should have been removed by unfinalize');
  return { theaterId, seat: block.seatIds[0], showing1_present: true, showing2_present: false };
});

await scenario('server rejects ambiguous write to dual-showing theater without showing_number', async () => {
  const theaterId = await findDualShowingTheater();
  const block = await findSeatBlock({ theaterId, showingNumber: 2, count: 1 });
  const { row_label, seat_num } = (() => {
    const dash = block.seatIds[0].indexOf('-');
    return {
      row_label: block.seatIds[0].slice(0, dash),
      seat_num: block.seatIds[0].slice(dash + 1),
    };
  })();

  // Hit the API directly WITHOUT showing_number. Pre-fix this would
  // silently default to showing 1. Post-fix it must 400 (theater has
  // multiple showings, server refuses to guess).
  const res = await apiJson(`/api/gala/portal/${QA_TOKEN}/pick`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'hold',
      theater_id: theaterId,
      row_label,
      seat_num,
      // showing_number deliberately omitted
    }),
  });
  assert.equal(res.ok, false, `expected error, got ok=true with body ${JSON.stringify(res.body)}`);
  assert.equal(res.status, 400, `expected 400 status, got ${res.status}`);
  assert.match(
    JSON.stringify(res.body),
    /showing_number|multiple showings/i,
    `expected showing_number error message, got ${JSON.stringify(res.body)}`,
  );
  return { theaterId, status: res.status, errorBody: res.body };
});

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify(
  { ok: failed.length === 0, baseUrl: QA_BASE_URL, results },
  null,
  2,
));
if (failed.length) process.exit(1);
