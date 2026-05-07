// /api/gala/marketing-due-now
// GET → upcoming sends categorized by urgency:
//   - overdue: scheduled_at < now (status still 'upcoming', should have been sent)
//   - due:     scheduled_at within next 60 minutes
//   - soon:    scheduled_at within next 24 hours
//   - blocked: status='blocked' (past their window per existing logic)
//
// Date strings in marketing_sends are human-readable ("May 7", "Apr 29")
// without a year. We assume 2026 for everything (the gala year).

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';

const MONTH_MAP = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

// Parse "May 7" + "4:30 PM" → Date (assume 2026 — gala year)
function parseSendTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const dm = String(dateStr).trim().match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!dm) return null;
  const month = MONTH_MAP[dm[1].toLowerCase()];
  if (month === undefined) return null;
  const day = parseInt(dm[2], 10);
  if (isNaN(day)) return null;

  const tm = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!tm) return null;
  let hour = parseInt(tm[1], 10);
  const minute = parseInt(tm[2], 10);
  const meridiem = tm[3].toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  // Mountain Time (Sherry/Scott/Kara are all in Utah). Build a Date in MT
  // by interpreting components as MT and converting to UTC.
  // Utah is UTC-6 (MDT) from mid-Mar to early-Nov, UTC-7 (MST) otherwise.
  // Gala season (Apr–Jun 2026) is firmly in MDT (UTC-6).
  // So: scheduled UTC = local MT + 6 hours.
  return new Date(Date.UTC(2026, month, day, hour + 6, minute, 0));
}

export async function onRequestGet({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) {
    return jsonError('Unauthorized', 401);
  }

  const db = env.GALA_DB;
  if (!db) return jsonError('GALA_DB not bound', 500);

  // Pull all upcoming + blocked sends. We compute urgency in-memory
  // because the date format isn't ISO so we can't easily SQL-filter.
  const result = await db.prepare(
    `SELECT send_id, channel, audience, status, title, subject, date, time, sort_order
     FROM marketing_sends
     WHERE status IN ('upcoming', 'blocked')
     ORDER BY sort_order ASC`
  ).all();

  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  const overdue = []; // upcoming, scheduled time has passed
  const due = [];     // within next 60 min
  const soon = [];    // within next 24 hr
  const blocked = []; // status=blocked (past-window per existing flag)

  for (const row of result.results || []) {
    const scheduled = parseSendTime(row.date, row.time);
    const enriched = {
      sendId: row.send_id,
      channel: row.channel,
      audience: row.audience,
      title: row.title,
      subject: row.subject,
      date: row.date,
      time: row.time,
      status: row.status,
      scheduledAt: scheduled ? scheduled.toISOString() : null,
      msUntil: scheduled ? scheduled.getTime() - now : null,
    };

    if (row.status === 'blocked') {
      blocked.push(enriched);
      continue;
    }

    if (!scheduled) continue; // unparseable — skip silently

    const ms = scheduled.getTime() - now;
    if (ms < 0) overdue.push(enriched);
    else if (ms <= HOUR) due.push(enriched);
    else if (ms <= DAY) soon.push(enriched);
  }

  // Sort overdue by most-recent-past first (likeliest to still be relevant)
  overdue.sort((a, b) => b.msUntil - a.msUntil);
  due.sort((a, b) => a.msUntil - b.msUntil);
  soon.sort((a, b) => a.msUntil - b.msUntil);

  return jsonOk({
    now: new Date(now).toISOString(),
    overdue,
    due,
    soon,
    blocked,
    counts: {
      overdue: overdue.length,
      due: due.length,
      soon: soon.length,
      blocked: blocked.length,
    },
  });
}
