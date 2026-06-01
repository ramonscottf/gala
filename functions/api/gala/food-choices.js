// /api/gala/food-choices
// GET (admin only) — aggregate dinner selections for the kitchen.
//
// Source of truth is seat_assignments.dinner_choice (one row per assigned
// seat). Raw codes in the column: frenchdip, salad, kids, veggie (+ blanks).
// We report kitchen totals, a per-showing split, and which sponsors still
// have seats with no choice (so they can be chased before the final count).

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';

// Raw code → human label. Unknown codes pass through capitalized.
const LABELS = {
  frenchdip: 'French Dip',
  salad: 'Salad',
  kids: 'Kids Meal',
  veggie: 'Vegetarian',
};
function labelFor(code) {
  const k = String(code || '').trim().toLowerCase();
  if (!k) return null;
  return LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1));
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  // Pull every assigned seat's choice + showing. Keep it to assigned seats
  // (those are the real diners; held/blocked seats aren't eating).
  const { results } = await env.GALA_DB.prepare(
    `SELECT showing_number, dinner_choice
       FROM seat_assignments
      WHERE status = 'assigned'`
  ).all();

  const rows = results || [];
  const total = rows.length;

  // Kitchen totals by labelled choice (+ a separate "no choice yet" count)
  const counts = {};   // label -> count
  let blank = 0;
  // Per-showing: { [showing]: { total, blank, byChoice: {label:n} } }
  const byShowing = {};

  for (const r of rows) {
    const label = labelFor(r.dinner_choice);
    const sh = r.showing_number == null ? 0 : r.showing_number;
    byShowing[sh] = byShowing[sh] || { showing: sh, total: 0, blank: 0, byChoice: {} };
    byShowing[sh].total++;
    if (!label) {
      blank++;
      byShowing[sh].blank++;
    } else {
      counts[label] = (counts[label] || 0) + 1;
      byShowing[sh].byChoice[label] = (byShowing[sh].byChoice[label] || 0) + 1;
    }
  }

  const chosen = total - blank;
  // Stable ordering: known meals first (by our LABELS order), then any extras desc.
  const known = Object.values(LABELS);
  const choices = Object.entries(counts)
    .sort((a, b) => {
      const ai = known.indexOf(a[0]); const bi = known.indexOf(b[0]);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return b[1] - a[1];
    })
    .map(([label, count]) => ({
      label, count,
      pct: chosen ? Math.round((count / chosen) * 100) : 0,
    }));

  const showings = Object.values(byShowing)
    .sort((a, b) => a.showing - b.showing)
    .map(s => ({
      showing: s.showing,
      total: s.total,
      chosen: s.total - s.blank,
      blank: s.blank,
      byChoice: known
        .filter(l => s.byChoice[l])
        .map(l => ({ label: l, count: s.byChoice[l] }))
        .concat(
          Object.keys(s.byChoice)
            .filter(l => !known.includes(l))
            .map(l => ({ label: l, count: s.byChoice[l] }))
        ),
    }));

  // Sponsors still missing choices (chase list)
  const { results: missRows } = await env.GALA_DB.prepare(
    `SELECT
        COALESCE(NULLIF(TRIM(sp.company),''),
                 NULLIF(TRIM(sp.first_name || ' ' || sp.last_name),''),
                 '(unassigned)') AS sponsor,
        COUNT(*) AS seats,
        SUM(CASE WHEN TRIM(COALESCE(sa.dinner_choice,'')) = '' THEN 1 ELSE 0 END) AS blanks
       FROM seat_assignments sa
       LEFT JOIN sponsors sp ON sp.id = sa.sponsor_id
      WHERE sa.status = 'assigned'
      GROUP BY sa.sponsor_id
      HAVING blanks > 0
      ORDER BY blanks DESC, sponsor ASC`
  ).all();

  const missing = (missRows || []).map(r => ({
    sponsor: r.sponsor, seats: r.seats, blanks: r.blanks,
  }));

  return jsonOk({ total, chosen, blank, choices, showings, missing });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
