// POST /api/gala/review/auth/request
// Body: { email }
// Issues a magic-link email to the allowlisted address.

import { jsonError, jsonOk } from '../../_auth.js';

const ALLOWED_EMAILS = [
  'sfoster@dsdmail.net',           // Scott
  'ramonscottf@gmail.com',         // Scott personal
  'smiggin@dsdmail.net',           // Sherry
  'ktoone@dsdmail.net',            // Kara
];

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid request', 400); }

  const email = (body.email || '').toLowerCase().trim();
  if (!email) return jsonError('Email required', 400);

  // Always return same shape so we don't leak who's allowed
  const isAllowed = ALLOWED_EMAILS.includes(email);

  if (!isAllowed) {
    // Pretend we sent it
    return jsonOk({ ok: true, message: 'If this email is on the list, a sign-in link was sent.' });
  }

  if (!env.GALA_REVIEW_SECRET) return jsonError('GALA_REVIEW_SECRET not configured', 503);
  if (!env.GALA_MAIL_TOKEN) return jsonError('GALA_MAIL_TOKEN not configured', 503);

  // Build signed token: email + expiry, signed with HMAC
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${email}|${expiresAt}`;
  const sig = await hmacHex(env.GALA_REVIEW_SECRET, payload);
  const token = btoa(payload).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') + '.' + sig;

  const url = `https://daviskids.org/api/gala/review/auth/verify?t=${encodeURIComponent(token)}`;

  // Send via skippy-mail
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;background:#0d1b3d;padding:32px 16px;">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:36px 32px;">
        <div style="font-size:11px;color:#737373;letter-spacing:0.18em;font-weight:700;margin-bottom:8px;">DAVIS EDUCATION FOUNDATION</div>
        <h1 style="font-size:24px;color:#0d1b3d;margin:0 0 8px;">Gala 2026 <span style="color:#d4af6a;">Review</span></h1>
        <p style="color:#475569;font-size:14px;line-height:1.55;margin:0 0 24px;">Tap the button below to sign in. This link expires in 15 minutes and works once.</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${url}" style="display:inline-block;background:#0d1b3d;color:#fff;padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:0.04em;text-decoration:none;">Sign in to gala review &rarr;</a>
        </p>
        <p style="color:#94a3b8;font-size:12px;line-height:1.55;margin:24px 0 0;">If you didn't request this, ignore the email.</p>
      </div>
    </div>
  `;

  const text = `Sign in to Gala 2026 Review:\n\n${url}\n\nLink expires in 15 minutes. If you didn't request this, ignore.`;

  const mailResp = await fetch('https://mail.fosterlabs.org/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GALA_MAIL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'gala@daviskids.org',
      replyTo: 'smiggin@dsdmail.net',
      to: [email],
      subject: 'Gala 2026 Review — sign-in link',
      html,
      text,
    }),
  });

  if (!mailResp.ok) {
    const errText = await mailResp.text();
    console.error('Mail send failed:', errText);
    return jsonError('Could not send sign-in email', 502);
  }

  return jsonOk({ ok: true, message: 'Sign-in link sent. Check your email.' });
}
