// POST /api/gala/portal/[token]/assign
// Body: { theater_id: N, seat_ids: ['F-7','F-8',...], delegation_id: N | null }
//
// Sets seat_assignments.delegation_id for the named seats. Decouples
// "who placed the seat" (sponsor_id) from "who's sitting in it"
// (delegation_id) so a sponsor can hand specific seats to specific
// delegates without delegating the WHOLE block.
//
// delegation_id = null clears the assignment (seat reverts to "Held by
// the sponsor" / unassigned in the UI).
//
// Validation:
//   - caller authenticated via resolveToken
//   - each seat_id must belong to the caller's placement scope:
//       sponsor caller → seat.sponsor_id matches AND
//                        seat.delegation_id is either null OR points
//                        at a delegation under this sponsor
//       delegation caller → seat.delegation_id matches caller.id
//   - delegation_id (if not null) must belong to caller's scope:
//       sponsor caller → delegation.parent_sponsor_id matches
//                        AND delegation.parent_delegation_id is null
//       delegation caller → delegation.parent_delegation_id matches caller.id

import { resolveToken, getTierAccess, tierGateError, jsonError, jsonOk } from '../../_sponsor_portal.js';
import { getLoveseatPartner } from '../../_loveseat_pairs.js';

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const token = params.token;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid or expired link', 404);

  // Tier-window gate (migration 010).
  const access = await getTierAccess(env, resolved);
  if (!access.open) return tierGateError(access);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const theater_id = Number(body.theater_id);
  const seat_ids = Array.isArray(body.seat_ids) ? body.seat_ids : [];
  const delegation_id =
    body.delegation_id === null || body.delegation_id === undefined
      ? null
      : Number(body.delegation_id);

  if (!theater_id) return jsonError('theater_id required', 400);
  if (!seat_ids.length) return jsonError('seat_ids required', 400);

  // Parse 'F-7' → ['F', '7']
  const parsed = seat_ids.map((id) => {
    const dash = String(id).indexOf('-');
    if (dash < 0) return null;
    return { row_label: String(id).slice(0, dash), seat_num: String(id).slice(dash + 1) };
  });
  if (parsed.some((p) => !p)) return jsonError('Invalid seat_id format (expected ROW-NUM)', 400);

  // Phase 5.2 — paired-loveseat expansion. If the caller passes one
  // half of a paired loveseat, pull the partner into the same /assign
  // operation so the pair never splits across delegations. The client
  // already sends both halves (SeatEngine.partnersFor in the picker),
  // but we re-expand here to be defensive against direct API callers.
  // Deduplicate via a Set of "ROW:NUM" keys.
  const seen = new Set(parsed.map((p) => `${p.row_label}:${p.seat_num}`));
  for (const p of [...parsed]) {
    const partner = await getLoveseatPartner(env, request, theater_id, p.row_label, p.seat_num);
    if (partner) {
      const key = `${p.row_label}:${partner}`;
      if (!seen.has(key)) {
        parsed.push({ row_label: p.row_label, seat_num: partner });
        seen.add(key);
      }
    }
  }

  // Validate delegation_id belongs to caller scope (if provided),
  // AND fetch the delegate identity so we can recompose guest_name
  // to match the seat's new owner. (When delegation_id is null we'll
  // recompose to the caller's identity instead — see below.)
  let delegRecord = null;
  if (delegation_id !== null) {
    const deleg = await env.GALA_DB.prepare(
      `SELECT d.*, s.company AS parent_company
         FROM sponsor_delegations d
         JOIN sponsors s ON s.id = d.parent_sponsor_id
        WHERE d.id = ?`
    ).bind(delegation_id).first();
    if (!deleg) return jsonError('Delegation not found', 404);

    let allowed = false;
    if (
      resolved.kind === 'sponsor' &&
      deleg.parent_sponsor_id === resolved.record.id &&
      !deleg.parent_delegation_id
    ) {
      allowed = true;
    } else if (
      resolved.kind === 'delegation' &&
      deleg.parent_delegation_id === resolved.record.id
    ) {
      allowed = true;
    }
    if (!allowed) {
      return jsonError('Delegation does not belong to this token', 403);
    }
    delegRecord = deleg;
  }

  // Recompose guest_name to match the seat's NEW owner. This keeps
  // the seat_assignments.guest_name column truthful for downstream
  // consumers (check-in iPad, CSV export, chat tools) which read it
  // directly without joining to delegation/sponsor tables.
  //
  // Format mirrors pick.js exactly:
  //   sponsor placement   → "Company (First Last)"
  //   delegation placement → "Parent Company / Delegate Name"
  //
  // delegation_id null + sponsor caller   → recompose to sponsor identity
  // delegation_id null + delegation caller → recompose to caller's parent + delegate name
  //   (this case shouldn't happen — delegations don't un-assign their own seats —
  //    but covered for symmetry.)
  let recomposedGuestName;
  if (delegRecord) {
    recomposedGuestName = `${delegRecord.parent_company} / ${delegRecord.delegate_name}`;
  } else if (resolved.kind === 'sponsor') {
    const s = resolved.record;
    recomposedGuestName = `${s.company}${s.first_name ? ' (' + s.first_name + ' ' + (s.last_name || '') + ')' : ''}`;
  } else {
    // Delegation caller un-assigning to null. Falls back to the
    // delegation's own identity since their seats remain under their
    // own delegation umbrella regardless of delegation_id changes.
    recomposedGuestName = `${resolved.record.parent_company} / ${resolved.record.delegate_name}`;
  }

  // Build the WHERE for "seats this caller may modify"
  // Sponsor scope: any seat I placed (sponsor_id = me, delegation_id null)
  //                OR any seat placed under a delegation I own
  // Delegation scope: only my own placements
  let scopeSql;
  let scopeBinds;
  if (resolved.kind === 'sponsor') {
    scopeSql = `(sponsor_id = ? AND (delegation_id IS NULL OR delegation_id IN (
      SELECT id FROM sponsor_delegations WHERE parent_sponsor_id = ?
    )))`;
    scopeBinds = [resolved.record.id, resolved.record.id];
  } else {
    scopeSql = `delegation_id = ?`;
    scopeBinds = [resolved.record.id];
  }

  // Update each seat. Single transaction-style: D1 doesn't support
  // multi-statement transactions in the binding API, but each UPDATE
  // is atomic and we report partial-success in the response.
  let updated = 0;
  const failed = [];
  for (const p of parsed) {
    const result = await env.GALA_DB.prepare(
      `UPDATE seat_assignments
          SET delegation_id = ?,
              guest_name = ?,
              updated_at = datetime('now')
        WHERE theater_id = ?
          AND row_label = ?
          AND seat_num = ?
          AND ${scopeSql}`
    )
      .bind(delegation_id, recomposedGuestName, theater_id, p.row_label, p.seat_num, ...scopeBinds)
      .run();
    const changes = result.meta?.changes || 0;
    if (changes > 0) updated += changes;
    else failed.push(`${p.row_label}-${p.seat_num}`);
  }

  if (updated === 0 && failed.length > 0) {
    return jsonError(
      `None of those seats are yours to reassign (${failed.join(', ')})`,
      403
    );
  }

  return jsonOk({
    ok: true,
    updated,
    failed: failed.length ? failed : undefined,
    delegation_id,
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
