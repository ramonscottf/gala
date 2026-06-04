// POST /api/gala/admin/move-seats
// Admin-only, master control. The coordinate-complete reseat primitive: moves
// any set of occupied seats to any set of destination seats, INCLUDING across
// different theaters/showings (i.e. moving a guest to a different movie). No
// quota, no orphan nag, no scope limits — this is the admin override.
//
// Body: {
//   moves: [
//     { from: { theater_id, showing_number, row_label, seat_num },
//       to:   { theater_id, showing_number, row_label, seat_num } },
//     ...
//   ]
// }
//
// Every coordinate is explicit (no top-level defaults) so a single batch can
// span multiple theaters. Rules:
//   - each `from` must be occupied
//   - each `to` must be open OR be one of the seats vacated in this same batch
//     (so an in-place shuffle / overlap is allowed)
//   - no two moves may target the same destination
//   - no `to` may be held by a sponsor mid-pick
//
// Two-phase to dodge UNIQUE(theater,showing,row,seat) on overlap:
//   1. PARK every source row to (its own theater/showing, row '__MOVE__',
//      seat = the row id) — guaranteed unique, no cross-row collision.
//   2. PLACE every parked row to its full destination coordinate.
// Best-effort restore on mid-flight failure. sponsor_id / delegation_id /
// guest_name / dinner_choice ride along untouched — only the seat location and
// (when moving movies) theater/showing change.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

const PARK_ROW = '__MOVE__';

function coord(c) {
  return {
    t: Number(c?.theater_id),
    s: Number(c?.showing_number),
    r: String(c?.row_label || ''),
    n: String(c?.seat_num || ''),
  };
}
const keyOf = (c) => `${c.t}|${c.s}|${c.r}|${c.n}`;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const moves = Array.isArray(body.moves) ? body.moves : [];
  if (moves.length === 0) return jsonError('moves[] is required and must be non-empty', 400);

  const norm = [];
  for (const m of moves) {
    const from = coord(m?.from);
    const to = coord(m?.to);
    if (!from.t || !from.s || !from.r || !from.n) {
      return jsonError('each move.from needs theater_id, showing_number, row_label, seat_num', 400);
    }
    if (!to.t || !to.s || !to.r || !to.n) {
      return jsonError('each move.to needs theater_id, showing_number, row_label, seat_num', 400);
    }
    norm.push({ from, to });
  }

  // No two moves may target the same destination.
  const tkeys = norm.map((m) => keyOf(m.to));
  if (new Set(tkeys).size !== tkeys.length) {
    return jsonError('Two seats are being moved to the same destination', 400);
  }
  const sourceKeys = new Set(norm.map((m) => keyOf(m.from)));

  // Load every source assignment (by exact coordinate); capture id.
  const sources = [];
  for (const m of norm) {
    const row = await env.GALA_DB.prepare(
      `SELECT id FROM seat_assignments
        WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ? LIMIT 1`
    ).bind(m.from.t, m.from.s, m.from.r, m.from.n).first();
    if (!row) return jsonError(`Seat ${m.from.r}${m.from.n} isn't occupied anymore — refresh and retry`, 409);
    sources.push({ ...m, id: row.id });
  }

  // Validate destinations: open, or part of this batch's vacating set; never a
  // seat held by someone mid-pick.
  for (const m of norm) {
    const occupant = await env.GALA_DB.prepare(
      `SELECT id FROM seat_assignments
        WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ? LIMIT 1`
    ).bind(m.to.t, m.to.s, m.to.r, m.to.n).first();
    if (occupant) {
      if (!sourceKeys.has(keyOf(m.to))) {
        return jsonError(`Destination ${m.to.r}${m.to.n} is taken by someone else — pick another spot`, 409);
      }
    } else {
      const held = await env.GALA_DB.prepare(
        `SELECT 1 FROM seat_holds
          WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?
            AND expires_at > datetime('now') LIMIT 1`
      ).bind(m.to.t, m.to.s, m.to.r, m.to.n).first();
      if (held) return jsonError(`Destination ${m.to.r}${m.to.n} is being held right now — try another spot`, 409);
    }
  }

  // PHASE 1 — park every source row uniquely (stays in its own theater/showing).
  const parked = [];
  try {
    for (const s of sources) {
      await env.GALA_DB.prepare(
        `UPDATE seat_assignments SET row_label = ?, seat_num = ? WHERE id = ?`
      ).bind(PARK_ROW, String(s.id), s.id).run();
      parked.push(s);
    }
    // PHASE 2 — place each parked row at its full destination coordinate.
    for (const s of sources) {
      await env.GALA_DB.prepare(
        `UPDATE seat_assignments
            SET theater_id = ?, showing_number = ?, row_label = ?, seat_num = ?,
                updated_at = datetime('now'), assigned_by = 'admin-sponsor-seating'
          WHERE id = ?`
      ).bind(s.to.t, s.to.s, s.to.r, s.to.n, s.id).run();
    }
  } catch (e) {
    for (const s of parked) {
      await env.GALA_DB.prepare(
        `UPDATE seat_assignments SET row_label = ?, seat_num = ? WHERE id = ? AND row_label = ?`
      ).bind(s.from.r, s.from.n, s.id, PARK_ROW).run().catch(() => {});
    }
    return jsonError('Reseat failed mid-flight — please refresh and verify those seats', 500);
  }

  try {
    await env.GALA_DB.prepare(
      `INSERT INTO audit_log (action, entity_type, entity_id, details, performed_by, performed_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind('move_seats', 'seat', sources[0]?.id ?? null,
      JSON.stringify({ moves: norm.map((m) => `${m.from.r}${m.from.n}@T${m.from.t}S${m.from.s}->${m.to.r}${m.to.n}@T${m.to.t}S${m.to.s}`) }),
      'admin-sponsor-seating').run();
  } catch (_) { /* audit is best-effort */ }

  return jsonOk({
    ok: true,
    kind: 'move_seats',
    count: sources.length,
    moves: norm.map((m) => ({
      from: `${m.from.r}${m.from.n}`, fromTheater: m.from.t, fromShowing: m.from.s,
      to: `${m.to.r}${m.to.n}`, toTheater: m.to.t, toShowing: m.to.s,
    })),
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
