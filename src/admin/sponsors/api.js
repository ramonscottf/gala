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
  return fetchJson(`/api/gala/sponsors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
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
