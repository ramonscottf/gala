// POST /api/gala/chat/start
// Body: { name, email }
// Creates a new chat thread and sets a session cookie. Returns thread metadata.
// If a valid cookie already exists, returns the existing thread (no new row).

import { getOrCreateThread, jsonResponse } from './_helpers.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 });
  }
  const name = (body.name || '').toString().trim().slice(0, 80);
  const email = (body.email || '').toString().trim().toLowerCase().slice(0, 200);

  // Check existing cookie first; if valid, no need for name/email
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

  // New session — require both
  if (!name || !email) {
    return jsonResponse({ error: 'name_and_email_required' }, { status: 400 });
  }
  if (!email.includes('@') || !email.includes('.')) {
    return jsonResponse({ error: 'invalid_email' }, { status: 400 });
  }

  const created = await getOrCreateThread(request, env, name, email);
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
