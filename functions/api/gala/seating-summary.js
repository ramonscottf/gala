import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import {
  hasSponsorArchiveSupport,
  normalizeSponsorTier,
  sponsorTierRank,
} from './_gala_data.js';

/**
 * GET /api/gala/seating-summary
 *
 * Venue-wide seating intelligence for the main seating chart page.
 * Returns:
 *   - total_capacity: sum of all theater seats (from layout config, passed by client)
 *   - ticketed_seats: sum of sponsors.seats_purchased
 *   - assigned_seats: count from seat_assignments
 *   - per_theater: {theater_id: {assigned, blocked}}
 *   - unseated_sponsors: sponsors where seats_remaining > 0
 *   - sponsor_placements: {sponsor_id: [{theater_id, row, seat}, ...]}
 *
 * Everything admin-auth'd.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  if (!env.GALA_DB) return jsonError('Database not configured', 503);
  const archiveSupported = await hasSponsorArchiveSupport(env);

  // Sponsors + their current assigned count (one query, joined)
  const sponsorsResult = await env.GALA_DB.prepare(`
    SELECT s.id, s.company, s.first_name, s.last_name,
           s.sponsorship_tier, s.seats_purchased, s.payment_status,
           COALESCE(sa.assigned, 0) AS seats_assigned
      FROM sponsors s
      LEFT JOIN (
        SELECT sponsor_id, COUNT(*) AS assigned
          FROM seat_assignments
         WHERE sponsor_id IS NOT NULL
         GROUP BY sponsor_id
      ) sa ON sa.sponsor_id = s.id
     ${archiveSupported ? 'WHERE s.archived_at IS NULL' : ''}
     ORDER BY
       CASE s.sponsorship_tier
         WHEN 'Platinum' THEN 1
         WHEN 'Gold' THEN 2
         WHEN 'Silver' THEN 3
         WHEN 'Cell Phone' THEN 4
         WHEN 'Bronze' THEN 5
         WHEN 'Friends and Family' THEN 6
         WHEN 'Split Friends & Family' THEN 7
         WHEN 'Individual Seats' THEN 8
         WHEN 'Indivudial Tickets' THEN 8
         WHEN 'Trade' THEN 9
         ELSE 10
       END,
       s.company
  `).all();

  const sponsors = (sponsorsResult.results || []).map(r => ({
    id: r.id,
    company: r.company,
    contact: [r.first_name, r.last_name].filter(Boolean).join(' ').trim(),
    tier: normalizeSponsorTier(r.sponsorship_tier) || r.sponsorship_tier,
    seatsPurchased: r.seats_purchased,
    seatsAssigned: r.seats_assigned,
    seatsRemaining: Math.max(0, (r.seats_purchased || 0) - (r.seats_assigned || 0)),
    paymentStatus: r.payment_status,
  })).sort((a, b) =>
    sponsorTierRank(a.tier) - sponsorTierRank(b.tier) ||
    a.company.localeCompare(b.company)
  );

  // Per-theater counts
  const theaterResult = await env.GALA_DB.prepare(`
    SELECT theater_id, COUNT(*) AS n
      FROM seat_assignments
     GROUP BY theater_id
  `).all();
  const perTheater = {};
  (theaterResult.results || []).forEach(r => { perTheater[r.theater_id] = { assigned: r.n }; });

  // Totals
  const ticketedSeats = sponsors.reduce((a, s) => a + (s.seatsPurchased || 0), 0);
  const assignedSeats = sponsors.reduce((a, s) => a + (s.seatsAssigned || 0), 0);
  const remainingToPlace = sponsors.reduce((a, s) => a + (s.seatsRemaining || 0), 0);

  // Sponsor placements (which theater each sponsor is in, for the placement map)
  const placementsResult = await env.GALA_DB.prepare(`
    SELECT sponsor_id, theater_id, row_label, seat_num
      FROM seat_assignments
     WHERE sponsor_id IS NOT NULL
     ORDER BY sponsor_id, theater_id, row_label, seat_num
  `).all();
  const placements = {};
  (placementsResult.results || []).forEach(r => {
    const sid = r.sponsor_id;
    if (!placements[sid]) placements[sid] = { theaters: new Set(), seats: [] };
    placements[sid].theaters.add(r.theater_id);
    placements[sid].seats.push({ theater_id: r.theater_id, row: r.row_label, seat: r.seat_num });
  });
  // Serialize sets
  Object.keys(placements).forEach(sid => {
    placements[sid].theaters = [...placements[sid].theaters];
  });

  return jsonOk({
    totals: {
      ticketedSeats,
      assignedSeats,
      remainingToPlace,
      sponsorsCount: sponsors.length,
      sponsorsFullySeated: sponsors.filter(s => s.seatsRemaining === 0 && s.seatsPurchased > 0).length,
      sponsorsUnseated: sponsors.filter(s => s.seatsAssigned === 0).length,
    },
    sponsors,
    perTheater,
    placements,
  }, 0);
}
