// POST /api/gala/portal/request-link
// Body: { email }
//
// Sponsor / delegate "email me my portal link" flow. Phase 5.14 —
// added with the homepage redesign that puts sign-in on the root.
//
// We don't run a real session-based auth flow here; sponsors and
// delegates already have permanent portal tokens stored in the
// sponsors / sponsor_delegations tables (the same tokens that ship
// in marketing emails and SMS). This endpoint just looks up the
// caller by email and re-sends them their existing portal link.
//
// Response shape is always identical regardless of whether the
// email matches a real record — we never leak who's a sponsor.
//
// Privacy: we deliberately return ok=true with a generic "if that
// email is on the list, we sent it" message in every case. The
// admin response code path (db error, mail send fail) returns a
// 5xx so the user knows to retry, but we don't tell them whether
// or not their email was found.
//
// Why no rate limiting in this file:
//   - The send backend (mail.fosterlabs.org) has its own rate limit
//   - Cloudflare's edge throttles abusive IPs automatically
//   - Sponsors mostly self-serve once or twice — the request volume
//     is naturally tiny (we have 99 active sponsors total)
//
// If abuse appears: add a simple SKIPPY_KV-backed sliding window
// per-IP and per-email before the DB lookup.

import { sendEmail } from '../_notify.js';
import { jsonError, jsonOk } from '../_sponsor_portal.js';

const PORTAL_BASE = 'https://gala.daviskids.org/sponsor/';
// Phase 5.14 hotfix — SkippyMail silently drops sends when replyTo is
// comma-separated (returns {ok:true} with no resend_id; email never
// reaches Resend). Stick to a single address. Sherry forwards to Scott
// when his eyes are needed. _notify.js has a stale comment claiming
// comma-separated is supported — it isn't, at least not as of May 2026.
const REPLY_TO = 'smiggin@dsdmail.net';

