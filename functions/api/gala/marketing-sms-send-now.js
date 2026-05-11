// /api/gala/marketing-sms-send-now
// POST { sendId: 'sms1', confirmedRecipientCount: 7 }
//
// SMS analog of marketing-send-now. Fires the SMS body (with {TOKEN}
// substitution per recipient) to every sponsor in the configured
// audience who has a phone number. Logs to marketing_send_log.
//
// confirmedRecipientCount must match what the UI computed at preview
// time to guard against the audience changing between Preview and Confirm.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { sendSMS } from './_notify.js';

// Audience name → SQL filter clause. Mirrors _audience.js mappings but
// keyed off `phone` instead of `email`.
function audienceClause(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'platinum sponsors') return { tiers: ['Platinum'] };
  if (n === 'gold sponsors') return { tiers: ['Gold'] };
  if (n === 'silver sponsors') return { tiers: ['Silver'] };
  if (n === 'bronze sponsors') return { tiers: ['Bronze'] };
  if (n === 'friends & family') return { tiers: ['Friends and Family'] };
  if (n === 'individual seats') return { tiers: ['Individual Seats'] };
  if (n === 'confirmed buyers') return { tiers: ['Platinum', 'Gold', 'Silver', 'Bronze', 'Friends and Family', 'Individual Seats'] };
  if (n === 'platinum internal') return { internal: true };
  return null;
}

async function resolveSmsRecipients(audience, db) {
  const clause = audienceClause(audience);
  if (!clause) return [];

  if (clause.internal) {
    // Platinum Internal = Scott + Sherry + Kara test trio (matches the
    // canonical sandbox audience used during dry runs)
    const rows = await db.prepare(`
      SELECT id, first_name, last_name, company, phone, rsvp_token
      FROM sponsors
      WHERE archived_at IS NULL
        AND phone IS NOT NULL
        AND phone != ''
        AND email IN ('sfoster@dsdmail.net', 'smiggin@dsdmail.net', 'ktoone@dsdmail.net', 'karatoone@gmail.com')
      ORDER BY company
    `).all();
    return rows.results || [];
  }

  const placeholders = clause.tiers.map(() => '?').join(',');
  const rows = await db.prepare(`
    SELECT id, first_name, last_name, company, phone, rsvp_token
    FROM sponsors
    WHERE archived_at IS NULL
      AND phone IS NOT NULL
      AND phone != ''
      AND sponsorship_tier IN (${placeholders})
    ORDER BY company
  `).bind(...clause.tiers).all();
  return rows.results || [];
}

function displayName(r) {
  const parts = [r.first_name, r.last_name].filter(Boolean);
  return parts.join(' ').trim() || r.company || '(unknown)';
}

export async function onRequestPost({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) {
    return jsonError('Unauthorized', 401);
  }

  let payload;
  try { payload = await request.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { sendId, confirmedRecipientCount } = payload || {};
  if (!sendId) return jsonError('sendId required', 400);
  if (typeof confirmedRecipientCount !== 'number') {
    return jsonError('confirmedRecipientCount required', 400);
  }

  const db = env.GALA_DB;
  if (!db) return jsonError('GALA_DB not bound', 500);

  const send = await db.prepare(
    'SELECT send_id, channel, audience, body FROM marketing_sends WHERE send_id = ?'
  ).bind(sendId).first();
  if (!send) return jsonError(`Send ${sendId} not found`, 404);

  const channelLc = (send.channel || '').toLowerCase();
  if (channelLc !== 'sms') {
    return jsonError(`This endpoint is SMS only — row is ${send.channel}`, 400);
  }
  if (!send.body) return jsonError('SMS body is empty', 400);

  const recipients = await resolveSmsRecipients(send.audience, db);
  if (recipients.length !== confirmedRecipientCount) {
    return jsonError(
      `Recipient count changed since preview (was ${confirmedRecipientCount}, now ${recipients.length}). Re-open Preview to refresh.`,
      409
    );
  }
  if (recipients.length === 0) {
    return jsonError(`No SMS recipients matched audience "${send.audience}"`, 400);
  }

  const runId = crypto.randomUUID();
  const sentBy = 'admin';
  const bodyPreview = String(send.body).slice(0, 200);

  let sent = 0, failed = 0;
  const errors = [];

  for (const r of recipients) {
    if (!r.rsvp_token) {
      failed++;
      errors.push({ phone: r.phone, error: 'Recipient has no rsvp_token — would ship dead-link SMS' });
      try {
        await db.prepare(`
          INSERT INTO marketing_send_log (
            send_id, send_run_id, channel, recipient_email, recipient_name,
            sponsor_id, audience_label, status, error_message, subject,
            body_preview, sent_by
          ) VALUES (?, ?, 'sms', ?, ?, ?, ?, 'failed', ?, ?, ?, ?)
        `).bind(
          sendId, runId, r.phone, displayName(r), r.id,
          send.audience, 'No rsvp_token', null,
          bodyPreview, sentBy
        ).run();
      } catch {}
      continue;
    }

    const body = String(send.body).replaceAll('{TOKEN}', r.rsvp_token);

    let status = 'sent', errorMessage = null;
    try {
      const res = await sendSMS(env, r.phone, body);
      if (!res.ok) {
        status = 'failed';
        errorMessage = res.error || 'Twilio returned not-ok';
        failed++;
        errors.push({ phone: r.phone, error: errorMessage });
      } else {
        sent++;
      }
    } catch (e) {
      status = 'failed';
      errorMessage = e.message;
      failed++;
      errors.push({ phone: r.phone, error: errorMessage });
    }

    try {
      await db.prepare(`
        INSERT INTO marketing_send_log (
          send_id, send_run_id, channel, recipient_email, recipient_name,
          sponsor_id, audience_label, status, error_message, subject,
          body_preview, sent_by
        ) VALUES (?, ?, 'sms', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        sendId, runId, r.phone, displayName(r), r.id,
        send.audience, status, errorMessage, null,
        bodyPreview, sentBy
      ).run();
    } catch (e) {
      errors.push({ phone: r.phone, error: 'Log write failed: ' + e.message });
    }
  }

  return jsonOk({ runId, sent, failed, total: recipients.length, errors });
}
