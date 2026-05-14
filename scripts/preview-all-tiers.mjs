// scripts/preview-all-tiers.mjs
//
// Renders all six tier-open emails using the canonical galaEmailHtml
// wrapper and writes each to /mnt/user-data/outputs/ for visual inspection.

import { writeFileSync } from 'node:fs';
import {
  PLATINUM_BODY,
  GOLD_BODY,
  SILVER_BODY,
  BRONZE_BODY,
  FRIENDS_FAMILY_BODY,
  INDIVIDUAL_SEATS_BODY,
} from './tier-open-email-bodies.mjs';

function galaEmailHtml({ firstName, body, footerLine }) {
  const foot = footerLine || 'Davis Education Foundation · Gala 2026 · June 10, 2026';
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
          <tr><td class="card-pad" align="center" style="padding:24px 40px 8px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 14px 0;font-size:12px;line-height:18px;color:#666;"><strong style="color:#0d1b3d;">${foot}</strong></p>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr><td style="padding:6px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#666;text-align:center;">
                <span style="color:#0d1b3d;font-weight:600;">Sponsorship &amp; gala questions</span><br/>
                Sherry Miggin &nbsp;·&nbsp; <a href="tel:+18014024483" style="color:#666;text-decoration:none;">801-402-4483</a> &nbsp;·&nbsp; <a href="mailto:smiggin@dsdmail.net" style="color:#666;text-decoration:underline;">smiggin@dsdmail.net</a>
              </td></tr>
              <tr><td style="padding:6px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#666;text-align:center;">
                <span style="color:#0d1b3d;font-weight:600;">Technical help</span><br/>
                Scott Foster &nbsp;·&nbsp; <a href="tel:+18018106642" style="color:#666;text-decoration:none;">801-810-6642</a> &nbsp;·&nbsp; <a href="mailto:sfoster@dsdmail.net" style="color:#666;text-decoration:underline;">sfoster@dsdmail.net</a>
              </td></tr>
            </table>
          </td></tr>
          <tr><td class="card-pad" align="center" style="padding:8px 40px 24px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:12px;line-height:18px;color:#888;"><a href="https://daviskids.org" style="color:#888;text-decoration:underline;">daviskids.org</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const tiers = [
  ['platinum', 'Mike',   PLATINUM_BODY],
  ['gold',     'Mike',   GOLD_BODY],
  ['silver',   'Alex',   SILVER_BODY],
  ['bronze',   'Jamie',  BRONZE_BODY],
  ['ff',       'Casey',  FRIENDS_FAMILY_BODY],
  ['individual','Riley', INDIVIDUAL_SEATS_BODY],
];

for (const [slug, firstName, body] of tiers) {
  const bodyWithToken = body.replace(/\{TOKEN\}/g, `preview${slug}token`);
  const html = galaEmailHtml({ firstName, body: bodyWithToken });
  const path = `/mnt/user-data/outputs/${slug}-email-preview.html`;
  writeFileSync(path, html);
  console.log(`Wrote ${path} (${body.length} chars)`);
}
