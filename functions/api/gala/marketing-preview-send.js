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
  if (channelLc !== 'email') {
    return jsonError(`Send Now currently supports email only. This row is ${send.channel}.`, 400);
  }
  if (!send.subject) return jsonError('No subject line set on this send', 400);
  if (!send.body) return jsonError('No body content set on this send', 400);

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
