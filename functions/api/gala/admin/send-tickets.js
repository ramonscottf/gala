// /api/gala/admin/send-tickets
// POST { dryRun?: true, onlySponsorId?: n, onlyDelegationId?: n, limit?: n }
//
// Morning-of personalized ticket emails — the final "wow" touch of the
// gala build (2026-06-10). One email per inbox we have:
//   • each sponsor with self-managed (non-delegated) seats
//   • each delegation (invited guest contact) with assigned seats
// Every email is fully personalized: movie + poster, auditorium, dinner
// time, showtime, every seat with guest name + dinner choice, a live
// portal link (doubles as the "see your company's seats" view), and
// auction/Givi links.
//
// Idempotent: every successful send is logged to marketing_send_log with
// send_id='tickets-jun10' and a recipient key. Re-running skips anyone
// already sent, so a mid-blast failure resumes cleanly. `limit` caps how
// many sends one invocation attempts (subrequest/CPU headroom) — call
// repeatedly until {remaining: 0}.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';
import { sendEmail } from '../_notify.js';

const SEND_ID = 'tickets-jun10';
const RUN_ID = () => `tickets-${Date.now()}`;
const PORTAL_BASE = 'https://gala.daviskids.org/sponsor/';
const AUCTION_URL = 'https://gala.daviskids.org/auction/';

const DINNER_LABELS = {
  frenchdip: 'French Dip', salad: 'Entrée Salad', kids: 'Kids Meal',
  veggie: 'Vegetarian', brisket: 'Brisket',
};
const dinnerLabel = (c) => DINNER_LABELS[String(c || '').toLowerCase()] || (c ? c : 'Selected at the table');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function seatChip(row, num) {
  return `<td style="padding:0 6px 6px 0;"><div style="background:#0b1b3c;color:#fff;border-radius:8px;padding:8px 12px;font-weight:800;font-size:15px;letter-spacing:.5px;font-family:Arial,Helvetica,sans-serif;">${esc(row)}${esc(num)}</div></td>`;
}

