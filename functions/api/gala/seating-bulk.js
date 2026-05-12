import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';

/**
 * POST /api/gala/seating-bulk
 * Body: {
 *   theater_id: number,
 *   sponsor_id: number,
 *   assignments: [{ row_label, seat_num }, ...]    // explicit list of seats
 * }
 * Performs upsert on each seat. Atomic best-effort — failures are collected
 * and returned, successful ones persist.
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const { theater_id, showing_number, sponsor_id, assignments } = body;
  if (!theater_id || !sponsor_id || !Array.isArray(assignments) || !assignments.length) {
    return jsonError('theater_id, sponsor_id, and assignments[] required', 400);
  }
  if (showing_number == null || !Number.isFinite(Number(showing_number))) {
    return jsonError('showing_number is required', 400);
  }

  // Look up sponsor name for the guest_name column
  const sponsor = await env.GALA_DB.prepare(
    'SELECT company, first_name, last_name, seats_purchased FROM sponsors WHERE id = ?'
  ).bind(sponsor_id).first();
  if (!sponsor) return jsonError('Sponsor not found', 404);

  const contact = [sponsor.first_name, sponsor.last_name].filter(Boolean).join(' ').trim();
  const baseLabel = contact ? `${sponsor.company} (${contact})` : sponsor.company;

  // Check current assignment count — refuse to overbook
  const current = await env.GALA_DB.prepare(
    'SELECT COUNT(*) AS n FROM seat_assignments WHERE sponsor_id = ?'
  ).bind(sponsor_id).first();
  const currentAssigned = current?.n || 0;
  const wouldHave = currentAssigned + assignments.length;
  if (sponsor.seats_purchased > 0 && wouldHave > sponsor.seats_purchased) {
    return jsonError(
      `Would exceed purchased seats: has ${sponsor.seats_purchased}, currently assigned ${currentAssigned}, requested ${assignments.length} more`,
      400
    );
  }

  const results = { succeeded: 0, failed: [], seats: [] };
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const guestName = `${baseLabel} — ${i + 1 + currentAssigned}`;
    try {
      await env.GALA_DB.prepare(`
        INSERT INTO seat_assignments
          (theater_id, showing_number, row_label, seat_num,
           guest_name, sponsor_id, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(theater_id, showing_number, row_label, seat_num)
             DO UPDATE SET guest_name = excluded.guest_name,
                           sponsor_id = excluded.sponsor_id,
                           updated_at = datetime('now')
      `).bind(
        Number(theater_id), Number(showing_number),
        a.row_label, String(a.seat_num),
        guestName, Number(sponsor_id),
      ).run();
      results.succeeded += 1;
      results.seats.push({ row_label: a.row_label, seat_num: a.seat_num, guest_name: guestName });
    } catch (err) {
      results.failed.push({ row: a.row_label, seat: a.seat_num, error: err.message });
    }
  }

  return jsonOk({
    ok: true,
    sponsor_id,
    sponsor_company: sponsor.company,
    ...results,
  }, 0);
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
