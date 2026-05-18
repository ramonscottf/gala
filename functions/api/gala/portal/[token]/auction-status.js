// GET /api/gala/portal/[token]/auction-status
//
// Lightweight check: is this sponsor already registered for the silent
// auction in Qgiv? Returns { registered, registered_at, email }.
//
// The main /api/gala/portal/[token] payload also carries the same data
// on identity.auctionRegisteredAt — this endpoint exists as a focused
// poll target for the AuctionRegistrationModal on close (in case the
// postMessage signal was missed and we need to confirm via a Qgiv
// webhook race).
//
// Delegations always return { registered: false } so the v1 client
// can render a clean "no auction registration on file" state if/when
// it ever queries — no 4xx noise for a non-sponsor case.

import { resolveToken, jsonError, jsonOk } from '../../_sponsor_portal.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const token = params.token;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid or expired link', 404);

  if (resolved.kind !== 'sponsor') {
    return jsonOk({ registered: false, registered_at: null, email: null });
  }

  const s = resolved.record;
  return jsonOk({
    registered: Boolean(s.auction_registered_at),
    registered_at: s.auction_registered_at || null,
    email: s.auction_registration_email || null,
    transaction_id: s.auction_registration_txn || null,
  });
}
