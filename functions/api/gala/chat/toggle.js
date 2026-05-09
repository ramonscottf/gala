// POST /api/gala/chat/toggle
// Body: { mode: 'ai' | 'live' }
// Switches the current thread between AI Helper and Live Help modes.

import { getOrCreateThread, recordMessage, jsonResponse } from './_helpers.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 });
  }
  const mode = (body.mode || '').toString();
  if (mode !== 'ai' && mode !== 'live') {
    return jsonResponse({ error: 'invalid_mode' }, { status: 400 });
  }
  const session = await getOrCreateThread(request, env, null, null);
  if (!session.thread) return jsonResponse({ error: 'no_session' }, { status: 401 });

  await env.GALA_DB.prepare('UPDATE chat_threads SET mode = ? WHERE id = ?')
    .bind(mode, session.thread.id).run();

  const note = mode === 'live'
    ? "Switched to Live Help. Your next message will reach Scott directly."
    : "Switched to AI Helper. I'll do my best to answer your questions.";
  await recordMessage(env, session.thread.id, 'system', note);

  return jsonResponse({ ok: true, mode, system_note: note });
}
