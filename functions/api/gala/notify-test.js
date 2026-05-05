// /api/gala/notify-test
// Admin-only endpoint to verify Resend + Twilio pipelines are working.
// POST { channel: 'sms'|'email'|'both', to: '+18018106642 or email or both', message?: '...' }
// GET  — returns which env vars are configured (no values, just presence)

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { sendSMS, sendEmail, galaEmailHtml } from './_notify.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  return jsonOk({
    resend: {
      RESEND_API_KEY: !!env.RESEND_API_KEY,
      GALA_FROM_EMAIL: env.GALA_FROM_EMAIL || '(fallback: gala@daviskids.org)',
      GALA_ADMIN_EMAIL: env.GALA_ADMIN_EMAIL || '(not set)',
    },
    twilio: {
      TWILIO_ACCOUNT_SID: !!env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: !!env.TWILIO_AUTH_TOKEN,
      TWILIO_MESSAGING_SERVICE_SID: !!env.TWILIO_MESSAGING_SERVICE_SID,
      TWILIO_FROM_NUMBER: !!env.TWILIO_FROM_NUMBER,
      TWILIO_FROM: !!env.TWILIO_FROM,
      sender: env.TWILIO_MESSAGING_SERVICE_SID
        ? 'MessagingService (A2P compliant)'
        : (env.TWILIO_FROM_NUMBER || env.TWILIO_FROM)
          ? 'From number (fallback)'
          : 'NOT CONFIGURED',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const channel = body.channel || 'both';
  const to = body.to;
  const message = body.message || `Test from DEF Gala notification pipeline · ${new Date().toLocaleString('en-US', { timeZone: 'America/Denver' })} MT`;

  if (!to) return jsonError('to required (phone for sms, email for email, both=comma-separated)', 400);

  const results = {};

  if (channel === 'sms' || channel === 'both') {
    // For 'both', expect comma-separated "phone,email"
    const phone = channel === 'both' ? to.split(',')[0].trim() : to;
    results.sms = await sendSMS(env, phone, message);
  }

  if (channel === 'email' || channel === 'both') {
    const email = channel === 'both' ? (to.split(',')[1] || '').trim() : to;
    if (email) {
      results.email = await sendEmail(env, {
        to: email,
        subject: 'DEF Gala · Notification Pipeline Test',
        html: galaEmailHtml({
          firstName: 'there',
          body: `<p>${message}</p><p style="color:#6b7280;font-size:13px;">If you received this, the gala's Resend pipeline is working. 🎉</p>`,
        }),
      });
    } else {
      results.email = { ok: false, error: 'No email address provided' };
    }
  }

  return jsonOk(results);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
