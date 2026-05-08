// /api/gala/volunteers
// GET  — list all (admin only) or counts (public with ?counts=1)
// POST — public signup
//
// DEF Gala 2026 volunteer capacity — keyed by {participant_type}_{position}
// All times on Jun 10 2026 at Megaplex Legacy Crossing.
// Updated Apr 23 2026 per Kristen Buchi's specs.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { notifyVolunteerRegistered } from './_notify.js';

// Position registry — single source of truth. Keyed as `{type}_{position}`.
const POSITIONS = {
  // ── Day-of prep ──
  adult_candy_setup:    { cap: 4,  role: 'setup',     shift: '12-2 PM',             label: 'Candy Setup',           shiftLabel: '12-2 PM',                  type: 'adult' },

  // ── Event Night shift 1 (3:45–7:30 PM) ──
  adult_registration:   { cap: 10, role: 'event',     shift: '3:45–7:30 PM',        label: 'Registration',          shiftLabel: 'Shift 1 · 3:45–7:30 PM',   type: 'adult' },
  student_registration: { cap: 2,  role: 'event',     shift: '3:45–7:30 PM',        label: 'Registration',          shiftLabel: 'Shift 1 · 3:45–7:30 PM',   type: 'student' },

  adult_social_hour:    { cap: 2,  role: 'event',     shift: '3:45–7:30 PM',        label: 'Social Hour',           shiftLabel: 'Shift 1 · 3:45–7:30 PM',   type: 'adult' },
  student_social_hour:  { cap: 15, role: 'event',     shift: '3:45–7:30 PM',        label: 'Social Hour',           shiftLabel: 'Shift 1 · 3:45–7:30 PM',   type: 'student' },

  adult_check_in:       { cap: 2,  role: 'event',     shift: '3:45–7:30 PM',        label: 'Volunteer Check-In',    shiftLabel: 'Shift 1 · 3:45–7:30 PM',   type: 'adult' },

  adult_ambassador:     { cap: 50, role: 'event',     shift: '3:45–8:30 PM',        label: 'Auditorium Ambassador', shiftLabel: 'Shift 1 · 3:45–~8:30 PM',  type: 'adult' },
  student_ambassador:   { cap: 60, role: 'event',     shift: '3:45–8:30 PM',        label: 'Auditorium Ambassador', shiftLabel: 'Shift 1 · 3:45–~8:30 PM',  type: 'student' },

  // ── Event Night shift 2 (8:45–10:00 PM) ──
  student_checkout:     { cap: 20, role: 'event',     shift: '8:45–10:00 PM',       label: 'Checkout',              shiftLabel: 'Shift 2 · 8:45–10:00 PM',  type: 'student' },

  // ── All-night fill-in ──
  adult_roamer:         { cap: 10, role: 'all_night', shift: 'Potentially 3:45 PM – end of event', label: 'Roamer / Dinner Help',  shiftLabel: 'All night · fill-in',      type: 'adult' },
};

// Legacy role caps — aggregated, for back-compat with counts UI.
const ROLE_CAPS = Object.values(POSITIONS).reduce((acc, p) => {
  acc[p.role] = (acc[p.role] || 0) + p.cap;
  return acc;
}, {});

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  const arr = new Uint8Array(22);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 22; i++) t += chars[arr[i] % chars.length];
  return t;
}

function parseGroupCount(row) {
  const gs = row.group_size;
  const gt = (row.group_type || '').toLowerCase();
  if (!gs) {
    if (gt === 'couple') return 2;
    return 1;
  }
  if (row.group_type === 'Individual') return 1;
  if (gs.includes('-')) {
    const parts = gs.split('-');
    return parseInt(parts[1]) || parseInt(parts[0]) || 1;
  }
  if (gs === '20+') return 20;
  const n = parseInt(gs);
  if (isNaN(n)) {
    return gt === 'couple' ? 2 : 1;
  }
  return n;
}

function positionKey(participantType, position) {
  if (!participantType || !position) return null;
  return `${participantType}_${position}`;
}

async function getPositionCounts(env) {
  const { results } = await env.GALA_DB.prepare(
    `SELECT role, position, participant_type, group_type, group_size FROM volunteers WHERE status != 'waitlisted' AND deleted_at IS NULL`
  ).all();

  const positionCounts = {};
  const roleCounts = { setup: 0, event: 0, teardown: 0, all_night: 0 };

  for (const r of results || []) {
    const count = parseGroupCount(r);

    // Position-level count
    const pKey = positionKey(r.participant_type, r.position);
    if (pKey && POSITIONS[pKey]) {
      positionCounts[pKey] = (positionCounts[pKey] || 0) + count;
    }

    // Role-level count (back-compat)
    const role = r.role || 'event';
    if (role in roleCounts) {
      roleCounts[role] += count;
    }
  }

  return { positionCounts, roleCounts };
}

