// _onBehalfOf.js — resolves the effective "who's being written for"
// scope when a sponsor edits a child delegation's seats.
//
// Background
// ──────────
// /pick used to gate every action on either `sponsor_id = ?` (sponsor
// direct) or `delegation_id = ?` (delegate self). A sponsor could not
// move/swap/release a child delegation's seats — they could only see
// what their guests picked, or fully reclaim a guest's whole block
// and re-invite them.
//
// Phase C of the sponsor-portal "more editing skills" work (May 18
// 2026) introduces an explicit on-behalf path. The sponsor passes
// `on_behalf_of_delegation_id` in the request body; we verify that
// the delegation is a direct child of the calling sponsor, then
// return a synthetic "writeScope" that downstream code uses in
// place of `resolved` for ownership conditions.
//
// Authorization rules
// ───────────────────
// 1. Only token kind 'sponsor' can supply on_behalf_of_delegation_id.
//    A delegation cannot edit another delegation's seats.
// 2. The target delegation must have parent_sponsor_id matching the
//    caller AND parent_delegation_id IS NULL (direct child only).
//    Grand-children are reachable transitively through their own
//    parent delegation's token.
// 3. The target delegation must not be reclaimed.
//
// Audit
// ─────
// Every successful action that ran in on-behalf mode writes a row
// to sponsor_actions_log via writeAuditLog() below. The row captures
// who, for whom, what action, the (theater/showing/row/seat) tuple,
// before/after state, and whether a follow-up notification was sent.

import { jsonError } from './_sponsor_portal.js';

/**
 * Resolves the effective write scope.
 *
 * @returns {Promise<{ok: true, writeScope: {kind, record}, onBehalf: {actorSponsorId, targetDelegationId} | null} | {ok: false, response: Response}>}
 */
export async function resolveWriteScope(env, resolved, body) {
  const requested = body?.on_behalf_of_delegation_id;
  if (requested == null || requested === '') {
    return { ok: true, writeScope: resolved, onBehalf: null };
  }

  if (resolved.kind !== 'sponsor') {
    return {
      ok: false,
      response: jsonError('Only sponsors can act on behalf of a delegation', 403),
    };
  }

  const targetId = Number(requested);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return {
      ok: false,
      response: jsonError('Invalid on_behalf_of_delegation_id', 400),
    };
  }

  const target = await env.GALA_DB.prepare(
    `SELECT * FROM sponsor_delegations WHERE id = ?`
  ).bind(targetId).first();

  if (!target) {
    return {
      ok: false,
      response: jsonError('Target delegation not found', 404),
    };
  }
  if (Number(target.parent_sponsor_id) !== Number(resolved.record.id)) {
    return {
      ok: false,
      response: jsonError('Not authorized to edit on behalf of this delegation', 403),
    };
  }
  if (target.parent_delegation_id != null) {
    // Sponsor can only directly edit their first-level child delegations.
    // Grand-children reach back through the intermediate delegation's token.
    return {
      ok: false,
      response: jsonError('Cannot directly edit a grand-child delegation', 403),
    };
  }
  if (target.status === 'reclaimed') {
    return {
      ok: false,
      response: jsonError('Cannot edit a reclaimed delegation', 400),
    };
  }

  // sponsor_delegations has no company column — the "parent company" for a
  // delegated guest is the acting sponsor's company. Attach it so writers
  // (e.g. seat finalize) can build a proper "Company / Delegate" guest name
  // instead of "undefined / Delegate".
  target.parent_company = resolved.record.company || null;

  return {
    ok: true,
    writeScope: { kind: 'delegation', record: target },
    onBehalf: {
      actorSponsorId: resolved.record.id,
      targetDelegationId: target.id,
    },
  };
}

/**
 * Append a row to sponsor_actions_log. No-op if onBehalf is null.
 * Wrapped in try/catch so logging failures never break the action.
 */
export async function writeAuditLog(env, onBehalf, entry) {
  if (!onBehalf) return;
  try {
    await env.GALA_DB.prepare(
      `INSERT INTO sponsor_actions_log
         (actor_sponsor_id, target_delegation_id, action,
          theater_id, showing_number, row_label, seat_num,
          before_value, after_value, notify_sent, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      onBehalf.actorSponsorId,
      onBehalf.targetDelegationId,
      entry.action,
      entry.theater_id ?? null,
      entry.showing_number ?? null,
      entry.row_label ?? null,
      entry.seat_num ?? null,
      entry.before_value != null ? JSON.stringify(entry.before_value) : null,
      entry.after_value != null ? JSON.stringify(entry.after_value) : null,
      entry.notify_sent ? 1 : 0,
      entry.notes ?? null,
    ).run();
  } catch (e) {
    console.error('sponsor_actions_log write failed', e);
  }
}
