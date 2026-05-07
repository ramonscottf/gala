// /api/gala/marketing-send-log
// GET → recent send activity, newest first.
//
// Query params:
//   ?sendId=s1a   — filter to one pipeline row (powers per-row disclosure)
//   ?limit=50     — cap rows (default 50, max 200)
//
// Returns rows grouped by send_run_id so the UI can render "12 sent · 0
// failed at 2:14 PM" rather than 12 separate lines per run.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';

export async function onRequestGet({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) return jsonError('Unauthorized', 401);

  const url = new URL(request.url);
  const sendId = url.searchParams.get('sendId');
  const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Math.min(Math.max(limitParam, 1), 200);

  const db = env.GALA_DB;
  if (!db) return jsonError('GALA_DB not bound', 500);

  // Pull individual rows, ordered by sent_at desc. We aggregate run-level
  // summaries client-side because D1 / SQLite can do GROUP BY but the row
  // detail (which 12 people got it) is more useful for the per-row UI.
  const sql = sendId
    ? `SELECT * FROM marketing_send_log WHERE send_id = ? ORDER BY sent_at DESC LIMIT ?`
    : `SELECT * FROM marketing_send_log ORDER BY sent_at DESC LIMIT ?`;

  const stmt = sendId
    ? db.prepare(sql).bind(sendId, limit)
    : db.prepare(sql).bind(limit);

  const result = await stmt.all();
  const rows = result.results || [];

  // Group by run_id while preserving newest-first order
  const runs = new Map();
  for (const row of rows) {
    if (!runs.has(row.send_run_id)) {
      runs.set(row.send_run_id, {
        runId: row.send_run_id,
        sendId: row.send_id,
        channel: row.channel,
        audienceLabel: row.audience_label,
        subject: row.subject,
        sentAt: row.sent_at,
        sentBy: row.sent_by,
        sent: 0,
        failed: 0,
        recipients: [],
      });
    }
    const r = runs.get(row.send_run_id);
    if (row.status === 'sent') r.sent++;
    else if (row.status === 'failed') r.failed++;
    r.recipients.push({
      email: row.recipient_email,
      name: row.recipient_name,
      status: row.status,
      error: row.error_message,
    });
  }

  return jsonOk({
    runs: Array.from(runs.values()),
    rowCount: rows.length,
  });
}
