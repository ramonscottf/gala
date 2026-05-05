import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { bloomerangFetch } from './_bloomerang.js';

/**
 * GET /api/gala/bloomerang-event
 * Fetch gala event info and attendees from Bloomerang
 *
 * POST /api/gala/bloomerang-event
 * Create/update the Gala 2026 event in Bloomerang
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  if (!env.BLOOMERANG_API_KEY) return jsonError('Bloomerang API key not configured', 503);

  try {
    // Search for existing gala event
    const events = await bloomerangFetch(env.BLOOMERANG_API_KEY, '/events?take=50');
    const galaEvent = (events.Results || []).find(e =>
      e.Name?.includes('2026 Gala') || e.Name?.includes('Gala 2026')
    );

    if (!galaEvent) {
      return jsonOk({ event: null, message: 'No Gala 2026 event found in Bloomerang. Use POST to create one.' }, 0);
    }

    // Get attendees
    let attendees = [];
    try {
      const attendeeData = await bloomerangFetch(
        env.BLOOMERANG_API_KEY,
        `/event/${galaEvent.Id}/attendees?take=200`
      );
      attendees = attendeeData.Results || [];
    } catch {}

    return jsonOk({
      event: galaEvent,
      attendees,
      attendeeCount: attendees.length,
    }, 60); // cache 1 min

  } catch (err) {
    return jsonError(err.message);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  if (!env.BLOOMERANG_API_KEY) return jsonError('Bloomerang API key not configured', 503);

  try {
    // Check if event already exists
    const events = await bloomerangFetch(env.BLOOMERANG_API_KEY, '/events?take=50');
    const existing = (events.Results || []).find(e =>
      e.Name?.includes('2026 Gala') || e.Name?.includes('Gala 2026')
    );

    if (existing) {
      return jsonOk({
        ok: true,
        event: existing,
        message: 'Gala 2026 event already exists in Bloomerang',
        created: false,
      }, 0);
    }

    // Create new event
    const newEvent = await bloomerangFetch(env.BLOOMERANG_API_KEY, '/event', 'POST', {
      Name: '2026 Gala — Davis Education Foundation',
      StartDate: '2026-06-10',
      EndDate: '2026-06-10',
      Goal: 100000,
      Note: 'Annual gala at Megaplex Theatres at Legacy Crossing, Centerville UT. Dinner, entertainment, silent auctions, private movie screening.',
    });

    // Log to D1 if available
    if (env.GALA_DB) {
      await env.GALA_DB.prepare(
        `INSERT INTO sync_log (direction, entity_type, entity_id, status, details)
         VALUES ('dashboard_to_bloomerang', 'event', ?, 'success', 'Created Gala 2026 event')`
      ).bind(String(newEvent.Id || '')).run().catch(() => {});
    }

    return jsonOk({
      ok: true,
      event: newEvent,
      message: 'Gala 2026 event created in Bloomerang',
      created: true,
    }, 0);

  } catch (err) {
    return jsonError(err.message);
  }
}
