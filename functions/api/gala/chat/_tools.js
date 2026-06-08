// functions/api/gala/chat/_tools.js
//
// Booker's tool definitions for Anthropic function-calling. All tools are
// READ-ONLY in v1 — they can read sponsor/delegation data from D1 but
// cannot write anything. Writes go through /sponsor/[token]/pick.
//
// Auth model: every tool receives `tokenContext`, which is the result of
// resolveToken(env, token). If tokenContext is null, the tools return an
// auth error and Booker falls back to FAQ-only answers.
//
// Token comes from the page URL (extracted by chat-widget.js, sent as
// X-Gala-Sponsor-Token header on the chat message).

import { resolveToken } from '../_sponsor_portal.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions (Anthropic function-calling schema)
// ─────────────────────────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'get_my_booking',
    description:
      "Look up the current user's booking — their name, sponsor tier, how many seats they've purchased, how many they've assigned to specific people, and details about each seated attendee (name, theater, row, seat, showing, movie title, dinner choice). Use this whenever the user asks about THEIR booking specifically: 'what did I book', 'where are my seats', 'who's in my group', 'what movie did we pick', 'do I have any seats left'. Returns nothing useful if the user is not on a sponsor portal page (no token).",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_movies',
    description:
      "Get the list of all active movies playing at the gala, with their runtime, rating, and a short synopsis. Use this when the user asks 'what movies are playing', 'what are the options', or wants help choosing between movies. Don't use this for personalized 'what did I pick' questions — use get_my_booking for that.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'check_showing_availability',
    description:
      "Check seat availability per theater for a specific showing (1 = early/4:30 PM, 2 = late/7:15 PM). Returns each theater's tier, capacity, how many seats are taken, and how many remain. Use this when the user is curious about whether there's room left somewhere, or wants to compare theaters, or is thinking about switching showings.",
    input_schema: {
      type: 'object',
      properties: {
        showing_number: {
          type: 'integer',
          enum: [1, 2],
          description: 'Which showing to check: 1 for early (4:30 PM), 2 for late (7:15 PM).',
        },
      },
      required: ['showing_number'],
    },
  },
  {
    name: 'get_portal_link',
    description:
      "Get the URL of the user's booking portal so they can do things Booker can't do directly — ADD or REMOVE seats, change which MOVIE they're seeing, or update DINNER choices. (Booker CAN move/swap a guest's existing seats himself via move_my_seat; everything else goes through the portal.) Use this whenever a user wants to add/remove a seat, switch movies, or change dinner.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'move_my_seat',
    description:
      "Move ONE of THIS user's own seats to a different spot in the SAME theater and SAME showing — either into an empty seat, or by swapping it with ANOTHER seat that also belongs to this same booking (to reorder their own party). Use this when the user wants to sit somewhere else or sit their group together: 'move us to row F', 'put my wife next to me', 'can we scoot down two seats', 'swap my seat with my son's'.\n\nWORKFLOW: ALWAYS call get_my_booking first to get the exact theater, showing, row, and seat numbers of their seats — never guess coordinates. To land in an empty seat, use check_showing_availability or ask the user which open seat they want.\n\nSTRICT RULES — the system enforces every one of these and will REJECT violations, so don't promise anything outside them:\n- You can ONLY move a seat that belongs to THIS user's booking. You can never move someone else's seat.\n- The destination must be EMPTY, or another seat that ALSO belongs to this booking (a swap within their own group). You can never move into or swap with a stranger's seat.\n- You CANNOT add seats, remove/release seats, or change how many seats they have. Moves only.\n- You CANNOT change their movie, theater, or showing. A move stays in the same theater and showing.\n- For adding/removing seats, changing movie, or changing dinner, use get_portal_link instead — that's not a move.\n\nIf there's any ambiguity about which seat or where, confirm the exact from→to with the user before calling. After a successful move, tell them their new seat.",
    input_schema: {
      type: 'object',
      properties: {
        theater_id: {
          type: 'integer',
          description: 'The theater/auditorium number, matching the theater of the seat being moved (from get_my_booking).',
        },
        showing_number: {
          type: 'integer',
          enum: [1, 2],
          description: '1 = early (4:30 PM), 2 = late (7:15 PM). Must match the showing of the seat being moved.',
        },
        from: {
          type: 'object',
          description: "The user's own seat to move.",
          properties: {
            row_label: { type: 'string', description: "Row letter, e.g. 'F'." },
            seat_num: { type: 'string', description: "Seat number, e.g. '12'." },
          },
          required: ['row_label', 'seat_num'],
        },
        to: {
          type: 'object',
          description: 'The destination seat in the SAME theater and showing — empty, or another seat in this same booking (for a swap).',
          properties: {
            row_label: { type: 'string', description: "Row letter, e.g. 'F'." },
            seat_num: { type: 'string', description: "Seat number, e.g. '14'." },
          },
          required: ['row_label', 'seat_num'],
        },
      },
      required: ['theater_id', 'showing_number', 'from', 'to'],
    },
  },
];

