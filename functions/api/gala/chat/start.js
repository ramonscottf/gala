// POST /api/gala/chat/start
// Body: { name?, email? }
//
// Anonymous-friendly: name and email are now OPTIONAL. Booker is openable
// without an identity gate so visitors can ask FAQ questions immediately.
// Identity will be requested at the moment of live escalation (when we
// turn Slack handoff back on), not as an entry barrier.
//
// If a valid cookie already exists, the existing thread is returned.

import { getOrCreateThread, jsonResponse } from './_helpers.js';

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine for anonymous start
  }
  const name = body.name ? body.name.toString().trim().slice(0, 80) : null;
  const email = body.email ? body.email.toString().trim().toLowerCase().slice(0, 200) : null;

  // Validate email format only if provided
  if (email && (!email.includes('@') || !email.includes('.'))) {
    return jsonResponse({ error: 'invalid_email' }, { status: 400 });
  }

  // Existing cookie → return existing thread
  const existing = await getOrCreateThread(request, env, null, null);
  if (existing.thread) {
    return jsonResponse({
      thread_id: existing.thread.id,
      mode: existing.thread.mode,
      name: existing.thread.attendee_name,
      email: existing.thread.attendee_email,
      resumed: true,
    });
  }

  // New session — create with whatever identity we have (or none)
  const created = await getOrCreateThread(request, env, name, email, { allowAnonymous: true });
  if (!created.thread) {
    return jsonResponse({ error: 'thread_creation_failed' }, { status: 500 });
  }
  return jsonResponse(
    {
      thread_id: created.thread.id,
      mode: created.thread.mode,
      name: created.thread.attendee_name,
      email: created.thread.attendee_email,
      resumed: false,
    },
    { headers: { 'Set-Cookie': created.cookieHeader } }
  );
}
