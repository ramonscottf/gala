#!/usr/bin/env node
import assert from 'node:assert/strict';
import { QA_RIVAL_TOKEN, QA_TOKEN } from './lib/config.js';
import {
  cleanupToken,
  ensureFreshState,
  findOrphanPair,
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
    if (QA_RIVAL_TOKEN) await ensureFreshState(QA_RIVAL_TOKEN);
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail });
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: error.message });
  } finally {
    await cleanupToken(QA_TOKEN).catch(() => {});
    if (QA_RIVAL_TOKEN) await cleanupToken(QA_RIVAL_TOKEN).catch(() => {});
  }
}

await scenario('over-quota rejects the third seat', async () => {
  const block = await findSeatBlock({ count: 3 });
  const [first, second, third] = block.seatIds;
  assert.equal((await pickSeat(QA_TOKEN, block.theaterId, first, 'finalize', block.showingNumber)).ok, true);
  assert.equal((await pickSeat(QA_TOKEN, block.theaterId, second, 'finalize', block.showingNumber)).ok, true);
  const overflow = await pickSeat(QA_TOKEN, block.theaterId, third, 'finalize', block.showingNumber);
  assert.equal(overflow.ok, false);
  assert.match(JSON.stringify(overflow.body), /full|placed|seat/i);
  return { theaterId: block.theaterId, showingNumber: block.showingNumber, seats: block.seatIds, overflowStatus: overflow.status };
});

await scenario('orphan-gap selection is rejected', async () => {
  const pair = await findOrphanPair();
  const first = await pickSeat(QA_TOKEN, pair.theaterId, pair.first, 'finalize', pair.showingNumber);
  assert.equal(first.ok, true);
  const orphan = await pickSeat(QA_TOKEN, pair.theaterId, pair.second, 'finalize', pair.showingNumber);
  assert.equal(orphan.ok, false);
  assert.match(JSON.stringify(orphan.body), /orphan|alone|single|empty|row/i);
  return { theaterId: pair.theaterId, showingNumber: pair.showingNumber, row: pair.row, first: pair.first, rejected: pair.second, status: orphan.status };
});

await scenario('stale-tab over-placement is rejected', async () => {
  const stalePortal = await getPortal(QA_TOKEN);
  assert.equal(stalePortal.seatMath.available, 2);
  const block = await findSeatBlock({ count: 3 });
  assert.equal((await pickSeat(QA_TOKEN, block.theaterId, block.seatIds[0], 'finalize', block.showingNumber)).ok, true);
  assert.equal((await pickSeat(QA_TOKEN, block.theaterId, block.seatIds[1], 'finalize', block.showingNumber)).ok, true);
  const stalePick = await pickSeat(QA_TOKEN, block.theaterId, block.seatIds[2], 'finalize', block.showingNumber);
  assert.equal(stalePick.ok, false);
  const freshPortal = await getPortal(QA_TOKEN);
  assert.equal(freshPortal.seatMath.placed, 2);
  return { staleAvailable: stalePortal.seatMath.available, freshPlaced: freshPortal.seatMath.placed, status: stalePick.status };
});

await scenario('two clients racing for one seat do not create duplicates', async () => {
  const block = await findSeatBlock({ count: 1 });
  const tokenA = QA_TOKEN;
  const tokenB = QA_RIVAL_TOKEN || QA_TOKEN;
  const [a, b] = await Promise.all([
    pickSeat(tokenA, block.theaterId, block.seatIds[0], 'finalize', block.showingNumber),
    pickSeat(tokenB, block.theaterId, block.seatIds[0], 'finalize', block.showingNumber),
  ]);
  assert.equal(a.ok || b.ok, true);
  const portal = await getPortal(tokenA);
  const matches = [...(portal.myAssignments || []), ...(portal.myHolds || [])].filter(
    (row) => row.theater_id === block.theaterId
      && Number(row.showing_number ?? 1) === Number(block.showingNumber)
      && `${row.row_label}-${row.seat_num}` === block.seatIds[0]
  );
  assert.ok(matches.length <= 1, 'Duplicate assignment found after race');
  return {
    theaterId: block.theaterId,
    showingNumber: block.showingNumber,
    seat: block.seatIds[0],
    statuses: [a.status, b.status],
    rivalTokenUsed: Boolean(QA_RIVAL_TOKEN),
  };
});

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: failed.length === 0, token: QA_TOKEN, results }, null, 2));
if (failed.length) process.exit(1);

