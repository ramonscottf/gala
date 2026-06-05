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
import { sendEmail, galaEmailHtml, sendSMS } from './_notify.js';
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

  // ── 2. Load send copy. DB-first since marketing_sends is the canonical
  //      source for the pipeline (admin can edit copy live), and there are
  //      DB rows that don't have entries in the in-code SENDS registry
  //      (e.g. s11n, s12n added after registry was frozen). Fall back to
  //      SENDS only for legacy IDs that haven't been migrated to the DB.
  //      Failure mode if neither has it → 404 "Unknown sendId".
  let send = null;
  try {
    const live = await db.prepare(
      `SELECT subject, body, channel, audience, title, reply_to
         FROM marketing_sends
        WHERE send_id = ?`
    ).bind(sendId).first();
    if (live) {
      send = {
        subject:  live.subject  || '',
        body:     live.body     || '',
        audience: live.audience || 'Unknown',
        type:    (live.channel  || 'email').toLowerCase(),
        title:    live.title    || sendId,
        reply_to: live.reply_to || null,
      };
    }
  } catch (e) {
    console.error('marketing_sends lookup failed (non-fatal, will try SENDS):', e.message);
  }

  // Legacy fallback: SENDS in-code registry (for IDs not migrated to DB).
  if (!send) {
    const baseSend = SENDS[sendId];
    if (!baseSend) {
      return jsonError(`Unknown sendId: ${sendId}`, 404);
    }
    send = { ...baseSend };
  }

  // marketing_edits is the older legacy override store — still consulted
  // in case a copy edit lives there. The DB-first path above already has
  // the live copy, so this only kicks in for SENDS-only sends.
  try {
    const legacy = await db.prepare(
      `SELECT subject_override, body_override
         FROM marketing_edits
        WHERE send_id = ?`
    ).bind(sendId).first();
    if (legacy && (legacy.subject_override || legacy.body_override)) {
      send = {
        ...send,
        subject: legacy.subject_override || send.subject,
        body:    legacy.body_override    || send.body,
      };
    }
  } catch (e) {
    console.error('marketing_edits lookup failed (non-fatal):', e.message);
  }

  // Need subject+body to actually fire something.
  if (!send.subject && !send.body) {
    return jsonError(
      `Send ${sendId} has no subject or body — edit it in marketing-flow before sending`,
      400
    );
  }

  // ── 3. Channel-specific preflight ──────────────────────────────────────
  const channel = (send.type || 'email').toLowerCase();
  if (channel === 'email' && !sponsor.email) {
    return jsonError('Sponsor has no email on file', 400);
  }
  if (channel === 'sms') {
    // SMS catch-up uses the SAME recipient rule as the bulk SMS pipeline
    // (marketing-sms-send-now.js): a sponsor with a phone number on file in
    // the targeted audience. There is no separate opt-in flag in the schema
    // — bulk marketing SMS already goes to these exact sponsors on phone
    // presence alone, via the A2P-registered messaging service. Catch-up is
    // the same message to the same audience, just to someone who missed the
    // scheduled send (or joined the tier after it fired), so the consent
    // posture is identical. We refuse only when there's no phone to send to.
    if (!(sponsor.phone && String(sponsor.phone).trim())) {
      return jsonError('Sponsor has no phone on file', 400);
    }
  }

  // ── 4. Substitute {TOKEN} ──────────────────────────────────────────────
  const subForRecipient = (str) =>
    String(str || '').replaceAll('{TOKEN}', sponsor.rsvp_token);

  const subjectForRecipient = subForRecipient(send.subject);
  const bodyForRecipient = subForRecipient(send.body);

  // ── 5. Send ────────────────────────────────────────────────────────────
  const runId = 'catchup-' + crypto.randomUUID();
  const sentBy = 'admin-catchup';
  // Name the actual recipient — a single-sponsor resend, NOT a tier blast.
  // Logging "Catch-up: <original audience>" (e.g. "Catch-up: Platinum
  // Sponsors") made a 1-sponsor resend read tier-wide in the activity feeds.
  const audienceLabel = 'Catch-up → ' + (sponsor.company || displayName(sponsor) || ('sponsor #' + sponsorId));
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
        replyTo: send.reply_to || 'smiggin@dsdmail.net',
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
    // Plain SMS — bodyForRecipient is the marketing_sends SMS body with
    // {TOKEN} substituted. No MMS hero (disabled 2026-05-27 — carrier
    // filtering). Mirrors marketing-sms-send-now.js's send path.
    try {
      const res = await sendSMS(env, sponsor.phone, bodyForRecipient);
      if (!res.ok) {
        status = 'failed';
        errorMessage = res.error || 'Twilio returned not-ok';
      } else {
        resendId = res.sid || null; // store Twilio sid for traceability
      }
    } catch (e) {
      status = 'failed';
      errorMessage = e.message;
    }
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
