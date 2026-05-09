// POST /api/gala/chat/slack-event
// Slack Events API webhook. Receives:
//   - URL verification challenges (initial Slack setup)
//   - message events from #gala-helpline (Scott's replies in threads)
//
// We only care about thread replies in our channel. We match by the parent
// message's thread_ts back to our chat_threads row, then insert as 'agent'.

import { verifySlackSignature, jsonResponse } from './_helpers.js';

export async function onRequestPost({ request, env }) {
  const rawBody = await request.text();

  // Verify request came from Slack
  if (env.SLACK_SIGNING_SECRET) {
    const ok = await verifySlackSignature(request, rawBody, env.SLACK_SIGNING_SECRET);
    if (!ok) return new Response('invalid signature', { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 });
  }

  // URL verification handshake
  if (payload.type === 'url_verification') {
    return new Response(payload.challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (payload.type !== 'event_callback' || !payload.event) {
    return jsonResponse({ ok: true });
  }

  const ev = payload.event;

  // Only process thread replies in our helpline channel from real users (not the bot itself)
  if (ev.type !== 'message') return jsonResponse({ ok: true });
  if (ev.channel !== env.SLACK_HELPLINE_CHANNEL) return jsonResponse({ ok: true });
  if (!ev.thread_ts) return jsonResponse({ ok: true });            // not a thread reply
  if (ev.thread_ts === ev.ts) return jsonResponse({ ok: true });   // is the parent
  if (ev.bot_id || ev.subtype === 'bot_message') return jsonResponse({ ok: true });
  if (ev.subtype === 'message_changed' || ev.subtype === 'message_deleted') {
    return jsonResponse({ ok: true });
  }

  // Find the chat thread by parent ts
  const thread = await env.GALA_DB.prepare(
    'SELECT id, mode FROM chat_threads WHERE slack_thread_ts = ?'
  ).bind(ev.thread_ts).first();
  if (!thread) {
    return jsonResponse({ ok: true, ignored: 'no_matching_thread' });
  }

  // Idempotency — same Slack message ts shouldn't be inserted twice
  const existing = await env.GALA_DB.prepare(
    'SELECT id FROM chat_messages WHERE slack_message_ts = ?'
  ).bind(ev.ts).first();
  if (existing) return jsonResponse({ ok: true, ignored: 'duplicate' });

  // Strip Slack mentions and convert simple formatting
  const text = (ev.text || '')
    .replace(/<@U[A-Z0-9]+>/g, '')
    .replace(/<#C[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<((?:https?|mailto):[^|>]+)\|([^>]+)>/g, '$2 ($1)')
    .replace(/<((?:https?|mailto):[^>]+)>/g, '$1')
    .trim();

  if (!text) return jsonResponse({ ok: true, ignored: 'empty' });

  await env.GALA_DB.prepare(
    `INSERT INTO chat_messages (thread_id, sender, content, slack_message_ts)
     VALUES (?, 'agent', ?, ?)`
  ).bind(thread.id, text, ev.ts).run();
  await env.GALA_DB.prepare(
    "UPDATE chat_threads SET last_activity = datetime('now') WHERE id = ?"
  ).bind(thread.id).run();

  return jsonResponse({ ok: true });
}
