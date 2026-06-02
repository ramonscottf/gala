// POST /api/gala/mytickets/lookup
// Body: { mode: 'email' | 'company', value: string }
//
// Walk-up "look up my tickets" endpoint for the /mytickets sign page
// (QR / NFC at the event). Returns a sponsor's seats read-only so a
// guest can confirm where they're sitting and what they ordered.
//
// SECURITY MODEL (deliberate, see /mytickets sign discussion 2026-06-01):
//   - Seats are NON-secret: every attendee can see the room that night.
//     So we return row/seat/dinner/movie for both email and company
//     lookups.
//   - The portal token is an EDIT credential (whoever holds it can move
//     seats / change meals). We therefore NEVER return the token or the
//     /sponsor/<token> URL in this response.
//       * Email match  → caller demonstrably knows the registered email,
//         so the page offers a one-tap "email me my link" via the
//         existing request-link flow (link goes to the inbox, not the
//         screen). canEdit=true signals the page to show that button.
//       * Company match → ownership unproven. canEdit=false. The page
//         tells them to use the email path to make changes.
//   - We never return contact info (emails/phones) on screen. For the
//     company path we return a masked hint only.
//
// Reuses the seat→showtime→movie join and the dinner-label map used
// across the portal. No writes.

import { jsonError, jsonOk } from '../_sponsor_portal.js';

const DINNER_LABELS = {
  frenchdip: 'Hot French Dip',
  salad: 'Chicken Salad',
  veggie: 'Vegetarian',
  kids: 'Kids Meal',
};

