// Shared helpers for the gala chat (FAQ + live help bubble).
//
// Three responsibilities:
//   1. Thread/cookie management (anonymous-but-gated session via name+email)
//   2. AI Gateway → Claude Haiku call with FAQ context
//   3. Slack outbound (post message) and Slack inbound verification
//
// Env vars expected (set in Cloudflare dashboard, not committed):
//   ANTHROPIC_API_KEY            - for AI Gateway (Claude Haiku)
//   SLACK_BOT_TOKEN              - xoxb-... for posting and threading
//   SLACK_HELPLINE_CHANNEL       - channel ID like C09XXXX (gala-helpline)
//   SLACK_SIGNING_SECRET         - for verifying inbound Events API webhooks
//   CHAT_COOKIE_SECRET           - HMAC secret for thread cookie

const COOKIE_NAME = 'gala_chat_thread';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const AI_GATEWAY_URL = 'https://gateway.ai.cloudflare.com/v1/77f3d6611f5ceab7651744268d434342/skippy/anthropic/v1/messages';

// ---------- crypto helpers ----------

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function ipHash(request, secret) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return (await hmacHex(secret, ip)).slice(0, 16);
}

// ---------- thread / cookie ----------

export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

export function uuid() {
  return crypto.randomUUID();
}

export function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function makeCookieHeader(threadId) {
  return [
    `${COOKIE_NAME}=${threadId}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE}`,
    'SameSite=Lax',
    'Secure',
    'HttpOnly',
  ].join('; ');
}

export async function getOrCreateThread(request, env, name, email) {
  const existingId = getCookie(request, COOKIE_NAME);
  if (existingId) {
    const row = await env.GALA_DB.prepare(
      'SELECT id, mode, slack_thread_ts, attendee_name, attendee_email FROM chat_threads WHERE id = ?'
    ).bind(existingId).first();
    if (row) {
      // Update last_activity, return existing
      await env.GALA_DB.prepare(
        "UPDATE chat_threads SET last_activity = datetime('now') WHERE id = ?"
      ).bind(existingId).run();
      return { thread: row, isNew: false, cookieHeader: null };
    }
  }
  if (!name || !email) {
    return { thread: null, isNew: false, cookieHeader: null, needsIdentity: true };
  }
  const id = uuid();
  const ipH = await ipHash(request, env.CHAT_COOKIE_SECRET || 'fallback');
  const ua = (request.headers.get('User-Agent') || '').slice(0, 200);
  await env.GALA_DB.prepare(
    `INSERT INTO chat_threads (id, attendee_name, attendee_email, mode, user_agent, ip_hash)
     VALUES (?, ?, ?, 'ai', ?, ?)`
  ).bind(id, name, email, ua, ipH).run();
  return {
    thread: { id, mode: 'ai', slack_thread_ts: null, attendee_name: name, attendee_email: email },
    isNew: true,
    cookieHeader: makeCookieHeader(id),
  };
}

