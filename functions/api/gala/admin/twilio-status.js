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
  const sid = url.searchParams.get('sid');
  const phoneRaw = url.searchParams.get('phone') || '';
  const hours = Number(url.searchParams.get('hours') || '24');
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  // Specific SID lookup
  if (sid) {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages/${sid}.json`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const m = await res.json();
    if (!res.ok) return jsonError(`Twilio: ${m.message || res.status}`, 500);
    return jsonOk({
      sid: m.sid, to: m.to, from: m.from, status: m.status,
      error_code: m.error_code, error_message: m.error_message,
      num_media: m.num_media, direction: m.direction,
      date_created: m.date_created, date_sent: m.date_sent,
      date_updated: m.date_updated, price: m.price,
      body_preview: m.body ? String(m.body).slice(0, 100) : null,
    });
  }

  if (!phoneRaw) return jsonError('phone or sid required', 400);
  let num = String(phoneRaw).replace(/[^\d+]/g, '');
  if (!num.startsWith('+')) {
    if (num.length === 10) num = '+1' + num;
    else if (num.length === 11 && num.startsWith('1')) num = '+' + num;
    else num = '+' + num;
  }
  // Note: Twilio doesn't have a DateCreated filter on Messages — use DateSent.
  // Removed the filter to also catch 'accepted'/'queued' messages.
  const apiUrl = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json?To=${encodeURIComponent(num)}&PageSize=20`;
  let twilio;
  try {
    const res = await fetch(apiUrl, { headers: { Authorization: `Basic ${auth}` } });
    twilio = await res.json();
    if (!res.ok) return jsonError(`Twilio API error: ${twilio.message || res.status}`, 500);
  } catch (e) {
    return jsonError(`Could not reach Twilio: ${e.message}`, 502);
  }
  const messages = (twilio.messages || []).map((m) => ({
    sid: m.sid, to: m.to, from: m.from,
    messaging_service_sid: m.messaging_service_sid,
    status: m.status, error_code: m.error_code,
    body_preview: m.body ? String(m.body).slice(0, 80) : null,
    num_media: m.num_media, direction: m.direction,
    date_sent: m.date_sent, date_created: m.date_created,
    date_updated: m.date_updated, price: m.price,
  }));
  const tally = messages.reduce((acc, m) => { acc[m.status] = (acc[m.status] || 0) + 1; return acc; }, {});
  return jsonOk({ phone_normalized: num, total: messages.length, tally, messages });
}
