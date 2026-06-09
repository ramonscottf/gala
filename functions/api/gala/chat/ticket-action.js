// POST /api/gala/chat/ticket-action
// Body: { thread_id, action: 'sms' | 'email' | 'qr', dry_run? }
//
// Self-service ticket delivery for the My Tickets Booker chat. Reads the
// found_token persisted on the chat thread (set in message.js the moment
// Booker finds a booking), resolves it, builds a ticket summary, and delivers
// it three ways:
//   - sms:   texts the summary + check-in link to the phone on file
//   - email: emails the summary + an inline check-in QR to the email on file
//   - qr:    read-only; hands back a QR image URL for inline render in chat
//
// SAFETY: sends ONLY to the contact stored on the resolved token — never to an
// address/number from the request body. The thread_id is the only input, and
// it merely selects which (already-known) guest to deliver to. dry_run:true
// returns exactly what would be sent without firing anything.

import { sendSMS, sendEmail, galaEmailHtml } from '../_notify.js';
import { resolveToken } from '../_sponsor_portal.js';
import { jsonResponse, recordMessage } from './_helpers.js';

const DINNER_LABELS = {
  frenchdip: 'Hot French Dip',
  salad: 'Chicken Salad',
  veggie: 'Vegetarian',
  kids: 'Kids Meal',
};
const ORIGIN = 'https://gala.daviskids.org';

function maskPhone(p) {
  const d = String(p).replace(/\D/g, '');
  return d.length >= 4 ? '•••\u2009' + d.slice(-4) : String(p);
}
function maskEmail(e) {
  const [u, dom] = String(e).split('@');
  if (!dom) return String(e);
  return u.slice(0, 2) + '•••@' + dom;
}

// Load the token-holder's seats, grouped by showing.
async function loadShowings(env, kind, record) {
  const where = kind === 'delegation'
    ? 'sa.delegation_id = ?'
    : 'sa.sponsor_id = ? AND sa.delegation_id IS NULL';
  const rs = await env.GALA_DB.prepare(
    `SELECT sa.theater_id, sa.showing_number, sa.row_label, sa.seat_num, sa.dinner_choice,
            m.title AS movie_title, st.show_start, st.dinner_time
       FROM seat_assignments sa
       LEFT JOIN showtimes st ON st.theater_id = sa.theater_id
            AND st.showing_number = sa.showing_number
       LEFT JOIN movies m ON m.id = st.movie_id
      WHERE ${where}
      ORDER BY sa.theater_id, sa.showing_number, sa.row_label, CAST(sa.seat_num AS INTEGER)`
  ).bind(record.id).all();

  const groups = new Map();
  for (const r of (rs.results || [])) {
    const key = `${r.theater_id}:${r.showing_number}`;
    if (!groups.has(key)) {
      groups.set(key, {
        auditorium: r.theater_id,
        showing_number: r.showing_number,
        movie: r.movie_title || 'Movie TBA',
        show_start: r.show_start || null,
        dinner_time: r.dinner_time || null,
        seats: [],
        dinners: new Set(),
      });
    }
    const g = groups.get(key);
    g.seats.push(`${r.row_label}${r.seat_num}`);
    if (r.dinner_choice) g.dinners.add(DINNER_LABELS[r.dinner_choice] || r.dinner_choice);
  }
  return Array.from(groups.values());
}

function smsSummary(name, showings, token) {
  if (!showings.length) {
    return `Hi ${name}! We don't have seats on file for you yet — text Scott at 801-810-6642 and he'll sort it out.`;
  }
  const parts = showings.map((g) => {
    const dinner = g.dinners.size
      ? ` · Dinner: ${[...g.dinners].join(' / ')} at ${g.dinner_time || 'TBA'}`
      : '';
    return `Aud ${g.auditorium} · ${g.movie} ${g.show_start || ''} · Seats ${g.seats.join(', ')}${dinner}`;
  });
  return `Your DEF Gala tickets, ${name}:\n${parts.join('\n')}\n\nCheck in at the door with this link:\n${ORIGIN}/checkin?t=${token}\n\nSee you June 10!`;
}