// lookup_booking — token-free lookup for the public "My Tickets" page. Booker
// searches by company name or RSVP email and shows the (non-secret) booking
// himself, instead of telling the guest to use a form. Same data the open
// /api/gala/mytickets/lookup endpoint already returns on screen.
export const LOOKUP_TOOL = {
  name: 'lookup_booking',
  description:
    "Find a guest's gala booking by their COMPANY NAME or the EMAIL they used to RSVP, and return their seats, theater/auditorium, movie, showtimes, and dinner choices. Use this on the My Tickets page whenever someone wants to find or see their tickets/seats — DO IT FOR THEM, never tell them to type into a form. If you don't yet know their company or email, ask for it, then call this. If it returns multiple matching companies, show that list and ask which one. If it finds nothing, ask them to try a shorter company name or their email. This is READ-ONLY — it shows the booking but cannot change anything.",
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: "The company name or email address to look up. If it looks like an email (contains @), it's matched exactly; otherwise it's a company-name search.",
      },
    },
    required: ['query'],
  },
};

// Toolset for the self-serve My Tickets concierge (no token). lookup_booking
// + the token-free informational tools. Deliberately excludes get_my_booking
// and get_portal_link (both require a token / would emit a token link).
export const SELFSERVE_TOOL_DEFINITIONS = [
  LOOKUP_TOOL,
  ...TOOL_DEFINITIONS.filter(
    t => t.name === 'list_movies' || t.name === 'check_showing_availability'
  ),
];

// ─────────────────────────────────────────────────────────────────────────────
// Token context — extract the sponsor or delegation context from the request
// ─────────────────────────────────────────────────────────────────────────────

