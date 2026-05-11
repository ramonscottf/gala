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
    // Phase 5.14 launch fix — substitute {TOKEN} placeholder in body
    // AND subject with this recipient's real rsvp_token. Without this,
    // every email ships with literal text "{TOKEN}" in the portal link,
    // making the link dead. Fails loudly if a recipient is missing a
    // token rather than silently shipping a dead-link email — surfaces
    // in marketing_send_log as status=failed with a clear error.
    if (!r.rsvp_token) {
      failed++;
      errors.push({ email: r.email, error: 'Recipient has no rsvp_token — would ship dead-link email' });
      try {
        await db.prepare(`
          INSERT INTO marketing_send_log (
            send_id, send_run_id, channel, recipient_email, recipient_name,
            sponsor_id, audience_label, status, error_message, subject,
            body_preview, sent_by
          ) VALUES (?, ?, 'email', ?, ?, ?, ?, 'failed', ?, ?, ?, ?)
        `).bind(
          sendId, runId, r.email, displayName(r), r.id,
          send.audience, 'No rsvp_token', send.subject,
          bodyPreview, sentBy
        ).run();
      } catch {}
      continue;
    }

    const bodyForRecipient = String(send.body || '').replaceAll('{TOKEN}', r.rsvp_token);
    const subjectForRecipient = String(send.subject || '').replaceAll('{TOKEN}', r.rsvp_token);
    const html = galaEmailHtml({
      firstName: r.first_name || r.company || null,
      body: bodyForRecipient,
    });

    let status = 'sent', errorMessage = null;
    try {
      const res = await sendEmail(env, {
        to: r.email,
        subject: subjectForRecipient,
        html,
      });
      if (!res.ok || !res.id) {
        // !res.id catches the SkippyMail silent-drop case where the
        // endpoint returns {ok:true} but never reaches Resend (proven
        // root cause from earlier this session — comma-separated
        // replyTo triggered it, now fixed upstream but keep the
        // defensive check in case any other config trips it).
        status = 'failed';
        errorMessage = res.error || 'SkippyMail returned ok but no resend_id (silent drop)';
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
        send.audience, status, errorMessage, subjectForRecipient,
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