export async function recordMessage(env, threadId, sender, content, extras = {}) {
  await env.GALA_DB.prepare(
    `INSERT INTO chat_messages (thread_id, sender, content, ai_model, ai_tokens_in, ai_tokens_out, slack_message_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    threadId,
    sender,
    content,
    extras.ai_model || null,
    extras.ai_tokens_in || null,
    extras.ai_tokens_out || null,
    extras.slack_message_ts || null
  ).run();
  await env.GALA_DB.prepare(
    "UPDATE chat_threads SET last_activity = datetime('now') WHERE id = ?"
  ).bind(threadId).run();
}

// ---------- AI Gateway (Claude Haiku) ----------

export async function loadFaqContext(env) {
  const { results } = await env.GALA_DB.prepare(
    `SELECT category, question, answer FROM chat_faq WHERE active = 1 ORDER BY category, priority`
  ).all();
  const grouped = {};
  for (const row of results) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(`Q: ${row.question}\nA: ${row.answer}`);
  }
  return Object.entries(grouped)
    .map(([cat, items]) => `## ${cat.toUpperCase()}\n\n${items.join('\n\n')}`)
    .join('\n\n');
}

export async function loadShowtimes(env) {
  const { results } = await env.GALA_DB.prepare(
    `SELECT s.show_start, s.dinner_time, s.showing_number, t.tier, m.title, m.runtime_minutes, m.rating
     FROM showtimes s
     LEFT JOIN movies m ON s.movie_id = m.id
     LEFT JOIN theaters t ON s.theater_id = t.id
     WHERE m.id IS NOT NULL AND m.active = 1
     ORDER BY s.showing_number, t.tier`
  ).all();
  if (!results.length) return '';
  const byShowing = {};
  for (const r of results) {
    const key = `Showing ${r.showing_number} — ${r.show_start}`;
    if (!byShowing[key]) byShowing[key] = [];
    byShowing[key].push(`${r.title} (${r.rating}, ${r.runtime_minutes} min) — ${r.tier} tier`);
  }
  return Object.entries(byShowing)
    .map(([k, v]) => `${k}\n${[...new Set(v)].map(x => '  - ' + x).join('\n')}`)
    .join('\n\n');
}

export async function loadHistory(env, threadId, limit = 12) {
  const { results } = await env.GALA_DB.prepare(
    `SELECT sender, content FROM chat_messages
     WHERE thread_id = ? AND sender IN ('user', 'ai', 'agent')
     ORDER BY created_at DESC LIMIT ?`
  ).bind(threadId, limit).all();
  return results.reverse();
}

export async function callHaiku(env, systemPrompt, history) {
  const messages = history.map(m => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));
  // Ensure conversation starts with user
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const resp = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Haiku error ${resp.status}: ${errText}`);
  }
  const data = await resp.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return {
    text,
    usage: data.usage || {},
    model: data.model || 'claude-haiku-4-5',
  };
}

export function buildSystemPrompt(faqText, showtimesText) {
  return `You are the friendly assistant for the Davis Education Foundation Gala 2026, a fundraising event happening Wednesday, June 10, 2026 at Megaplex Theatres at The Junction in Centerville, Utah.

Your job is to answer attendees' questions clearly and warmly using the FAQ knowledge base below. Stay concise (2-4 sentences when possible). If the question is not covered, suggest tapping the "Live Help" toggle at the top of the chat to reach Scott directly.

Tone: warm, helpful, a bit upbeat — this is a community fundraiser, not a sterile customer service desk. Use plain language. No jargon.

Rules:
- Only answer from the FAQ and showtimes data below. Do not invent specific prices, ticket counts, or policies.
- If asked about pricing specifics, refunds, sponsor details, dietary accommodations, accessibility specifics, or anything personal, recommend tapping "Live Help".
- If the user seems upset, frustrated, or has a complaint, immediately suggest "Live Help" — Scott handles those personally.
- Never make up names of staff or volunteers. The only names you should use are: Scott (your operator), Sherry Miggin (Executive Director, smiggin@dsdmail.net).
- The Davis Education Foundation supports Davis School District (Utah) — it is unrelated to other foundations with similar names.

# FAQ KNOWLEDGE BASE

${faqText}

# SHOWTIMES (live data from the seating system)

${showtimesText}

Remember: when in doubt, route to Live Help.`;
}

// ---------- Slack ----------

export async function postToSlack(env, channelId, text, threadTs = null, blocks = null) {
  const body = { channel: channelId, text };
  if (threadTs) body.thread_ts = threadTs;
  if (blocks) body.blocks = blocks;
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(`Slack post error: ${data.error}`);
  return data; // includes ts
}

export async function verifySlackSignature(request, body, secret) {
  const ts = request.headers.get('X-Slack-Request-Timestamp');
  const sig = request.headers.get('X-Slack-Signature');
  if (!ts || !sig) return false;
  // Reject if request older than 5 min
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false;
  const baseString = `v0:${ts}:${body}`;
  const expected = 'v0=' + (await hmacHex(secret, baseString));
  return timingSafeEqual(expected, sig);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