// One card per (theater, showing) group the recipient has seats in.
function showingCard(group) {
  const { movie, theaterId, dinnerTime, showStart, seats } = group;
  const seatRows = seats.map(s => `
    <tr>
      <td style="padding:6px 10px 6px 0;white-space:nowrap;"><span style="display:inline-block;background:#CB262C;color:#fff;border-radius:6px;padding:4px 9px;font-weight:800;font-size:13px;">${esc(s.row_label)}${esc(s.seat_num)}</span></td>
      <td style="padding:6px 10px 6px 0;color:#0b1b3c;font-size:14px;font-weight:600;">${esc(s.guest_name || 'Your guest')}</td>
      <td style="padding:6px 0;color:#475569;font-size:13px;">${esc(dinnerLabel(s.dinner_choice))}</td>
    </tr>`).join('');

  const poster = movie.poster_url
    ? `<td width="120" valign="top" style="padding:0 18px 0 0;"><img src="${esc(movie.poster_url)}" width="110" alt="${esc(movie.title)} poster" style="display:block;width:110px;border-radius:10px;border:0;"/></td>`
    : '';

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;margin:0 0 18px;">
    <tr><td style="padding:20px 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${poster}
        <td valign="top">
          <p style="margin:0 0 2px;color:#CB262C;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Your movie</p>
          <p style="margin:0 0 10px;color:#0b1b3c;font-size:21px;font-weight:800;line-height:1.2;">${esc(movie.title)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;color:#1e293b;">
            <tr><td style="padding:2px 14px 2px 0;color:#64748b;">Auditorium</td><td style="font-weight:700;">#${esc(theaterId)}</td></tr>
            <tr><td style="padding:2px 14px 2px 0;color:#64748b;">Doors &amp; dinner</td><td style="font-weight:700;">${esc(dinnerTime)}</td></tr>
            <tr><td style="padding:2px 14px 2px 0;color:#64748b;">Movie starts</td><td style="font-weight:700;">${esc(showStart)}</td></tr>
          </table>
        </td>
      </tr></table>
      <div style="height:1px;background:#e2e8f0;margin:16px 0;"></div>
      <p style="margin:0 0 8px;color:#0b1b3c;font-size:13px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Your seats</p>
      <table role="presentation" cellpadding="0" cellspacing="0">${seatRows}</table>
    </td></tr>
  </table>`;
}

function ticketHtml({ recipientName, company, groups, portalUrl, mapUrl, totalSeats }) {
  const cards = groups.map(showingCard).join('');
  const mapBtn = mapUrl
    ? `<p style="text-align:center;margin:0 0 10px;"><a href="${esc(mapUrl)}" style="display:inline-block;background:#ffc24d;color:#0b1233;padding:13px 28px;border-radius:8px;font-weight:800;font-size:14px;text-decoration:none;">📍 See your seats on the auditorium map →</a></p>`
    : '';
  const companyBtn = company
    ? `<p style="text-align:center;margin:0 0 10px;"><a href="${esc(portalUrl)}" style="display:inline-block;background:#0b1b3c;color:#fff;padding:13px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">🎟️ View my live ticket &amp; everyone from ${esc(company)} →</a></p>`
    : `<p style="text-align:center;margin:0 0 10px;"><a href="${esc(portalUrl)}" style="display:inline-block;background:#0b1b3c;color:#fff;padding:13px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">🎟️ View my live ticket →</a></p>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;"><tr><td align="center" style="padding:22px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:Arial,Helvetica,sans-serif;">
    <tr><td style="background:#0b1b3c;border-radius:14px 14px 0 0;padding:26px 26px 20px;">
      <p style="margin:0 0 4px;color:#9db4e8;font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;">Lights, Camera, Take Action!</p>
      <p style="margin:0;color:#ffffff;font-size:26px;font-weight:900;line-height:1.15;">Tonight's the night, ${esc(recipientName)}.</p>
      <p style="margin:8px 0 0;color:#c7d4f2;font-size:14px;">Davis Education Foundation Gala · Tonight, June 10 · Megaplex at Legacy Crossing, Centerville</p>
    </td></tr>
    <tr><td style="height:5px;background:linear-gradient(90deg,#1f4484,#CB262C);font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="background:#f8fafc;padding:22px 22px 8px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
      <p style="margin:0 0 16px;color:#1e293b;font-size:15px;line-height:1.55;">This is your ticket — everything for your ${totalSeats === 1 ? 'seat' : `${totalSeats} seats`} tonight is below. Your seats, your dinner, and a live map of exactly where you're sitting — it's all here.</p>
      ${cards}
      ${mapBtn}
      ${companyBtn}
      <p style="text-align:center;margin:0 0 18px;"><a href="${AUCTION_URL}" style="display:inline-block;background:#CB262C;color:#fff;padding:13px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">🔨 Register for the silent auction + get Givi →</a></p>
      <p style="margin:0 0 18px;color:#475569;font-size:13px;line-height:1.6;text-align:center;">The silent auction closes at <strong>7:30 PM tonight</strong> — register and download the Givi app before you arrive so you can bid from your seat. Item pickup opens <strong>7:45 PM</strong> in the auction room, just south of the main lobby.</p>
    </td></tr>
    <tr><td style="background:#0b1b3c;border-radius:0 0 14px 14px;padding:18px 26px;">
      <p style="margin:0;color:#9db4e8;font-size:12px;line-height:1.6;">We can't wait to see you tonight. Every bid and every seat supports Davis County students.<br/>— Sherry, Kara, and everyone at the Davis Education Foundation</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

// Group a flat seat list into (theater, showing) cards using showtime map.
function buildGroups(seats, showMap) {
  const byKey = new Map();
  for (const s of seats) {
    const key = `${s.theater_id}:${s.showing_number}`;
    if (!byKey.has(key)) {
      const st = showMap.get(key) || {};
      byKey.set(key, {
        theaterId: s.theater_id,
        movie: { title: st.title || 'Your movie', poster_url: st.poster_url || '' },
        dinnerTime: st.dinner_time || 'See portal',
        showStart: st.show_start || 'See portal',
        seats: [],
        sortKey: st.show_start || '',
      });
    }
    byKey.get(key).seats.push(s);
  }
  for (const g of byKey.values()) {
    g.seats.sort((a, b) =>
      String(a.row_label).localeCompare(String(b.row_label)) ||
      (parseInt(a.seat_num, 10) || 0) - (parseInt(b.seat_num, 10) || 0));
  }
  return [...byKey.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export async function onRequestPost({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) {
    return jsonError('Unauthorized', 401);
  }
  let payload = {};
  try { payload = await request.json(); } catch { /* defaults */ }
  const dryRun = !!payload.dryRun;
  const onlySponsorId = payload.onlySponsorId || null;
  const onlyDelegationId = payload.onlyDelegationId || null;
  const limit = Math.min(Math.max(parseInt(payload.limit, 10) || 120, 1), 200);
  // toOverride: send the recipient's exact production email to this address
  // instead — pure preview. Never logs, never touches the real recipient,
  // ignores the already-sent check. For Scott's-inbox review only.
  const toOverride = String(payload.toOverride || '').trim() || null;

  const db = env.GALA_DB;
  if (!db) return jsonError('GALA_DB not bound', 500);

  // Showtime/movie lookup
  const stRes = await db.prepare(`
    SELECT st.theater_id, st.showing_number, st.dinner_time, st.show_start,
           m.title, m.poster_url
    FROM showtimes st JOIN movies m ON m.id = st.movie_id
  `).all();
  const showMap = new Map();
  for (const r of stRes.results || []) {
    showMap.set(`${r.theater_id}:${r.showing_number}`, r);
  }

  // Already-sent recipient keys (idempotent resume)
  const sentRes = await db.prepare(`
    SELECT recipient_email FROM marketing_send_log
    WHERE send_id = ? AND status = 'sent'
  `).bind(SEND_ID).all();
  const sentKeys = new Set((sentRes.results || [])
    .map(r => String(r.recipient_email || '').toLowerCase()).filter(Boolean));

  // ── Recipient 1: sponsors with self-managed seats ─────────────────────
  // (skipped entirely when testing a single delegation)
  const sponsors = onlyDelegationId ? { results: [] } : await db.prepare(`
    SELECT s.id, s.email, s.first_name, s.last_name, s.company, s.rsvp_token
    FROM sponsors s
    WHERE s.archived_at IS NULL AND s.email IS NOT NULL AND s.email != ''
      AND EXISTS (SELECT 1 FROM seat_assignments sa
                  WHERE sa.sponsor_id = s.id AND sa.delegation_id IS NULL)
      ${onlySponsorId ? 'AND s.id = ?' : ''}
    ORDER BY s.id
  `).bind(...(onlySponsorId ? [onlySponsorId] : [])).all();

  // ── Recipient 2: delegations with seats + email ────────────────────────
  const delegations = onlySponsorId ? { results: [] } : await db.prepare(`
    SELECT d.id, d.token, d.delegate_name, d.delegate_email,
           (SELECT company FROM sponsors ps WHERE ps.id = d.parent_sponsor_id) AS company
    FROM sponsor_delegations d
    WHERE d.status != 'reclaimed'
      AND d.delegate_email IS NOT NULL AND d.delegate_email != ''
      AND EXISTS (SELECT 1 FROM seat_assignments sa WHERE sa.delegation_id = d.id)
      ${onlyDelegationId ? 'AND d.id = ?' : ''}
    ORDER BY d.id
  `).bind(...(onlyDelegationId ? [onlyDelegationId] : [])).all();

  const queue = [];
  for (const s of sponsors.results || []) {
    queue.push({
      kind: 'sponsor', refId: s.id,
      email: s.email,
      name: (s.first_name || s.company || 'friend').trim(),
      displayName: s.company || `${s.first_name || ''} ${s.last_name || ''}`.trim(),
      company: s.company || '',
      token: s.rsvp_token,
      seatSql: { col: 'sponsor_id', id: s.id, extra: 'AND delegation_id IS NULL' },
    });
  }
  for (const d of delegations.results || []) {
    queue.push({
      kind: 'delegation', refId: d.id,
      email: d.delegate_email,
      name: (String(d.delegate_name || '').split(' ')[0] || 'friend').trim(),
      displayName: d.delegate_name || d.delegate_email,
      company: d.company || '',
      token: d.token,
      seatSql: { col: 'delegation_id', id: d.id, extra: '' },
    });
  }

  const pending = toOverride
    ? queue
    : queue.filter(r => !sentKeys.has(String(r.email).toLowerCase()));
  const batch = pending.slice(0, limit);

  const runId = RUN_ID();
  let sent = 0, failed = 0;
  const errors = [];
  for (const r of batch) {
    try {
      const seatsRes = await db.prepare(`
        SELECT theater_id, showing_number, row_label, seat_num, guest_name, dinner_choice
        FROM seat_assignments WHERE ${r.seatSql.col} = ? ${r.seatSql.extra}
      `).bind(r.seatSql.id).all();
      const seats = seatsRes.results || [];
      if (!seats.length) continue;

      const groups = buildGroups(seats, showMap);
      const portalUrl = r.token ? `${PORTAL_BASE}${r.token}` : 'https://gala.daviskids.org/';
      const mapUrl = r.token ? `https://gala.daviskids.org/checkin?t=${encodeURIComponent(r.token)}` : null;
      const html = ticketHtml({
        recipientName: r.name, company: r.company,
        groups, portalUrl, mapUrl, totalSeats: seats.length,
      });
      const subject = `🎟️ Your gala ticket — tonight, ${groups[0].dinnerTime} dinner, Auditorium #${groups[0].theaterId}`;

      if (dryRun) { sent++; continue; }

      const res = await sendEmail(env, {
        to: toOverride || r.email,
        subject: toOverride ? `[PREVIEW for ${r.email}] ${subject}` : subject,
        html,
      });
      if (res && res.ok) {
        sent++;
        if (toOverride) continue; // preview sends are never logged
        await db.prepare(`
          INSERT INTO marketing_send_log (send_id, send_run_id, channel, recipient_email, recipient_name, status, sent_by, audience_label, sent_at)
          VALUES (?, ?, 'Email', ?, ?, 'sent', 'admin-tickets', ?, CURRENT_TIMESTAMP)
        `).bind(SEND_ID, runId, r.email, r.displayName, `Tickets: ${r.kind}`).run();
      } else {
        failed++;
        errors.push({ email: r.email, error: (res && res.error) || 'send failed' });
      }
    } catch (e) {
      failed++;
      errors.push({ email: r.email, error: String(e && e.message || e).slice(0, 160) });
    }
  }

  return jsonOk({
    dryRun, sent, failed,
    batchSize: batch.length,
    remaining: Math.max(pending.length - batch.length, 0) + failed,
    totalRecipients: queue.length,
    alreadySent: queue.length - pending.length,
    errors: errors.slice(0, 12),
  });
}
