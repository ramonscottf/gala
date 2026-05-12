// /api/gala/marketing-catch-up-list
// GET → list of marketing sends that have actually been fired at least once
// (i.e. have any row in marketing_send_log with status='sent'), enriched
// with the live copy from marketing_sends and falling back to the in-code
// SENDS registry for metadata.
//
// Powers the "Resend a marketing piece" tab in the sponsor card composer.
// Phase 5.16 (2026-05-12) — Big West Oil tier-change catch-up trigger.
//
// Shape:
//   { sends: [
//       { sendId, title, channel, audience, subject,
//         lastSentAt, totalSent }
//     ] }
//
// Sorted newest-fired first. Includes both email and SMS sends — the UI
// filters by default to email-only but lets admin toggle SMS in.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { SENDS } from './marketing-test.js';

export async function onRequestGet({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) {
    return jsonError('Unauthorized', 401);
  }

  const db = env.GALA_DB;
  if (!db) return jsonError('GALA_DB not bound', 500);

  // 1. Aggregate marketing_send_log: which sendIds have been fired, when
  //    was the most recent successful send, and total successful sends.
  //
  //    GROUP BY send_id with MAX(sent_at) and COUNT. Filter to status='sent'
  //    so we don't surface sends that only have failed attempts.
  let logRows = [];
  try {
    const res = await db.prepare(`
      SELECT send_id,
             MAX(sent_at) AS last_sent_at,
             COUNT(*) AS total_sent
        FROM marketing_send_log
       WHERE status = 'sent'
       GROUP BY send_id
       ORDER BY MAX(sent_at) DESC
    `).all();
    logRows = res.results || [];
  } catch (e) {
    return jsonError('Failed to query marketing_send_log: ' + e.message, 500);
  }

  if (logRows.length === 0) {
    return jsonOk({ sends: [] });
  }

  // 2. Bulk-pull live copy for every fired sendId from marketing_sends.
  const sendIds = logRows.map(r => r.send_id);
  const placeholders = sendIds.map(() => '?').join(',');
  let liveBySendId = new Map();
  try {
    const res = await db.prepare(
      `SELECT send_id, channel, audience, subject, body
         FROM marketing_sends
        WHERE send_id IN (${placeholders})`
    ).bind(...sendIds).all();
    for (const row of (res.results || [])) {
      liveBySendId.set(row.send_id, row);
    }
  } catch (e) {
    // Non-fatal — we can fall back to in-code SENDS for metadata.
    console.error('marketing_sends lookup failed (non-fatal):', e.message);
  }

  // 3. Compose the response. Priority for each field:
  //    title:    SENDS[id].title  → 'Send ' + id (last resort)
  //    audience: live.audience  → SENDS[id].audience  → 'Unknown'
  //    subject:  live.subject  → SENDS[id].subject  → ''
  //    channel:  live.channel  → SENDS[id].type  → 'email'
  //
  // We deliberately read `title` from the registry only — `marketing_sends`
  // doesn't store a separate human title (only subject/body). The in-code
  // title field is the canonical human label.
  const sends = logRows.map(r => {
    const reg = SENDS[r.send_id] || null;
    const live = liveBySendId.get(r.send_id) || null;
    return {
      sendId: r.send_id,
      title: reg?.title || `Send ${r.send_id}`,
      channel: (live?.channel || reg?.type || 'email').toLowerCase(),
      audience: live?.audience || reg?.audience || 'Unknown',
      subject: live?.subject || reg?.subject || '',
      lastSentAt: r.last_sent_at,
      totalSent: r.total_sent,
    };
  });

  return jsonOk({ sends });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
