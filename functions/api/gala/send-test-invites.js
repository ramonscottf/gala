// POST /api/gala/send-test-invites
//
// ONE-SHOT TEST ENDPOINT — sends the production Gala 2026 "time to
// pick seats" invite (email + SMS) to a hardcoded allowlist of three
// sponsor IDs: 28 (Logan/2N Town), 89 (Scott/Wicko), 98 (Kara/2N
// Family). Scoped by ID list so it cannot fan out to real sponsors.
//
// Uses the same template + send pipeline as /admin/send-invites but
// skips the dashboard cookie auth, since this is a Sunday-night test
// fire from Skippy. Idempotent per channel via sponsor_invites
// status='sent' lookup so multiple calls don't double-send.
//
// Delete after the test send is complete. Phase 5.7 / May 10.

import { sendEmail, sendSMS } from './_notify.js';

const ALLOWED_IDS = [28, 89, 98];
const SUBJECT = 'Gala 2026 — time to select your seats';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function emailHtml({ contactName, company, tier, seats, portalUrl }) {
  const tierLabel = tier || 'Sponsor';
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="border-radius:18px;box-shadow:0 1px 2px rgba(11,27,60,0.06),0 10px 30px rgba(11,27,60,0.12),0 20px 48px rgba(11,27,60,0.08);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#122a57 0%,#1f4484 100%);padding:30px 30px 22px;border-top:3px solid #CB262C;">
      <div style="color:#ffc24d;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:6px;">Davis Education Foundation</div>
      <h1 style="color:#fff;font-size:24px;margin:0;font-weight:700;">Gala 2026 · June 10</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:4px 0 0;">Megaplex Theatres at Legacy Crossing · Centerville</p>
    </div>
    <div style="background:#ffffff;padding:34px 30px;">
      <p style="color:#0b1b3c;font-size:17px;margin:0 0 12px;font-weight:600;">Hi ${escapeHtml(contactName)},</p>
      <p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Thank you for supporting this year's Davis Education Foundation Gala. Your <strong>${escapeHtml(tierLabel)}</strong> group can now select seats.
      </p>
      <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin:18px 0;border-left:3px solid #CB262C;">
        <div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:4px;">Your Sponsorship</div>
        <div style="color:#0b1b3c;font-size:16px;font-weight:700;">${escapeHtml(company)} · ${escapeHtml(tierLabel)} · ${seats} seats</div>
      </div>
      <p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Click the link below to pick exactly where you'd like your group to sit. You can:
      </p>
      <ul style="color:#1e293b;font-size:14px;line-height:1.7;margin:0 0 24px;padding-left:18px;">
        <li><strong>Select all ${seats} seats yourself</strong> — click your seats on the chart</li>
        <li><strong>Delegate some seats</strong> — have a colleague select their own spots</li>
        <li><strong>Need help?</strong> Reply to this email and our team will help your group finish seating</li>
      </ul>
      <p style="text-align:center;margin:28px 0;">
        <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#CB262C,#a01f24);color:#fff;padding:16px 36px;border-radius:50px;font-weight:700;font-size:16px;text-decoration:none;box-shadow:0 12px 32px rgba(203,38,44,0.25);">Select my seats →</a>
      </p>
      <p style="color:#64748b;font-size:13px;text-align:center;margin:16px 0 0;">
        Or open this URL in your browser:<br/>
        <a href="${portalUrl}" style="color:#CB262C;word-break:break-all;">${portalUrl}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;"/>
      <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;line-height:1.6;">
        Davis Education Foundation · Gala 2026 · June 10, 2026 · 6:00 PM
      </p>
    </div>
  </div>
</div>
</body></html>`;
}

function smsBody({ first, tier, seats, portalUrl }) {
  return `Hi ${first}, DEF Gala 2026 ${tier} sponsors can now select their ${seats} seats. Reply STOP to opt out. ${portalUrl}`;
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
  } catch (_) {}
}

export async function onRequestPost(context) {
  const { env } = context;
  if (!env.GALA_DB) {
    return new Response(JSON.stringify({ error: 'GALA_DB missing' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Pull only the allowed IDs — defense in depth alongside the hardcoded
  // list. Even if someone could trigger this, only these three records
  // can ever receive.
  const placeholders = ALLOWED_IDS.map(() => '?').join(',');
  const rows = await env.GALA_DB.prepare(
    `SELECT id, first_name, last_name, company, email, phone, sponsorship_tier, seats_purchased, rsvp_token FROM sponsors WHERE id IN (${placeholders}) ORDER BY id`
  ).bind(...ALLOWED_IDS).all();
  const targets = rows.results || [];

  const results = [];
  for (const s of targets) {
    const first = s.first_name || 'there';
    const contactName = [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || 'there';
    const tier = s.sponsorship_tier || 'Sponsor';
    const seats = s.seats_purchased || 0;
    const portalUrl = `https://gala.daviskids.org/portal/${s.rsvp_token}`;
    const entry = { id: s.id, company: s.company, first, email_ok: null, sms_ok: null };

    if (s.email) {
      if (await hasSentRow(env, s.id, 'email')) {
        entry.email_ok = 'already_sent';
      } else {
        const html = emailHtml({ contactName, company: s.company, tier, seats, portalUrl });
        const r = await sendEmail(env, {
          to: s.email,
          subject: SUBJECT,
          html,
          replyTo: env.GALA_ADMIN_EMAIL,
        });
        entry.email_ok = !!r?.ok;
        entry.email_id = r?.id;
        entry.email_err = r?.ok ? undefined : r?.error;
        await logInvite(env, s.id, 'email', s.email, SUBJECT, r?.ok, r?.error);
        await new Promise((resolve) => setTimeout(resolve, 250)); // Resend rate limit
      }
    }

    if (s.phone) {
      if (await hasSentRow(env, s.id, 'sms')) {
        entry.sms_ok = 'already_sent';
      } else {
        const body = smsBody({ first, tier, seats, portalUrl });
        const r = await sendSMS(env, s.phone, body);
        entry.sms_ok = !!r?.ok;
        entry.sms_sid = r?.sid;
        entry.sms_err = r?.ok ? undefined : r?.error;
        await logInvite(env, s.id, 'sms', s.phone, null, r?.ok, r?.error);
      }
    }

    // Flip rsvp_status to 'invited' on first successful send (matches
    // the production /admin/send-invites contract).
    if (entry.email_ok === true || entry.sms_ok === true) {
      await env.GALA_DB.prepare(
        `UPDATE sponsors SET rsvp_status = 'invited', updated_at = datetime('now') WHERE id = ? AND (rsvp_status IS NULL OR rsvp_status = 'pending')`
      ).bind(s.id).run();
    }

    results.push(entry);
  }

  const summary = {
    targeted: targets.length,
    email_sent: results.filter((r) => r.email_ok === true).length,
    email_skipped: results.filter((r) => r.email_ok === 'already_sent').length,
    email_failed: results.filter((r) => r.email_ok === false).length,
    sms_sent: results.filter((r) => r.sms_ok === true).length,
    sms_skipped: results.filter((r) => r.sms_ok === 'already_sent').length,
    sms_failed: results.filter((r) => r.sms_ok === false).length,
  };

  return new Response(JSON.stringify({ summary, results }, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
