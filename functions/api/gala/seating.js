import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';

/**
 * GET /api/gala/seating?theater_id=N  — fetch assignments for a theater
 * GET /api/gala/seating?export=true    — CSV export of all assignments
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const url = new URL(request.url);
  const theaterId = url.searchParams.get('theater_id');
  const isExport = url.searchParams.get('export') === 'true';

  // CSV export of all assignments
  if (isExport) {
    const results = await env.GALA_DB.prepare(
      `SELECT sa.theater_id, sa.showing_number, sa.row_label, sa.seat_num, sa.guest_name,
              sa.sponsor_id, s.company AS sponsor_company, s.sponsorship_tier,
              sa.dinner_choice, sa.assigned_at
         FROM seat_assignments sa
         LEFT JOIN sponsors s ON s.id = sa.sponsor_id
        ORDER BY sa.theater_id, sa.showing_number, sa.row_label, sa.seat_num`
    ).all();

    const rows = results.results || [];
    const csv = [
      'Theater,Showing,Row,Seat,Guest,Sponsor Company,Tier,Sponsor ID,Dinner,Assigned At',
      ...rows.map(r =>
        `${r.theater_id},${r.showing_number},"${r.row_label}","${r.seat_num}","${(r.guest_name || '').replace(/"/g, '""')}","${(r.sponsor_company || '').replace(/"/g, '""')}","${r.sponsorship_tier || ''}","${r.sponsor_id || ''}","${r.dinner_choice || ''}","${r.assigned_at || ''}"`
      ),
    ].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="gala-seating-export.csv"',
        'Cache-Control': 'no-store',
      },
    });
  }

  // Fetch assignments for a specific theater
  if (!theaterId) return jsonError('theater_id required', 400);

  const results = await env.GALA_DB.prepare(
    'SELECT * FROM seat_assignments WHERE theater_id = ? ORDER BY row_label, seat_num'
  ).bind(Number(theaterId)).all();

  return jsonOk({ assignments: results.results || [] }, 0);
}

/**
 * POST /api/gala/seating — assign a seat
 * Body: { theater_id, row_label, seat_num, guest_name, monday_item_id? }
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { theater_id, row_label, seat_num, guest_name, sponsor_id, monday_item_id, dinner_choice } = body;
  if (!theater_id || !row_label || !seat_num || !guest_name) {
    return jsonError('theater_id, row_label, seat_num, and guest_name are required', 400);
  }

  try {
    await env.GALA_DB.prepare(
      `INSERT INTO seat_assignments (theater_id, row_label, seat_num, guest_name, sponsor_id, dinner_choice, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(theater_id, showing_number, row_label, seat_num)
       DO UPDATE SET guest_name = excluded.guest_name,
                     sponsor_id = excluded.sponsor_id,
                     dinner_choice = COALESCE(excluded.dinner_choice, seat_assignments.dinner_choice),
                     updated_at = datetime('now')`
    ).bind(
      Number(theater_id), row_label, seat_num, guest_name,
      sponsor_id ? Number(sponsor_id) : null,
      dinner_choice || null
    ).run();

    return jsonOk({ ok: true, message: 'Seat assigned' }, 0);
  } catch (err) {
    return jsonError(err.message);
  }
}

/**
 * DELETE /api/gala/seating — unassign a seat
 * Body: { theater_id, row_label, seat_num }
 */
export async function onRequestDelete(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { theater_id, row_label, seat_num } = body;
  if (!theater_id || !row_label || !seat_num) {
    return jsonError('theater_id, row_label, and seat_num are required', 400);
  }

  try {
    const result = await env.GALA_DB.prepare(
      'DELETE FROM seat_assignments WHERE theater_id = ? AND row_label = ? AND seat_num = ?'
    ).bind(Number(theater_id), row_label, seat_num).run();

    return jsonOk({ ok: true, deleted: result.meta?.changes || 0 }, 0);
  } catch (err) {
    return jsonError(err.message);
  }
}
