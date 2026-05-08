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

/**
 * Load the per-sponsor marketing pipeline view. Returns the full schedule
 * with per-row status (sent | missed | not-targeted | upcoming) plus a
 * summary roll-up.
 */
export async function loadSponsorPipeline(sponsorId) {
  return fetchJson(`/api/gala/admin/sponsor-pipeline?sponsor_id=${encodeURIComponent(sponsorId)}`);
}

/**
 * Send one scheduled message to one sponsor. subject/body overrides are
 * optional — when omitted, the canonical pipeline copy is sent verbatim.
 * Logs to marketing_send_log with send_run_id = manual-{ts}-{id}.
 */
export async function sendOneToSponsor(sponsorId, sendId, { subjectOverride, bodyOverride } = {}) {
  const body = { sponsor_id: sponsorId, send_id: sendId };
  if (subjectOverride != null) body.subject_override = subjectOverride;
  if (bodyOverride != null)    body.body_override = bodyOverride;
  return fetchJson('/api/gala/admin/send-one', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