function maskEmail(email) {
  if (!email || email.indexOf('@') < 1) return null;
  const [local, domain] = email.split('@');
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(2, local.length - 1))}@${domain}`;
}

// Levenshtein distance with an early-exit ceiling. Returns max+1 the
// moment every cell in a row exceeds `max`, so we never finish the matrix
// for clearly-unrelated strings. Plenty fast over ~100 short company
// names per request.
function boundedLev(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[lb];
}

// Pull a sponsor's seats, grouped by showing, with movie + times.
async function seatsForSponsor(env, sponsorId) {
  const rs = await env.GALA_DB.prepare(
    `SELECT sa.theater_id, sa.showing_number, sa.row_label, sa.seat_num,
            sa.dinner_choice, m.title AS movie_title,
            st.show_start, st.dinner_time
       FROM seat_assignments sa
       LEFT JOIN showtimes st
              ON st.theater_id = sa.theater_id
             AND st.showing_number = sa.showing_number
       LEFT JOIN movies m ON m.id = st.movie_id
      WHERE sa.sponsor_id = ?
      ORDER BY sa.theater_id, sa.showing_number,
               sa.row_label, CAST(sa.seat_num AS INTEGER)`
  ).bind(sponsorId).all();

  const rows = rs.results || [];
  // Group by (theater_id, showing_number) so a sponsor split across two
  // showings/auditoriums reads cleanly.
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.theater_id}:${r.showing_number}`;
    if (!groups.has(key)) {
      groups.set(key, {
        auditorium: r.theater_id,
        showing_number: r.showing_number,
        movie_title: r.movie_title || 'Movie TBA',
        show_start: r.show_start || null,
        dinner_time: r.dinner_time || null,
        seats: [],
      });
    }
    groups.get(key).seats.push({
      seat: `${r.row_label}${r.seat_num}`,
      row: r.row_label,
      num: r.seat_num,
      dinner: r.dinner_choice || null,
      dinner_label: r.dinner_choice ? (DINNER_LABELS[r.dinner_choice] || r.dinner_choice) : null,
    });
  }
  return Array.from(groups.values());
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid request', 400); }

  const mode = (body && body.mode) === 'company' ? 'company' : 'email';
  const value = String((body && body.value) || '').trim();
  if (!value) return jsonError('Please enter your email or company name.', 400);

  // ───── EMAIL ─────
  if (mode === 'email') {
    const email = value.toLowerCase();
    if (email.indexOf('@') < 1 || email.length > 254) {
      return jsonError('Please enter a valid email address.', 400);
    }
    const sponsor = await env.GALA_DB.prepare(
      `SELECT id, company, first_name, last_name, seats_purchased
         FROM sponsors
        WHERE archived_at IS NULL
          AND (LOWER(email) = ? OR LOWER(secondary_email) = ?)
        LIMIT 1`
    ).bind(email, email).first();

    if (!sponsor) {
      // Friendly miss — this is a find-my-tickets tool, not a secret.
      return jsonOk({ ok: true, match: 'none' });
    }

    const groups = await seatsForSponsor(env, sponsor.id);
    return jsonOk({
      ok: true,
      match: 'email',
      sponsor_id: sponsor.id,
      company: sponsor.company,
      name: sponsor.first_name
        ? `${sponsor.first_name} ${sponsor.last_name || ''}`.trim()
        : sponsor.company,
      seats_purchased: sponsor.seats_purchased || 0,
      placed: groups.reduce((n, g) => n + g.seats.length, 0),
      showings: groups,
      canEdit: true,        // page may offer "email me my link" (request-link)
      editEmail: email,     // echo back so the page can prefill request-link
    });
  }

  // ───── COMPANY ─────
  // Pass 1: prefix + contains match, case-insensitive.
  const cleaned = value.replace(/[%_]/g, '');
  const like = `%${cleaned}%`;
  let matches = await env.GALA_DB.prepare(
    `SELECT id, company, email, secondary_email, seats_purchased
       FROM sponsors
      WHERE archived_at IS NULL
        AND company LIKE ? COLLATE NOCASE
      ORDER BY
        CASE WHEN company LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END,
        company
      LIMIT 6`
  ).bind(like, `${cleaned}%`).all();

  let results = matches.results || [];

  // Pass 2 (fallback): no exact contains-match. Guests misspell school
  // names constantly (e.g. "Muller" vs the real "Mueller Park"), drop
  // words, or type just one word. Retry on each significant word the
  // guest typed (length >= 3, skipping common org filler), matching any
  // sponsor whose company contains that word. This rescues partial and
  // single-letter-off entries without a full fuzzy/Levenshtein engine.
  if (results.length === 0) {
    const STOP = new Set(['the','and','jr','sr','inc','llc','co','of','for','school','high','elementary','junior','dist']);
    const words = cleaned.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
    if (words.length) {
      const clauses = words.map(() => `company LIKE ? COLLATE NOCASE`).join(' OR ');
      const binds = words.map((w) => `%${w}%`);
      const fb = await env.GALA_DB.prepare(
        `SELECT id, company, email, secondary_email, seats_purchased
           FROM sponsors
          WHERE archived_at IS NULL AND (${clauses})
          ORDER BY company
          LIMIT 6`
      ).bind(...binds).all();
      results = fb.results || [];
    }
  }

  // Pass 3 (last resort): true typo tolerance for single/double-letter
  // errors the substring passes can't bridge (e.g. "Muller" → "Mueller",
  // which share no 3-char substring). The sponsor set is tiny (~100 rows)
  // so a bounded edit-distance scan in JS is cheap. Only fires when 1 & 2
  // found nothing; results still flow through the disambiguation UI.
  if (results.length === 0 && cleaned.length >= 4) {
    const all = await env.GALA_DB.prepare(
      `SELECT id, company, email, secondary_email, seats_purchased
         FROM sponsors WHERE archived_at IS NULL`
    ).all();
    const q = cleaned.toLowerCase();
    const scored = [];
    for (const r of (all.results || [])) {
      const comp = String(r.company || '').toLowerCase();
      // Compare the query against the whole company and its words; take
      // the best (smallest) distance. Tolerance scales with query length.
      const tol = q.length <= 5 ? 1 : 2;
      let best = boundedLev(q, comp, tol);
      if (best > tol) {
        for (const w of comp.split(/[^a-z0-9]+/)) {
          if (Math.abs(w.length - q.length) > tol) continue;
          const d = boundedLev(q, w, tol);
          if (d < best) best = d;
          if (best === 0) break;
        }
      }
      if (best <= tol) scored.push({ r, best });
    }
    scored.sort((a, b) => a.best - b.best);
    results = scored.slice(0, 6).map((s) => s.r);
  }


  if (results.length === 0) {
    return jsonOk({ ok: true, match: 'none' });
  }
  if (results.length > 1) {
    return jsonOk({
      ok: true,
      match: 'company_multi',
      candidates: results.map((r) => ({ id: r.id, company: r.company })),
    });
  }

  const sponsor = results[0];
  const groups = await seatsForSponsor(env, sponsor.id);
  return jsonOk({
    ok: true,
    match: 'company',
    company: sponsor.company,
    seats_purchased: sponsor.seats_purchased || 0,
    placed: groups.reduce((n, g) => n + g.seats.length, 0),
    showings: groups,
    canEdit: false,                                   // ownership unproven
    sponsor_id: sponsor.id,
    maskedEmail: maskEmail(sponsor.email || sponsor.secondary_email),
  });
}

// GET /api/gala/mytickets/lookup?id=<sponsorId> — used after a guest
// picks one company from a multi-match list. Same read-only contract,
// no token returned.
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.GALA_DB) return jsonError('Database not configured', 503);
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return jsonError('Missing id', 400);

  const sponsor = await env.GALA_DB.prepare(
    `SELECT id, company, email, secondary_email, seats_purchased
       FROM sponsors WHERE id = ? AND archived_at IS NULL LIMIT 1`
  ).bind(id).first();
  if (!sponsor) return jsonOk({ ok: true, match: 'none' });

  const groups = await seatsForSponsor(env, sponsor.id);
  return jsonOk({
    ok: true,
    match: 'company',
    company: sponsor.company,
    seats_purchased: sponsor.seats_purchased || 0,
    placed: groups.reduce((n, g) => n + g.seats.length, 0),
    showings: groups,
    canEdit: false,
    sponsor_id: sponsor.id,
    maskedEmail: maskEmail(sponsor.email || sponsor.secondary_email),
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
