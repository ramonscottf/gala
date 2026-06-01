// /api/gala/salad-gf
// PUBLIC (token-gated, no session) — the gluten-free salad poll.
//
// The salad option is "Green Salad with Grilled Chicken." It can be made
// gluten-free, but it's better when it isn't, so we ask each salad guest /
// table host which they'd prefer. Each recipient (a delegate who picked
// their own salad seats, or a sponsor who placed them) gets a one-tap link
// carrying their ?t=TOKEN.
//
// GET  ?t=TOKEN           → { ok, recipient:{name, salad_seats, gf_count, responded} }
// POST { token, gf_count } → records how many of their salad seats need GF,
//                            flips needs_gf on that many seat rows, marks responded.
//                            (Single-seat links just send gf_count 0 or 1.)

import { jsonOk, jsonError } from './_auth.js';

async function loadByToken(env, token) {
  if (!token) return null;
  const row = await env.GALA_DB.prepare(
    `SELECT token, recipient_type, recipient_id, name, email, phone,
            salad_seats, gf_count, responded
       FROM salad_gf_poll WHERE token = ?`
  ).bind(token).first();
  return row || null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);
  const token = new URL(request.url).searchParams.get('t');
  const r = await loadByToken(env, token);
  if (!r) return jsonError('This link is not valid. Please check the email or text you received.', 404);
  return jsonOk({
    ok: true,
    recipient: {
      name: r.name,
      salad_seats: r.salad_seats,
      gf_count: r.gf_count,
      responded: !!r.responded,
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  let body;
  try { body = await request.json(); } catch { return jsonError('Invalid request', 400); }

  const token = (body.token || '').trim();
  const r = await loadByToken(env, token);
  if (!r) return jsonError('This link is not valid.', 404);

  let gf = Number(body.gf_count);
  if (!Number.isInteger(gf) || gf < 0) return jsonError('Invalid count', 400);
  if (gf > r.salad_seats) gf = r.salad_seats; // clamp

  // Find this recipient's salad seats (same grouping rule as the seed:
  // delegate seats by delegation_id, sponsor seats are the salad seats on
  // that sponsor that were NOT delegated to someone with an email).
  let seatRows;
  if (r.recipient_type === 'delegate') {
    const res = await env.GALA_DB.prepare(
      `SELECT id FROM seat_assignments
        WHERE status='assigned' AND LOWER(TRIM(dinner_choice))='salad'
          AND delegation_id = ?
        ORDER BY id ASC`
    ).bind(r.recipient_id).all();
    seatRows = res.results || [];
  } else {
    // sponsor's own (non-delegated-with-email) salad seats
    const res = await env.GALA_DB.prepare(
      `SELECT sa.id
         FROM seat_assignments sa
         LEFT JOIN sponsor_delegations d ON d.id = sa.delegation_id
        WHERE sa.status='assigned' AND LOWER(TRIM(sa.dinner_choice))='salad'
          AND sa.sponsor_id = ?
          AND (sa.delegation_id IS NULL OR TRIM(COALESCE(d.delegate_email,'')) = '')
        ORDER BY sa.id ASC`
    ).bind(r.recipient_id).all();
    seatRows = res.results || [];
  }

  const ids = seatRows.map(s => s.id);
  // First `gf` seats → needs_gf=1, the rest → 0. Single statement per group.
  const gfIds = ids.slice(0, gf);
  const regIds = ids.slice(gf);
  const stmts = [];
  if (gfIds.length) {
    stmts.push(env.GALA_DB.prepare(
      `UPDATE seat_assignments SET needs_gf=1, updated_at=datetime('now')
        WHERE id IN (${gfIds.map(() => '?').join(',')})`
    ).bind(...gfIds));
  }
  if (regIds.length) {
    stmts.push(env.GALA_DB.prepare(
      `UPDATE seat_assignments SET needs_gf=0, updated_at=datetime('now')
        WHERE id IN (${regIds.map(() => '?').join(',')})`
    ).bind(...regIds));
  }
  stmts.push(env.GALA_DB.prepare(
    `UPDATE salad_gf_poll SET gf_count=?, responded=1, updated_at=datetime('now')
      WHERE token=?`
  ).bind(gf, token));
  await env.GALA_DB.batch(stmts);

  return jsonOk({ ok: true, gf_count: gf, salad_seats: r.salad_seats });
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
