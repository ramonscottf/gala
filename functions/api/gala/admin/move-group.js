// POST /api/gala/admin/move-group
// Admin-only. Relocates an entire party (all the seats a sponsor/delegate
// holds in one theater+showing) to a new block of open seats in one action.
//
// Body: {
//   theater_id, showing_number,
//   moves: [ { from: { row_label, seat_num }, to: { row_label, seat_num } }, ... ]
// }
//
// The CLIENT computes the destination block (it has the layout) and sends an
// explicit list of from->to pairs. The server's job is to execute them safely:
//
//   - Every `from` must be an occupied seat.
//   - Every `to` must be EITHER open OR one of the seats being vacated in this
//     same batch (so an overlapping move like E7-E10 -> E5-E8 is allowed).
//   - No `to` may be held by anyone, and no two moves may target the same seat.
//
// Execution is two-phase to dodge the UNIQUE(theater,showing,row,seat) key when
// source and target blocks overlap:
//   1. PARK  — every source row is moved to a unique parking coordinate
//              (row '__MOVE__', seat = the row's own id) so no two rows ever
//              collide mid-shuffle.
//   2. PLACE — each parked row is moved to its final target.
// If anything fails, we best-effort restore parked rows to their originals so a
// party is never stranded. All four composite-key columns are bound on every
// write (composite-key-bug discipline). The assignment's sponsor_id,
// delegation_id, guest_name, dinner_choice all ride along untouched.

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

const PARK_ROW = '__MOVE__';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const t = Number(body.theater_id);
  const sh = Number(body.showing_number);
  const moves = Array.isArray(body.moves) ? body.moves : [];

  if (!t || !sh) return jsonError('theater_id and showing_number are required', 400);
  if (moves.length === 0) return jsonError('moves[] is required and must be non-empty', 400);

  // Normalize + validate the move list shape.
  const norm = [];
  for (const m of moves) {
    const fr = String(m?.from?.row_label || '');
    const fn = String(m?.from?.seat_num || '');
    const tr = String(m?.to?.row_label || '');
    const tn = String(m?.to?.seat_num || '');
    if (!fr || !fn || !tr || !tn) {
      return jsonError('each move needs from{row_label,seat_num} and to{row_label,seat_num}', 400);
    }
    norm.push({ fr, fn, tr, tn });
  }

  // No two moves may target the same destination seat.
  const targetKeys = norm.map((m) => `${m.tr}|${m.tn}`);
  if (new Set(targetKeys).size !== targetKeys.length) {
    return jsonError('Two seats are being moved to the same destination', 400);
  }

  const sourceKeys = new Set(norm.map((m) => `${m.fr}|${m.fn}`));

  // Load every source assignment; capture its id so we can park/place by id.
  const sources = [];
  for (const m of norm) {
    const row = await env.GALA_DB.prepare(
      `SELECT id, sponsor_id, delegation_id, guest_name FROM seat_assignments
        WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ? LIMIT 1`
    ).bind(t, sh, m.fr, m.fn).first();
    if (!row) return jsonError(`Seat ${m.fr}${m.fn} is not occupied — refresh and try again`, 409);
    sources.push({ ...m, id: row.id, sponsor_id: row.sponsor_id, delegation_id: row.delegation_id, guest_name: row.guest_name });
  }

  // Validate every destination: must be open, OR one of the seats we're
  // vacating in this same batch. And not held by anyone.
  for (const m of norm) {
    const destKey = `${m.tr}|${m.tn}`;
    const occupant = await env.GALA_DB.prepare(
      `SELECT id FROM seat_assignments
        WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ? LIMIT 1`
    ).bind(t, sh, m.tr, m.tn).first();
    if (occupant) {
      // Occupied is only OK if that seat is part of THIS party's vacating set.
      if (!sourceKeys.has(destKey)) {
        return jsonError(`Destination ${m.tr}${m.tn} is taken by someone else — pick another block`, 409);
      }
    } else {
      // Open destination — make sure nobody is mid-hold on it.
      const held = await env.GALA_DB.prepare(
        `SELECT 1 FROM seat_holds
          WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?
            AND expires_at > datetime('now') LIMIT 1`
      ).bind(t, sh, m.tr, m.tn).first();
      if (held) return jsonError(`Destination ${m.tr}${m.tn} is being held by a sponsor right now — try another block`, 409);
    }
  }

  // ── PHASE 1: park every source row at a unique coordinate ──
  const parked = [];
  try {
    for (const s of sources) {
      await env.GALA_DB.prepare(
        `UPDATE seat_assignments SET row_label = ?, seat_num = ? WHERE id = ?`
      ).bind(PARK_ROW, String(s.id), s.id).run();
      parked.push(s);
    }

    // ── PHASE 2: place each parked row at its destination ──
    for (const s of sources) {
      await env.GALA_DB.prepare(
        `UPDATE seat_assignments
            SET row_label = ?, seat_num = ?, updated_at = datetime('now'),
                assigned_by = 'admin-seatmap-group'
          WHERE id = ?`
      ).bind(s.tr, s.tn, s.id).run();
    }
  } catch (e) {
    // Best-effort restore: any row still parked goes back to its original.
    for (const s of parked) {
      await env.GALA_DB.prepare(
        `UPDATE seat_assignments SET row_label = ?, seat_num = ? WHERE id = ? AND row_label = ?`
      ).bind(s.fr, s.fn, s.id, PARK_ROW).run().catch(() => {});
    }
    return jsonError('Group move failed mid-flight — please refresh and verify those seats', 500);
  }

  // Best-effort audit (table is optional / schema varies across envs).
  try {
    await env.GALA_DB.prepare(
      `INSERT INTO audit_log (action, entity_type, entity_id, details, performed_by, performed_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      'move_group',
      'seat_group',
      sources[0]?.sponsor_id ?? null,
      JSON.stringify({
        theater_id: t, showing_number: sh,
        moves: norm.map((m) => `${m.fr}${m.fn}->${m.tr}${m.tn}`),
        delegation_id: sources[0]?.delegation_id ?? null,
        guest: sources[0]?.guest_name ?? null,
      }),
      'admin-seatmap',
    ).run();
  } catch (_) { /* no-op if table/columns differ */ }

  return jsonOk({
    ok: true,
    kind: 'move_group',
    count: sources.length,
    moves: norm.map((m) => ({ from: `${m.fr}${m.fn}`, to: `${m.tr}${m.tn}` })),
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
