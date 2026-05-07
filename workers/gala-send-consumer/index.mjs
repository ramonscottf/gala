// gala-send-consumer
//
// Cloudflare Queue consumer that handles bulk gala marketing sends.
// Triggered by messages on `gala-marketing-send`. Each message represents
// ONE recipient. Worker:
//
//   1. Pulls message body { sendId, runId, recipient, sendRow }
//   2. Renders the v6 brand-wrapped HTML
//   3. Sends via SkippyMail (mail.fosterlabs.org/send)
//   4. Logs result to marketing_send_log (D1)
//   5. ack() on success, retry() up to 3x on transient failure, DLQ if persistent
//
// Why this exists: Pages Functions have a 30s wall when client disconnects.
// On May 7 2026, a send to 91 sponsors stalled at 78 because the browser
// dropped the request and the worker got cancelled. Queue consumers run
// independently of any HTTP request, with their own 30s CPU budget per
// MESSAGE — not per batch. This scales to 50,000+ sends without timeout.
//
// Bindings (set in wrangler.toml):
//   MAIL_TOKEN      — secret, SkippyMail bearer
//   GALA_DB         — D1 binding to gala-seating
//   QUEUE           — producer binding to gala-marketing-send (for self-enqueue if needed)

const MAIL_ENDPOINT = 'https://mail.fosterlabs.org/send';

export default {
  async queue(batch, env, ctx) {
    for (const msg of batch.messages) {
      try {
        await processOne(msg.body, env);
        msg.ack();
      } catch (err) {
        // Transient failure — retry up to message-level limits.
        // After max_retries (configured per-binding), CF will move to DLQ automatically.
        console.error(`[send-consumer] error processing ${msg.body?.recipient?.email}:`, err.message);
        msg.retry();
      }
    }
  },
};

async function processOne(body, env) {
  const { sendId, runId, recipient, sendRow } = body;
  if (!sendId || !runId || !recipient || !sendRow) {
    throw new Error('Invalid message body — missing fields');
  }

  const html = galaEmailHtml({
    firstName: recipient.first_name || recipient.company || null,
    body: sendRow.body,
  });

  let status = 'sent';
  let errorMessage = null;

  try {
    const res = await fetch(MAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.MAIL_TOKEN}`,
        'User-Agent': 'gala-send-consumer/1.0',
      },
      body: JSON.stringify({
        from: 'Davis Education Foundation Gala <gala@daviskids.org>',
        replyTo: 'gala@daviskids.org',
        to: recipient.email,
        subject: sendRow.subject,
        html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // 5xx → throw (retry). 4xx → log as failed and ack (don't retry permanent errors).
      if (res.status >= 500) {
        throw new Error(`SkippyMail ${res.status}: ${errText.slice(0, 200)}`);
      }
      status = 'failed';
      errorMessage = `SkippyMail ${res.status}: ${errText.slice(0, 200)}`;
    }
  } catch (e) {
    // Network errors → retry
    throw e;
  }

  // Always log — success OR permanent failure
  const bodyPreview = stripHtml(sendRow.body).slice(0, 200);
  await env.GALA_DB.prepare(`
    INSERT INTO marketing_send_log (
      send_id, send_run_id, channel, recipient_email, recipient_name,
      sponsor_id, audience_label, status, error_message, subject,
      body_preview, sent_by
    ) VALUES (?, ?, 'email', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    sendId, runId, recipient.email, displayName(recipient), recipient.id,
    sendRow.audience, status, errorMessage, sendRow.subject,
    bodyPreview, 'queue-consumer'
  ).run();
}

function displayName(r) {
  const fn = r.first_name || '';
  const ln = r.last_name || '';
  const full = `${fn} ${ln}`.trim();
  return full || r.company || r.email || 'Unknown';
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── v6 Brand template ─── (mirrors functions/api/gala/_notify.js galaEmailHtml)
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
