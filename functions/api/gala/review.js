// /api/gala/review — Editable marketing review page
// GET  ?action=loadEdits → all current edits + last editor's email
// GET  ?action=loadHistory&sendId=X → version history for one send
// POST { sendId, subject, body, notes } → save edit (snapshots current to history)
// POST { sendId, action: 'reset' } → revert to defaults
// POST { sendId, action: 'undo' } → pop last history entry back into current

import { verifyReviewSession } from './review/_session.js';
import { jsonError, jsonOk } from './_auth.js';

async function requireAuth(request, env) {
  const session = await verifyReviewSession(request, env.GALA_REVIEW_SECRET);
  if (!session) return { error: jsonError('Not signed in', 401) };
  return { session };
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  if (action === 'loadEdits') {
    if (!env.GALA_DB) return jsonError('DB not configured', 503);
    const { results } = await env.GALA_DB.prepare(
      'SELECT send_id, subject_override, body_override, notes, status, updated_at, updated_by, applied_at, applied_commit FROM marketing_edits'
    ).all();
    const edits = {};
    for (const r of results) {
      edits[r.send_id] = {
        subject: r.subject_override,
        body: r.body_override,
        notes: r.notes,
        status: r.status,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
        appliedAt: r.applied_at,
        appliedCommit: r.applied_commit,
      };
    }
    return jsonOk({ edits, currentUser: session.email });
  }

  if (action === 'loadHistory') {
    const sendId = url.searchParams.get('sendId');
    if (!sendId) return jsonError('sendId required', 400);
    if (!env.GALA_DB) return jsonError('DB not configured', 503);
    const { results } = await env.GALA_DB.prepare(
      `SELECT id, snapshot_subject, snapshot_body, snapshot_notes, snapshot_at, snapshot_by, change_kind
       FROM marketing_edits_history
       WHERE send_id = ?
       ORDER BY id DESC
       LIMIT 10`
    ).bind(sendId).all();
    return jsonOk({ history: results || [] });
  }

  return jsonError('Unknown action', 400);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.GALA_DB) return jsonError('DB not configured', 503);

  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const { sendId, action } = body;
  if (!sendId) return jsonError('sendId required', 400);

  if (action === 'reset') {
    await snapshotCurrent(env, sendId, session.email, 'reset');
    await env.GALA_DB.prepare('DELETE FROM marketing_edits WHERE send_id = ?').bind(sendId).run();
    return jsonOk({ ok: true, reset: true });
  }

  if (action === 'undo') {
    const last = await env.GALA_DB.prepare(
      `SELECT id, snapshot_subject, snapshot_body, snapshot_notes
       FROM marketing_edits_history
       WHERE send_id = ?
       ORDER BY id DESC LIMIT 1`
    ).bind(sendId).first();

    if (!last) return jsonError('Nothing to undo', 404);

    await snapshotCurrent(env, sendId, session.email, 'undo');

    if (!last.snapshot_subject && !last.snapshot_body && !last.snapshot_notes) {
      await env.GALA_DB.prepare('DELETE FROM marketing_edits WHERE send_id = ?').bind(sendId).run();
    } else {
      await env.GALA_DB.prepare(
        `INSERT INTO marketing_edits (send_id, subject_override, body_override, notes, status, updated_at, updated_by)
         VALUES (?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP, ?)
         ON CONFLICT(send_id) DO UPDATE SET
           subject_override = excluded.subject_override,
           body_override = excluded.body_override,
           notes = excluded.notes,
           status = 'draft',
           updated_at = CURRENT_TIMESTAMP,
           updated_by = excluded.updated_by`
      ).bind(sendId, last.snapshot_subject, last.snapshot_body, last.snapshot_notes, session.email).run();
    }

    await env.GALA_DB.prepare('DELETE FROM marketing_edits_history WHERE id = ?').bind(last.id).run();
    return jsonOk({ ok: true, undone: true });
  }

  const subject = body.subject !== undefined ? body.subject : null;
  const bodyOverride = body.body !== undefined ? body.body : null;
  const notes = body.notes !== undefined ? body.notes : null;
  const isContentEdit = body.subject !== undefined || body.body !== undefined;
  const isAnyEdit = isContentEdit || body.notes !== undefined;

  if (isAnyEdit) {
    const kind = body.changeKind || (isContentEdit ? 'edit' : 'notes');
    await snapshotCurrent(env, sendId, session.email, kind);
  }

  await env.GALA_DB.prepare(
    `INSERT INTO marketing_edits (send_id, subject_override, body_override, notes, status, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(send_id) DO UPDATE SET
       subject_override = COALESCE(excluded.subject_override, subject_override),
       body_override = COALESCE(excluded.body_override, body_override),
       notes = COALESCE(excluded.notes, notes),
       status = CASE WHEN ? = 1 THEN 'draft' ELSE status END,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = excluded.updated_by`
  ).bind(sendId, subject, bodyOverride, notes, 'draft', session.email, isContentEdit ? 1 : 0).run();

  return jsonOk({ ok: true, by: session.email });
}

async function snapshotCurrent(env, sendId, email, kind) {
  const cur = await env.GALA_DB.prepare(
    `SELECT subject_override, body_override, notes FROM marketing_edits WHERE send_id = ?`
  ).bind(sendId).first();

  const subj = cur ? cur.subject_override : null;
  const bod = cur ? cur.body_override : null;
  const not = cur ? cur.notes : null;

  await env.GALA_DB.prepare(
    `INSERT INTO marketing_edits_history (send_id, snapshot_subject, snapshot_body, snapshot_notes, snapshot_at, snapshot_by, change_kind)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`
  ).bind(sendId, subj, bod, not, email, kind).run();

  await env.GALA_DB.prepare(
    `DELETE FROM marketing_edits_history
     WHERE send_id = ?
       AND id NOT IN (
         SELECT id FROM marketing_edits_history
         WHERE send_id = ?
         ORDER BY id DESC LIMIT 10
       )`
  ).bind(sendId, sendId).run();
}
