// GET /api/gala/admin/sponsor-pipeline?sponsor_id=X
//
// Per-sponsor view of the marketing pipeline. For each scheduled send,
// derives status: sent | missed | not-targeted | upcoming.
//
//   would_have_received  = sponsor's tier was in the resolved audience tier list
//   actually_received    = a marketing_send_log row exists with status='sent'
//                          for (send_id, sponsor.id) — preferring sponsor_id
//                          match, falling back to recipient_email match
//
//   sent          = would_have_received && actually_received
//   missed        = would_have_received && !actually_received && date < today
//   upcoming      = would_have_received && !actually_received && date >= today
//   not-targeted  = !would_have_received
//
// Tier-at-time-of-send is NOT snapshotted — status uses CURRENT tier. This
// is documented in the plan as a known trade-off. If a sponsor changed tiers
// mid-cycle, past sends may show as 'not-targeted' or 'missed' that weren't
// at the actual time of the send. Acceptable until it bites.
//
// Audit: the sender is gala admin (cookie SSO), so no per-row auth narrowing.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';
import { resolveAudience } from '../_audience.js';

export async function onRequestGet({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) {
    return jsonError('Unauthorized', 401);
  }
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const url = new URL(request.url);
  const sponsorId = Number(url.searchParams.get('sponsor_id'));
  if (!sponsorId) return jsonError('sponsor_id required', 400);

  const db = env.GALA_DB;

  // 1) Sponsor row
  const sponsor = await db.prepare(
    `SELECT id, company, first_name, last_name, email, phone, sponsorship_tier
       FROM sponsors WHERE id = ?`
  ).bind(sponsorId).first();
  if (!sponsor) return jsonError('Sponsor not found', 404);

  // 2) Pull all scheduled sends (mirror marketing-pipeline.js GET shape minus the log aggregate)
  const { results: sends } = await db.prepare(
    `SELECT send_id, phase, phase_title, phase_color, phase_desc, phase_range,
            channel, date, time, audience, status, title, subject, body, notes,
            sort_order
       FROM marketing_sends
       ORDER BY phase, sort_order`
  ).all();

  // 3) Pull all log rows for this sponsor in one shot — match by sponsor_id OR
  //    recipient email (legacy rows may have NULL sponsor_id). Index on send_id
  //    keyed map for fast lookup. Only 'sent' status counts as "received".
  const sponsorEmail = (sponsor.email || '').toLowerCase();
  const logRows = await db.prepare(
    `SELECT send_id, status, sent_at, recipient_email
       FROM marketing_send_log
       WHERE (sponsor_id = ?)
          OR (sponsor_id IS NULL AND LOWER(recipient_email) = ?)`
  ).bind(sponsorId, sponsorEmail).all();

  // First successful send wins for received_at; ignore failed rows for status
  // derivation but the UI may want to surface failures separately later.
  const receivedBySendId = new Map();
  for (const row of (logRows.results || [])) {
    if (row.status !== 'sent') continue;
    const existing = receivedBySendId.get(row.send_id);
    if (!existing || (row.sent_at && row.sent_at < existing)) {
      receivedBySendId.set(row.send_id, row.sent_at);
    }
  }

  // 4) Audience-resolution cache. Most sends share an audience string ("Confirmed
  //    Buyers", "Platinum Sponsors") so we resolve each one at most once and only
  //    keep the tier list — we don't need the recipients array for this query.
  const audienceCache = new Map();
  async function resolveTiers(audienceLabel) {
    const key = audienceLabel || '';
    if (audienceCache.has(key)) return audienceCache.get(key);
    const { tiers } = await resolveAudience(audienceLabel, db);
    audienceCache.set(key, tiers || []);
    return tiers || [];
  }

  const sponsorTier = sponsor.sponsorship_tier || '';
  const todayIso = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // 5) Walk each send and derive per-row status
  const phasesById = new Map();
  const summary = { total_sends: 0, received: 0, missed: 0, not_targeted: 0, upcoming: 0 };

  for (const s of sends) {
    summary.total_sends++;
    const tiers = await resolveTiers(s.audience);
    const wouldHaveReceived = sponsorTier && tiers.includes(sponsorTier);
    const receivedAt = receivedBySendId.get(s.send_id) || null;
    const actuallyReceived = !!receivedAt;

    let status;
    if (!wouldHaveReceived) status = 'not-targeted';
    else if (actuallyReceived) status = 'sent';
    else if (s.date && s.date < todayIso) status = 'missed';
    else status = 'upcoming';

    if (status === 'sent') summary.received++;
    else if (status === 'missed') summary.missed++;
    else if (status === 'upcoming') summary.upcoming++;
    else summary.not_targeted++;

    if (!phasesById.has(s.phase)) {
      phasesById.set(s.phase, {
        phase: s.phase,
        title: s.phase_title,
        color: s.phase_color,
        desc: s.phase_desc,
        range: s.phase_range,
        sends: [],
      });
    }
    phasesById.get(s.phase).sends.push({
      send_id: s.send_id,
      title: s.title,
      date: s.date,
      time: s.time,
      channel: s.channel,
      audience: s.audience,
      subject: s.subject,
      body: s.body,
      would_have_received: wouldHaveReceived,
      actually_received: actuallyReceived,
      received_at: receivedAt,
      status,
    });
  }

  const phases = [...phasesById.values()].sort((a, b) => a.phase - b.phase);

  return jsonOk({
    sponsor: {
      id: sponsor.id,
      company: sponsor.company,
      first_name: sponsor.first_name,
      last_name: sponsor.last_name,
      email: sponsor.email,
      phone: sponsor.phone,
      sponsorship_tier: sponsor.sponsorship_tier,
    },
    phases,
    summary,
  });
}
