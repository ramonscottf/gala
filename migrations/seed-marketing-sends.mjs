#!/usr/bin/env node
// Seed marketing_sends from the current in-code SENDS registry +
// the admin/index.html PIPELINE metadata.
//
// Run once after the migration. Idempotent — uses INSERT OR REPLACE.
//
// Usage:
//   node migrations/seed-marketing-sends.mjs
//
// Reads:
//   functions/api/gala/marketing-test.js  (SENDS registry, with helper consts)
//   public/admin/index.html               (PIPELINE metadata)
//
// Writes:
//   D1 gala-seating  (table marketing_sends)

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const D1_ID  = '1468a0b3-cc6c-49a6-ad89-421e9fb00a86';
const ACCT   = '77f3d6611f5ceab7651744268d434342';
const CF_KEY = process.env.CF_API_KEY;
const CF_EML = process.env.CF_API_EMAIL;
if (!CF_KEY || !CF_EML) {
  console.error('Need CF_API_KEY and CF_API_EMAIL in env.');
  process.exit(1);
}

// ── Extract the SENDS object from marketing-test.js ────────────────────────
//
// The file uses ES module syntax with imports. We can't `import` it directly
// here because Cloudflare-specific imports (`./_auth.js`, etc.) won't resolve.
// Strategy: read the source, strip the unwanted imports + onRequest function,
// keep the helper consts (PORTAL_LINK, BTN, blocks…) and SENDS literal, eval
// in a sandbox.

const src = readFileSync(join(ROOT, 'functions/api/gala/marketing-test.js'), 'utf8');

// Find SENDS literal start
const sendsStart = src.indexOf('const SENDS = {');
if (sendsStart < 0) throw new Error('SENDS not found');

// Take everything from start of file up to the SENDS closing `};`. We need
// the consts above SENDS to be evaluated so template literals resolve.
const sendsEnd = (() => {
  let depth = 0, i = src.indexOf('{', sendsStart);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error('couldn\'t find end of SENDS');
})();

const helpersAndSends = src.slice(0, sendsEnd);

// Strip the imports — they reference Cloudflare-only modules
const evalSrc = helpersAndSends
  .replace(/^import .*?;$/gm, '')
  // expose SENDS to outer scope
  + '\nglobalThis.__SENDS = SENDS;';

// Eval in a Function constructor sandbox
new Function(evalSrc)();
const SENDS = globalThis.__SENDS;
if (!SENDS) throw new Error('eval did not produce SENDS');

console.log(`Loaded ${Object.keys(SENDS).length} sends from SENDS registry.`);

// ── Extract PIPELINE metadata from admin/index.html ────────────────────────
const adminHtml = readFileSync(join(ROOT, 'public/admin/index.html'), 'utf8');
const pipelineStart = adminHtml.indexOf('const PIPELINE = [');
if (pipelineStart < 0) throw new Error('PIPELINE not found');
const pipelineEnd = (() => {
  let depth = 0, i = adminHtml.indexOf('[', pipelineStart);
  for (; i < adminHtml.length; i++) {
    if (adminHtml[i] === '[') depth++;
    else if (adminHtml[i] === ']') { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error('couldn\'t find end of PIPELINE');
})();
const pipelineLiteral = adminHtml.slice(pipelineStart, pipelineEnd).replace(/^const PIPELINE = /, '');

const PIPELINE = new Function(`return ${pipelineLiteral};`)();
console.log(`Loaded ${PIPELINE.length} phases / ${PIPELINE.flatMap(p=>p.sends).length} sends from PIPELINE metadata.`);

// ── Build rows ─────────────────────────────────────────────────────────────
const rows = [];
let order = 0;
for (const phase of PIPELINE) {
  for (const send of phase.sends) {
    const fromSends = SENDS[send.id] || {};
    rows.push({
      send_id: send.id,
      phase: phase.phase,
      phase_title: phase.title,
      phase_color: phase.color,
      phase_desc: phase.desc,
      phase_range: phase.range,
      channel: send.channel,
      date: send.date,
      time: send.time,
      audience: send.audience || null,
      status: send.status || 'upcoming',
      title: send.title || null,
      subject: fromSends.subject || send.subject || null,
      body: fromSends.body || null,
      notes: send.notes || null,
      sort_order: order++,
      updated_by: 'seed:marketing-pipeline-init',
    });
  }
}

console.log(`Built ${rows.length} rows.`);

// ── Insert via D1 HTTP API ────────────────────────────────────────────────
// Use a single batched INSERT OR REPLACE per row (safer for big bodies than
// multi-VALUES). We chunk into batches of 5 statements per call to stay well
// under any payload limits.
//
// D1 query API accepts {sql, params} per call; for batched: {sql} can have
// `;`-separated statements but params binding gets messy. Loop per-row.

async function d1(sql, params = []) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCT}/d1/database/${D1_ID}/query`,
    {
      method: 'POST',
      headers: {
        'X-Auth-Key': CF_KEY,
        'X-Auth-Email': CF_EML,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  const d = await r.json();
  if (!d.success) throw new Error(JSON.stringify(d.errors));
  return d.result;
}

const upsertSql = `
INSERT OR REPLACE INTO marketing_sends
  (send_id, phase, phase_title, phase_color, phase_desc, phase_range,
   channel, date, time, audience, status, title, subject, body, notes,
   sort_order, updated_at, updated_by)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)`;

let n = 0;
for (const r of rows) {
  await d1(upsertSql, [
    r.send_id, r.phase, r.phase_title, r.phase_color, r.phase_desc, r.phase_range,
    r.channel, r.date, r.time, r.audience, r.status, r.title, r.subject, r.body,
    r.notes, r.sort_order, r.updated_by,
  ]);
  n++;
  process.stdout.write(`\rSeeded ${n}/${rows.length} (${r.send_id})${' '.repeat(20)}`);
}
console.log('\nDone.');
