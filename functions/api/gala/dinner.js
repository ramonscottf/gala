import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';

/**
 * Dinner choices for the 2026 Gala.
 * Single source of truth — also exposed via GET so the front-end picker
 * can render whatever the back-end currently allows.
 *
 * Phase 5.8 (May 10 2026) — Kara's revised menu, four options total:
 *   frenchdip — Hot French Dip Sandwich
 *   salad     — Green Salad with Grilled Chicken (Gluten Free)
 *   veggie    — Vegetarian
 *   kids      — Kids Meal
 * Cold turkey sandwich removed entirely. veggie + kids IDs preserved
 * across the rename; brisket→frenchdip and glutenfree→salad changed
 * IDs because the meaning changed (the GF option is now a distinct
 * grilled-chicken salad, not a "gluten-free version of the others").
 * Mirror in src/portal/components/DinnerPicker.jsx DINNER_OPTIONS,
 * DinnerSheet.jsx DINNER_TILES, portal/[token]/pick.js VALID set,
 * admin/seating.html DINNER_OPTIONS const, marketing-test.js + the
 * review/index.html email previews.
 */
export const DINNER_OPTIONS = [
  { id: 'frenchdip', label: 'Hot French Dip Sandwich',                       kind: 'sandwich' },
  { id: 'salad',     label: 'Green Salad with Grilled Chicken (Gluten Free)', kind: 'salad'    },
  { id: 'veggie',    label: 'Vegetarian',                                     kind: 'veggie'   },
  { id: 'kids',      label: 'Kids Meal',                                      kind: 'kids'     },
];

const VALID_IDS = new Set(DINNER_OPTIONS.map(o => o.id));

/**
 * GET /api/gala/dinner
 *   Returns the dinner option list. Public — no auth (so guest portal can
 *   render the same options without admin cookie).
 *
 * GET /api/gala/dinner?summary=1
 *   Returns counts of dinner_choice across seat_assignments per showing.
 *   Auth required.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.searchParams.get('summary') === '1') {
    const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
    if (!authed) return jsonError('Unauthorized', 401);
    if (!env.GALA_DB) return jsonError('Database not configured', 503);

    const res = await env.GALA_DB.prepare(`
      SELECT showing_number, dinner_choice, COUNT(*) AS n
        FROM seat_assignments
       WHERE dinner_choice IS NOT NULL AND dinner_choice <> ''
       GROUP BY showing_number, dinner_choice
       ORDER BY showing_number, dinner_choice
    `).all();

    return jsonOk({ options: DINNER_OPTIONS, summary: res.results || [] }, 0);
  }

  return jsonOk({ options: DINNER_OPTIONS }, 300);
}

/**
 * POST /api/gala/dinner — set dinner_choice for one or more seats.
 * Auth required.
 *
 * Body (single):
 *   { theater_id, showing_number?, row_label, seat_num, dinner_choice }
 *
 * Body (bulk):
 *   { updates: [ { theater_id, showing_number?, row_label, seat_num, dinner_choice }, ... ] }
 *
 * dinner_choice must be one of DINNER_OPTIONS[*].id, or null/empty to clear.
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const updates = Array.isArray(body.updates) ? body.updates : [body];
  if (!updates.length) return jsonError('No updates provided', 400);

  const results = { succeeded: 0, failed: [] };

  for (const u of updates) {
    const { theater_id, showing_number, row_label, seat_num, dinner_choice } = u;
    if (!theater_id || !row_label || seat_num === undefined || seat_num === null) {
      results.failed.push({ ...u, error: 'theater_id, row_label, seat_num required' });
      continue;
    }
    const choice = dinner_choice == null || dinner_choice === '' ? null : String(dinner_choice);
    if (choice !== null && !VALID_IDS.has(choice)) {
      results.failed.push({ ...u, error: `Invalid dinner_choice: ${choice}` });
      continue;
    }

    try {
      const showing = Number.isInteger(showing_number) ? showing_number : 1;
      const upd = await env.GALA_DB.prepare(`
        UPDATE seat_assignments
           SET dinner_choice = ?, updated_at = datetime('now')
         WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?
      `).bind(choice, Number(theater_id), showing, row_label, String(seat_num)).run();

      if ((upd.meta?.changes || 0) === 0) {
        results.failed.push({ ...u, error: 'Seat not assigned — assign first, then set dinner' });
      } else {
        results.succeeded += 1;
      }
    } catch (err) {
      results.failed.push({ ...u, error: err.message });
    }
  }

  return jsonOk({ ok: results.failed.length === 0, ...results }, 0);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
