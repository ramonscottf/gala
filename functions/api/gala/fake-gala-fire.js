// POST /api/gala/fake-gala-fire
//
// ONE-SHOT ENDPOINT — sends Fake Gala dry-run invites (email + SMS) to
// sponsors where sponsorship_tier='TEST' AND archived_at IS NULL.
// Hard-scoped to TEST rows so it cannot accidentally hit real sponsors.
// Idempotent per channel (skips anyone with an existing status='sent' row
// for that channel). Delete this file after the dry run is done.

import { sendEmail, sendSMS } from './_notify.js';

const SUBJECT = "You're invited to Fake Gala 🎬";

function emailHtml(first, token) {
  const portal = `https://gala.daviskids.org/sponsor/${token}`;
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="border-radius:18px;box-shadow:0 1px 2px rgba(11,27,60,0.06),0 10px 30px rgba(11,27,60,0.12),0 20px 48px rgba(11,27,60,0.08);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#122a57 0%,#1f4484 100%);padding:30px 30px 22px;border-top:3px solid #CB262C;">
      <div style="color:#ffc24d;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:6px;">Davis Education Foundation</div>
      <h1 style="color:#fff;font-size:24px;margin:0;font-weight:700;">Fake Gala · April 24 · 10 AM</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:4px 0 0;">DEF Conference Room</p>
    </div>
    <div style="background:#ffffff;padding:34px 30px;">
      <p style="color:#0b1b3c;font-size:17px;margin:0 0 12px;font-weight:600;">Hi ${first},</p>
      <p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Round 2 of <strong>Fake Gala</strong> — fresh link, clean slate. 🎬 The old links got accidentally expired, so here's a new one.
      </p>
      <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin:18px 0;border-left:3px solid #CB262C;">
        <div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:4px;">Your Seats</div>
        <div style="color:#0b1b3c;font-size:16px;font-weight:700;">2 seats · Fake Gala · DEF Conference Room</div>
      </div>
      <p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Here's how it works:
      </p>
      <ul style="color:#1e293b;font-size:14px;line-height:1.7;margin:0 0 24px;padding-left:18px;">
        <li><strong>Select your 2 seats</strong> on the theater chart</li>
        <li><strong>Meet in the conference room at 10 AM</strong> — that's the whole venue, that's the whole event</li>
        <li><strong>Just seats for now</strong> — we'll test the auction separately</li>
        <li><strong>Marvel at the ticket email</strong> that shows up with a QR code like you're a real VIP</li>
      </ul>
      <p style="text-align:center;margin:28px 0;">
        <a href="${portal}" style="display:inline-block;background:linear-gradient(135deg,#CB262C,#a01f24);color:#fff;padding:16px 36px;border-radius:50px;font-weight:700;font-size:16px;text-decoration:none;box-shadow:0 12px 32px rgba(203,38,44,0.25);">Select my Fake Gala seats →</a>
      </p>
      <p style="color:#64748b;font-size:13px;text-align:center;margin:16px 0 0;">
        Or open this URL in your browser:<br/>
        <a href="${portal}" style="color:#CB262C;word-break:break-all;">${portal}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;"/>
      <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;line-height:1.6;">
        Fake Gala · Friday, April 24 · 10:00 AM · DEF Conference Room<br/>
        Bring coffee. Bring your A-game. Bring nothing, it's fine.
      </p>
    </div>
  </div>
</div>
</body></html>`;
}

function smsBody(first, token) {
  const portal = `https://gala.daviskids.org/sponsor/${token}`;
  return `Hi ${first} — round 2 of Fake Gala 🎬 old links expired, here's your fresh one. April 24 at 10 AM, DEF Conference Room. Just select seats this time (no auction). Reply STOP to opt out. ${portal}`;
}

async function hasSentRow(env, sponsorId, channel) {
  const row = await env.GALA_DB.prepare(
    `SELECT 1 FROM sponsor_invites WHERE sponsor_id = ? AND channel = ? AND status = 'sent' LIMIT 1`
  ).bind(sponsorId, channel).first();
  return !!row;
}

async function logInvite(env, sponsorId, channel, recipient, subject, ok, err) {
  try {
    await env.GALA_DB.prepare(
      `INSERT INTO sponsor_invites (sponsor_id, channel, recipient, subject, status, error, sent_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(sponsorId, channel, recipient, subject, ok ? 'sent' : 'failed', ok ? null : String(err || 'unknown').slice(0, 500)).run();
  } catch (_) { /* swallow log errors */ }
}

export async function onRequestPost(context) {
  const { env } = context;
  if (!env.GALA_DB) return new Response(JSON.stringify({ error: 'GALA_DB missing' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

  const rows = await env.GALA_DB.prepare(
    `SELECT id, first_name, email, phone, rsvp_token FROM sponsors
     WHERE sponsorship_tier='TEST' AND archived_at IS NULL ORDER BY id`
  ).all();
  const targets = rows.results || [];

  const results = [];
  for (const s of targets) {
    const first = s.first_name || 'there';
    const entry = { id: s.id, first, email_ok: null, sms_ok: null };

    // EMAIL
    if (s.email) {
      if (await hasSentRow(env, s.id, 'email')) {
        entry.email_ok = 'already_sent';
      } else {
        const html = emailHtml(first, s.rsvp_token);
        const r = await sendEmail(env, { to: s.email, subject: SUBJECT, html, replyTo: env.GALA_ADMIN_EMAIL });
        entry.email_ok = !!r?.ok;
        entry.email_id = r?.id;
        entry.email_err = r?.ok ? undefined : r?.error;
        await logInvite(env, s.id, 'email', s.email, SUBJECT, r?.ok, r?.error);
        await new Promise(resolve => setTimeout(resolve, 250)); // Resend 5/sec
      }
    }

    // SMS
    if (s.phone) {
      if (await hasSentRow(env, s.id, 'sms')) {
        entry.sms_ok = 'already_sent';
      } else {
        const body = smsBody(first, s.rsvp_token);
        const r = await sendSMS(env, s.phone, body);
        entry.sms_ok = !!r?.ok;
        entry.sms_sid = r?.sid;
        entry.sms_err = r?.ok ? undefined : r?.error;
        await logInvite(env, s.id, 'sms', s.phone, null, r?.ok, r?.error);
      }
    }

    results.push(entry);
  }

  const summary = {
    targeted: targets.length,
    email_sent: results.filter(r => r.email_ok === true).length,
    email_skipped: results.filter(r => r.email_ok === 'already_sent').length,
    email_failed: results.filter(r => r.email_ok === false).length,
    sms_sent: results.filter(r => r.sms_ok === true).length,
    sms_skipped: results.filter(r => r.sms_ok === 'already_sent').length,
    sms_failed: results.filter(r => r.sms_ok === false).length,
  };

  return new Response(JSON.stringify({ summary, results }, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}
