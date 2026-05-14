// scripts/test-brand-block-roundtrip.mjs
//
// Sanity check that wrapBrandBlocks → unwrapBrandBlocks recovers the
// original HTML byte-for-byte for our six canonical tier bodies.

import { wrapBrandBlocks, unwrapBrandBlocks } from '../src/admin/brand-block.js';
import {
  PLATINUM_BODY, GOLD_BODY, SILVER_BODY, BRONZE_BODY,
  FRIENDS_FAMILY_BODY, INDIVIDUAL_SEATS_BODY,
} from './tier-open-email-bodies.mjs';

const bodies = [
  ['Platinum',         PLATINUM_BODY],
  ['Gold',             GOLD_BODY],
  ['Silver',           SILVER_BODY],
  ['Bronze',           BRONZE_BODY],
  ['Friends & Family', FRIENDS_FAMILY_BODY],
  ['Individual Seats', INDIVIDUAL_SEATS_BODY],
];

let fails = 0;
for (const [name, body] of bodies) {
  const wrapped = wrapBrandBlocks(body);
  const unwrapped = unwrapBrandBlocks(wrapped);
  const wrappedBlockCount = (wrapped.match(/<brand-block /g) || []).length;
  if (unwrapped === body) {
    console.log(`✓ ${name} — wrapped ${wrappedBlockCount} blocks, unwrap == original (${body.length} bytes)`);
  } else {
    fails++;
    console.log(`✗ ${name} — MISMATCH (${body.length} → ${wrapped.length} → ${unwrapped.length})`);
    // Find first divergence
    let i = 0;
    while (i < body.length && i < unwrapped.length && body[i] === unwrapped[i]) i++;
    console.log(`   First diff at index ${i}`);
    console.log(`   orig:    "${body.slice(Math.max(0, i - 20), i + 60)}"`);
    console.log(`   roundtrip: "${unwrapped.slice(Math.max(0, i - 20), i + 60)}"`);
  }
}

// Bonus: simulate a save where TipTap *would* have flattened our blocks —
// in the new world, the editor never sees the raw HTML for those blocks,
// just opaque <brand-block> wrappers. Verify that if Kara only edits OUTSIDE
// a brand block (changes the greeting), the brand blocks come back intact.
console.log('\n--- Simulated Kara edit (greeting wording change) ---');
const goldWrapped = wrapBrandBlocks(GOLD_BODY);
const editedAsKara = goldWrapped.replace(
  /Hello, Gold sponsors!/,
  'Hello, our Gold sponsors!'
);
const editedUnwrapped = unwrapBrandBlocks(editedAsKara);
const stillHasButton = editedUnwrapped.includes('linear-gradient(90deg,#0066ff 0%,#c8102e 100%)');
const stillHasGuestsBox = editedUnwrapped.includes('Bringing guests?');
const stillHasChecklist = editedUnwrapped.includes('💺');
const greetingChanged = editedUnwrapped.includes('our Gold sponsors!');
console.log(`Greeting edit preserved:   ${greetingChanged ? '✓' : '✗'}`);
console.log(`Gradient button preserved: ${stillHasButton ? '✓' : '✗'}`);
console.log(`Guests box preserved:      ${stillHasGuestsBox ? '✓' : '✗'}`);
console.log(`Checklist preserved:       ${stillHasChecklist ? '✓' : '✗'}`);

if (fails > 0) {
  console.log(`\n${fails} body/ies failed round-trip.`);
  process.exit(1);
}
