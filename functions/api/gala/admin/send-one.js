// POST /api/gala/admin/send-one
//
// Send a single scheduled marketing message to a single sponsor. Used for
// catching up late-added sponsors who missed earlier-cycle sends, fired one
// at a time from the per-sponsor pipeline view.
//
// Body: {
//   sponsor_id:       number  (required)
//   send_id:          string  (required) — pulls subject/body/channel from marketing_sends
//   subject_override: string  (optional, email only)
//   body_override:    string  (optional)
// }
//
// Differences from marketing-send-now:
//   - Single recipient, no audience resolution
//   - No confirmedRecipientCount handshake (caller already chose THE one sponsor)
//   - Logs to marketing_send_log with send_run_id = manual-{ts}-{sponsor_id} so
//     it's distinguishable from batch runs in the UI
//   - Supports SMS as well as email (catch-up may include SMS-channel sends)
//   - Supports per-call subject/body overrides for "Apologies for the delay"
//     intros without mutating the canonical pipeline row

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';
import { sendEmail, sendSMS, galaEmailHtml } from '../_notify.js';
import { displayName } from '../_audience.js';

export async function onRequestPost({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) {
    return jsonError('Unauthorized', 401);
  }
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  let payload;
  try { payload = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const sponsorId = Number(payload?.sponsor_id);
  const sendId = String(payload?.send_id || '').trim();
  const subjectOverride = typeof payload?.subject_override === 'string' ? payload.subject_override.trim() : null;
  const bodyOverride = typeof payload?.body_override === 'string' ? payload.body_override : null;

  if (!sponsorId) return jsonError('sponsor_id required', 400);
  if (!sendId)    return jsonError('send_id required', 400);

  const db = env.GALA_DB;

  // Pull sponsor + send rows in parallel
  const [sponsor, send] = await Promise.all([
    db.prepare(
      `SELECT id, company, first_name, last_name, email, phone, sponsorship_tier
         FROM sponsors WHERE id = ?`
    ).bind(sponsorId).first(),
    db.prepare(
      `SELECT send_id, channel, audience, subject, body
         FROM marketing_sends WHERE send_id = ?`
    ).bind(sendId).first(),
  ]);

  if (!sponsor) return jsonError(`Sponsor ${sponsorId} not found`, 404);
  if (!send)    return jsonError(`Send ${sendId} not found`, 404);

  const channel = (send.channel || '').toLowerCase();
  if (channel !== 'email' && channel !== 'sms') {
    return jsonError(`Unsupported channel: ${send.channel}`, 400);
  }

  const finalSubject = subjectOverride || send.subject || '';
  const finalBody = bodyOverride !== null ? bodyOverride : (send.body || '');

  if (channel === 'email' && !finalSubject) return jsonError('Subject required for email', 400);
  if (!finalBody) return jsonError('Body required', 400);

  if (channel === 'email' && !sponsor.email) {
    return jsonError('Sponsor has no email on file', 400);
  }
  if (channel === 'sms' && !sponsor.phone) {
    return jsonError('Sponsor has no phone on file', 400);
  }

  // send_run_id distinguishes manual catch-up sends from batch runs in the
  // UI ("manual-1234567890123-80"). The format is human-grokable on the
  // marketing-send-log endpoint.
  const runId = `manual-${Date.now()}-${sponsorId}`;
  const sentBy = 'admin-catchup';
  const bodyPreview = stripHtml(finalBody).slice(0, 200);

  let status = 'sent';
  let errorMessage = null;
  let providerId = null;

  if (channel === 'email') {
    const html = galaEmailHtml({
      firstName: sponsor.first_name || sponsor.company || null,
      body: finalBody,
    });
    try {
      const res = await sendEmail(env, {
        to: sponsor.email,
        subject: finalSubject,
        html,
        replyTo: env.GALA_ADMIN_EMAIL,
      });
      if (res.ok) {
        providerId = res.id || null;
      } else {
        status = 'failed';
        errorMessage = res.error || 'Unknown email send error';
      }
    } catch (e) {
      status = 'failed';
      errorMessage = e.message || String(e);
    }
  } else {
    // SMS
    try {
      const res = await sendSMS(env, sponsor.phone, finalBody);
      if (res.ok) {
        providerId = res.sid || res.id || null;
      } else {
        status = 'failed';
        errorMessage = res.error || 'Unknown SMS send error';
      }
    } catch (e) {
      status = 'failed';
      errorMessage = e.message || String(e);
    }
  }

  // Log the attempt regardless of outcome — same shape as marketing-send-now.
  // The log is what powers the per-sponsor pipeline status, so a failed send
  // still surfaces as a row (status='failed') and the pipeline will continue
  // to mark the send as 'missed' for status purposes (sent count = success only).
  try {
    await db.prepare(`
      INSERT INTO marketing_send_log (
        send_id, send_run_id, channel, recipient_email, recipient_phone, recipient_name,
        sponsor_id, audience_label, status, error_message, subject,
        body_preview, sent_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sendId,
      runId,
      channel,
      channel === 'email' ? sponsor.email : null,
      channel === 'sms'   ? sponsor.phone : null,
      displayName(sponsor),
      sponsorId,
      send.audience || '(catch-up: per-sponsor)',
      status,
      errorMessage,
      finalSubject || null,
      bodyPreview,
      sentBy,
    ).run();
  } catch (e) {
    // Logging shouldn't fail the response, but include the warning so the
    // UI can show a non-blocking notice.
    return jsonOk({
      sent: status === 'sent',
      status,
      error: errorMessage,
      runId,
      providerId,
      logWarning: 'Send completed but log write failed: ' + e.message,
    });
  }

  if (status !== 'sent') {
    return jsonError(errorMessage || 'Send failed', 502);
  }

  return jsonOk({
    sent: true,
    status,
    runId,
    providerId,
    sentAt: new Date().toISOString(),
  });
}

function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
