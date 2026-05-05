// /api/gala/volunteers/[id]/restore
// POST — un-soft-delete a volunteer (admin only)

import { verifyGalaAuth, jsonError, jsonOk } from '../../_auth.js';

export async function onRequestPost(context) {
  const { request, env, params } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const result = await env.GALA_DB.prepare(
    'UPDATE volunteers SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL'
  ).bind(new Date().toISOString(), params.id).run();

  if (!result.meta?.changes) {
    return jsonError('Volunteer not found or not deleted', 404);
  }

  return jsonOk({ id: params.id, restored: true });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
