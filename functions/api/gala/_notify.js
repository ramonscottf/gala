// Shared Twilio + Resend helpers for the gala volunteer system.
// Env expected:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN   — required
//   TWILIO_MESSAGING_SERVICE_SID            — preferred (A2P 10DLC compliant)
//   TWILIO_FROM_NUMBER                      — fallback if no messaging service
//   RESEND_API_KEY                          — required for email
//   GALA_FROM_EMAIL                         — optional, defaults gala@daviskids.org
//   GALA_ADMIN_EMAIL                        — optional, reply-to + admin alerts

export async function sendSMS(env, to, body, options = {}) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    return { ok: false, error: 'Twilio not configured (missing SID/token)' };
  }
  if (!to) return { ok: false, error: 'No phone number' };

  // Normalize — strip non-digits, add +1 if needed
  let num = String(to).replace(/[^\d+]/g, '');
  if (!num.startsWith('+')) {
    if (num.length === 10) num = '+1' + num;
    else if (num.length === 11 && num.startsWith('1')) num = '+' + num;
    else num = '+' + num;
  }

  // Prefer MessagingServiceSid (A2P compliance), fall back to From number
  const params = { To: num, Body: body };
  if (env.TWILIO_MESSAGING_SERVICE_SID) {
    params.MessagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;
  } else if (env.TWILIO_FROM_NUMBER || env.TWILIO_FROM) {
    params.From = env.TWILIO_FROM_NUMBER || env.TWILIO_FROM;
  } else {
    return { ok: false, error: 'Twilio sender not configured (need MESSAGING_SERVICE_SID or FROM_NUMBER)' };
  }

  // Optional MMS attachment — pass options.mediaUrl as string or array of URLs.
  // For the gala, the canonical SMS hero is:
  //   https://assets.daviskids.org/gala-2026/sms-hero.png
  // Twilio accepts up to 10 MediaUrl params. We build the form body manually below
  // to support multiple values for the same key.
  const mediaUrls = options.mediaUrl
    ? (Array.isArray(options.mediaUrl) ? options.mediaUrl : [options.mediaUrl]).slice(0, 10)
    : [];

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  // Build form body — URLSearchParams supports append() for multi-value keys
  const formBody = new URLSearchParams(params);
  for (const u of mediaUrls) formBody.append('MediaUrl', u);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    });
    const data = await res.json();
    if (res.ok) return { ok: true, sid: data.sid, status: data.status, mms: mediaUrls.length > 0 };
    return { ok: false, error: data.message || `Twilio error ${res.status}`, code: data.code };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!to) return { ok: false, error: 'No email address' };

  const fromAddr = env.GALA_FROM_EMAIL || 'gala@daviskids.org';
  const fromDisplay = `Davis Education Foundation Gala <${fromAddr}>`;
  // All gala emails reply to Sherry by default. Per Apr 28 2026 personnel update:
  // Val is no longer with DEF; Sherry Miggin (Executive Director) owns gala correspondence.
  const defaultReplyTo = replyTo || env.GALA_ADMIN_EMAIL || 'smiggin@dsdmail.net';

  // ── Path 1: SkippyMail at mail.fosterlabs.org/send (primary) ────────────
  // Uses the GALA_MAIL_TOKEN bearer; this is the same backend that the
  // /api/auth/request magic-link emails go through, so we know it works.
  if (env.GALA_MAIL_TOKEN) {
    try {
      const res = await fetch('https://mail.fosterlabs.org/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.GALA_MAIL_TOKEN}`,
        },
        body: JSON.stringify({
          from: fromDisplay,
          replyTo: defaultReplyTo,
          to,
          subject,
          html,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, id: data.id || data.resend_id || null, via: 'skippymail' };
      }
      const errText = await res.text().catch(() => '');
      return { ok: false, error: `SkippyMail ${res.status}: ${errText.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: 'SkippyMail network: ' + e.message };
    }
  }

  // ── Path 2: Resend direct (fallback) ────────────────────────────────────
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: 'No mail backend configured (need GALA_MAIL_TOKEN or RESEND_API_KEY)' };
  }
  const payload = {
    from: fromDisplay,
    to: [to],
    subject,
    html,
    reply_to: defaultReplyTo,
  };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) return { ok: true, id: data.id, via: 'resend' };
    return { ok: false, error: data.message || `Resend error ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Brand-wrapped HTML template for gala emails
export function galaEmailHtml({ firstName, body, footerLine }) {
  const foot = footerLine || 'Davis Education Foundation · Gala 2026 · June 10, 2026';
  // v6 BRANDING (locked Apr 28 2026): NO IMAGE in email.
  // Words-only masthead on dark navy, blue→red gradient strips top and bottom.
  // White page bg, gray card body. Hero image is reserved for SMS/MMS only.
  // Palette: navy #0d1b3d, red #c8102e, blue #0066ff, yellow #ffb400 (accents).
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; display: block; }
  table { border-collapse: collapse !important; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #ffffff !important; }
  a { color: #c8102e; text-decoration: none; }
  @media screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .card-pad { padding-left: 24px !important; padding-right: 24px !important; }
    .h1 { font-size: 24px !important; line-height: 30px !important; }
    .gala-mark { font-size: 28px !important; letter-spacing: 2px !important; }
    .neon-bar { height: 6px !important; }
    .outer-pad { padding: 16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff" style="background-color:#ffffff;">
  <tr><td align="center" class="outer-pad" style="padding:32px 20px;background-color:#ffffff;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px;max-width:600px;">
      <tr><td style="padding:0;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
               style="background-color:#f3f5f9;border:1px solid #c5cdd9;border-radius:12px;box-shadow:0 12px 32px rgba(13,27,61,0.18), 0 4px 12px rgba(13,27,61,0.10);overflow:hidden;">
          <tr><td height="8" class="neon-bar" style="height:8px;line-height:8px;font-size:0;background:#0066ff;background:linear-gradient(90deg,#0066ff 0%,#c8102e 100%);" bgcolor="#c8102e">&nbsp;</td></tr>
          <tr><td align="center" bgcolor="#0d1b3d" style="background-color:#0d1b3d;padding:32px 32px 28px 32px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:3px;color:#9bb0d4;text-transform:uppercase;font-weight:600;margin-bottom:12px;">Davis Education Foundation</div>
            <div class="gala-mark" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:38px;font-weight:900;letter-spacing:4px;color:#ffffff;text-transform:uppercase;line-height:1;">Gala 2026</div>
            <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#ffffff;margin-top:14px;letter-spacing:1px;">Wednesday  ·  June 10  ·  Megaplex Centerville</div>
          </td></tr>
          <tr><td height="6" class="neon-bar" style="height:6px;line-height:6px;font-size:0;background:#c8102e;background:linear-gradient(90deg,#c8102e 0%,#0066ff 100%);" bgcolor="#0066ff">&nbsp;</td></tr>
          <tr><td class="card-pad" style="padding:28px 40px 8px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;">
            <p style="margin:0 0 16px 0;font-size:18px;line-height:26px;color:#1a1a1a;font-weight:600;">Hi ${firstName || 'there'},</p>
          </td></tr>
          <tr><td class="card-pad" style="padding:0 40px 28px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#3d3d3d;font-size:16px;line-height:25px;">${body}</td></tr>
          <tr><td class="card-pad" style="padding:0 40px;"><div style="border-top:1px solid #c5cdd9;height:1px;line-height:1px;font-size:0;">&nbsp;</div></td></tr>
          <tr><td class="card-pad" align="center" style="padding:24px 40px 28px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px 0;font-size:12px;line-height:18px;color:#666;"><strong style="color:#0d1b3d;">${foot}</strong></p>
            <p style="margin:0;font-size:12px;line-height:18px;color:#666;"><a href="https://daviskids.org" style="color:#666;text-decoration:underline;">daviskids.org</a> &nbsp;·&nbsp; Questions? <a href="mailto:smiggin@dsdmail.net" style="color:#666;text-decoration:underline;">Reply to this email</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export async function notifyVolunteerRegistered(env, vol) {
  const firstName = vol.firstName;
  const token = vol.token;
  const portalUrl = `https://gala.daviskids.org/volunteer?t=${token}`;

  // Prefer the fine-grained position label; fall back to role
  const POSITION_LABELS = {
    candy_setup: 'Candy Setup',
    registration: 'Registration',
    social_hour: 'Social Hour',
    check_in: 'Volunteer Check-In',
    ambassador: 'Auditorium Ambassador',
    checkout: 'Checkout',
    roamer: 'Roamer / Dinner Help',
  };
  const ROLE_LABELS = {
    setup: 'Setup Crew',
    event: 'Event Night',
    teardown: 'Teardown',
    all_night: 'All Night',
  };
  const roleLabel = POSITION_LABELS[vol.position] || ROLE_LABELS[vol.role] || 'Event Volunteer';
  const typeLabel = vol.participantType === 'student' ? 'Student Volunteer' : 'Adult Volunteer';

  const statusLine = vol.waitlisted
    ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:16px 0;color:#92400e;font-size:14px;"><strong>You're on the backup list.</strong> We've reached capacity for the gala — we'll reach out the moment a spot opens up. Thanks for your willingness to help!</div>`
    : `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:14px 16px;margin:16px 0;color:#065f46;font-size:14px;"><strong>You're registered.</strong> Save the date — June 10, 2026.</div>`;

  const body = `
    <p>Thank you for signing up to volunteer at the <strong>Davis Education Foundation Gala</strong> on June 10, 2026.</p>
    ${statusLine}
    <div style="background:#fef7f7;border-radius:10px;padding:16px 18px;margin:16px 0;border-left:3px solid #CB262C;">
      <p style="margin:0 0 4px;color:#a01f24;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">${typeLabel}</p>
      <p style="margin:0;color:#0b1b3c;font-size:16px;font-weight:700;">${roleLabel}</p>
      ${vol.shift ? `<p style="margin:4px 0 0;color:#475569;font-size:13px;">${vol.shift}</p>` : ''}
    </div>
    <p>Your personal volunteer page has your QR code for check-in at the event, event details, and all the info you'll need:</p>
    <p style="text-align:center;margin:24px 0;"><a href="${portalUrl}" style="display:inline-block;background:#CB262C;color:#fff;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">View your volunteer page →</a></p>
    <p style="color:#64748b;font-size:13px;">We'll send reminders by text and email as the event approaches. Reply STOP to any text to opt out.</p>
  `;

  const html = galaEmailHtml({ firstName, body });

  const results = await Promise.allSettled([
    vol.email
      ? sendEmail(env, {
          to: vol.email,
          subject: vol.waitlisted
            ? "You're on the Gala backup list"
            : "You're registered for the DEF Gala!",
          html,
          replyTo: env.GALA_ADMIN_EMAIL,
        })
      : Promise.resolve({ ok: false, error: 'No email' }),
    vol.phone && vol.smsOptIn !== false
      ? sendSMS(
          env,
          vol.phone,
          vol.waitlisted
            ? `Hi ${firstName}, thanks for signing up for the DEF Gala on June 10. We're at capacity right now, so you're on the backup list. We'll text if a spot opens. Reply STOP to opt out.`
            : `Hi ${firstName}, you're confirmed to volunteer at the DEF Gala on June 10! Reply STOP to opt out. ${portalUrl}`
        )
      : Promise.resolve({ ok: false, error: 'No phone/sms opt-out' }),
  ]);

  return results;
}
