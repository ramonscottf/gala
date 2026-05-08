// /api/gala/marketing-stats
//
// GET — returns dashboard KPIs and timeseries for the Marketing Activity card.
//
// Designed for Sherry/Kara: plain numbers, plain English, no run IDs or
// technical jargon. Powers the collapsed "X sent today, 100% delivered"
// summary AND the expanded full dashboard.
//
// Response shape:
// {
//   today:        { sent, failed, deliveryRate },
//   week:         { sent, failed, deliveryRate },
//   lifetime:     { sent, failed, deliveryRate },
//   activeRuns:   [{ runId, sendId, audience, subject, sent, failed, startedAt, lastSeen, complete }],
//   recentRuns:   [last 10 completed runs with summary],
//   campaignRollup: [{ sendId, audience, planned, sent, failed, lastSent }],
//   throughput:   [{ hour: '2026-05-07T15:00', count: 12 }, ...],   // last 24h hourly buckets
//   health: {
//     consumerLastSeen,         // most recent log row from queue-consumer
//     dlqDepth,                 // null if can't query (we'd need extra binding)
//     mailEndpointReachable,    // we'll just trust recent successes
//   }
// }

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';

export async function onRequestGet({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) return jsonError('Unauthorized', 401);

  const db = env.GALA_DB;
  if (!db) return jsonError('GALA_DB not bound', 500);

  // ── KPIs by time window ────────────────────────────────────────────
  const kpiSql = `
    SELECT
      SUM(CASE WHEN status = 'sent' AND sent_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS today_sent,
      SUM(CASE WHEN status = 'failed' AND sent_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS today_failed,
      SUM(CASE WHEN status = 'sent' AND sent_at >= datetime('now', '-7 day') THEN 1 ELSE 0 END) AS week_sent,
      SUM(CASE WHEN status = 'failed' AND sent_at >= datetime('now', '-7 day') THEN 1 ELSE 0 END) AS week_failed,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS lifetime_sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS lifetime_failed
    FROM marketing_send_log
  `;
  const kpis = await db.prepare(kpiSql).first();

  const rate = (s, f) => {
    const total = (s || 0) + (f || 0);
    if (total === 0) return null;
    return Math.round((s / total) * 1000) / 10; // one decimal
  };

  // ── Active runs (started in last 10 min, may still be processing) ─
  const activeSql = `
    SELECT
      send_run_id, send_id, audience_label, subject,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      MIN(sent_at) AS started_at,
      MAX(sent_at) AS last_seen
    FROM marketing_send_log
    WHERE sent_at >= datetime('now', '-10 minutes')
    GROUP BY send_run_id
    ORDER BY started_at DESC
    LIMIT 5
  `;
  const activeRowsRes = await db.prepare(activeSql).all();
  const activeRows = activeRowsRes.results || [];
  // A run is "active" if last_seen was in the last 90 seconds — otherwise it's complete or stalled
  const nowSql = await db.prepare(`SELECT datetime('now') AS now_utc`).first();
  const nowMs = new Date(nowSql.now_utc.replace(' ', 'T') + 'Z').getTime();
  const activeRuns = activeRows.map(r => {
    const lastSeenMs = new Date(r.last_seen.replace(' ', 'T') + 'Z').getTime();
    const ageSec = (nowMs - lastSeenMs) / 1000;
    return {
      runId: r.send_run_id,
      sendId: r.send_id,
      audience: r.audience_label,
      subject: r.subject,
      sent: r.sent || 0,
      failed: r.failed || 0,
      startedAt: r.started_at,
      lastSeen: r.last_seen,
      isActive: ageSec < 90,
    };
  });

  // ── Recent completed runs (last 10 in last 7 days) ────────────────
  const recentRunsSql = `
    SELECT
      send_run_id, send_id, audience_label, subject,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      MIN(sent_at) AS started_at,
      MAX(sent_at) AS last_seen
    FROM marketing_send_log
    WHERE sent_at >= datetime('now', '-7 day')
    GROUP BY send_run_id
    ORDER BY last_seen DESC
    LIMIT 10
  `;
  const recentRunsRes = await db.prepare(recentRunsSql).all();
  const recentRuns = (recentRunsRes.results || []).map(r => ({
    runId: r.send_run_id,
    sendId: r.send_id,
    audience: r.audience_label,
    subject: r.subject,
    sent: r.sent || 0,
    failed: r.failed || 0,
    startedAt: r.started_at,
    lastSeen: r.last_seen,
  }));

  // ── Per-campaign rollup (one row per sendId) ──────────────────────
  const rollupSql = `
    SELECT
      send_id,
      audience_label,
      subject,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      MAX(sent_at) AS last_sent
    FROM marketing_send_log
    GROUP BY send_id
    ORDER BY last_sent DESC
    LIMIT 20
  `;
  const rollupRes = await db.prepare(rollupSql).all();
  const campaignRollup = (rollupRes.results || []).map(r => ({
    sendId: r.send_id,
    audience: r.audience_label,
    subject: r.subject,
    sent: r.sent || 0,
    failed: r.failed || 0,
    lastSent: r.last_sent,
  }));

  // ── Throughput: last 24h, hourly buckets ─────────────────────────
  const throughputSql = `
    SELECT
      strftime('%Y-%m-%d %H:00', sent_at) AS hour_bucket,
      COUNT(*) AS count,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
    FROM marketing_send_log
    WHERE sent_at >= datetime('now', '-1 day')
    GROUP BY hour_bucket
    ORDER BY hour_bucket ASC
  `;
  const throughputRes = await db.prepare(throughputSql).all();
  const throughput = (throughputRes.results || []).map(r => ({
    hour: r.hour_bucket,
    count: r.count || 0,
    sent: r.sent_count || 0,
    failed: r.failed_count || 0,
  }));

  // ── Health checks ─────────────────────────────────────────────────
  const consumerSql = `
    SELECT MAX(sent_at) AS last_seen
    FROM marketing_send_log
    WHERE sent_by = 'queue-consumer'
  `;
  const consumerRow = await db.prepare(consumerSql).first();

  return jsonOk({
    today: {
      sent: kpis.today_sent || 0,
      failed: kpis.today_failed || 0,
      deliveryRate: rate(kpis.today_sent, kpis.today_failed),
    },
    week: {
      sent: kpis.week_sent || 0,
      failed: kpis.week_failed || 0,
      deliveryRate: rate(kpis.week_sent, kpis.week_failed),
    },
    lifetime: {
      sent: kpis.lifetime_sent || 0,
      failed: kpis.lifetime_failed || 0,
      deliveryRate: rate(kpis.lifetime_sent, kpis.lifetime_failed),
    },
    activeRuns,
    recentRuns,
    campaignRollup,
    throughput,
    health: {
      consumerLastSeen: consumerRow?.last_seen || null,
      nowUtc: nowSql.now_utc,
    },
  });
}
