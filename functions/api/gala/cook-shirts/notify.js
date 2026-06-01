// /api/gala/cook-shirts/notify
// POST (admin only) — email and/or text the kitchen crew their shirt-size link.
//
// Body: { channel?: "email"|"sms"|"both" (default "both"),
//         awaitingOnly?: bool (only those who haven't responded),
//         copyScott?: bool (default true — send Scott a copy so he can verify),
//         testTo?: { name, email, phone }  // if set, send ONLY to this one }
//
// Email goes from gala@daviskids.org with Reply-To: sfoster@dsdmail.net.
// SMS goes through the DEF Twilio messaging service with a STOP opt-out line.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';
import { sendEmail, sendSMS } from '../_notify.js';

const PAGE = 'https://daviskids.org/gala-cook-shirts';
const REPLY_TO = 'sfoster@dsdmail.net';
const SUBJECT = 'Your DEF Gala crew shirt — grab your size';
const SCOTT = { name: 'Scott', email: 'sfoster@dsdmail.net', phone: '+18018106642' };

function firstNameOf(name) {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

function smsBody(name) {
  const first = firstNameOf(name);
  return `Hi ${first}! Thanks for signing up to help serve at the DEF Gala on Wed, June 10. `
    + `We've got a crew shirt for you — grab your size (takes ~15 sec): ${PAGE}  `
    + `Questions? Reply or email ${REPLY_TO}. Reply STOP to opt out.`;
}

function cookEmailHtml(name) {
  const first = firstNameOf(name);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  table { border-collapse:collapse !important; }
  body { margin:0 !important; padding:0 !important; width:100% !important; background-color:#ffffff !important; }
  a { color:#c8102e; text-decoration:none; }
  @media screen and (max-width:620px){
    .container{width:100% !important;} .card-pad{padding-left:24px !important;padding-right:24px !important;}
    .h1{font-size:24px !important;line-height:30px !important;} .gala-mark{font-size:28px !important;letter-spacing:2px !important;}
    .neon-bar{height:6px !important;} .outer-pad{padding:16px !important;}
  }
</style></head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">You signed up to help serve dinner at the DEF Gala on June 10 — we just need your t-shirt size. Takes about 15 seconds.</div>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff" style="background-color:#ffffff;">
  <tr><td align="center" class="outer-pad" style="padding:32px 20px;background-color:#ffffff;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px;max-width:600px;">
      <tr><td style="padding:0;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f5f9;border:1px solid #c5cdd9;border-radius:12px;box-shadow:0 12px 32px rgba(13,27,61,0.18), 0 4px 12px rgba(13,27,61,0.10);overflow:hidden;">
          <tr><td height="8" class="neon-bar" style="height:8px;line-height:8px;font-size:0;background:#0066ff;background:linear-gradient(90deg,#0066ff 0%,#c8102e 100%);" bgcolor="#c8102e">&nbsp;</td></tr>
          <tr><td align="center" bgcolor="#0d1b3d" style="background-color:#0d1b3d;padding:32px 32px 28px 32px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <div style="font-size:11px;letter-spacing:3px;color:#9bb0d4;text-transform:uppercase;font-weight:600;margin-bottom:12px;">Davis Education Foundation</div>
            <div class="gala-mark" style="font-size:38px;font-weight:900;letter-spacing:4px;color:#ffffff;text-transform:uppercase;line-height:1;"><span style="color:#ffb400;">Gala</span> <span style="color:#ffffff;">2026</span></div>
            <div style="font-size:13px;color:#ffffff;margin-top:14px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;"><span style="color:#ff5252;">&bull;</span>&nbsp; Lights, Camera, Take Action!  &nbsp;<span style="color:#ff5252;">&bull;</span></div>
          </td></tr>
          <tr><td height="6" class="neon-bar" style="height:6px;line-height:6px;font-size:0;background:#ffb400;background:linear-gradient(90deg,#c8102e 0%,#0066ff 100%);" bgcolor="#0066ff">&nbsp;</td></tr>
          <tr><td align="center" style="padding:14px 24px;background-color:#0a1530;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;" bgcolor="#0a1530">Wednesday &middot; June 10, 2026 &middot; Megaplex Centerville</td></tr>
          <tr><td class="card-pad" style="padding:28px 40px 8px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;">
            <p style="margin:0 0 16px 0;font-size:18px;line-height:26px;color:#1a1a1a;font-weight:600;">Hi ${first},</p>
            <h1 class="h1" style="margin:0 0 18px 0;font-size:28px;line-height:34px;color:#0d1b3d;font-weight:800;letter-spacing:-0.3px;">We&rsquo;ve got a shirt for you</h1>
          </td></tr>
          <tr><td class="card-pad" style="padding:0 40px 18px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 16px 0;font-size:16px;line-height:25px;color:#3d3d3d;">Thank you for signing up to help serve dinner at this year&rsquo;s Gala on <strong style="color:#0d1b3d;">Wednesday, June 10</strong>. We&rsquo;re so glad to have the pros from Davis School District Nutrition Services with us &mdash; you&rsquo;re going to make the night.</p>
            <p style="margin:0;font-size:16px;line-height:25px;color:#3d3d3d;">We&rsquo;re getting a crew shirt ready for each of you, and we just need your size. Tap below to pick it &mdash; it takes about 15 seconds, and you can see the shirt and a quick fit guide right on the page.</p>
          </td></tr>
          <tr><td align="center" class="card-pad" style="padding:18px 40px 32px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
              <td align="center" bgcolor="#c8102e" style="border-radius:8px;background-color:#c8102e;box-shadow:0 2px 6px rgba(200,16,46,0.3);">
                <a href="${PAGE}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.5px;border-radius:8px;">Grab your shirt size  &rarr;</a>
              </td>
            </tr></table>
          </td></tr>
          <tr><td class="card-pad" style="padding:0 40px 8px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 18px 0;font-size:15px;line-height:24px;color:#3d3d3d;">Questions about the night? Just reply to this email &mdash; we&rsquo;re happy to help.</p>
            <p style="margin:0 0 32px 0;font-size:15px;line-height:24px;color:#3d3d3d;">&mdash; Sherry, Kara, and the entire DEF team</p>
          </td></tr>
          <tr><td class="card-pad" style="padding:0 40px;"><div style="border-top:1px solid #c5cdd9;height:1px;line-height:1px;font-size:0;">&nbsp;</div></td></tr>
          <tr><td class="card-pad" align="center" style="padding:24px 40px 28px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px 0;font-size:12px;line-height:18px;color:#666;"><strong style="color:#0d1b3d;">Davis Education Foundation</strong> &middot; Gala 2026</p>
            <p style="margin:0;font-size:12px;line-height:18px;color:#666;"><a href="https://daviskids.org" style="color:#666;text-decoration:underline;">daviskids.org</a> &nbsp;&middot;&nbsp; Questions? <a href="mailto:${REPLY_TO}" style="color:#666;text-decoration:underline;">Reply to this email</a></p>
          </td></tr>
          <tr><td height="6" class="neon-bar" style="height:6px;line-height:6px;font-size:0;background:#0066ff;background:linear-gradient(90deg,#0066ff 0%,#c8102e 100%);" bgcolor="#c8102e">&nbsp;</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function notifyOne(env, cook, channel) {
  const out = { name: cook.name, email: cook.email, phone: cook.phone };
  if ((channel === 'email' || channel === 'both') && cook.email) {
    out.email_result = await sendEmail(env, {
      to: cook.email, subject: SUBJECT, html: cookEmailHtml(cook.name), replyTo: REPLY_TO,
    });
  }
  if ((channel === 'sms' || channel === 'both') && cook.phone) {
    out.sms_result = await sendSMS(env, cook.phone, smsBody(cook.name));
  }
  return out;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch { /* allow empty body */ }
  const channel = ['email', 'sms', 'both'].includes(body.channel) ? body.channel : 'both';

  // Single test recipient
  if (body.testTo && (body.testTo.email || body.testTo.phone)) {
    const r = await notifyOne(env, body.testTo, channel);
    return jsonOk({ test: true, channel, result: r });
  }

  let sql = 'SELECT name, email, phone FROM cook_shirts';
  if (body.awaitingOnly) sql += ' WHERE responded = 0';
  sql += ' ORDER BY name COLLATE NOCASE ASC';
  const { results } = await env.GALA_DB.prepare(sql).all();
  const cooks = results || [];

  const sent = [];
  for (const c of cooks) sent.push(await notifyOne(env, c, channel));

  let scott = null;
  if (body.copyScott !== false) scott = await notifyOne(env, SCOTT, channel);

  const emailOk = sent.filter(s => s.email_result?.ok).length;
  const smsOk = sent.filter(s => s.sms_result?.ok).length;
  return jsonOk({ channel, recipients: cooks.length, emailOk, smsOk, sent, scott });
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
