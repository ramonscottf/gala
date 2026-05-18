// POST /api/gala/portal/[token]/auction-register
// Body: { email, transaction_id?, registered_at? }
//
// Called by the portal AuctionRegistrationModal when the embedded Qgiv
// iframe posts QGIV.registrationComplete (with email + transaction_id in
// the payload) or — fallback — when the modal poll-on-close detects a
// Qgiv-side webhook arrived first.
//
// Writes auction_registered_at, auction_registration_email,
// auction_registration_txn on the sponsor row. Idempotent: if the
// sponsor already has auction_registered_at set, we NO-OP and return
// the existing state (no overwrite of original registration date).
//
// Auth: portal magic-link token. v1 scope is sponsor tokens only —
// delegations bid via their own future flow; for now a delegation
// token returns 400 (UI also gates the card to sponsor kind).
//
// Per Scott's composite-key write learning (gala-seating, May 11): we
// bind every column on every write to avoid silent default-NULL drift.

import { resolveToken, jsonError, jsonOk } from '../../_sponsor_portal.js';

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const token = params.token;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid or expired link', 404);

  if (resolved.kind !== 'sponsor') {
    return jsonError(
      'Auction registration is for primary sponsor accounts only',
      400,
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const transactionId =
    typeof body.transaction_id === 'string' ? body.transaction_id.trim() : '';
  // Allow caller to pass a registered_at (e.g. from Qgiv's timestamp);
  // default to server-now when missing or malformed.
  let registeredAt =
    typeof body.registered_at === 'string' ? body.registered_at.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}T/.test(registeredAt)) {
    registeredAt = new Date().toISOString();
  }

  if (!email) return jsonError('email required', 400);

  const sponsor = resolved.record;

  // Idempotency — never overwrite the original registration timestamp.
  if (sponsor.auction_registered_at) {
    return jsonOk({
      ok: true,
      already_registered: true,
      registered_at: sponsor.auction_registered_at,
      email: sponsor.auction_registration_email,
      transaction_id: sponsor.auction_registration_txn,
    });
  }

  await env.GALA_DB.prepare(
    `UPDATE sponsors
        SET auction_registered_at = ?,
            auction_registration_email = ?,
            auction_registration_txn = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
  )
    .bind(registeredAt, email, transactionId || null, sponsor.id)
    .run();

  return jsonOk({
    ok: true,
    already_registered: false,
    registered_at: registeredAt,
    email,
    transaction_id: transactionId || null,
  });
}
