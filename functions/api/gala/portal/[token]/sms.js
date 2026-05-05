// SMS sender for the sponsor portal. POST /api/gala/portal/[token]/sms
//
// Two use cases driven by `kind`:
//   1. kind=self  — sponsor sends themselves a confirmation with their
//      full seat list, showtime, venue, and a link back to the portal.
//   2. kind=guest — sponsor sends an assigned guest a confirmation with
//      their assigned seat(s), showtime, and dinner choice (if set).
//
// Auth: portal token in the URL is re-verified server-side via the
// existing resolveToken helper. No SMS sent without a valid token.
// Only sponsors can use this (delegations skip).
//
// Rate limiting: GALA_KV (or SMS_KV), 5 sends per token per rolling
// hour. Returns 429 if exceeded.
//
// Twilio: uses Account SID + Auth Token + From Number from Pages env.

import { resolveToken, jsonError, jsonOk } from '../../_sponsor_portal.js';

function toE164(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(raw).startsWith('+') && digits.length >= 10) return `+${digits}`;
  return null;
}

async function sendTwilioSms(env, { to, body }) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    throw new Error('Twilio not configured');
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const form = new URLSearchParams();
  form.set('To', to);
  form.set('From', env.TWILIO_FROM_NUMBER);
  form.set('Body', body);
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(`Twilio ${r.status}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

async function checkRateLimit(env, token) {
  const kv = env.GALA_KV || env.SMS_KV;
  if (!kv) return true;
  const key = `sms:rate:${token}`;
  const now = Date.now();
  const window = 60 * 60 * 1000;
  let history = [];
  try {
    const raw = await kv.get(key);
    if (raw) history = JSON.parse(raw);
  } catch { /* ignore */ }
  history = history.filter((t) => now - t < window);
  if (history.length >= 5) return false;
  history.push(now);
  await kv.put(key, JSON.stringify(history), { expirationTtl: 60 * 60 * 2 });
  return true;
}

async function buildSponsorMessage(env, sponsorId, sponsorCompany, token) {
  const q = await env.GALA_DB.prepare(
    `SELECT sa.theater_id, sa.row_label, sa.seat_num,
            s.showing_number, s.show_start, s.dinner_time,
            m.title AS movie_title
       FROM seat_assignments sa
       JOIN showtimes s ON s.theater_id = sa.theater_id
                       AND s.showing_number = sa.showing_number
       JOIN movies m ON m.id = s.movie_id
      WHERE sa.sponsor_id = ?
      ORDER BY sa.theater_id, sa.row_label, sa.seat_num`
  ).bind(sponsorId).all();
  const rows = q.results || [];

  const byShow = new Map();
  rows.forEach((r) => {
    const key = `${r.movie_title}|${r.theater_id}`;
    if (!byShow.has(key)) {
      byShow.set(key, { movie: r.movie_title, theaterId: r.theater_id, seats: [] });
    }
    byShow.get(key).seats.push(`${r.row_label}${r.seat_num}`);
  });

  const parts = [
    `🎬 GALA · 2026 — ${sponsorCompany}`,
    `Wed June 10 · Megaplex Legacy Crossing · Doors 3:15 PM`,
    '',
  ];
  if (byShow.size === 0) {
    parts.push(`No seats placed yet.`);
  } else {
    for (const show of byShow.values()) {
      parts.push(`${show.movie} (Aud ${show.theaterId})`);
      parts.push(`Seats: ${show.seats.join(', ')}`);
      parts.push('');
    }
  }
  parts.push(`Manage: gala.daviskids.org/sponsor/${token}`);
  return parts.join('\n').trim();
}

export async function onRequest({ request, env, params }) {
  if (request.method !== 'POST') return jsonError('POST only', 405);
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const token = params.token;
  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid or expired link', 404);
  if (resolved.kind !== 'sponsor') {
    return jsonError('Only sponsors can send SMS confirmations', 403);
  }
  const sponsor = resolved.record;

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Bad JSON', 400); }

  const kind = body.kind || 'self';

  const ok = await checkRateLimit(env, token);
  if (!ok) return jsonError('Rate limit: 5 sends/hour. Try again later.', 429);

  if (kind === 'self') {
    const phone = toE164(body.phone || sponsor.phone);
    if (!phone) return jsonError('Valid phone required (sponsor record has no phone)', 400);
    const msg = await buildSponsorMessage(env, sponsor.id, sponsor.company, token);
    try {
      const tw = await sendTwilioSms(env, { to: phone, body: msg });
      return jsonOk({ ok: true, sid: tw.sid, to: phone, kind: 'self' });
    } catch (e) {
      return jsonError(`SMS send failed: ${String(e.message || e)}`, 502);
    }
  }

  if (kind === 'guest') {
    const phone = toE164(body.phone);
    const guestName = (body.guestName || '').trim();
    const seats = Array.isArray(body.seats) ? body.seats : [];
    const seatList = seats.join(', ');
    const showLabel = (body.showLabel || '').trim();
    const dinnerChoice = (body.dinnerChoice || '').trim();
    if (!phone) return jsonError('Valid guest phone required', 400);
    if (!guestName) return jsonError('guestName required', 400);
    const isPlural = seats.length > 1;
    const msg = [
      `🎬 GALA · 2026`,
      `Hi ${guestName.split(' ')[0]} — ${sponsor.company} has reserved your seat${isPlural ? 's' : ''} for the Davis Education Foundation gala.`,
      ``,
      `Wed June 10 · Megaplex Legacy Crossing`,
      `Doors 3:15 PM`,
      seatList ? `Your seat${isPlural ? 's' : ''}: ${seatList}` : '',
      showLabel ? `Showing: ${showLabel}` : '',
      dinnerChoice ? `Dinner: ${dinnerChoice}` : '',
      ``,
      `Questions? Reply or email smiggin@dsdmail.net`,
    ].filter(Boolean).join('\n');
    try {
      const tw = await sendTwilioSms(env, { to: phone, body: msg });
      return jsonOk({ ok: true, sid: tw.sid, to: phone, kind: 'guest' });
    } catch (e) {
      return jsonError(`SMS send failed: ${String(e.message || e)}`, 502);
    }
  }

  return jsonError(`Unknown kind: ${kind}`, 400);
}
