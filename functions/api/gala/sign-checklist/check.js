/**
 * POST /api/gala/sign-checklist/check
 *
 * Body: { id: number, done: boolean }
 *
 * Toggles the sign-finished marker on a sponsor. The checklist UI sends
 * { done: true } when the box is ticked, { done: false } to clear it.
 * Stored as ISO timestamp (or NULL) on sponsors.sign_completed_at so we
 * also have an audit trail of WHEN each sign was marked done — useful
 * later when Scott wants to know what happened the night before the
 * gala if a sign was missing.
 */

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) {
    return jsonError('unauthorized', 401);
  }
  if (!env.GALA_DB) return jsonError('D1 not bound', 503);

  let body;
  try { body = await request.json(); } catch { return jsonError('invalid JSON', 400); }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return jsonError('bad id', 400);
  if (typeof body.done !== 'boolean') return jsonError('done must be boolean', 400);

  const ts = body.done ? new Date().toISOString() : null;

  // Explicit column naming, both columns we touch are bound in the
  // statement. updated_at lets sponsors-with-tracking pick up the change.
  const sql =
    'UPDATE sponsors SET sign_completed_at = ?1, updated_at = datetime(\'now\') WHERE id = ?2 AND archived_at IS NULL';
  const res = await env.GALA_DB.prepare(sql).bind(ts, id).run();

  if (!res.meta || res.meta.changes !== 1) {
    return jsonError('sponsor not found or archived', 404);
  }

  return jsonOk({ ok: true, id, sign_completed_at: ts });
}
