// /api/gala/marketing-preview-send
// POST { sendId: 's1a' }
//
// Resolves the audience for the given send and returns the recipient list
// — but does not send anything. Powers the first step of the two-step
// Send Now flow: admin sees the count + first 10 recipients, then clicks
// Confirm in the UI to actually fire.
//
// Lookup chain for the send body: marketing_sends → marketing_edits → 404.
// The body returned here is the live body that would be sent.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { resolveAudience, displayName } from './_audience.js';

export async function onRequestPost({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { sendId } = body || {};
  if (!sendId) return jsonError('sendId required', 400);

  const db = env.GALA_DB;
  if (!db) return jsonError('GALA_DB not bound', 500);

  // Pull the latest copy from marketing_sends (canonical) or fall back to legacy edit
  let send = await db.prepare(
    'SELECT send_id, channel, audience, status, title, subject, body FROM marketing_sends WHERE send_id = ?'
  ).bind(sendId).first();

  if (!send) {
    const legacy = await db.prepare(
      'SELECT send_id, body, subject FROM marketing_edits WHERE send_id = ? ORDER BY edited_at DESC LIMIT 1'
    ).bind(sendId).first();
    if (!legacy) return jsonError(`Send ${sendId} not found`, 404);
    // Synthesize a minimal send record
    send = { send_id: sendId, channel: 'email', audience: '', status: 'unknown',
             title: sendId, subject: legacy.subject || '', body: legacy.body || '' };
  }

  const channelLc = (send.channel || '').toLowerCase();
  if (channelLc !== 'email' && channelLc !== 'sms') {
    return jsonError(`Preview Send supports email and sms. This row is ${send.channel}.`, 400);
  }
  if (channelLc === 'email' && !send.subject) return jsonError('No subject line set on this send', 400);
  if (!send.body) return jsonError('No body content set on this send', 400);

  // For SMS, resolve audience inline with phone-based filter (mirrors
  // marketing-sms-send-now.js — there's no shared resolver yet because
  // _audience.js is hard-keyed to email-required filtering).
  if (channelLc === 'sms') {
    const recipients = await resolveSmsRecipients(send.audience, db);
    return jsonOk({
      sendId: send.send_id,
      channel: send.channel,
      audience: send.audience,
      audienceTiers: [],
      subject: null,
      bodyPreview: String(send.body || '').slice(0, 280),
      recipients: recipients.map(r => ({
        id: r.id,
        email: r.phone, // dashboard reuses 'email' field for the list display
        name: displayName(r),
        tier: r.sponsorship_tier || '',
      })),
      recipientCount: recipients.length,
      missingEmail: [],
      missingEmailCount: 0,
    });
  }

  const { tiers, recipients, missingEmail } = await resolveAudience(send.audience, db);

  return jsonOk({
    sendId: send.send_id,
    channel: send.channel,
    audience: send.audience,
    audienceTiers: tiers,
    subject: send.subject,
    bodyPreview: stripHtml(send.body).slice(0, 280),
    recipients: recipients.map(r => ({
      id: r.id,
      email: r.email,
      name: displayName(r),
      tier: r.sponsorship_tier,
    })),
    recipientCount: recipients.length,
    missingEmail: (missingEmail || []).map(r => ({
      id: r.id,
      name: displayName(r),
      tier: r.sponsorship_tier,
    })),
    missingEmailCount: (missingEmail || []).length,
  });
}

function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// SMS audience resolver — phone-based, mirrors the audience clauses in
// marketing-sms-send-now.js. Keep in sync if either changes.
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
    const rows = await db.prepare(`
      SELECT id, first_name, last_name, company, phone, rsvp_token, sponsorship_tier
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
    SELECT id, first_name, last_name, company, phone, rsvp_token, sponsorship_tier
    FROM sponsors
    WHERE archived_at IS NULL
      AND phone IS NOT NULL
      AND phone != ''
      AND sponsorship_tier IN (${placeholders})
    ORDER BY company
  `).bind(...clause.tiers).all();
  return rows.results || [];
}
