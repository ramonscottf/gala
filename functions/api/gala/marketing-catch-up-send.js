// /api/gala/marketing-catch-up-send
// POST { sponsorId, sendId } — replay an already-fired marketing touchpoint
// to one specific sponsor. Used when a sponsor's tier changes after the
// audience-wide send has gone out (e.g. Big West Oil promoted from
// Individual Seats to Platinum on 2026-05-12 after Platinum Opens shipped
// 2026-05-11) or when a single sponsor needs a resend for any other reason.
//
// Behavior:
//   1. Load sponsor row. Refuse if archived, no email (for email), no phone
//      (for SMS), or no rsvp_token (would ship dead-link).
//   2. Load send copy with the same priority chain as marketing-test.js:
//      marketing_sends (live) → marketing_edits (legacy) → in-code SENDS.
//   3. Substitute {TOKEN} with sponsor's rsvp_token.
//   4. Render with sponsor's first_name (or company) and SEND IT FOR REAL
//      — no test banner, no [TEST] subject prefix.
//   5. Log one row to marketing_send_log with sent_by='admin-catchup'
//      and audience_label='Catch-up: <original audience>' so the row
//      shows up in the sponsor timeline and is filterable from regular
//      bulk-send analytics.
//
// Phase 5.16 (2026-05-12) — sponsor-card composer "Resend a marketing
// piece" surface.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { sendEmail, galaEmailHtml } from './_notify.js';
import { displayName } from './_audience.js';
import { SENDS } from './marketing-test.js';

