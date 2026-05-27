// GET /api/gala/admin/twilio-status?phone=8018106642&hours=2
//
// Queries Twilio's Messages API for recent messages to a given destination
// number and returns the actual delivery status — `sent` from our side means
// Twilio accepted the request, but real delivery status (`delivered`,
// `undelivered`, `failed`, `queued`, ...) only shows up in the Twilio API
// response after carrier feedback. Built 2026-05-27 to diagnose why Scott
// Foster's 8018106642 never received the delegation SMS even though
// sponsor_invites.status read 'sent'.

import { verifyGalaAuth } from '../_auth.js';
import { jsonError, jsonOk } from '../_sponsor_portal.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    return jsonError('Twilio not configured', 503);
  }

  const url = new URL(request.url);
  const phoneRaw = url.searchParams.get('phone') || '';
  const hours = Number(url.searchParams.get('hours') || '24');

  if (!phoneRaw) return jsonError('phone query param required', 400);

  // Normalize like sendSMS does
  let num = String(phoneRaw).replace(/[^\d+]/g, '');
  if (!num.startsWith('+')) {
    if (num.length === 10) num = '+1' + num;
    else if (num.length === 11 && num.startsWith('1')) num = '+' + num;
    else num = '+' + num;
  }

  const dateSentAfter = new Date(Date.now() - hours * 3600 * 1000)
    .toISOString();
  const apiUrl =
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}` +
    `/Messages.json?To=${encodeURIComponent(num)}` +
    `&DateSent%3E=${encodeURIComponent(dateSentAfter)}&PageSize=20`;
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  let twilio;
  try {
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });
    twilio = await res.json();
    if (!res.ok) {
      return jsonError(`Twilio API error: ${twilio.message || res.status}`, 500);
    }
  } catch (e) {
    return jsonError(`Could not reach Twilio: ${e.message}`, 502);
  }

  const messages = (twilio.messages || []).map((m) => ({
    sid: m.sid,
    to: m.to,
    from: m.from,
    messaging_service_sid: m.messaging_service_sid,
    status: m.status, // queued, sending, sent, delivered, undelivered, failed
    error_code: m.error_code,
    error_message: m.error_message,
    body_preview: m.body ? String(m.body).slice(0, 80) : null,
    num_media: m.num_media,
    direction: m.direction,
    date_sent: m.date_sent,
    date_created: m.date_created,
    date_updated: m.date_updated,
    price: m.price,
  }));

  // Summary tally
  const tally = messages.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});

  return jsonOk({
    phone_normalized: num,
    window_hours: hours,
    total: messages.length,
    tally,
    messages,
  });
}
