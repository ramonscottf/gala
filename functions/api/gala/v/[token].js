// /api/gala/v/[token]
// GET  — public volunteer profile (QR scan)
// POST — agree to terms (public) or check in (admin)

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const token = params.token;
  if (!token || token.length < 10) return jsonError('Invalid token', 400);

  const vol = await env.GALA_DB.prepare(`
    SELECT id, token, first_name, last_name, email, phone, organization,
           role, shift, shirt_size, status,
           agreed_to_terms, agreed_at,
           checked_in, checked_in_at
    FROM volunteers WHERE token = ? AND deleted_at IS NULL
  `).bind(token).first();

  if (!vol) return jsonError('Volunteer not found', 404);

  return jsonOk({
    id: vol.id,
    token: vol.token,
    firstName: vol.first_name,
    lastName: vol.last_name,
    email: vol.email,
    phone: vol.phone,
    organization: vol.organization,
    role: vol.role,
    shift: vol.shift,
    shirtSize: vol.shirt_size,
    status: vol.status,
    agreedToTerms: !!vol.agreed_to_terms,
    agreedAt: vol.agreed_at,
    checkedIn: !!vol.checked_in,
    checkedInAt: vol.checked_in_at,
  });
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const token = params.token;
  if (!token || token.length < 10) return jsonError('Invalid token', 400);

  let body;
  try { body = await request.json(); }
  catch { body = {}; }

  const action = body.action || 'agree';

  if (action === 'agree') {
    const now = new Date().toISOString();
    const result = await env.GALA_DB.prepare(
      'UPDATE volunteers SET agreed_to_terms = 1, agreed_at = ? WHERE token = ? AND agreed_to_terms = 0'
    ).bind(now, token).run();

    if (!result.meta.changes) {
      const vol = await env.GALA_DB.prepare(
        'SELECT agreed_to_terms FROM volunteers WHERE token = ?'
      ).bind(token).first();
      if (!vol) return jsonError('Volunteer not found', 404);
      return jsonOk({ ok: true, alreadyAgreed: true });
    }

    return jsonOk({ ok: true });
  }

  if (action === 'checkin') {
    // Admin only — ops checks in volunteer by scanning their QR
    const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
    if (!authed) return jsonError('Unauthorized', 401);

    const now = new Date().toISOString();
    const result = await env.GALA_DB.prepare(
      'UPDATE volunteers SET checked_in = 1, checked_in_at = ? WHERE token = ?'
    ).bind(now, token).run();

    if (!result.meta.changes) return jsonError('Volunteer not found', 404);

    const vol = await env.GALA_DB.prepare(
      'SELECT id, first_name, last_name, role, shift FROM volunteers WHERE token = ?'
    ).bind(token).first();

    return jsonOk({
      ok: true,
      volunteer: {
        id: vol.id,
        firstName: vol.first_name,
        lastName: vol.last_name,
        role: vol.role,
        shift: vol.shift,
      },
    });
  }

  return jsonError('Unknown action', 400);
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
