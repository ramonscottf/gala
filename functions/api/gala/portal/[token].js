// GET /api/gala/portal/[token]
// Returns the full portal state for a sponsor OR delegation lead:
//   - who they are (sponsor/delegation record)
//   - how many seats they can place
//   - their current assignments
//   - their child delegations
//   - ALL current seat assignments + active holds (for chart rendering)

import { resolveToken, getSeatsAvailableToPlace, cleanupExpiredHolds, getTierAccess, jsonError, jsonOk } from '../_sponsor_portal.js';
import { normalizeSponsorTier } from '../_gala_data.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const token = params.token;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  await cleanupExpiredHolds(env);

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid or expired link', 404);

  // Tier-window check (migration 010). Reported in the response payload so
  // the client UI can pre-empt the write-side 403 with a friendly overlay
  // ("Your window opens Tue May 18 at 8:00 AM"). The actual gate lives in
  // pick.js / finalize.js / assign.js / delegate.js.
  const tierAccess = await getTierAccess(env, resolved);

  const seatMath = await getSeatsAvailableToPlace(env, resolved);

  // Build identity payload
  let identity;
  if (resolved.kind === 'sponsor') {
    const s = resolved.record;
    identity = {
      kind: 'sponsor',
      id: s.id,
      company: s.company,
      contactName: [s.first_name, s.last_name].filter(Boolean).join(' ').trim(),
      email: s.email,
      phone: s.phone,
      tier: normalizeSponsorTier(s.sponsorship_tier) || s.sponsorship_tier,
      seatsPurchased: s.seats_purchased,
      logoUrl: s.logo_url || null,
      // Phase 5.3 — Tickets-tab CTA state machine. The sponsor's
      // rsvp_status flips to 'completed' on /finalize. Surfacing it
      // here lets the client decide which pill to render: 'Select
      // meals' (indigo, missing dinners) → 'Finalize seats' (red, all
      // dinners picked) → 'View' (indigo, finalized; read-only sheet).
      rsvpStatus: s.rsvp_status || null,
      rsvpCompletedAt: s.rsvp_completed_at || null,
    };
  } else {
    const d = resolved.record;
    identity = {
      kind: 'delegation',
      id: d.id,
      delegateName: d.delegate_name,
      email: d.delegate_email,
      phone: d.delegate_phone,
      parentCompany: d.parent_company,
      parentTier: normalizeSponsorTier(d.parent_tier) || d.parent_tier,
      parentLogoUrl: d.parent_logo_url || null,
      seatsAllocated: d.seats_allocated,
      status: d.status,
      finalizedAt: d.finalized_at,
    };
  }

  // My assignments (seats I placed directly)
  const myAssignmentsQ = resolved.kind === 'sponsor'
    ? `SELECT * FROM seat_assignments WHERE sponsor_id = ? AND delegation_id IS NULL ORDER BY theater_id, row_label, seat_num`
    : `SELECT * FROM seat_assignments WHERE delegation_id = ? ORDER BY theater_id, row_label, seat_num`;
  const myAssignments = await env.GALA_DB.prepare(myAssignmentsQ).bind(
    resolved.kind === 'sponsor' ? resolved.record.id : resolved.record.id
  ).all();

  // Child delegations
  // Includes per-delegation counts for: seats_placed (any assignment) and
  // seats_missing_dinner (assignments without a dinner_choice). The latter
  // drives the host-facing "Remind dinners" CTA — we only show it when
  // the delegation has placed seats AND any of them lack a meal choice.
  const childDelegsQ = resolved.kind === 'sponsor'
    ? `SELECT d.*, COALESCE(sa.placed, 0) AS seats_placed,
              COALESCE(sa.missing_dinner, 0) AS seats_missing_dinner
         FROM sponsor_delegations d
         LEFT JOIN (
           SELECT delegation_id,
                  COUNT(*) AS placed,
                  SUM(CASE WHEN dinner_choice IS NULL OR dinner_choice = '' THEN 1 ELSE 0 END) AS missing_dinner
             FROM seat_assignments GROUP BY delegation_id
         ) sa ON sa.delegation_id = d.id
        WHERE d.parent_sponsor_id = ? AND d.parent_delegation_id IS NULL AND d.status != 'reclaimed'
        ORDER BY d.created_at`
    : `SELECT d.*, COALESCE(sa.placed, 0) AS seats_placed,
              COALESCE(sa.missing_dinner, 0) AS seats_missing_dinner
         FROM sponsor_delegations d
         LEFT JOIN (
           SELECT delegation_id,
                  COUNT(*) AS placed,
                  SUM(CASE WHEN dinner_choice IS NULL OR dinner_choice = '' THEN 1 ELSE 0 END) AS missing_dinner
             FROM seat_assignments GROUP BY delegation_id
         ) sa ON sa.delegation_id = d.id
        WHERE d.parent_delegation_id = ? AND d.status != 'reclaimed'
        ORDER BY d.created_at`;
  const childDelegs = await env.GALA_DB.prepare(childDelegsQ).bind(resolved.record.id).all();
  const childDelegRows = childDelegs.results || [];
  let childDelegationAssignments = [];
  if (childDelegRows.length > 0) {
    const ids = childDelegRows.map((d) => Number(d.id)).filter(Number.isFinite);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const childAssignmentsQ = await env.GALA_DB.prepare(
        `SELECT sa.*, d.delegate_name, d.delegate_email, d.delegate_phone, d.status AS delegation_status
           FROM seat_assignments sa
           JOIN sponsor_delegations d ON d.id = sa.delegation_id
          WHERE sa.delegation_id IN (${placeholders})
          ORDER BY d.delegate_name, sa.theater_id, sa.row_label, sa.seat_num`
      ).bind(...ids).all();
      childDelegationAssignments = childAssignmentsQ.results || [];
    }
  }

  // ALL assignments across venue (to render the chart — seats others have taken)
  const allAssignments = await env.GALA_DB.prepare(
    `SELECT sa.theater_id, sa.row_label, sa.seat_num,
            sa.sponsor_id, sa.delegation_id,
            s.company AS sponsor_company, s.sponsorship_tier AS sponsor_tier
       FROM seat_assignments sa
       LEFT JOIN sponsors s ON s.id = sa.sponsor_id`
  ).all();

  // ALL active holds (exclude my own token's holds — those render as "mine pending")
  const allHolds = await env.GALA_DB.prepare(
    `SELECT theater_id, row_label, seat_num, held_by_token, expires_at
       FROM seat_holds
      WHERE expires_at > datetime('now')`
  ).all();

  const myHolds = (allHolds.results || []).filter(h => h.held_by_token === token);
  const otherHolds = (allHolds.results || []).filter(h => h.held_by_token !== token);

  // Active showtimes joined with their movie. Drives the sponsor-facing
  // showtime → movie → auditorium picker, including TMDB metadata + Stream
  // trailer URLs for the in-portal detail view.
  const showtimesQ = await env.GALA_DB.prepare(
    `SELECT s.theater_id, s.movie_id, s.showing_number, s.dinner_time,
            s.show_start, s.capacity, s.trailer_minutes,
            m.title AS movie_title, m.runtime_minutes, m.trailer_url,
            m.poster_url, m.thumbnail_url, m.backdrop_url, m.synopsis, m.rating, m.year,
            m.stream_uid, m.trailer_duration_seconds,
            m.tmdb_score, m.tmdb_vote_count,
            t.tier AS theater_tier, t.notes AS theater_notes
       FROM showtimes s
       JOIN movies m ON m.id = s.movie_id
       LEFT JOIN theaters t ON t.id = s.theater_id
      WHERE m.active = 1
      ORDER BY s.showing_number, m.title, s.theater_id`
  ).all();
  const showtimes = showtimesQ.results || [];

  return jsonOk({
    identity,
    tierAccess: {
      open: tierAccess.open,
      tier: tierAccess.tier,
      opensAt: tierAccess.opens_at,
    },
    seatMath,
    myAssignments: myAssignments.results || [],
    childDelegations: childDelegRows.map(d => ({
      id: d.id,
      token: d.token,
      delegateName: d.delegate_name,
      email: d.delegate_email,
      phone: d.delegate_phone,
      seatsAllocated: d.seats_allocated,
      seatsPlaced: d.seats_placed,
      seatsMissingDinner: d.seats_missing_dinner,
      status: d.status,
      invitedAt: d.invited_at,
      accessedAt: d.accessed_at,
      finalizedAt: d.finalized_at,
    })),
    childDelegationAssignments,
    allAssignments: allAssignments.results || [],
    myHolds,
    otherHolds,
    showtimes,
  });
}