function publicPositions() {
  const out = {};
  for (const [key, p] of Object.entries(POSITIONS)) {
    out[key] = {
      cap: p.cap,
      label: p.label,
      shift: p.shift,
      shiftLabel: p.shiftLabel,
      type: p.type,
      role: p.role,
    };
  }
  return out;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  // Public counts endpoint
  if (url.searchParams.get('counts') === '1') {
    const { positionCounts, roleCounts } = await getPositionCounts(env);
    return jsonOk({
      positions: publicPositions(),
      positionCounts,
      // Legacy fields kept for any consumer still reading them
      counts: roleCounts,
      caps: ROLE_CAPS,
    });
  }

  // Everything else is admin-only (PII)
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const status = url.searchParams.get('status');
  const role = url.searchParams.get('role');
  const position = url.searchParams.get('position');
  const participantType = url.searchParams.get('participant_type');
  const search = url.searchParams.get('search');
  const includeDeleted = url.searchParams.get('include_deleted') === '1';
  const onlyDeleted = url.searchParams.get('only_deleted') === '1';

  let sql = 'SELECT * FROM volunteers WHERE 1=1';
  const params = [];
  if (onlyDeleted) {
    sql += ' AND deleted_at IS NOT NULL';
    // Auto-purge anything soft-deleted more than 30 days ago. Cheap and runs
    // only when an admin actually opens the "Recently deleted" view.
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await env.GALA_DB.prepare(
        'DELETE FROM volunteers WHERE deleted_at IS NOT NULL AND deleted_at < ?'
      ).bind(cutoff).run();
    } catch (e) {
      // Non-fatal — the list query will still work
    }
  } else if (!includeDeleted) {
    sql += ' AND deleted_at IS NULL';
  }
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (role && role !== 'all') { sql += ' AND role = ?'; params.push(role); }
  if (position && position !== 'all') { sql += ' AND position = ?'; params.push(position); }
  if (participantType && participantType !== 'all') { sql += ' AND participant_type = ?'; params.push(participantType); }
  if (search) {
    sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR organization LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  sql += ' ORDER BY created_at DESC';

  const { results } = await env.GALA_DB.prepare(sql).bind(...params).all();
  const volunteers = (results || []).map(r => ({
    id: r.id,
    token: r.token,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    organization: r.organization,
    groupType: r.group_type,
    groupSize: r.group_size,
    shirtSize: r.shirt_size,
    role: r.role,
    position: r.position,
    participantType: r.participant_type,
    shift: r.shift,
    experience: r.experience,
    hearAbout: r.hear_about,
    smsOptIn: !!r.sms_opt_in,
    status: r.status,
    notes: r.notes,
    agreedToTerms: !!r.agreed_to_terms,
    agreedAt: r.agreed_at,
    checkedIn: !!r.checked_in,
    checkedInAt: r.checked_in_at,
    qrSent: !!r.qr_sent,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  }));

  const { positionCounts, roleCounts } = await getPositionCounts(env);
  return jsonOk({
    volunteers,
    total: volunteers.length,
    positions: publicPositions(),
    positionCounts,
    counts: roleCounts,
    caps: ROLE_CAPS,
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  if (!body.firstName || !body.lastName) {
    return jsonError('First and last name required', 400);
  }
  if (!body.email) {
    return jsonError('Email required', 400);
  }
  if (!body.phone) {
    return jsonError('Phone number required', 400);
  }

  // Require participantType + position going forward
  const participantType = body.participantType === 'student' ? 'student' : 'adult';
  const position = body.position || null;
  const pKey = positionKey(participantType, position);

  if (!pKey || !POSITIONS[pKey]) {
    return jsonError('Please choose a shift and position.', 400);
  }

  const meta = POSITIONS[pKey];
  const role = meta.role;

  // Capacity check at position level
  const { positionCounts } = await getPositionCounts(env);
  const currentAtPosition = positionCounts[pKey] || 0;
  const incoming = body.groupType && body.groupType !== 'Individual'
    ? parseGroupCount({ group_type: body.groupType, group_size: body.groupSize })
    : 1;
  const waitlisted = meta.cap && (currentAtPosition + incoming) > meta.cap;
  const status = waitlisted ? 'waitlisted' : 'registered';

  const shift = `${meta.shift} (${meta.label})`;

  const id = generateId();
  const token = generateToken();

  await env.GALA_DB.prepare(`
    INSERT INTO volunteers
      (id, token, first_name, last_name, email, phone, organization,
       group_type, group_size, shirt_size, role, position, participant_type, shift,
       experience, hear_about, sms_opt_in, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    id, token,
    body.firstName, body.lastName,
    body.email || null, body.phone || null,
    body.organization || null,
    body.groupType || 'Individual',
    body.groupSize || null,
    body.shirtSize || null,
    role,
    position,
    participantType,
    shift,
    body.experience || null,
    body.hearAbout || null,
    body.smsOptIn === false ? 0 : 1,
    status,
  ).run();

  // Fire-and-forget notification
  context.waitUntil(notifyVolunteerRegistered(env, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone,
    smsOptIn: body.smsOptIn,
    role,
    position,
    participantType,
    shift,
    waitlisted,
    token,
  }));

  // Fire-and-forget mirror to unified DEF Volunteer Hub
  context.waitUntil(mirrorToUnified({
    event_slug: 'gala-2026',
    first_name: body.firstName,
    last_name: body.lastName,
    email: body.email,
    phone: body.phone,
    organization: body.organization,
    group_type: body.groupType || 'individual',
    group_size: body.groupSize ? parseInt(body.groupSize, 10) || 1 : 1,
    shirt_size: body.shirtSize,
    role: position,                    // unified `role` = gala position label
    shift: shift,
    experience: body.experience,
    hear_about: body.hearAbout,
    sms_opt_in: body.smsOptIn !== false,
    status,
    notes: `participant_type=${participantType}`,
  }));

  return jsonOk({ id, token, status, waitlisted }, 0);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ---------- Unified DEF Volunteer Hub mirror ----------
// Fire-and-forget. Idempotent on (email, event_slug). Never throws.
async function mirrorToUnified(payload) {
  try {
    const res = await fetch('https://volunteers.daviskids.org/api/volunteers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, upsert: true, source: 'mirror' }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[mirror gala→unified] failed', res.status, txt);
    }
  } catch (e) {
    console.error('[mirror gala→unified] threw', e?.message || e);
  }
}
