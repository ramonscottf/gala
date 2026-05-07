// /api/gala/marketing-send-now
// POST { sendId: 's1a', confirmedRecipientCount: 12 }
//
// Resolves the audience, sends the wrapped email to each recipient, and
// writes one row to marketing_send_log per recipient. The
// confirmedRecipientCount must match what we recompute server-side — this
// guards against the audience changing between Preview and Confirm (e.g.
// admin in another tab adds a sponsor mid-flow).
//
// On success returns { sent, failed, runId } so the UI can show the badge
// and link the per-row activity disclosure to the run.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { sendEmail, galaEmailHtml } from './_notify.js';
import { resolveAudience, displayName } from './_audience.js';

export async function onRequestPost({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) return jsonError('Unauthorized', 401);

  let payload;
  try { payload = await request.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { sendId, confirmedRecipientCount } = payload || {};
  if (!sendId) return jsonError('sendId required', 400);
  if (typeof confirmedRecipientCount !== 'number') {
    return jsonError('confirmedRecipientCount required', 400);
  }

  const db = env.GALA_DB;
  if (!db) return jsonError('GALA_DB not bound', 500);

  // Pull canonical send row
  const send = await db.prepare(
    'SELECT send_id, channel, audience, subject, body FROM marketing_sends WHERE send_id = ?'
  ).bind(sendId).first();
  if (!send) return jsonError(`Send ${sendId} not found in marketing_sends`, 404);
  const channelLc = (send.channel || '').toLowerCase();
  if (channelLc !== 'email') {
    return jsonError(`Send Now is email only — this row is ${send.channel}`, 400);
  }
  if (!send.subject || !send.body) return jsonError('Subject and body required', 400);

  // Re-resolve audience server-side and verify count matches what admin saw
  const { recipients } = await resolveAudience(send.audience, db);
  if (recipients.length !== confirmedRecipientCount) {
    return jsonError(
      `Recipient count changed since preview (was ${confirmedRecipientCount}, now ${recipients.length}). Re-open Preview Send to refresh.`,
      409
    );
  }
  if (recipients.length === 0) {
    return jsonError(`No recipients matched audience "${send.audience}"`, 400);
  }

  const runId = crypto.randomUUID();
  const sentBy = 'admin';
  const bodyPreview = stripHtml(send.body).slice(0, 200);

  let sent = 0, failed = 0;
  const errors = [];

  for (const r of recipients) {
    const html = galaEmailHtml({
      firstName: r.first_name || r.company || null,
      body: send.body,
    });

    let status = 'sent', errorMessage = null;
    try {
      const res = await sendEmail(env, {
        to: r.email,
        subject: send.subject,
        html,
      });
      if (!res.ok) {
        status = 'failed';
        errorMessage = res.error || 'Unknown error';
        failed++;
        errors.push({ email: r.email, error: errorMessage });
      } else {
        sent++;
      }
    } catch (e) {
      status = 'failed';
      errorMessage = e.message;
      failed++;
      errors.push({ email: r.email, error: errorMessage });
    }

    // Log every attempt, success or failure
    try {
      await db.prepare(`
        INSERT INTO marketing_send_log (
          send_id, send_run_id, channel, recipient_email, recipient_name,
          sponsor_id, audience_label, status, error_message, subject,
          body_preview, sent_by
        ) VALUES (?, ?, 'email', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        sendId, runId, r.email, displayName(r), r.id,
        send.audience, status, errorMessage, send.subject,
        bodyPreview, sentBy
      ).run();
    } catch (e) {
      // Logging failure shouldn't abort the run, but capture for the response
      errors.push({ email: r.email, error: 'Log write failed: ' + e.message });
    }
  }

  return jsonOk({ runId, sent, failed, total: recipients.length, errors });
}

function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
