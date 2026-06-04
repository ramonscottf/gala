// GET /api/gala/board — PUBLIC, read-only occupancy for the public schedule timeline.
// Returns, per "theaterId:showingNumber", the assigned count + the list of occupied
// seat keys (ROW+NUM, e.g. "D9"). Deliberately NO guest names and NO sponsor info —
// just which seats are taken, so the public seat-fill heatmap can render without
// exposing who is sitting where. Cached 30s at the edge to keep DB load near zero.
export async function onRequestGet(context) {
  const { env } = context;
  if (!env.GALA_DB) {
    return new Response(JSON.stringify({ ok: false, error: 'Database not configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }
  try {
    const r = await env.GALA_DB.prepare(
      'SELECT theater_id, showing_number, row_label, seat_num FROM seat_assignments'
    ).all();
    const fill = {};
    for (const a of (r.results || [])) {
      const k = a.theater_id + ':' + a.showing_number;
      if (!fill[k]) fill[k] = { assigned: 0, seats: [] };
      fill[k].assigned++;
      fill[k].seats.push(String(a.row_label) + String(a.seat_num));
    }
    return new Response(
      JSON.stringify({ ok: true, fill, generated_at: new Date().toISOString() }),
      {
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, max-age=30',
          'access-control-allow-origin': '*',
        },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }
}