export async function onRequestPost({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) {
    return jsonError('Unauthorized', 401);
  }

  let payload;
  try { payload = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const sponsorId = Number(payload?.sponsorId);
  const sendId = String(payload?.sendId || '').trim();
  if (!sponsorId) return jsonError('sponsorId required', 400);
  if (!sendId) return jsonError('sendId required', 400);

  const db = env.GALA_DB;
  if (!db) return jsonError('GALA_DB not bound', 500);

  // ── 1. Load sponsor ────────────────────────────────────────────────────
  const sponsor = await db.prepare(
    `SELECT id, company, first_name, last_name, email, phone,
            sponsorship_tier, rsvp_token, archived_at
       FROM sponsors
      WHERE id = ?`
  ).bind(sponsorId).first();

  if (!sponsor) return jsonError(`Sponsor ${sponsorId} not found`, 404);
  if (sponsor.archived_at) {
    return jsonError('Sponsor is archived — unarchive before sending', 400);
  }
  if (!sponsor.rsvp_token) {
    return jsonError(
      'Sponsor has no rsvp_token — re-issue invite before catch-up',
      400
    );
  }

  // ── 2. Load send copy (same priority chain as marketing-test.js) ───────
  const baseSend = SENDS[sendId];
  if (!baseSend) {
    return jsonError(`Unknown sendId: ${sendId}`, 404);
  }

  let send = baseSend;
  try {
    const live = await db.prepare(
      `SELECT subject, body, channel, audience
         FROM marketing_sends
        WHERE send_id = ?`
    ).bind(sendId).first();
    if (live && (live.subject || live.body)) {
      send = {
        ...baseSend,
        subject: live.subject || baseSend.subject,
        body: live.body || baseSend.body,
        audience: live.audience || baseSend.audience,
        // marketing_sends.channel is the canonical channel; baseSend.type
        // is the in-code default.
        type: (live.channel || baseSend.type || 'email').toLowerCase(),
      };
    } else {
      // Legacy fallback to marketing_edits (kept until that tool retires).
      const legacy = await db.prepare(
        `SELECT subject_override, body_override
           FROM marketing_edits
          WHERE send_id = ?`
      ).bind(sendId).first();
      if (legacy && (legacy.subject_override || legacy.body_override)) {
        send = {
          ...baseSend,
          subject: legacy.subject_override || baseSend.subject,
          body: legacy.body_override || baseSend.body,
        };
      }
    }
  } catch (e) {
    console.error('Override fetch failed, falling back to in-code:', e.message);
  }

  // ── 3. Channel-specific preflight ──────────────────────────────────────
  const channel = (send.type || 'email').toLowerCase();
  if (channel === 'email' && !sponsor.email) {
    return jsonError('Sponsor has no email on file', 400);
  }
  if (channel === 'sms') {
    // SMS catch-up is intentionally not yet supported for sponsors —
    // the sponsors table doesn't carry an opt-in flag yet, and TCPA
    // forbids sending SMS to anyone who hasn't explicitly consented.
    // When we add a sponsor opt-in surface (likely Phase 5.17 of the
    // marketing pipeline), this branch can be unblocked. Until then,
    // refuse rather than guess.
    return jsonError(
      'SMS catch-up not yet supported for sponsors (no opt-in flag on the schema). ' +
      'Email touchpoints work — use those, or send a text manually via the Compose text button.',
      400
    );
  }

  // ── 4. Substitute {TOKEN} ──────────────────────────────────────────────
  const subForRecipient = (str) =>
    String(str || '').replaceAll('{TOKEN}', sponsor.rsvp_token);

  const subjectForRecipient = subForRecipient(send.subject);
  const bodyForRecipient = subForRecipient(send.body);

  // ── 5. Send ────────────────────────────────────────────────────────────
  const runId = 'catchup-' + crypto.randomUUID();
  const sentBy = 'admin-catchup';
  const audienceLabel = 'Catch-up: ' + (send.audience || baseSend.audience || 'Unknown');
  const bodyPreview = stripHtml(bodyForRecipient).slice(0, 200);
  const recipientName = displayName(sponsor);

  let status = 'sent';
  let errorMessage = null;
  let resendId = null;
  let sentAt = new Date().toISOString();

  if (channel === 'email') {
    const html = galaEmailHtml({
      firstName: sponsor.first_name || sponsor.company || null,
      body: bodyForRecipient,
      // No footerLine — let the template default (matches bulk sends).
    });

    try {
      const res = await sendEmail(env, {
        to: sponsor.email,
        subject: subjectForRecipient,
        html,
        replyTo: 'smiggin@dsdmail.net',
      });
      if (!res.ok || !res.id) {
        status = 'failed';
        errorMessage = res.error || 'SkippyMail returned ok but no resend_id (silent drop)';
      } else {
        resendId = res.id;
      }
    } catch (e) {
      status = 'failed';
      errorMessage = e.message;
    }
  } else if (channel === 'sms') {
    // Unreachable — blocked at preflight above until sponsor SMS opt-in
    // is modeled. Kept structurally so a future Skippy implementing
    // sponsor opt-in only has to flip the preflight, not re-add the
    // send logic. If you're reading this and adding sponsor SMS, see
    // the comment block at the preflight check.
    return jsonError('SMS catch-up path not yet enabled', 400);
  } else {
    return jsonError(`Unsupported channel: ${channel}`, 400);
  }

  // ── 6. Log (always, success or failure) ────────────────────────────────
  // Mirrors marketing-send-now.js schema. sent_by='admin-catchup' makes
  // catch-up rows filterable from bulk runs in analytics. recipient_phone
  // stays NULL for email sends; resend_id holds the SkippyMail/Resend
  // tracking id when present (lets per-row email tracking events tie back
  // to this log entry via the existing email-events webhook path).
  try {
    await db.prepare(`
      INSERT INTO marketing_send_log (
        send_id, send_run_id, channel, recipient_email, recipient_phone,
        recipient_name, sponsor_id, audience_label, status, error_message,
        subject, body_preview, sent_by, resend_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sendId,
      runId,
      channel,
      channel === 'email' ? sponsor.email : null,
      channel === 'sms' ? (sponsor.phone || null) : null,
      recipientName,
      sponsor.id,
      audienceLabel,
      status,
      errorMessage,
      subjectForRecipient,
      bodyPreview,
      sentBy,
      resendId
    ).run();
  } catch (e) {
    // Log write failure is non-fatal for the send but we surface it so the
    // UI can warn admin that the timeline won't reflect this replay.
    console.error('marketing_send_log write failed:', e.message);
    return jsonOk({
      ok: status === 'sent',
      sentAt,
      sendId,
      sponsorId: sponsor.id,
      recipient: channel === 'email' ? sponsor.email : sponsor.phone,
      channel,
      resendId,
      warning: 'Send completed but timeline log write failed: ' + e.message,
      error: errorMessage,
    });
  }

  if (status === 'failed') {
    return jsonError(errorMessage || 'Send failed', 502);
  }

  return jsonOk({
    ok: true,
    sentAt,
    sendId,
    sponsorId: sponsor.id,
    recipient: channel === 'email' ? sponsor.email : sponsor.phone,
    channel,
    resendId,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