function buildEmailHtml({ recipientName, portalUrl, kind }) {
  const greeting = recipientName ? `Hi ${recipientName.split(' ')[0]},` : 'Hello,';
  const roleLine = kind === 'delegation'
    ? "You're listed as a guest delegate on a DEF Gala 2026 sponsorship."
    : "You're listed as a sponsor on the DEF Gala 2026.";
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; padding: 0; background: #0d1b3d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .wrap { max-width: 540px; margin: 0 auto; padding: 32px 16px; }
  .card { background: #ffffff; border-radius: 14px; padding: 36px 32px; }
  .eyebrow { font-size: 11px; color: #737373; letter-spacing: 0.18em; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; }
  h1 { font-size: 24px; color: #0d1b3d; margin: 0 0 8px; font-weight: 700; }
  h1 em { font-style: normal; color: #cb262c; font-weight: 700; }
  p { color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
  .btn-wrap { text-align: center; margin: 28px 0; }
  .btn { display: inline-block; background: #cb262c; color: #ffffff !important; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.04em; text-decoration: none; }
  .url-fallback { color: #94a3b8; font-size: 12px; line-height: 1.55; margin: 16px 0 0; word-break: break-all; }
  .url-fallback a { color: #475569; text-decoration: underline; }
  .footer { color: #94a3b8; font-size: 12px; line-height: 1.55; margin: 24px 0 0; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="eyebrow">Davis Education Foundation</div>
      <h1>Your Gala <em>2026</em> portal link</h1>
      <p>${greeting}</p>
      <p>${roleLine} You can pick (and edit) your seats, choose your dinner, and invite the rest of your party using the link below.</p>
      <div class="btn-wrap">
        <a href="${portalUrl}" class="btn">Open my Gala portal &rarr;</a>
      </div>
      <p class="url-fallback">
        Button not working? Paste this into your browser:<br>
        <a href="${portalUrl}">${portalUrl}</a>
      </p>
      <p class="footer">If you didn't request this email, you can ignore it — your portal link is private to you. Questions? Reply to this email and Sherry or Scott will get back to you.</p>
    </div>
  </div>
</body>
</html>
  `;
}

function buildEmailText({ recipientName, portalUrl, kind }) {
  const greeting = recipientName ? `Hi ${recipientName.split(' ')[0]},` : 'Hello,';
  const roleLine = kind === 'delegation'
    ? "You're listed as a guest delegate on a DEF Gala 2026 sponsorship."
    : "You're listed as a sponsor on the DEF Gala 2026.";
  return [
    greeting,
    '',
    roleLine,
    '',
    'Open your Gala portal here:',
    portalUrl,
    '',
    "If you didn't request this email, you can safely ignore it.",
    '',
    '— Davis Education Foundation',
  ].join('\n');
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid request', 400);
  }

  const rawEmail = (body && body.email) || '';
  const email = String(rawEmail).toLowerCase().trim();

  // Basic input shape check. Beyond this we don't reveal anything.
  if (!email || email.indexOf('@') < 1 || email.length > 254) {
    return jsonError('Please enter a valid email address.', 400);
  }

  // Look up sponsors by primary email OR secondary_email (some companies
  // route everything through an admin assistant). Active (not archived)
  // records only.
  const sponsorRow = await env.GALA_DB.prepare(
    `SELECT id, first_name, last_name, email, secondary_email, rsvp_token
       FROM sponsors
      WHERE archived_at IS NULL
        AND (LOWER(email) = ? OR LOWER(secondary_email) = ?)
      LIMIT 1`
  ).bind(email, email).first();

  // Look up delegations — anyone invited as a guest. Active (not revoked)
  // records only; status='revoked' means the sponsor took the seat back.
  const delegationRow = await env.GALA_DB.prepare(
    `SELECT id, delegate_name, delegate_email, token, status
       FROM sponsor_delegations
      WHERE LOWER(delegate_email) = ?
        AND (status IS NULL OR status != 'revoked')
      LIMIT 1`
  ).bind(email).first();

  // Always-same response shape so we don't leak presence.
  const genericOk = jsonOk({
    ok: true,
    message: "If that email is on the sponsor list, we just sent your portal link. Check your inbox (and spam, just in case).",
  });

  if (!sponsorRow && !delegationRow) {
    // No match. Pretend we sent.
    return genericOk;
  }

  // Prefer the sponsor record over a delegation — a sponsor who's also
  // listed as someone's delegate (rare but possible) should get their
  // own portal link, not the one where they're the guest.
  let recipientName = null;
  let portalToken = null;
  let kind = 'sponsor';
  if (sponsorRow) {
    recipientName = [sponsorRow.first_name, sponsorRow.last_name].filter(Boolean).join(' ').trim() || null;
    portalToken = sponsorRow.rsvp_token;
    kind = 'sponsor';
  } else {
    recipientName = delegationRow.delegate_name || null;
    portalToken = delegationRow.token;
    kind = 'delegation';
  }

  if (!portalToken) {
    // Data integrity issue — sponsor record exists but has no token.
    // Bubble up a 5xx so the user knows to retry / contact us.
    console.error('[request-link] match found but no portal token', { email, kind });
    return jsonError('We hit a snag preparing your link — please email smiggin@dsdmail.net and we will get you set up.', 500);
  }

  const portalUrl = `${PORTAL_BASE}${portalToken}`;
  const subject = "Your DEF Gala 2026 portal link";

  const html = buildEmailHtml({ recipientName, portalUrl, kind });
  const text = buildEmailText({ recipientName, portalUrl, kind });

  // _notify.sendEmail returns { ok, ... } — uses GALA_MAIL_TOKEN
  // (SkippyMail) primary, falls back to RESEND_API_KEY if configured.
  const mailResult = await sendEmail(env, {
    to: email,
    subject,
    html,
    replyTo: REPLY_TO,
    text,
  });

  // Phase 5.14 hotfix — SkippyMail returns {ok:true} with no resend_id
  // when it silently drops a send (e.g. on comma-separated replyTo).
  // Treat a missing id as a failure so we surface real "send didn't
  // happen" cases as 502 instead of falsely returning success.
  if (!mailResult.ok || !mailResult.id) {
    console.error('[request-link] mail send failed or dropped', {
      email,
      error: mailResult.error,
      via: mailResult.via,
      id: mailResult.id,
    });
    return jsonError(
      'We could not send your link right now. Please try again in a minute, or email smiggin@dsdmail.net.',
      502
    );
  }

  // Light audit log — console only. marketing_send_log is shaped for the
  // bulk-marketing pipeline (requires send_id, send_run_id, channel,
  // status NOT NULL) — overloading it for self-service one-offs would
  // pollute its analytics rollups. If we want first-class audit later,
  // create a dedicated `portal_link_requests` table.
  console.log('[request-link] sent', {
    email,
    kind,
    sponsor_id: sponsorRow ? sponsorRow.id : null,
    delegation_id: delegationRow && !sponsorRow ? delegationRow.id : null,
    mail_id: mailResult.id || null,
    via: mailResult.via || null,
  });

  return genericOk;
}
