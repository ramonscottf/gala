/**
 * API helpers for the sponsors React island.
 *
 * All admin routes are same-origin (gala.daviskids.org) and share the
 * existing cookie-based auth from Microsoft SSO via /admin/login.
 * Browser sends the cookie automatically — no token wrangling here.
 */

const J = { 'Content-Type': 'application/json' };

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...opts,
    headers: { ...J, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err && err.error) msg = err.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function loadSponsorsWithTracking() {
  const data = await fetchJson('/api/gala/admin/sponsors-with-tracking');
  return data.sponsors || [];
}

/**
 * Load a sponsor's actual seat selections by reusing the sponsor-facing
 * portal endpoint with their rsvp_token. Returns the same contract the
 * portal renders from, so the admin card shows exactly what the sponsor sees:
 *   - myAssignments: seats they placed directly
 *   - showtimes:     (theater_id, showing_number) → movie_title, etc.
 *   - childDelegationAssignments: seats they handed to invited guests
 * No new backend — same source of truth as the portal.
 */
export async function loadSponsorSeats(token) {
  if (!token) return { myAssignments: [], showtimes: [], childDelegationAssignments: [], allAssignments: [], allHolds: [], myToken: token };
  const data = await fetchJson(`/api/gala/portal/${token}`);
  const allHolds = [...(data.myHolds || []), ...(data.otherHolds || [])];
  return {
    myAssignments: data.myAssignments || [],
    showtimes: data.showtimes || [],
    childDelegationAssignments: data.childDelegationAssignments || [],
    allAssignments: data.allAssignments || [],
    allHolds,
    myToken: token,
  };
}

/**
 * Seat mutations via the portal pick endpoint, by the sponsor's token.
 * Every call binds showing_number explicitly (composite-key-bug safe) and
 * inherits pick.js's collision / orphan / loveseat guards.
 */
function pickAction(token, action, seat) {
  return fetchJson(`/api/gala/portal/${token}/pick`, {
    method: 'POST',
    body: JSON.stringify({
      action,
      theater_id: seat.theater_id,
      showing_number: seat.showing_number,
      row_label: seat.row_label,
      seat_num: seat.seat_num,
    }),
  });
}
// Claim an open seat = hold then finalize.
export async function claimSeat(token, seat) {
  await pickAction(token, 'hold', seat);
  return pickAction(token, 'finalize', seat);
}
// Give up one of this sponsor's assigned seats.
export async function releaseSeat(token, seat) {
  return pickAction(token, 'unfinalize', seat);
}

/**
 * Change a single seat's meal via the portal's set_dinner action, using the
 * sponsor's token. Reuses the exact endpoint the portal uses, which resolves
 * showing_number defensively and scopes the write to the full composite key —
 * so the admin never hand-writes seat SQL. dinner_choice of '' clears it.
 * Valid codes: frenchdip | salad | veggie | kids | '' (none).
 */
export async function setSeatDinner(token, { theater_id, showing_number, row_label, seat_num, dinner_choice }) {
  return fetchJson(`/api/gala/portal/${token}/pick`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'set_dinner',
      theater_id,
      showing_number,
      row_label,
      seat_num,
      dinner_choice: dinner_choice || '',
    }),
  });
}

export async function updateSponsor(id, patch) {
  return fetchJson('/api/gala/sponsors', {
    method: 'PATCH',
    body: JSON.stringify({ id, ...patch }),
  });
}

export async function createSponsor(data) {
  return fetchJson('/api/gala/sponsors', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function sendMessage(sponsorId, channel, body, subject) {
  // Uses the existing per-sponsor message endpoint that the legacy
  // drawer wires up (functions/api/gala/admin/sponsor-message.js).
  return fetchJson('/api/gala/admin/sponsor-message', {
    method: 'POST',
    body: JSON.stringify({
      sponsor_id: sponsorId,
      channel,
      message: body,
      subject: subject || undefined,
    }),
  });
}

export async function resendInvite(sponsorId) {
  return fetchJson('/api/gala/admin/send-invites', {
    method: 'POST',
    body: JSON.stringify({ sponsor_ids: [sponsorId], force: true }),
  });
}

// ── Marketing pipeline / catch-up ──────────────────────────────────────────
// Powers the "Catch-up" tab in the sponsor Composer. Loads the full
// pipeline schedule (all 5 phases, every send, fired + scheduled) so the
// admin can both replay an already-fired touchpoint AND pre-deliver one
// that hasn't gone out yet.

export async function loadMarketingPipeline() {
  const data = await fetchJson('/api/gala/marketing-pipeline');
  return data.phases || [];
}

export async function sendCatchUp(sponsorId, sendId) {
  return fetchJson('/api/gala/marketing-catch-up-send', {
    method: 'POST',
    body: JSON.stringify({ sponsorId, sendId }),
  });
}
