import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';
import { hasSponsorArchiveSupport } from '../_gala_data.js';

/**
 * /api/gala/admin/sponsors-with-tracking
 *
 * Returns the sponsor list enriched with email tracking aggregates from
 * marketing_email_events (joined via marketing_send_log.resend_id) and
 * portal activity (rsvp_completed_at, seats assigned, last seat-pick time).
 *
 * Designed as a single payload for the Sponsors React island so the
 * dashboard can render the full pipeline (Invite → Opened → Clicked →
 * Picked → Finalized) without N+1 queries.
 *
 * Each sponsor object includes:
 *   - all base sponsor fields (snake_case from D1)
 *   - seats_assigned (count from seat_assignments)
 *   - last_send (most recent marketing_send_log row: resend_id, sent_at,
 *     subject, channel, status)
 *   - email_events (array of recent marketing_email_events rows for the
 *     latest send: type, occurred_at, click_link, etc.)
 *   - tracking_summary: { sent_at, delivered_at, opened_at, opened_count,
 *     clicked_at, clicked_count, bounced_at, complained_at, last_event_at }
 *
 * Status derivation happens client-side from these primitives.
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const archiveSupported = await hasSponsorArchiveSupport(env);

  // 1. Pull all sponsors with seat-assignment counts (same shape as
  //    /api/gala/sponsors but no filters — the React island filters in JS).
  let sql = `
    SELECT s.id, s.company, s.first_name, s.last_name, s.email, s.phone,
           s.sponsorship_tier, s.seats_purchased, s.amount_paid, s.payment_status,
           s.street_address, s.city, s.state, s.zip,
           s.rsvp_status, s.rsvp_token, s.rsvp_completed_at,
           s.seats_priority_order, s.notes,
           s.created_at, s.updated_at,
           COALESCE(sa.assigned, 0) AS seats_assigned,
           sa.last_assigned_at
      FROM sponsors s
      LEFT JOIN (
        SELECT sponsor_id,
               COUNT(*) AS assigned,
               MAX(assigned_at) AS last_assigned_at
          FROM seat_assignments
         WHERE sponsor_id IS NOT NULL
         GROUP BY sponsor_id
      ) sa ON sa.sponsor_id = s.id
     WHERE 1=1
  `;
  if (archiveSupported) sql += ' AND s.archived_at IS NULL';
  sql += ' ORDER BY s.seats_priority_order, s.company';

  const sponsorsRes = await env.GALA_DB.prepare(sql).all();
  const sponsors = sponsorsRes.results || [];
  if (sponsors.length === 0) return jsonOk({ sponsors: [] });

  const sponsorIds = sponsors.map(s => s.id);

  // 2. Pull the latest send per sponsor from marketing_send_log.
  //    We use the most recent row keyed by sent_at — this is the "current"
  //    invite the sponsor is engaging with. Older sends are visible in the
  //    expanded timeline via a separate fetch if Scott needs them.
  const placeholders = sponsorIds.map(() => '?').join(',');
  const latestSendsRes = await env.GALA_DB.prepare(`
    SELECT msl.sponsor_id, msl.send_id, msl.send_run_id, msl.channel,
           msl.recipient_email, msl.recipient_phone, msl.recipient_name,
           msl.audience_label, msl.status, msl.subject, msl.body_preview,
           msl.sent_at, msl.sent_by, msl.resend_id, msl.error_message
      FROM marketing_send_log msl
     INNER JOIN (
       SELECT sponsor_id, MAX(sent_at) AS max_sent_at
         FROM marketing_send_log
        WHERE sponsor_id IN (${placeholders})
          AND status IN ('sent', 'test')
        GROUP BY sponsor_id
     ) latest ON latest.sponsor_id = msl.sponsor_id AND latest.max_sent_at = msl.sent_at
  `).bind(...sponsorIds).all();

  const latestSends = latestSendsRes.results || [];
  const sendBySponsorId = {};
  const resendIds = [];
  for (const row of latestSends) {
    sendBySponsorId[row.sponsor_id] = row;
    if (row.resend_id) resendIds.push(row.resend_id);
  }

  // 3. Pull all email events for the relevant resend_ids.
  let eventsByResendId = {};
  if (resendIds.length > 0) {
    const eventPlaceholders = resendIds.map(() => '?').join(',');
    const eventsRes = await env.GALA_DB.prepare(`
      SELECT resend_id, event_type, recipient_email, click_link,
             bounce_type, bounce_reason, user_agent, ip_address,
             occurred_at, received_at
        FROM marketing_email_events
       WHERE resend_id IN (${eventPlaceholders})
       ORDER BY occurred_at ASC
    `).bind(...resendIds).all();

    for (const ev of (eventsRes.results || [])) {
      if (!eventsByResendId[ev.resend_id]) eventsByResendId[ev.resend_id] = [];
      eventsByResendId[ev.resend_id].push(ev);
    }
  }

  // 4. Compose response.
  const enriched = sponsors.map(s => {
    const send = sendBySponsorId[s.id] || null;
    const events = (send && send.resend_id) ? (eventsByResendId[send.resend_id] || []) : [];

    // Aggregate tracking summary from events. Multiple opens/clicks possible.
    let summary = {
      sent_at: send ? send.sent_at : null,
      delivered_at: null,
      opened_at: null,
      opened_count: 0,
      clicked_at: null,
      clicked_count: 0,
      bounced_at: null,
      bounce_type: null,
      complained_at: null,
      last_event_at: null,
    };

    for (const ev of events) {
      summary.last_event_at = ev.occurred_at;
      switch (ev.event_type) {
        case 'email.delivered':
          if (!summary.delivered_at) summary.delivered_at = ev.occurred_at;
          break;
        case 'email.opened':
          if (!summary.opened_at) summary.opened_at = ev.occurred_at;
          summary.opened_count++;
          break;
        case 'email.clicked':
          if (!summary.clicked_at) summary.clicked_at = ev.occurred_at;
          summary.clicked_count++;
          break;
        case 'email.bounced':
          summary.bounced_at = ev.occurred_at;
          summary.bounce_type = ev.bounce_type;
          break;
        case 'email.complained':
          summary.complained_at = ev.occurred_at;
          break;
      }
    }

    return {
      ...s,
      last_send: send,
      email_events: events,
      tracking_summary: summary,
    };
  });

  return jsonOk({ sponsors: enriched, generated_at: new Date().toISOString() });
}
