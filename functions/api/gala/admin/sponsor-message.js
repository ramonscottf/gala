// POST /api/gala/admin/sponsor-message
// Body: {
//   sponsor_id: number,
//   channel: 'sms' | 'email',
//   subject?: string,   // email only
//   body: string,       // plaintext; for email, wrapped in gala template
// }
//
// Sends a one-off custom message from the admin dashboard to a specific sponsor.
// Logs the send in `outreach_log` for audit.

import { verifyGalaAuth } from '../_auth.js';
import { jsonError, jsonOk } from '../_sponsor_portal.js';
import { sendSMS, sendEmail, galaEmailHtml } from '../_notify.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const sponsorId = Number(body.sponsor_id);
  const channel = String(body.channel || '').toLowerCase();
  const messageBody = String(body.body || '').trim();
  const subject = String(body.subject || '').trim();

  if (!sponsorId) return jsonError('sponsor_id is required', 400);
  if (!['sms', 'email'].includes(channel)) return jsonError('channel must be sms or email', 400);
  if (!messageBody) return jsonError('body is required', 400);
  if (channel === 'email' && !subject) return jsonError('subject is required for email', 400);

  const sponsor = await env.GALA_DB.prepare(
    `SELECT id, company, first_name, last_name, email, phone FROM sponsors WHERE id = ?`
  ).bind(sponsorId).first();
  if (!sponsor) return jsonError('Sponsor not found', 404);

  let result;
  if (channel === 'sms') {
    if (!sponsor.phone) return jsonError('Sponsor has no phone number on file', 400);
    result = await sendSMS(env, sponsor.phone, messageBody);
  } else {
    if (!sponsor.email) return jsonError('Sponsor has no email on file', 400);
    const html = galaEmailHtml({
      firstName: sponsor.first_name || '',
      body: messageBody.split(/\n{2,}/).map(p => `<p>${escapeHtml(p)}</p>`).join(''),
    });
    result = await sendEmail(env, {
      to: sponsor.email,
      subject,
      html,
      replyTo: env.GALA_ADMIN_EMAIL,
    });
  }

  // Log outcome regardless of success (best-effort)
  try {
    await env.GALA_DB.prepare(
      `INSERT INTO outreach_log (sponsor_id, channel, recipient, template, status, message_id, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sponsorId,
      channel,
      channel === 'email' ? (sponsor.email || null) : (sponsor.phone || null),
      channel === 'email' ? `custom:${subject.slice(0, 80)}` : 'custom',
      result.ok ? 'sent' : 'failed',
      result.ok ? (result.id || result.sid || null) : null,
      result.ok ? null : (result.error || 'unknown'),
    ).run();
  } catch {
    // don't block on logging
  }

  if (!result.ok) return jsonError(result.error || 'Send failed', 502);
  return jsonOk({ sent: true, id: result.id || result.sid });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
