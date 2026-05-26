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

  // Per-showing fill: one row per (theater × showing) with its movie + soft cap.
  // assigned is counted on the composite (theater_id, showing_number) so showing 1
  // and showing 2 in the same auditorium never blur together. Flex/reserve rooms
  // (no movie assigned) come back with movie = null so the client can surface them.
  const showingsResult = await env.GALA_DB.prepare(`
    SELECT st.theater_id, st.showing_number,
           t.tier, t.purpose, t.notes AS theater_notes,
           st.movie_id, m.title AS movie_title,
           COALESCE(st.capacity, t.capacity) AS capacity,
           (SELECT COUNT(*) FROM seat_assignments sa
              WHERE sa.theater_id = st.theater_id
                AND sa.showing_number = st.showing_number) AS assigned
      FROM showtimes st
      LEFT JOIN theaters t ON t.id = st.theater_id
      LEFT JOIN movies m ON m.id = st.movie_id
     ORDER BY m.title, st.showing_number, st.theater_id
  `).all();
  const showings = (showingsResult.results || []).map(r => ({
    theaterId: r.theater_id,
    showing: r.showing_number,
    tier: r.tier,
    purpose: r.purpose,
    movieId: r.movie_id,
    movie: r.movie_title,
    capacity: r.capacity || 0,
    assigned: r.assigned || 0,
  }));

  // Unpicked sponsors by tier — sponsors who have placed zero seats so far.
  // Lets the dashboard show who still needs to select, grouped by tier.
  const unpickedResult = await env.GALA_DB.prepare(`
    SELECT sponsorship_tier AS tier, COUNT(*) AS sponsors,
           COALESCE(SUM(seats_purchased), 0) AS seats
      FROM sponsors
     WHERE ${archiveSupported ? 'archived_at IS NULL AND ' : ''}
           id NOT IN (
             SELECT DISTINCT sponsor_id FROM seat_assignments WHERE sponsor_id IS NOT NULL
           )
     GROUP BY sponsorship_tier
     ORDER BY sponsors DESC
  `).all();
  const unpickedByTier = (unpickedResult.results || []).map(r => ({
    tier: normalizeSponsorTier(r.tier) || r.tier,
    sponsors: r.sponsors,
    seats: r.seats,
  }));

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
    showings,
    unpickedByTier,
    placements,
  }, 0);
}