function emailBody(showings, token) {
  const rows = showings.map((g) => {
    const dinner = g.dinners.size
      ? `<div style="color:#3d3d3d;font-size:15px;line-height:22px;margin-top:4px;">Dinner: ${[...g.dinners].join(' / ')} · served ${g.dinner_time || 'TBA'}</div>`
      : '';
    return `<div style="margin:0 0 14px 0;padding:14px 16px;background:#ffffff;border:1px solid #c5cdd9;border-radius:10px;">
        <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#0066ff;font-weight:700;">Auditorium ${g.auditorium}</div>
        <div style="font-size:18px;font-weight:700;color:#0d1b3d;margin:2px 0;">${g.movie}</div>
        <div style="color:#1a1a1a;font-size:15px;line-height:22px;">Showtime ${g.show_start || 'TBA'} · Seats <strong>${g.seats.join(', ')}</strong></div>
        ${dinner}
      </div>`;
  }).join('');
  const qr = `${ORIGIN}/api/gala/qr?t=${encodeURIComponent(token)}&format=png&size=300`;
  const seatsBlock = showings.length
    ? rows
    : `<p style="margin:0 0 16px 0;">We don't have seats on file for you yet. Text Scott at 801-810-6642 and he'll get you set.</p>`;
  return `<p style="margin:0 0 18px 0;">Here are your tickets for the DEF Gala. Show the QR code below at the door to check in — that's all you need.</p>
      ${seatsBlock}
      <div style="text-align:center;margin:22px 0 6px 0;">
        <img src="${qr}" width="240" height="240" alt="Your check-in QR code" style="display:inline-block;border:8px solid #ffffff;border-radius:12px;box-shadow:0 4px 14px rgba(13,27,61,0.15);" />
        <div style="font-size:13px;color:#666;margin-top:10px;">Your check-in code · doors open at dinner time</div>
      </div>`;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'invalid_json' }, { status: 400 }); }

  const threadId = body.thread_id;
  const action = (body.action || '').toString();
  const dryRun = body.dry_run === true;
  if (!threadId) return jsonResponse({ error: 'missing_thread_id' }, { status: 400 });
  if (!['sms', 'email', 'qr'].includes(action)) return jsonResponse({ error: 'bad_action' }, { status: 400 });

  const thread = await env.GALA_DB.prepare(
    'SELECT id, found_token FROM chat_threads WHERE id = ?'
  ).bind(threadId).first();
  if (!thread || !thread.found_token) {
    return jsonResponse({ error: 'no_booking_on_thread' }, { status: 404 });
  }
  const token = thread.found_token;

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonResponse({ error: 'token_unresolved' }, { status: 404 });
  const { kind, record } = resolved;

  const name = (kind === 'delegation'
    ? record.delegate_name
    : (record.first_name || record.company)) || 'Guest';
  const toEmail = (kind === 'delegation' ? record.delegate_email : record.email) || null;
  const toPhone = (kind === 'delegation' ? record.delegate_phone : null) || null;

  // ---- QR: read-only, no send ----
  if (action === 'qr') {
    return jsonResponse({
      ok: true,
      action: 'qr',
      qr_url: `/api/gala/qr?t=${encodeURIComponent(token)}&format=svg&size=320`,
      checkin_url: `${ORIGIN}/checkin?t=${encodeURIComponent(token)}`,
    });
  }

  const showings = await loadShowings(env, kind, record);

  // ---- SMS ----
  if (action === 'sms') {
    if (!toPhone) return jsonResponse({ error: 'no_phone_on_file' }, { status: 422 });
    const text = smsSummary(name, showings, token);
    if (dryRun) {
      return jsonResponse({ ok: true, dry_run: true, action: 'sms', would_send_to: maskPhone(toPhone), body: text });
    }
    const res = await sendSMS(env, toPhone, text, { noHero: true });
    if (!res || res.ok === false) {
      return jsonResponse({ error: 'sms_failed', detail: (res && res.error) || 'unknown' }, { status: 502 });
    }
    try { await recordMessage(env, thread.id, 'system', `📲 Texted your tickets to ${maskPhone(toPhone)}.`); } catch {}
    return jsonResponse({ ok: true, action: 'sms', sent_to: maskPhone(toPhone) });
  }

  // ---- Email ----
  if (action === 'email') {
    if (!toEmail) return jsonResponse({ error: 'no_email_on_file' }, { status: 422 });
    const subject = 'Your DEF Gala 2026 tickets';
    const html = galaEmailHtml({
      firstName: name,
      body: emailBody(showings, token),
      footerLine: 'Davis Education Foundation · Gala 2026 · June 10, 2026',
    });
    if (dryRun) {
      return jsonResponse({ ok: true, dry_run: true, action: 'email', would_send_to: maskEmail(toEmail), subject });
    }
    const res = await sendEmail(env, { to: toEmail, subject, html, replyTo: 'smiggin@dsdmail.net' });
    if (!res || res.ok === false) {
      return jsonResponse({ error: 'email_failed', detail: (res && res.error) || 'unknown' }, { status: 502 });
    }
    try { await recordMessage(env, thread.id, 'system', `✉️ Emailed your tickets to ${maskEmail(toEmail)}.`); } catch {}
    return jsonResponse({ ok: true, action: 'email', sent_to: maskEmail(toEmail) });
  }
}
