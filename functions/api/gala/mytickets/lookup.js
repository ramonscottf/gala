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
  // Prefix + contains match, case-insensitive. Return up to a few
  // candidates if ambiguous so the guest can disambiguate by name only.
  const like = `%${value.replace(/[%_]/g, '')}%`;
  const matches = await env.GALA_DB.prepare(
    `SELECT id, company, email, secondary_email, seats_purchased
       FROM sponsors
      WHERE archived_at IS NULL
        AND company LIKE ? COLLATE NOCASE
      ORDER BY
        CASE WHEN company LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END,
        company
      LIMIT 6`
  ).bind(like, `${value.replace(/[%_]/g, '')}%`).all();

  const results = matches.results || [];
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
