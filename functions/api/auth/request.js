// Magic-link auth — request endpoint
//
// POST { email } → checks allowlist (admins) or sponsor lookup, sends email
// with a signed magic link. Always returns 200 on valid input shape so we
// don't leak whether an email is allow-listed.
//
// Two paths:
//
// 1. ADMIN: email is @dsdmail.net AND username ∈ {sfoster, smiggin, ktoone, kbuchi}
//    → sign a JWT with role=admin, send link to /api/auth/verify?t=...
//    → verify endpoint sets gala_session cookie + redirects to /admin
//
// 2. SPONSOR: email matches a sponsor's contact_email in D1
//    → look up that sponsor's permanent token from sponsors table
//    → email link straight to /sponsor/{token}
//    → no cookie needed (token IS the auth)
//
// If neither match, we still return 200 — silent rejection. The user sees
// "If that email is on file..." regardless.

const ADMIN_DOMAIN = 'dsdmail.net';
const ADMIN_USERS = new Set(['sfoster', 'smiggin', 'ktoone', 'kbuchi']);
const TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes for admin magic links

// Simple HMAC-SHA256 JWT — header.payload.signature, base64url
async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = new TextEncoder();
  const b64 = (s) =>
    btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const h = b64(JSON.stringify(header));
  const p = b64(JSON.stringify(payload));
  const data = enc.encode(`${h}.${p}`);
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, data);
  const sigB64 = b64(String.fromCharCode(...new Uint8Array(sig)));
  return `${h}.${p}.${sigB64}`;
}

async function sendEmail(env, to, subject, html, text) {
  // Use the existing mail.fosterlabs.org/send infrastructure if GALA_MAIL_TOKEN
  // is configured. Falls back to Resend direct.
  if (env.GALA_MAIL_TOKEN) {
    const res = await fetch('https://mail.fosterlabs.org/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GALA_MAIL_TOKEN}`,
      },
      body: JSON.stringify({
        from: env.GALA_FROM_EMAIL || 'gala@daviskids.org',
        replyTo: 'smiggin@dsdmail.net',
        to,
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`mail.fosterlabs.org failed: ${res.status} ${errText}`);
    }
    return;
  }

  if (!env.RESEND_API_KEY) {
    throw new Error('No mail backend configured (need GALA_MAIL_TOKEN or RESEND_API_KEY)');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.GALA_FROM_EMAIL || 'gala@daviskids.org',
      reply_to: 'smiggin@dsdmail.net',
      to,
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Resend failed: ${res.status} ${errText}`);
  }
}

function isAllowedAdmin(email) {
  const m = /^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+)$/.exec(email);
  if (!m) return false;
  const [, user, domain] = m;
  return domain.toLowerCase() === ADMIN_DOMAIN && ADMIN_USERS.has(user.toLowerCase());
}

async function findSponsorByEmail(env, email) {
  const result = await env.GALA_DB.prepare(
    'SELECT id, company, contact_name, token FROM sponsors WHERE LOWER(contact_email) = ? LIMIT 1'
  )
    .bind(email)
    .first();
  return result || null;
}

async function adminLinkEmail(env, email, link) {
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a2540;">
      <div style="background:#0d1b3d;color:#fff;padding:24px;border-radius:12px;text-align:center;">
        <div style="font-size:11px;letter-spacing:0.18em;color:#c9a45c;text-transform:uppercase;font-weight:600;margin-bottom:6px;">Davis Education Foundation</div>
        <div style="font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:700;">Gala <span style="color:#c9a45c;font-style:italic;">2026</span> Admin</div>
      </div>
      <div style="padding:24px 8px;">
        <p style="font-size:15px;line-height:1.55;margin:0 0 18px;">Click the link below to sign in to the gala dashboard. The link expires in 15 minutes.</p>
        <p style="margin:0 0 22px;">
          <a href="${link}" style="display:inline-block;background:#0d1b3d;color:#fff;padding:14px 22px;border-radius:10px;font-weight:600;text-decoration:none;font-size:15px;">Sign in to admin</a>
        </p>
        <p style="font-size:12px;color:#6b7493;line-height:1.5;margin:0;">If you didn't request this, you can ignore this email.</p>
      </div>
    </div>
  `;
  const text = `Sign in to the DEF Gala 2026 admin dashboard.\n\n${link}\n\nLink expires in 15 minutes. If you didn't request this, ignore.`;
  await sendEmail(env, email, 'Sign in to DEF Gala 2026 admin', html, text);
}

async function sponsorLinkEmail(env, email, name, company, link) {
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a2540;">
      <div style="background:#0d1b3d;color:#fff;padding:24px;border-radius:12px;text-align:center;">
        <div style="font-size:11px;letter-spacing:0.18em;color:#c9a45c;text-transform:uppercase;font-weight:600;margin-bottom:6px;">Davis Education Foundation</div>
        <div style="font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:700;">Gala <span style="color:#c9a45c;font-style:italic;">2026</span></div>
      </div>
      <div style="padding:24px 8px;">
        <p style="font-size:15px;line-height:1.55;margin:0 0 18px;">Hi ${name || 'there'},</p>
        <p style="font-size:15px;line-height:1.55;margin:0 0 18px;">Here's your sponsor portal for ${company || 'your company'}. Bookmark or save this link — it works forever, no password.</p>
        <p style="margin:0 0 22px;">
          <a href="${link}" style="display:inline-block;background:#0d1b3d;color:#fff;padding:14px 22px;border-radius:10px;font-weight:600;text-decoration:none;font-size:15px;">Open my portal</a>
        </p>
        <p style="font-size:12px;color:#6b7493;line-height:1.5;margin:0;">Questions? Reply to this email or contact <a href="mailto:smiggin@dsdmail.net" style="color:#0d1b3d;">smiggin@dsdmail.net</a>.</p>
      </div>
    </div>
  `;
  const text = `Hi ${name || ''},\n\nHere's your DEF Gala 2026 sponsor portal for ${company || 'your company'}:\n\n${link}\n\nThis link works forever — no password needed.\n\nQuestions: smiggin@dsdmail.net`;
  await sendEmail(env, email, `Your DEF Gala 2026 sponsor portal`, html, text);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Email required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Admin path: signed JWT magic link
  if (isAllowedAdmin(email)) {
    if (!env.GALA_DASH_SECRET) {
      console.error('GALA_DASH_SECRET not configured');
      // Still return generic success so we don't leak config state
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: email,
      role: 'admin',
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    };
    try {
      const token = await signJWT(payload, env.GALA_DASH_SECRET);
      const link = `https://gala.daviskids.org/api/auth/verify?t=${encodeURIComponent(token)}`;
      await adminLinkEmail(env, email, link);
    } catch (err) {
      console.error('Admin email send failed:', err.message);
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Sponsor path: look up by email, send their permanent portal link
  if (env.GALA_DB) {
    try {
      const sponsor = await findSponsorByEmail(env, email);
      if (sponsor && sponsor.token) {
        const link = `https://gala.daviskids.org/sponsor/${sponsor.token}`;
        await sponsorLinkEmail(env, email, sponsor.contact_name, sponsor.company, link);
      }
    } catch (err) {
      console.error('Sponsor lookup/email failed:', err.message);
    }
  }

  // Always 200 — generic response keeps allowlist private
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
