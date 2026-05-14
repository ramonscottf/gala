// Shared helpers for gala sponsor portal + delegation + check-in

import { hasSponsorArchiveSupport } from './_gala_data.js';

/** Generate a secure random token (12 chars, URL-safe).
 *  62^12 ≈ 3.2e21 combinations — overkill for ~100 sponsors and a few
 *  hundred delegations, but more than enough collision resistance.
 *  Was 22 chars; shortened May 2026 because 22-char tokens forced
 *  ugly 5-line URL wrapping in invite SMS messages. Existing 22-char
 *  tokens remain valid — `resolveToken()` accepts any length >= 10. */
export function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let t = '';
  for (let i = 0; i < 12; i++) t += chars[bytes[i] % chars.length];
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

/**
 * Tier-window gate. Returns { open, opens_at, tier, error } for the given
 * sponsor (or the parent sponsor of a delegation). Once opens_at is in the
 * past for a given tier, that tier is open forever — nothing closes. The
 * override_open column lets admins punch a hole without changing the global
 * schedule (e.g. early-payer favor).
 *
 * Backed by the `tier_windows` table (migration 010, May 14 2026). If a
 * sponsor's tier is missing from the table (or the table doesn't exist —
 * fail-open during the transition window), the gate allows the action and
 * logs a warning. We never *block* on a missing row because the gala write
 * path predates the gate by months and we don't want a config gap to make
 * the portal unusable.
 *
 * Why an open-future window doesn't block: the same `resolveToken` path
 * powers post-finalization edits (changing a dinner, swapping a seat). Once
 * a sponsor's tier is open, they keep access forever. So this function only
 * answers the *first*-action question.
 */
import { normalizeSponsorTier } from './_gala_data.js';

export async function getTierAccess(env, resolved) {
  const rawTier = resolved.kind === 'sponsor'
    ? resolved.record.sponsorship_tier
    : resolved.record.parent_tier;
  const tier = normalizeSponsorTier(rawTier) || rawTier || null;

  if (!tier) {
    // Missing tier on the sponsor record — fail-open and log. This is a
    // data-quality issue, not a gate concern.
    return { open: true, opens_at: null, tier: null, reason: 'no-tier-on-record' };
  }

  let row;
  try {
    row = await env.GALA_DB.prepare(
      `SELECT tier, opens_at, override_open FROM tier_windows WHERE tier = ?`
    ).bind(tier).first();
  } catch (err) {
    // tier_windows table missing (migration not yet applied to this D1).
    // Fail-open during the transition. Logged so we can see it in the
    // worker logs.
    console.warn('[tier-gate] tier_windows query failed — failing open:', err.message);
    return { open: true, opens_at: null, tier, reason: 'tier_windows-table-missing' };
  }

  if (!row) {
    console.warn('[tier-gate] no tier_windows row for tier:', tier, '— failing open');
    return { open: true, opens_at: null, tier, reason: 'tier-row-missing' };
  }

  if (row.override_open) {
    return { open: true, opens_at: row.opens_at, tier, reason: 'override' };
  }

  const opensAtMs = Date.parse(row.opens_at);
  if (!Number.isFinite(opensAtMs)) {
    console.warn('[tier-gate] unparseable opens_at for tier:', tier, row.opens_at);
    return { open: true, opens_at: row.opens_at, tier, reason: 'unparseable-opens_at' };
  }

  const open = Date.now() >= opensAtMs;
  return { open, opens_at: row.opens_at, tier, reason: open ? 'on-schedule' : 'not-yet-open' };
}

/**
 * Convenience wrapper for write endpoints. Returns a `Response` (jsonError)
 * if the tier is not yet open, or `null` if the caller may proceed.
 *
 * Format the opens_at as a friendly Mountain-time string in the message so
 * the sponsor knows when they CAN pick — not just that they currently can't.
 * "Selection for Silver opens Mon, May 18 at 8:00 AM (Mountain). You'll get
 *  an email when it does." beats an ambiguous 403.
 */
export function tierGateError(access) {
  const tierLabel = access.tier || 'your tier';
  const opensAt = access.opens_at ? new Date(access.opens_at) : null;
  let when = '';
  if (opensAt && !Number.isNaN(opensAt.getTime())) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    when = ` Seat selection for ${tierLabel} sponsors opens ${fmt.format(opensAt)} (Mountain). We'll email you a reminder when it does.`;
  } else {
    when = ` Seat selection for ${tierLabel} sponsors hasn't opened yet.`;
  }
  return jsonError(
    `Your sponsor window is not open yet.${when} If you believe this is a mistake, please reply to your invitation email or contact Sherry Miggin (smiggin@dsdmail.net).`,
    403,
  );
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
