// /api/gala/marketing-pipeline
//
// Single source of truth for the gala 2026 outbound marketing schedule.
// Replaces the hardcoded PIPELINE constant in admin/index.html and the
// SENDS registry in marketing-test.js (which now also reads from here).
//
// GET    /api/gala/marketing-pipeline           → all sends, grouped by phase
// PATCH  /api/gala/marketing-pipeline/:send_id  → update editable fields
//
// Editable fields: subject, body, date, time, status, notes, audience, title
// Read-only:       send_id, phase metadata, channel, sort_order
//
// Auth: gala admin session cookie (verifyGalaAuth) — same gate as the rest
// of /api/gala/admin/* and the existing marketing-test endpoint.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';

const EDITABLE = new Set(['subject', 'body', 'date', 'time', 'status', 'notes', 'audience', 'title']);

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Auth
  const ok = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!ok) return jsonError('Unauthorized', 401);

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  if (request.method === 'GET') return handleGet(env);
  return jsonError('Method not allowed', 405);
}

async function handleGet(env) {
  const { results } = await env.GALA_DB.prepare(
    `SELECT send_id, phase, phase_title, phase_color, phase_desc, phase_range,
            channel, date, time, audience, status, title, subject, body, notes,
            sort_order, updated_at, updated_by
       FROM marketing_sends
       ORDER BY phase, sort_order`
  ).all();

  // Group by phase for the dashboard's existing render shape
  const phasesById = new Map();
  for (const r of results) {
    if (!phasesById.has(r.phase)) {
      phasesById.set(r.phase, {
        phase: r.phase,
        title: r.phase_title,
        color: r.phase_color,
        desc: r.phase_desc,
        range: r.phase_range,
        sends: [],
      });
    }
    phasesById.get(r.phase).sends.push({
      id: r.send_id,
      channel: r.channel,
      date: r.date,
      time: r.time,
      audience: r.audience,
      status: r.status,
      title: r.title,
      subject: r.subject,
      body: r.body,
      notes: r.notes,
      updated_at: r.updated_at,
      updated_by: r.updated_by,
    });
  }

  const phases = [...phasesById.values()].sort((a, b) => a.phase - b.phase);
  return jsonOk({ phases });
}
