// PATCH /api/gala/marketing-pipeline/:sendId
//
// Update editable fields on a single send. See marketing-pipeline.js for the
// full description.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

const EDITABLE = new Set(['subject', 'body', 'date', 'time', 'status', 'notes', 'audience', 'title']);

// CORS / preflight on PATCH from same-origin admin page is fine, but Pages
// returns 405 on PATCH for static asset paths — this is a function route so
// it works. We accept POST + ?action=update as a fallback for any client that
// rejects PATCH (matches the gala-emails skill note about Cloudflare WAF).
export async function onRequest(context) {
  const { request, env, params } = context;

  const ok = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!ok) return jsonError('Unauthorized', 401);
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const sendId = params.sendId;
  if (!sendId) return jsonError('Missing sendId', 400);

  const url = new URL(request.url);
  const isUpdate = request.method === 'PATCH'
    || (request.method === 'POST' && url.searchParams.get('action') === 'update');
  if (!isUpdate) return jsonError('Method not allowed', 405);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Bad JSON', 400); }

  // Filter to editable fields only
  const updates = {};
  for (const k of Object.keys(body)) {
    if (EDITABLE.has(k)) updates[k] = body[k];
  }
  if (Object.keys(updates).length === 0) {
    return jsonError('No editable fields supplied', 400);
  }

  // Verify the row exists
  const existing = await env.GALA_DB.prepare(
    'SELECT send_id, channel FROM marketing_sends WHERE send_id = ?'
  ).bind(sendId).first();
  if (!existing) return jsonError(`No such send: ${sendId}`, 404);

  // Sanity: SMS sends shouldn't accept HTML — but allow anything; the test
  // sender already handles the divergence. Just log via updated_by.
  const setClauses = Object.keys(updates).map(k => `${k} = ?`);
  const values = Object.keys(updates).map(k => updates[k]);
  const updatedBy = body._updatedBy || 'admin';

  await env.GALA_DB.prepare(
    `UPDATE marketing_sends
        SET ${setClauses.join(', ')},
            updated_at = CURRENT_TIMESTAMP,
            updated_by = ?
      WHERE send_id = ?`
  ).bind(...values, updatedBy, sendId).run();

  // Return the updated row
  const fresh = await env.GALA_DB.prepare(
    `SELECT send_id, phase, channel, date, time, audience, status, title,
            subject, body, notes, updated_at, updated_by
       FROM marketing_sends WHERE send_id = ?`
  ).bind(sendId).first();

  return jsonOk({ ok: true, send: fresh });
}
