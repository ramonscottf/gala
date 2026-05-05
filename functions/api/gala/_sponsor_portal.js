// Shared helpers for gala sponsor portal + delegation + check-in

import { hasSponsorArchiveSupport } from './_gala_data.js';

/** Generate a secure random token (22 chars, URL-safe). */
export function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let t = '';
  for (let i = 0; i < 22; i++) t += chars[bytes[i] % chars.length];
  return t;
}

/** Resolve an invite token to a sponsor or delegation record. */
export async function resolveToken(env, token) {
  if (!token || token.length < 10) return null;
  const archiveSupported = await hasSponsorArchiveSupport(env);

  // First, check if it's a primary sponsor token
  const sponsor = await env.GALA_DB.prepare(
    `SELECT * FROM sponsors WHERE rsvp_token = ?${archiveSupported ? ' AND archived_at IS NULL' : ''}`
  ).bind(token).first();
  if (sponsor) {
    return { kind: 'sponsor', record: sponsor };
  }

  // Otherwise, check delegation token
  const deleg = await env.GALA_DB.prepare(
    `SELECT d.*, s.company AS parent_company, s.sponsorship_tier AS parent_tier,
            s.logo_url AS parent_logo_url
       FROM sponsor_delegations d
       JOIN sponsors s ON s.id = d.parent_sponsor_id
      WHERE d.token = ?${archiveSupported ? ' AND s.archived_at IS NULL' : ''}`
  ).bind(token).first();
  if (deleg) {
    return { kind: 'delegation', record: deleg };
  }

  return null;
}

/**
 * Compute how many seats this token-holder is allowed to place, taking into
 * account recursive delegations underneath them.
 *
 * For a sponsor: total seats_purchased minus seats already assigned to this
 *   sponsor (any level) minus seats allocated to direct child delegations.
 * For a delegation: seats_allocated minus already-assigned seats under this
 *   delegation (any level) minus seats allocated to direct child delegations.
 */
export async function getSeatsAvailableToPlace(env, resolved) {
  if (resolved.kind === 'sponsor') {
    const s = resolved.record;
    const total = s.seats_purchased || 0;

    // Count seats placed directly by this sponsor (no delegation_id)
    const direct = await env.GALA_DB.prepare(
      `SELECT COUNT(*) AS n FROM seat_assignments
        WHERE sponsor_id = ? AND delegation_id IS NULL`
    ).bind(s.id).first();

    // Count seats allocated to direct child delegations (any status except reclaimed)
    const delegated = await env.GALA_DB.prepare(
      `SELECT COALESCE(SUM(seats_allocated), 0) AS n
         FROM sponsor_delegations
        WHERE parent_sponsor_id = ?
          AND parent_delegation_id IS NULL
          AND status != 'reclaimed'`
    ).bind(s.id).first();

    return {
      total,
      placed: direct.n || 0,
      delegated: delegated.n || 0,
      available: Math.max(0, total - (direct.n || 0) - (delegated.n || 0)),
    };
  }

  // Delegation
  const d = resolved.record;
  const total = d.seats_allocated || 0;

  const direct = await env.GALA_DB.prepare(
    `SELECT COUNT(*) AS n FROM seat_assignments WHERE delegation_id = ?`
  ).bind(d.id).first();

  const delegated = await env.GALA_DB.prepare(
    `SELECT COALESCE(SUM(seats_allocated), 0) AS n
       FROM sponsor_delegations
      WHERE parent_delegation_id = ?
        AND status != 'reclaimed'`
  ).bind(d.id).first();

  return {
    total,
    placed: direct.n || 0,
    delegated: delegated.n || 0,
    available: Math.max(0, total - (direct.n || 0) - (delegated.n || 0)),
  };
}

/** Clean up expired holds. Called opportunistically. */
export async function cleanupExpiredHolds(env) {
  const now = new Date().toISOString();
  await env.GALA_DB.prepare(
    `DELETE FROM seat_holds WHERE expires_at < ?`
  ).bind(now).run();
}

/** JSON response helpers (mirror _auth.js style). */
export function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
export function jsonOk(data, cacheSec = 0) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheSec ? `public, max-age=${cacheSec}` : 'no-store',
    },
  });
}

/** CORS preflight helper. */
export function cors(res) {
  const headers = new Headers(res.headers || {});
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(res.body, { status: res.status, headers });
}
