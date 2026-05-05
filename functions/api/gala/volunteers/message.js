// /api/gala/volunteers/message
// POST — bulk SMS/email to selected or filtered volunteers (admin only)

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';
import { sendSMS, sendEmail, galaEmailHtml } from '../_notify.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const {
    channel = 'both',    // 'sms' | 'email' | 'both'
    to = 'all',          // 'all' | 'registered' | 'waitlisted' | 'checked_in' | 'role' | 'position' | 'ptype' | 'ids'
    ids = [],
    message,
    subject,
    role,
    position,
    participantType,
  } = body;

  if (!message) return jsonError('Message required', 400);

  let sql = 'SELECT * FROM volunteers WHERE deleted_at IS NULL';
  const params = [];

  if (to === 'registered') { sql += " AND status = 'registered'"; }
  else if (to === 'waitlisted') { sql += " AND status = 'waitlisted'"; }
  else if (to === 'checked_in') { sql += ' AND checked_in = 1'; }
  else if (to === 'role' && role) { sql += ' AND role = ?'; params.push(role); }
  else if (to === 'position' && position) { sql += ' AND position = ?'; params.push(position); }
  else if (to === 'ptype' && participantType) { sql += ' AND participant_type = ?'; params.push(participantType); }
  else if (to === 'ids' && ids.length) {
    sql += ` AND id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }

  const { results } = await env.GALA_DB.prepare(sql).bind(...params).all();
  const msgId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  let smsSent = 0, emailSent = 0;
  const smsErrors = [];
  const emailErrors = [];

  for (const v of (results || [])) {
    const name = `${v.first_name} ${v.last_name}`;
    // Replace {{name}} / {{firstName}} tokens
    const personalized = message
      .replace(/\{\{\s*name\s*\}\}/gi, v.first_name || '')
      .replace(/\{\{\s*firstName\s*\}\}/gi, v.first_name || '');

    if ((channel === 'sms' || channel === 'both') && v.phone && v.sms_opt_in) {
      const res = await sendSMS(env, v.phone, personalized);
      if (res?.ok) smsSent++;
      else if (res) smsErrors.push(`${name}: ${res.error}`);
    }

    if ((channel === 'email' || channel === 'both') && v.email) {
      const emailBody = personalized.replace(/\n/g, '<br/>');
      const res = await sendEmail(env, {
        to: v.email,
        replyTo: env.GALA_ADMIN_EMAIL,
        subject: subject || 'DEF Gala 2026 · Volunteer Update',
        html: galaEmailHtml({ firstName: v.first_name, body: `<p>${emailBody}</p>` }),
      });
      if (res?.ok) emailSent++;
      else if (res) emailErrors.push(`${name}: ${res.error}`);
    }
  }

  await env.GALA_DB.prepare(
    'INSERT INTO volunteer_messages (id, channel, recipient_count, subject, body) VALUES (?, ?, ?, ?, ?)'
  ).bind(msgId, channel, results?.length || 0, subject || null, message).run();

  return jsonOk({
    smsSent,
    emailSent,
    total: results?.length || 0,
    smsErrors: smsErrors.slice(0, 5),
    emailErrors: emailErrors.slice(0, 5),
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
