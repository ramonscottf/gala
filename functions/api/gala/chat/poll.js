// GET /api/gala/chat/poll?since={iso8601}
// Returns any messages added to this thread after `since` (defaults to all).
// The widget polls every 6 seconds while in 'live' mode to surface Slack replies.

import { getOrCreateThread, jsonResponse } from './_helpers.js';

export async function onRequestGet({ request, env }) {
  const session = await getOrCreateThread(request, env, null, null);
  if (!session.thread) return jsonResponse({ error: 'no_session' }, { status: 401 });

  const url = new URL(request.url);
  const since = url.searchParams.get('since') || '1970-01-01T00:00:00.000Z';

  const { results } = await env.GALA_DB.prepare(
    `SELECT id, sender, content, created_at FROM chat_messages
     WHERE thread_id = ? AND created_at > ?
     ORDER BY created_at ASC LIMIT 50`
  ).bind(session.thread.id, since).all();

  return jsonResponse({
    ok: true,
    thread_id: session.thread.id,
    mode: session.thread.mode,
    messages: results,
    server_now: new Date().toISOString(),
  });
}
