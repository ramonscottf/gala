// POST /api/gala/portal/[token]/profile
// Body: { first_name, last_name, email, phone }
//
// Updates the caller's contact info on whichever record the token resolves
// to (sponsors row OR sponsor_delegations row). Returns the updated
// identity object in the same shape /api/gala/portal/[token] returns it
// so the SPA can drop it into local state without a follow-up GET.
//
// Auth: token in URL = bearer. Pattern matches the other portal sub-
// endpoints (/pick, /delegate, /assign, /finalize).

import { resolveToken, jsonError, jsonOk } from '../../_sponsor_portal.js';
import { normalizeSponsorTier } from '../../_gala_data.js';

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const token = params.token;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid or expired link', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const first_name = (body.first_name || '').trim();
  const last_name = (body.last_name || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim();

  if (!first_name && !last_name) return jsonError('Name required', 400);
  if (!email && !phone) return jsonError('Email or phone required', 400);

  if (resolved.kind === 'sponsor') {
    await env.GALA_DB.prepare(
      `UPDATE sponsors
          SET first_name = ?, last_name = ?, email = ?, phone = ?,
              updated_at = datetime('now')
        WHERE id = ?`
    )
      .bind(first_name || null, last_name || null, email || null, phone || null, resolved.record.id)
      .run();

    const s = await env.GALA_DB.prepare(`SELECT * FROM sponsors WHERE id = ?`)
      .bind(resolved.record.id)
      .first();

    return jsonOk({
      ok: true,
      identity: {
        kind: 'sponsor',
        id: s.id,
        company: s.company,
        contactName: [s.first_name, s.last_name].filter(Boolean).join(' ').trim(),
        email: s.email,
        phone: s.phone,
        tier: normalizeSponsorTier(s.sponsorship_tier) || s.sponsorship_tier,
        seatsPurchased: s.seats_purchased,
      },
    });
  }

  // Delegation: schema stores a single delegate_name. Concat first + last.
  const fullName = [first_name, last_name].filter(Boolean).join(' ').trim();

  await env.GALA_DB.prepare(
    `UPDATE sponsor_delegations
        SET delegate_name = ?, delegate_email = ?, delegate_phone = ?,
            updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind(fullName || resolved.record.delegate_name, email || null, phone || null, resolved.record.id)
    .run();

  const d = await env.GALA_DB.prepare(
    `SELECT d.*, s.company AS parent_company, s.sponsorship_tier AS parent_tier
       FROM sponsor_delegations d
       JOIN sponsors s ON s.id = d.parent_sponsor_id
      WHERE d.id = ?`
  )
    .bind(resolved.record.id)
    .first();

  return jsonOk({
    ok: true,
    identity: {
      kind: 'delegation',
      id: d.id,
      delegateName: d.delegate_name,
      email: d.delegate_email,
      phone: d.delegate_phone,
      parentCompany: d.parent_company,
      parentTier: normalizeSponsorTier(d.parent_tier) || d.parent_tier,
      seatsAllocated: d.seats_allocated,
      status: d.status,
      finalizedAt: d.finalized_at,
    },
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
