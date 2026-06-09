// POST /api/gala/admin/walkup
// Admin-only. Night-of "assign on the fly": Scott picks open seats in the
// Seat Mover, enters a name + phone/email, and this creates the guest and
// delivers their tickets in one shot.
//
// Body: { name, email?, phone?, theater_id, showing_number,
//         seats: [{row,num},...], dinner?, send: bool }
//
// What it does:
//  1. Ensures the house sponsor "DEF Gala Walk-ups" exists (created lazily).
//  2. Creates a delegation under it (own token -> portal link + QR work
//     exactly like every other guest's).
//  3. Claims the seats atomically — a UNIQUE collision on any seat rolls back
//     everything created (no half-assigned parties).
//  4. If send && a contact was given: texts and/or emails their tickets with
//     the seat-view link (/checkin?t=...) and portal link.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';
import { generateToken } from '../_sponsor_portal.js';
import { sendSMS, sendEmail, galaEmailHtml } from '../_notify.js';

const HOUSE_COMPANY = 'DEF Gala Walk-ups';
const ORIGIN = 'https://gala.daviskids.org';
const DINNER_LABELS = { frenchdip: 'Hot French Dip', salad: 'Chicken Salad', veggie: 'Vegetarian', kids: 'Kids Meal' };

async function ensureHouseSponsor(env) {
  const existing = await env.GALA_DB.prepare(
    `SELECT id FROM sponsors WHERE company = ? LIMIT 1`
  ).bind(HOUSE_COMPANY).first();
  if (existing) return existing.id;
  const row = await env.GALA_DB.prepare(
    `INSERT INTO sponsors (company, email, rsvp_token) VALUES (?, ?, ?) RETURNING id`
  ).bind(HOUSE_COMPANY, 'gala@daviskids.org', generateToken()).first();
  return row.id;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return jsonError('Bad JSON', 400); }
  const name = (body.name || '').trim();
  const email = (body.email || '').trim() || null;
  const phone = (body.phone || '').trim() || null;
  const theater_id = Number(body.theater_id);
  const showing_number = Number(body.showing_number);
  const seats = Array.isArray(body.seats) ? body.seats : [];
  const dinner = body.dinner && DINNER_LABELS[body.dinner] ? body.dinner : null;
  const wantSend = body.send !== false;

  if (!name) return jsonError('Name required', 400);
  if (!theater_id || !showing_number) return jsonError('theater_id and showing_number required', 400);
  if (!seats.length) return jsonError('Pick at least one open seat', 400);
  if (seats.length > 12) return jsonError('Max 12 seats per walk-up party', 400);
  for (const s of seats) {
    if (!s || !s.row || !s.num) return jsonError('Each seat needs row + num', 400);
  }

  const showing = await env.GALA_DB.prepare(
    `SELECT st.show_start, st.dinner_time, m.title AS movie
       FROM showtimes st LEFT JOIN movies m ON m.id = st.movie_id
      WHERE st.theater_id = ? AND st.showing_number = ?`
  ).bind(theater_id, showing_number).first();
  if (!showing) return jsonError('No such showing', 400);

  const houseId = await ensureHouseSponsor(env);
  const token = generateToken();

  const deleg = await env.GALA_DB.prepare(
    `INSERT INTO sponsor_delegations
       (parent_sponsor_id, token, delegate_name, delegate_email, delegate_phone,
        seats_allocated, status)
     VALUES (?, ?, ?, ?, ?, ?, 'confirmed') RETURNING id`
  ).bind(houseId, token, name, email, phone, seats.length).first();
  const delegationId = deleg.id;

  // Claim seats one at a time; any collision rolls back everything.
  const claimed = [];
  for (const s of seats) {
    try {
      const r = await env.GALA_DB.prepare(
        `INSERT INTO seat_assignments
           (theater_id, showing_number, row_label, seat_num, guest_name,
            sponsor_id, delegation_id, dinner_choice, finalized_at, assigned_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'walkup')`
      ).bind(theater_id, showing_number, String(s.row), String(s.num),
             name, houseId, delegationId, dinner).run();
      if ((r.meta?.changes || 0) > 0) claimed.push(`${s.row}${s.num}`);
      else throw new Error('no-insert');
    } catch (e) {
      // Roll back: free what we claimed, remove the delegation.
      for (const c of claimed) {
        const m = c.match(/^([A-Za-z]+)(\d+)$/);
        await env.GALA_DB.prepare(
          `DELETE FROM seat_assignments WHERE theater_id=? AND showing_number=?
             AND row_label=? AND seat_num=? AND delegation_id=?`
        ).bind(theater_id, showing_number, m[1], m[2], delegationId).run();
      }
      await env.GALA_DB.prepare(`DELETE FROM sponsor_delegations WHERE id=?`).bind(delegationId).run();
      return jsonError(`Seat ${s.row}${s.num} was just taken — refresh and pick again`, 409);
    }
  }

  // Deliver tickets to whatever contact we have.
  const checkinUrl = `${ORIGIN}/checkin?t=${encodeURIComponent(token)}`;
  const portalUrl = `${ORIGIN}/sponsor/${token}`;
  const seatLine = claimed.join(', ');
  const when = showing.show_start || (showing_number === 1 ? 'early showing' : 'late showing');
  const sent = { sms: false, email: false };

  if (wantSend && phone) {
    try {
      const r = await sendSMS(env,
        phone,
        `🎬 DEF Gala tonight! ${name}, you're set: ${showing.movie || 'your movie'} at ${when}, Auditorium ${theater_id}, seats ${seatLine}.` +
        (dinner ? ` Dinner: ${DINNER_LABELS[dinner]}.` : '') +
        ` Your seats on a map: ${checkinUrl}`,
        { noHero: true });
      sent.sms = !!(r && r.ok !== false);
    } catch (e) { console.error('[walkup] sms failed', e); }
  }
  if (wantSend && email) {
    try {
      const qr = `${ORIGIN}/api/gala/qr?t=${encodeURIComponent(token)}&format=png&size=300`;
      const bodyHtml =
        `<p>You're all set for tonight!</p>` +
        `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:10px 0;">` +
        `<div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#0066ff;font-weight:700;">Auditorium ${theater_id}</div>` +
        `<div style="font-size:16px;font-weight:700;color:#0d1b3d;margin:2px 0;">${showing.movie || 'Your movie'}</div>` +
        `<div style="color:#1a1a1a;font-size:14px;">Showtime ${when} · Seats <strong>${seatLine}</strong>${dinner ? ` · ${DINNER_LABELS[dinner]}` : ''}</div>` +
        `</div>` +
        `<p><a href="${checkinUrl}" style="font-weight:700;color:#0066ff;">📍 See your seats on the auditorium map</a></p>` +
        `<div style="text-align:center;margin:16px 0 6px;"><img src="${qr}" width="200" height="200" alt="Your gala QR" style="border:8px solid #fff;border-radius:12px;box-shadow:0 4px 14px rgba(13,27,61,.15);"/>` +
        `<div style="font-size:13px;color:#737373;margin-top:6px;">Any gala helper can scan this to pull up your seats.</div></div>` +
        `<p style="font-size:13px;">Need to pick dinner or make a change? <a href="${portalUrl}">Open your guest link</a>.</p>`;
      const r = await sendEmail(env, {
        to: email,
        subject: 'Your DEF Gala 2026 tickets',
        html: galaEmailHtml({ firstName: name.split(' ')[0], body: bodyHtml, footerLine: 'Davis Education Foundation · Gala 2026' }),
        replyTo: 'smiggin@dsdmail.net',
      });
      sent.email = !!(r && r.ok);
    } catch (e) { console.error('[walkup] email failed', e); }
  }

  return jsonOk({
    ok: true, delegation_id: delegationId, token,
    seats: claimed, sent,
    checkin_url: checkinUrl, portal_url: portalUrl,
  });
}
