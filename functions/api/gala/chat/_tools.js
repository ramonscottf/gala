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
      "Get the URL of the user's booking portal so they can make changes themselves (add/remove seats, change a movie, update dinner choices). Use this whenever a user wants to actually CHANGE something — Booker is read-only and doesn't make changes directly. Always include this link when the user has a request that needs the portal.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
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
// Tool dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export async function dispatchTool(env, tokenContext, name, input) {
  switch (name) {
    case 'get_my_booking':
      return await getMyBooking(env, tokenContext);
    case 'list_movies':
      return await listMovies(env);
    case 'check_showing_availability':
      return await checkShowingAvailability(env, input.showing_number);
    case 'get_portal_link':
      return getPortalLink(tokenContext);
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
