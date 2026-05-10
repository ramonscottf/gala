// POST /api/gala/portal/[token]/finalize
// Called when the sponsor/delegate clicks "Done" — delivers QR code + confirmation
// via email and SMS. Does NOT prevent further edits (seats remain editable until June 9).

import { resolveToken, jsonError, jsonOk } from '../../_sponsor_portal.js';
import { sendSMS, sendEmail } from '../../_notify.js';
import { buildConfirmationSms } from '../../_confirmation_sms.js';

export async function onRequestPost(context) {
  const { env, params } = context;
  const token = params.token;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid token', 404);

  // Load current assignments for this scope.
  //
  // SPONSOR scope: every seat under this sponsor's umbrella — both the
  // ones the sponsor placed directly (delegation_id IS NULL) AND any
  // seats placed under one of this sponsor's child delegations. This
  // matters because a sponsor can fully delegate their entire block
  // (e.g. Wicko delegates all 2 of 2 seats to Chuck). With the old
  // delegation_id IS NULL filter, the seat list came back empty and
  // /finalize returned 400 "No seats picked yet" — the client threw
  // and the user got a blank post-confirmation screen. The QR is
  // group-level (the token IS the auth) so summarizing all seats in
  // the umbrella is the correct semantic anyway.
  //
  // DELEGATION scope: only this delegation's own placements. (A
  // delegation lead does NOT see seats placed by sub-delegates of
  // theirs in this summary — they finalize their own slice.)
  const myAssignmentsQ = resolved.kind === 'sponsor'
    ? `SELECT * FROM seat_assignments
         WHERE sponsor_id = ?
           AND (delegation_id IS NULL OR delegation_id IN (
             SELECT id FROM sponsor_delegations WHERE parent_sponsor_id = ?
           ))
         ORDER BY theater_id, row_label, seat_num`
    : `SELECT * FROM seat_assignments WHERE delegation_id = ? ORDER BY theater_id, row_label, seat_num`;
  const seats = resolved.kind === 'sponsor'
    ? await env.GALA_DB.prepare(myAssignmentsQ).bind(resolved.record.id, resolved.record.id).all()
    : await env.GALA_DB.prepare(myAssignmentsQ).bind(resolved.record.id).all();
  const seatList = seats.results || [];

  if (!seatList.length) {
    return jsonError('No seats picked yet', 400);
  }

  // Mark delegation as finalized (sponsor equiv: update rsvp_status)
  if (resolved.kind === 'delegation') {
    await env.GALA_DB.prepare(
      `UPDATE sponsor_delegations SET status = 'finalized', finalized_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).bind(resolved.record.id).run();
  } else {
    await env.GALA_DB.prepare(
      `UPDATE sponsors SET rsvp_status = 'completed', rsvp_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).bind(resolved.record.id).run();
  }

  // Build QR URL (group-level — scanning it loads the check-in view for this token)
  const checkInUrl = `https://gala.daviskids.org/checkin?t=${token}`;
  // Self-hosted QR — no third-party dependency, works reliably in Gmail/iOS Mail/etc.
  // QR endpoint lives on gala.daviskids.org (this repo). The daviskids.org
  // root domain belongs to def-site Pages, which doesn't bundle this function.
  const qrImgUrl = `https://gala.daviskids.org/api/gala/qr?t=${encodeURIComponent(token)}&size=400`;

  // Identity for email/SMS
  const name = resolved.kind === 'sponsor'
    ? ([resolved.record.first_name, resolved.record.last_name].filter(Boolean).join(' ').trim() || resolved.record.company)
    : resolved.record.delegate_name;
  const company = resolved.kind === 'sponsor' ? resolved.record.company : resolved.record.parent_company;
  const email = resolved.kind === 'sponsor' ? resolved.record.email : resolved.record.delegate_email;
  const phone = resolved.kind === 'sponsor' ? resolved.record.phone : resolved.record.delegate_phone;

  // Build seat list by theater
  const byTheater = {};
  for (const s of seatList) {
    if (!byTheater[s.theater_id]) byTheater[s.theater_id] = [];
    byTheater[s.theater_id].push(s);
  }
  const seatSummary = Object.keys(byTheater).map(tid => {
    const sorted = byTheater[tid].sort((a, b) => a.row_label.localeCompare(b.row_label) || String(a.seat_num).localeCompare(String(b.seat_num)));
    const seats = sorted.map(s => `Row ${s.row_label} seat ${s.seat_num}`).join(', ');
    return `<strong>Auditorium ${tid}:</strong> ${seats}`;
  }).join('<br/>');
  const seatSummarySms = Object.keys(byTheater).map(tid => {
    return `Aud ${tid}: ${byTheater[tid].map(s => s.row_label + '-' + s.seat_num).join(', ')}`;
  }).join('; ');

  const subject = `Your gala seats are confirmed — ${seatList.length} seat${seatList.length===1?'':'s'}`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="border-radius:18px;box-shadow:0 1px 2px rgba(11,27,60,0.06),0 10px 30px rgba(11,27,60,0.12),0 20px 48px rgba(11,27,60,0.08);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#122a57 0%,#1f4484 100%);padding:30px 30px 22px;border-top:3px solid #CB262C;">
      <div style="color:#ffc24d;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:6px;">Davis Education Foundation</div>
      <h1 style="color:#fff;font-size:24px;margin:0;font-weight:700;">Your seats are confirmed</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:4px 0 0;">Gala 2026 · June 10 · Megaplex Theatres</p>
    </div>
    <div style="background:#ffffff;padding:34px 30px;">
      <p style="color:#0b1b3c;font-size:17px;margin:0 0 16px;font-weight:600;">Thank you, ${escapeHtml(name)}!</p>
      <p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 20px;">
        You're confirmed for <strong>${seatList.length} seat${seatList.length===1?'':'s'}</strong> at the DEF Gala on June 10, 2026. Your group is:
      </p>
      <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin:0 0 20px;border-left:3px solid #CB262C;font-size:14px;line-height:1.7;color:#0b1b3c;">
        ${seatSummary}
      </div>
      <div style="background:#0b1b3c;border-radius:12px;padding:24px;text-align:center;margin:0 0 20px;">
        <div style="color:#ffc24d;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;margin-bottom:10px;">Your Check-In QR</div>
        <img src="${qrImgUrl}" alt="Check-in QR code" width="240" height="240" style="background:#fff;padding:12px;border-radius:10px;display:block;margin:0 auto 10px;"/>
        <div style="color:rgba(255,255,255,0.7);font-size:12px;">Show this at the check-in table on June 10.</div>
      </div>
      <p style="color:#1e293b;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Need to make changes? Your seats remain editable until June 9:<br/>
        <a href="https://gala.daviskids.org/sponsor/${token}" style="color:#CB262C;font-weight:600;">Return to my seat selector →</a>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 14px;"/>
      <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;line-height:1.6;">
        Davis Education Foundation · Gala 2026 · June 10, 2026 · 6:00 PM<br/>
        Questions? <a href="mailto:gala@daviskids.org" style="color:#CB262C;">gala@daviskids.org</a>
      </p>
    </div>
  </div>
</div>
</body></html>`;

  const smsText = await buildConfirmationSms(env, {
    kind: resolved.kind,
    recordId: resolved.record.id,
    company,
    token,
  });

  // Send both channels (non-blocking so the portal returns fast)
  const results = await Promise.allSettled([
    email ? sendEmail(env, { to: email, subject, html, replyTo: env.GALA_ADMIN_EMAIL }) : Promise.resolve(null),
    phone ? sendSMS(env, phone, smsText) : Promise.resolve(null),
  ]);

  return jsonOk({
    ok: true,
    finalized: true,
    seatCount: seatList.length,
    checkInUrl,
    qrImgUrl,
    email: { sent: email && results[0].status === 'fulfilled' && results[0].value?.ok },
    sms: { sent: phone && results[1].status === 'fulfilled' && results[1].value?.ok },
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
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
