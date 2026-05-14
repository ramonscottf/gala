// scripts/update-tier-open-bodies.mjs
//
// Writes the canonical tier-open email bodies (from
// tier-open-email-bodies.mjs) into the marketing_sends table in D1.
// Run with:
//
//   CF_API_TOKEN=<global-key> CF_API_EMAIL=ramonscottf@gmail.com \
//   D1_DB=1468a0b3-cc6c-49a6-ad89-421e9fb00a86 \
//   node scripts/update-tier-open-bodies.mjs
//
// Uses X-Auth-Email + X-Auth-Key (the gala D1 has been on Global API Key
// auth since the original setup — Bearer tokens are NOT accepted).

import { TIER_OPEN_BODIES } from './tier-open-email-bodies.mjs';

const ACCOUNT = '77f3d6611f5ceab7651744268d434342';
const D1 = process.env.D1_DB || '1468a0b3-cc6c-49a6-ad89-421e9fb00a86';
const EMAIL = process.env.CF_API_EMAIL || 'ramonscottf@gmail.com';
const KEY = process.env.CF_API_TOKEN;

if (!KEY) {
  console.error('Set CF_API_TOKEN to the Global API Key.');
  process.exit(1);
}

const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${D1}/query`;

async function exec(sql, params = []) {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Auth-Email': EMAIL,
      'X-Auth-Key': KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json();
  if (!j.success) {
    console.error('D1 error:', JSON.stringify(j.errors, null, 2));
    process.exit(2);
  }
  return j.result[0];
}

console.log('Updating tier-open email bodies in marketing_sends…\n');

for (const [sendId, { audience, body, note }] of Object.entries(TIER_OPEN_BODIES)) {
  const before = await exec(
    'SELECT send_id, subject, length(body) AS body_len FROM marketing_sends WHERE send_id = ?',
    [sendId],
  );
  if (!before.results || before.results.length === 0) {
    console.log(`  ${sendId} (${audience}): NOT FOUND in marketing_sends — skipping`);
    continue;
  }
  const oldLen = before.results[0].body_len || 0;

  const result = await exec(
    `UPDATE marketing_sends SET body = ?, updated_at = datetime('now'), updated_by = 'tier-lockdown-2026-05-14' WHERE send_id = ?`,
    [body, sendId],
  );
  const changes = result.meta?.changes || 0;
  const status = changes > 0 ? '✓ updated' : '✗ no change';
  console.log(`  ${sendId.padEnd(4)} ${audience.padEnd(22)} ${status}  (was ${oldLen} chars → ${body.length})  ${note}`);
}

console.log('\nDone. Verify in admin → Marketing tab, then send Gold via Preview/Confirm flow.');
