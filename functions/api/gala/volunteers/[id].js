// /api/gala/volunteers/[id]
// PATCH — update volunteer (admin only)
// DELETE — remove volunteer (admin only)

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const allowed = ['status', 'role', 'shift', 'notes', 'first_name', 'last_name',
                   'email', 'phone', 'organization', 'shirt_size', 'checked_in',
                   'position', 'participant_type'];
  const fields = [];
  const vals = [];

  for (const [key, val] of Object.entries(body)) {
    const snake = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (!allowed.includes(snake)) continue;
    fields.push(`${snake} = ?`);
    if (snake === 'checked_in') {
      vals.push(val ? 1 : 0);
      if (val) { fields.push('checked_in_at = ?'); vals.push(new Date().toISOString()); }
    } else {
      vals.push(val === '' ? null : val);
    }
  }

  if (!fields.length) return jsonError('Nothing to update', 400);

  fields.push('updated_at = ?');
  vals.push(new Date().toISOString());
  vals.push(params.id);

  await env.GALA_DB.prepare(
    `UPDATE volunteers SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`
  ).bind(...vals).run();

  return jsonOk({ id: params.id, updated: true });
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  // Soft delete: set deleted_at instead of removing the row.
  // Recoverable via POST /api/gala/volunteers/[id]/restore for 30 days.
  const result = await env.GALA_DB.prepare(
    'UPDATE volunteers SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL'
  ).bind(new Date().toISOString(), params.id).run();

  if (!result.meta?.changes) {
    return jsonError('Volunteer not found or already deleted', 404);
  }

  return jsonOk({ id: params.id, deleted: true, soft: true });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
