// /api/gala/cook-shirts
// POST — public: a kitchen-crew cook submits their t-shirt size (upsert by name)
// GET  — admin only (gala session cookie): list the full crew roster + sizes
//
// DEF Gala 2026 — Davis School District nutrition-services cooks serving dinner
// June 10. The roster (name/email/phone/shift) is pre-seeded; the public form
// fills in `size` and flips `responded`. Stored in gala-seating D1 `cook_shirts`.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';

const SIZES = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL','LT','XLT','2XLT','3XLT','4XLT'];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function nameKey(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const name = (body.name || '').trim();
  const size = (body.size || '').trim();
  const phone = (body.phone || '').trim() || null;

  if (!name) return jsonError('Name is required', 400);
  if (!size || !SIZES.includes(size)) return jsonError('Please choose a valid size', 400);

  const key = nameKey(name);
  const id = generateId();

  // Upsert on name_key. Every column is explicitly bound. On conflict we update
  // ONLY size/phone/responded — email + shift come from the seeded roster and
  // must be preserved (the public form never sends them).
  await env.GALA_DB.prepare(`
    INSERT INTO cook_shirts (id, name, name_key, phone, size, responded, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
    ON CONFLICT(name_key) DO UPDATE SET
      size = excluded.size,
      phone = COALESCE(excluded.phone, cook_shirts.phone),
      responded = 1,
      updated_at = datetime('now')
  `).bind(id, name, key, phone, size, body.source || 'cook-crew').run();

  return jsonOk({ ok: true, name, size });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  // PII — admin session required (same gala dashboard login as volunteers)
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const { results } = await env.GALA_DB.prepare(
    `SELECT name, email, phone, shift, size, responded, source, created_at, updated_at
       FROM cook_shirts ORDER BY name COLLATE NOCASE ASC`
  ).all();

  const cooks = results || [];
  const responded = cooks.filter(c => c.responded).length;
  return jsonOk({ cooks, total: cooks.length, responded, awaiting: cooks.length - responded });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