export async function getTokenContext(request, env) {
  const token = (request.headers.get('X-Gala-Sponsor-Token') || '').trim();
  if (!token) return null;
  try {
    return await resolveToken(env, token);
  } catch (err) {
    console.error('resolveToken failed:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getMyticketsContext — read-only booking awareness for the /mytickets page
// ─────────────────────────────────────────────────────────────────────────────
//
// On the walk-up /mytickets page there is no edit token. After a guest looks
// up their tickets, the page forwards the matched (non-secret) sponsor id via
// the X-Gala-Mytickets-Sponsor header. We resolve it to the SAME read-only
// seat snapshot the open lookup endpoint already returns on screen — seats,
// movie, showtimes, dinner. Deliberately NO token, NO portal link, NO contact
// info. This gives Booker enough to answer personalized day-of questions
// ("which theater am I in?", "when does my movie start?") without granting any
// ability to change anything. Returns null when the header is absent/invalid.
const MYTICKETS_DINNER_LABELS = {
  frenchdip: 'Hot French Dip',
  salad: 'Chicken Salad',
  veggie: 'Vegetarian',
  kids: 'Kids Meal',
};

export async function getMyticketsContext(request, env) {
  const raw = (request.headers.get('X-Gala-Mytickets-Sponsor') || '').trim();
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;

  const sponsor = await env.GALA_DB.prepare(
    `SELECT id, company, first_name, last_name
       FROM sponsors WHERE id = ? AND archived_at IS NULL LIMIT 1`
  ).bind(id).first();
  if (!sponsor) return null;

  const showings = await loadShowingsForSponsor(env, id);
  const name = sponsor.first_name
    ? `${sponsor.first_name} ${sponsor.last_name || ''}`.trim()
    : sponsor.company;

  return {
    kind: 'mytickets',
    name,
    company: sponsor.company,
    showings,
  };
}

// Shared seat-grouping loader — used by getMyticketsContext (injected snapshot)
// and the lookup_booking tool. Groups a sponsor's seats by theater:showing
// with movie + showtimes + dinner labels. Read-only, non-secret seat data.
async function loadShowingsForSponsor(env, sponsorId) {
  const rs = await env.GALA_DB.prepare(
    `SELECT sa.theater_id, sa.showing_number, sa.row_label, sa.seat_num, sa.dinner_choice,
            m.title AS movie_title, st.show_start, st.dinner_time
       FROM seat_assignments sa
       LEFT JOIN showtimes st ON st.theater_id = sa.theater_id
            AND st.showing_number = sa.showing_number
       LEFT JOIN movies m ON m.id = st.movie_id
      WHERE sa.sponsor_id = ?
      ORDER BY sa.theater_id, sa.showing_number, sa.row_label, CAST(sa.seat_num AS INTEGER)`
  ).bind(sponsorId).all();

  const groups = new Map();
  for (const r of (rs.results || [])) {
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
      dinner_label: r.dinner_choice
        ? (MYTICKETS_DINNER_LABELS[r.dinner_choice] || r.dinner_choice)
        : null,
    });
  }
  return Array.from(groups.values());
}

// lookup_booking implementation — search by email (exact) or company (LIKE),
// return the read-only booking, a candidate list for multi-match, or not-found.
// Mirrors the public /api/gala/mytickets/lookup search. No token, no contact
// info, no portal link in the output.
async function lookupBooking(env, input) {
  const query = String(input?.query || '').trim();
  if (!query) {
    return { found: false, message: 'Ask the guest for their company name or the email they used to RSVP, then look it up.' };
  }

  if (query.includes('@')) {
    const email = query.toLowerCase();
    const sponsor = await env.GALA_DB.prepare(
      `SELECT id, company, first_name, last_name FROM sponsors
        WHERE archived_at IS NULL AND (LOWER(email) = ? OR LOWER(secondary_email) = ?)
        LIMIT 1`
    ).bind(email, email).first();
    if (!sponsor) {
      return { found: false, message: `No booking found for ${query}. Double-check the email, or try the company name instead.` };
    }
    return await bookingResult(env, sponsor);
  }

  const like = `%${query}%`;
  const rs = await env.GALA_DB.prepare(
    `SELECT id, company, first_name, last_name FROM sponsors
      WHERE archived_at IS NULL AND company LIKE ? COLLATE NOCASE
      ORDER BY CASE WHEN company LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, company
      LIMIT 10`
  ).bind(like, `${query}%`).all();
  const rows = rs.results || [];
  if (rows.length === 0) {
    return { found: false, message: `No booking found for "${query}". Try a shorter version of the company name, or the email used to RSVP.` };
  }
  if (rows.length > 1) {
    return {
      found: false,
      multiple: true,
      candidates: rows.map(r => r.company),
      message: 'Multiple companies match — list them and ask the guest which one.',
    };
  }
  return await bookingResult(env, rows[0]);
}

async function bookingResult(env, sponsor) {
  const showings = await loadShowingsForSponsor(env, sponsor.id);
  const name = sponsor.first_name
    ? `${sponsor.first_name} ${sponsor.last_name || ''}`.trim()
    : sponsor.company;
  return {
    found: true,
    name,
    company: sponsor.company,
    has_seats: showings.length > 0,
    showings,
    note: 'READ-ONLY. To change anything, the guest taps "Email me my portal link" on this page — that sends a private link to the email on file, and on that page Booker can actually move their seats for them. For any other help, text or call Scott at 801-810-6642. Do not output a portal link or token.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export async function dispatchTool(env, tokenContext, name, input) {
  switch (name) {
    case 'lookup_booking':
      return await lookupBooking(env, input);
    case 'get_my_booking':
      return await getMyBooking(env, tokenContext);
    case 'list_movies':
      return await listMovies(env);
    case 'check_showing_availability':
      return await checkShowingAvailability(env, input.showing_number);
    case 'get_portal_link':
      return getPortalLink(tokenContext);
    case 'move_my_seat':
      return await moveMySeat(env, tokenContext, input);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// get_my_booking
// ─────────────────────────────────────────────────────────────────────────────

async function getMyBooking(env, tokenContext) {
  if (!tokenContext) {
    return {
      error: 'no_token',
      message:
        "I can only look up bookings when you're on your personal booking page. If you have an invite link from your email, open that and ask me again here.",
    };
  }

  if (tokenContext.kind === 'sponsor') {
    const s = tokenContext.record;
    const seats = await env.GALA_DB.prepare(
      `SELECT
         sa.id, sa.theater_id, sa.row_label, sa.seat_num, sa.showing_number,
         sa.guest_name, sa.attendee_id, sa.dinner_choice, sa.status, sa.delegation_id,
         a.full_name AS attendee_name, a.email AS attendee_email,
         t.tier AS theater_tier, t.capacity AS theater_capacity,
         m.title AS movie_title, m.runtime_minutes, m.rating
         FROM seat_assignments sa
         LEFT JOIN attendees a ON a.id = sa.attendee_id
         LEFT JOIN theaters t ON t.id = sa.theater_id
         LEFT JOIN showtimes st ON st.theater_id = sa.theater_id
              AND st.showing_number = sa.showing_number
         LEFT JOIN movies m ON m.id = st.movie_id
        WHERE sa.sponsor_id = ?
        ORDER BY sa.showing_number, sa.theater_id, sa.row_label, CAST(sa.seat_num AS INTEGER)`
    ).bind(s.id).all();

    const assigned = (seats.results || []).map(formatSeat);

    return {
      kind: 'sponsor',
      sponsor_id: s.id,
      company: s.company,
      contact_name: [s.first_name, s.last_name].filter(Boolean).join(' ').trim(),
      contact_email: s.email,
      tier: s.sponsorship_tier,
      seats_purchased: s.seats_purchased,
      seats_assigned: assigned.length,
      seats_remaining: Math.max(0, (s.seats_purchased || 0) - assigned.length),
      rsvp_status: s.rsvp_status,
      attendees: assigned,
    };
  }

  if (tokenContext.kind === 'delegation') {
    const d = tokenContext.record;
    const seats = await env.GALA_DB.prepare(
      `SELECT
         sa.id, sa.theater_id, sa.row_label, sa.seat_num, sa.showing_number,
         sa.guest_name, sa.attendee_id, sa.dinner_choice, sa.status,
         a.full_name AS attendee_name, a.email AS attendee_email,
         t.tier AS theater_tier,
         m.title AS movie_title, m.runtime_minutes, m.rating
         FROM seat_assignments sa
         LEFT JOIN attendees a ON a.id = sa.attendee_id
         LEFT JOIN theaters t ON t.id = sa.theater_id
         LEFT JOIN showtimes st ON st.theater_id = sa.theater_id
              AND st.showing_number = sa.showing_number
         LEFT JOIN movies m ON m.id = st.movie_id
        WHERE sa.delegation_id = ?
        ORDER BY sa.showing_number, sa.theater_id, sa.row_label, CAST(sa.seat_num AS INTEGER)`
    ).bind(d.id).all();

    const assigned = (seats.results || []).map(formatSeat);

    return {
      kind: 'delegation',
      delegation_id: d.id,
      delegate_name: d.delegate_name,
      delegate_email: d.delegate_email,
      parent_company: d.parent_company,
      parent_tier: d.parent_tier,
      seats_allocated: d.seats_allocated,
      seats_assigned: assigned.length,
      seats_remaining: Math.max(0, (d.seats_allocated || 0) - assigned.length),
      attendees: assigned,
    };
  }

  return { error: 'unknown_kind' };
}

function formatSeat(row) {
  return {
    name: row.attendee_name || row.guest_name || '(unassigned)',
    email: row.attendee_email || null,
    theater: `Theater ${row.theater_id}`,
    theater_tier: row.theater_tier,
    row: row.row_label,
    seat: row.seat_num,
    showing: row.showing_number === 1 ? 'early (4:30 PM)' : 'late (7:15 PM)',
    movie: row.movie_title || '(no movie assigned yet)',
    movie_runtime_min: row.runtime_minutes || null,
    movie_rating: row.rating || null,
    dinner_choice: row.dinner_choice || null,
    status: row.status || 'assigned',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// list_movies
// ─────────────────────────────────────────────────────────────────────────────

async function listMovies(env) {
  const r = await env.GALA_DB.prepare(
    `SELECT m.id, m.title, m.runtime_minutes, m.rating, m.synopsis,
            (SELECT COUNT(*) FROM showtimes st WHERE st.movie_id = m.id AND st.showing_number = 1) AS showing1_count,
            (SELECT COUNT(*) FROM showtimes st WHERE st.movie_id = m.id AND st.showing_number = 2) AS showing2_count
       FROM movies m
      WHERE m.active = 1
      ORDER BY m.title`
  ).all();
  return {
    movies: (r.results || []).map(m => ({
      title: m.title,
      runtime_minutes: m.runtime_minutes,
      rating: m.rating,
      synopsis: m.synopsis,
      showings: [
        m.showing1_count > 0 ? 'early (4:30 PM)' : null,
        m.showing2_count > 0 ? 'late (7:15 PM)' : null,
      ].filter(Boolean),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// check_showing_availability
// ─────────────────────────────────────────────────────────────────────────────

async function checkShowingAvailability(env, showing_number) {
  if (showing_number !== 1 && showing_number !== 2) {
    return { error: 'showing_number must be 1 or 2' };
  }
  const r = await env.GALA_DB.prepare(
    `SELECT
       t.id AS theater_id, t.tier, t.capacity,
       m.title AS movie_title,
       (SELECT COUNT(*) FROM seat_assignments sa
          WHERE sa.theater_id = t.id AND sa.showing_number = ?) AS taken
       FROM theaters t
       LEFT JOIN showtimes st ON st.theater_id = t.id AND st.showing_number = ?
       LEFT JOIN movies m ON m.id = st.movie_id
      WHERE EXISTS (
        SELECT 1 FROM showtimes st2
         WHERE st2.theater_id = t.id AND st2.showing_number = ?
      )
      ORDER BY t.id`
  ).bind(showing_number, showing_number, showing_number).all();
  return {
    showing_number,
    showing_label: showing_number === 1 ? 'early (4:30 PM)' : 'late (7:15 PM)',
    theaters: (r.results || []).map(t => ({
      theater_id: t.theater_id,
      tier: t.tier,
      movie: t.movie_title || '(no movie assigned)',
      capacity: t.capacity,
      taken: t.taken,
      available: Math.max(0, (t.capacity || 0) - (t.taken || 0)),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// get_portal_link
// ─────────────────────────────────────────────────────────────────────────────

function getPortalLink(tokenContext) {
  if (!tokenContext) {
    return {
      error: 'no_token',
      message: "I don't see a booking portal for this session. The portal link comes from your email invite.",
    };
  }
  const token =
    tokenContext.kind === 'sponsor'
      ? tokenContext.record.rsvp_token
      : tokenContext.record.token;
  return {
    url: `https://gala.daviskids.org/sponsor/${token}`,
    label: 'Open my booking page',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// move_my_seat  (WRITE — token/concierge mode only)
// ─────────────────────────────────────────────────────────────────────────────
//
// The ONLY write Booker can perform. Bulletproof by construction: every rule is
// enforced here in code/SQL, never trusted to the model.
//
//   • Ownership scope is derived from the resolved token — a SPONSOR owns seats
//     by sponsor_id, a DELEGATE by delegation_id. The model never supplies it.
//   • The `from` seat MUST belong to this scope (else not_your_seat).
//   • The `to` seat MUST be empty, OR also belong to this same scope (a swap
//     within the user's own party). A stranger's seat is never touched.
//   • No INSERT (can't add seats) and no DELETE (can't release seats).
//   • Locked to the SAME theater + showing → movie assignment and the kitchen's
//     per-showing dinner counts are never disturbed.
//   • All four composite-key columns are bound on every write (composite-key-bug
//     discipline); swap uses the same park-and-place as /admin/move-seat.
//   • Best-effort audit on every successful change.
async function moveMySeat(env, tokenContext, input) {
  if (!tokenContext) {
    return {
      ok: false,
      error: 'no_token',
      message:
        "I can only move seats on your own private booking page (the secure link from your email). I can't change anything from the public lookup page.",
    };
  }

  let scopeCol, scopeId, ownerName;
  if (tokenContext.kind === 'sponsor') {
    scopeCol = 'sponsor_id';
    scopeId = tokenContext.record.id;
    ownerName = tokenContext.record.company;
  } else if (tokenContext.kind === 'delegation') {
    scopeCol = 'delegation_id';
    scopeId = tokenContext.record.id;
    ownerName = tokenContext.record.delegate_name;
  } else {
    return { ok: false, error: 'unknown_kind' };
  }

  const t = Number(input?.theater_id);
  const sh = Number(input?.showing_number);
  const fr = String(input?.from?.row_label || '').trim();
  const fn = String(input?.from?.seat_num || '').trim();
  const tr = String(input?.to?.row_label || '').trim();
  const tn = String(input?.to?.seat_num || '').trim();

  if (!t || (sh !== 1 && sh !== 2) || !fr || !fn || !tr || !tn) {
    return {
      ok: false,
      error: 'bad_input',
      message: 'I need the theater, showing, and both the from-seat and to-seat. Let me pull up your booking first.',
    };
  }
  if (fr === tr && fn === tn) {
    return { ok: false, error: 'same_seat', message: "That's already the seat you're in — nothing to move." };
  }

  // Source seat by exact coordinate.
  const src = await env.GALA_DB.prepare(
    `SELECT id, sponsor_id, delegation_id, guest_name, dinner_choice
       FROM seat_assignments
      WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?
      LIMIT 1`
  ).bind(t, sh, fr, fn).first();
  if (!src) {
    return { ok: false, error: 'from_empty', message: `Seat ${fr}${fn} is empty — let me re-check your booking so I have the right seat.` };
  }

  // OWNERSHIP — the source seat must belong to THIS booking.
  if (String(src[scopeCol] ?? '') !== String(scopeId)) {
    return {
      ok: false,
      error: 'not_your_seat',
      message: `Seat ${fr}${fn} isn't part of your booking, so I can't move it. I can only move your own seats.`,
    };
  }

  // Destination occupant (if any).
  const dst = await env.GALA_DB.prepare(
    `SELECT id, sponsor_id, delegation_id, guest_name
       FROM seat_assignments
      WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?
      LIMIT 1`
  ).bind(t, sh, tr, tn).first();

  if (!dst) {
    // ── MOVE into an open seat ──
    const held = await env.GALA_DB.prepare(
      `SELECT 1 FROM seat_holds
        WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?
          AND expires_at > datetime('now') LIMIT 1`
    ).bind(t, sh, tr, tn).first();
    if (held) {
      return { ok: false, error: 'held', message: `Seat ${tr}${tn} is being picked by someone right now — try another open seat.` };
    }

    // Re-assert ownership + exact source coords in the WHERE so a concurrent
    // change can't let this write land on the wrong row.
    const res = await env.GALA_DB.prepare(
      `UPDATE seat_assignments
          SET row_label = ?, seat_num = ?, updated_at = datetime('now'), assigned_by = 'booker-move'
        WHERE id = ? AND ${scopeCol} = ?
          AND theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?`
    ).bind(tr, tn, src.id, scopeId, t, sh, fr, fn).run();
    if ((res.meta?.changes || 0) === 0) {
      return { ok: false, error: 'move_failed', message: 'That seat just changed — let me re-check your booking and try again.' };
    }

    await logBookerMove(env, {
      sponsor_id: src.sponsor_id,
      action: 'booker_move_seat',
      detail: { scope: scopeCol, scope_id: scopeId, theater_id: t, showing_number: sh, from: `${fr}${fn}`, to: `${tr}${tn}`, guest: src.guest_name, owner: ownerName },
    });
    return {
      ok: true,
      kind: 'move',
      from: `${fr}${fn}`,
      to: `${tr}${tn}`,
      guest_name: src.guest_name,
      message: `Moved ${src.guest_name || 'your seat'} from ${fr}${fn} to ${tr}${tn}.`,
    };
  }

  // Destination is occupied — OWNERSHIP: it must be one of THIS booking's own
  // seats to allow a swap. Never swap with a stranger.
  if (String(dst[scopeCol] ?? '') !== String(scopeId)) {
    return {
      ok: false,
      error: 'dest_taken',
      message: `Seat ${tr}${tn} is taken by another guest, so I can't move you there. Pick an empty seat, or swap with one of your own seats.`,
    };
  }

  // ── SWAP two of the user's own seats ── park-and-place to dodge
  // UNIQUE(theater,showing,row,seat); both stay in the same theater/showing.
  const PARK_ROW = '__BKSWAP__';
  try {
    await env.GALA_DB.prepare(`UPDATE seat_assignments SET row_label = ?, seat_num = ? WHERE id = ?`)
      .bind(PARK_ROW, `${fr}${fn}`, src.id).run();
    await env.GALA_DB.prepare(`UPDATE seat_assignments SET row_label = ?, seat_num = ?, updated_at = datetime('now'), assigned_by = 'booker-move' WHERE id = ?`)
      .bind(fr, fn, dst.id).run();
    await env.GALA_DB.prepare(`UPDATE seat_assignments SET row_label = ?, seat_num = ?, updated_at = datetime('now'), assigned_by = 'booker-move' WHERE id = ?`)
      .bind(tr, tn, src.id).run();
  } catch (e) {
    // Best-effort un-park so we never strand the row.
    await env.GALA_DB.prepare(`UPDATE seat_assignments SET row_label = ?, seat_num = ? WHERE id = ? AND row_label = ?`)
      .bind(fr, fn, src.id, PARK_ROW).run().catch(() => {});
    return { ok: false, error: 'swap_failed', message: 'That swap hit a snag — let me re-check those two seats.' };
  }

  await logBookerMove(env, {
    sponsor_id: src.sponsor_id,
    action: 'booker_swap_seat',
    detail: { scope: scopeCol, scope_id: scopeId, theater_id: t, showing_number: sh, a: `${fr}${fn}`, b: `${tr}${tn}`, guest_a: src.guest_name, guest_b: dst.guest_name, owner: ownerName },
  });
  return {
    ok: true,
    kind: 'swap',
    a: `${fr}${fn}`,
    b: `${tr}${tn}`,
    guest_a: src.guest_name,
    guest_b: dst.guest_name,
    message: `Swapped ${fr}${fn} and ${tr}${tn}.`,
  };
}

// Best-effort audit. Tries audit_log (used by /admin/move-seats) first, then
// sponsor_actions_log (used by /admin/move-seat) — different envs have one or
// the other. Never throws.
async function logBookerMove(env, p) {
  try {
    await env.GALA_DB.prepare(
      `INSERT INTO audit_log (action, entity_type, entity_id, details, performed_by, performed_at)
       VALUES (?, 'seat', ?, ?, 'booker-move', datetime('now'))`
    ).bind(p.action, p.sponsor_id ?? null, JSON.stringify(p.detail || {})).run();
    return;
  } catch (_) { /* fall through */ }
  try {
    await env.GALA_DB.prepare(
      `INSERT INTO sponsor_actions_log (sponsor_id, action, detail, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).bind(p.sponsor_id ?? null, p.action, JSON.stringify(p.detail || {})).run();
  } catch (__) { /* no-op if neither table exists */ }
}
