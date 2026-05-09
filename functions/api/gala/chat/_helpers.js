// Shared helpers for the gala chat (FAQ + live help bubble).
//
// Three responsibilities:
//   1. Thread/cookie management (anonymous-but-gated session via name+email)
//   2. Anthropic API call via anthropic-proxy worker (Claude Haiku)
//   3. Slack outbound (post message) and Slack inbound verification
//
// Env vars expected (set in Cloudflare dashboard, not committed):
//   SLACK_BOT_TOKEN              - xoxb-... for posting and threading
//   SLACK_HELPLINE_CHANNEL       - channel ID like C09XXXX (gala-helpline)
//   SLACK_SIGNING_SECRET         - for verifying inbound Events API webhooks
//   CHAT_COOKIE_SECRET           - HMAC secret for thread cookie
//
// AI calls go through anthropic-proxy.ramonscottf.workers.dev which holds
// the Anthropic key. No key needed in this Pages project.

const COOKIE_NAME = 'gala_chat_thread';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const ANTHROPIC_PROXY_URL = 'https://anthropic-proxy.ramonscottf.workers.dev/v1/messages';

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

export async function getOrCreateThread(request, env, name, email, opts = {}) {
  const existingId = getCookie(request, COOKIE_NAME);
  if (existingId) {
    const row = await env.GALA_DB.prepare(
      'SELECT id, mode, slack_thread_ts, attendee_name, attendee_email FROM chat_threads WHERE id = ?'
    ).bind(existingId).first();
    if (row) {
      // If caller is supplying a name/email and the thread doesn't have one
      // yet (anonymous → identified upgrade path, e.g. before a live escalation),
      // patch it onto the existing thread.
      if ((name || email) && (!row.attendee_name || !row.attendee_email)) {
        await env.GALA_DB.prepare(
          `UPDATE chat_threads
              SET attendee_name = COALESCE(?, attendee_name),
                  attendee_email = COALESCE(?, attendee_email),
                  last_activity = datetime('now')
            WHERE id = ?`
        ).bind(name || null, email || null, existingId).run();
        row.attendee_name = name || row.attendee_name;
        row.attendee_email = email || row.attendee_email;
      } else {
        await env.GALA_DB.prepare(
          "UPDATE chat_threads SET last_activity = datetime('now') WHERE id = ?"
        ).bind(existingId).run();
      }
      return { thread: row, isNew: false, cookieHeader: null };
    }
  }

  // No existing thread. Anonymous threads are now allowed (Booker FAQ chat
  // is open to everyone). Identity is required only when escalating to a
  // live human, which is gated by a separate /upgrade endpoint.
  if (!name && !email && !opts.allowAnonymous) {
    return { thread: null, isNew: false, cookieHeader: null, needsIdentity: true };
  }

  const id = uuid();
  const ipH = await ipHash(request, env.CHAT_COOKIE_SECRET || 'fallback');
  const ua = (request.headers.get('User-Agent') || '').slice(0, 200);
  await env.GALA_DB.prepare(
    `INSERT INTO chat_threads (id, attendee_name, attendee_email, mode, user_agent, ip_hash)
     VALUES (?, ?, ?, 'ai', ?, ?)`
  ).bind(id, name || null, email || null, ua, ipH).run();
  return {
    thread: { id, mode: 'ai', slack_thread_ts: null, attendee_name: name || null, attendee_email: email || null },
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

  const resp = await fetch(ANTHROPIC_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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

// ─────────────────────────────────────────────────────────────────────────────
// callSonnet — concierge mode (token-bearing user, tool-calling enabled)
// ─────────────────────────────────────────────────────────────────────────────
//
// Used when the chat widget is loaded on a sponsor portal page (i.e. the
// request carries a valid X-Gala-Sponsor-Token). The model can call tools
// to look up the user's actual booking, list movies, check availability,
// and hand back a portal link. Read-only tools — Booker can SEE everything
// but writes still go through /sponsor/[token]/pick.
//
// Why Sonnet (not Haiku): tool selection, context-juggling, and the kind
// of "find 4 contiguous seats in a Platinum theater for the late showing"
// reasoning needs more horsepower than Haiku reliably delivers. Booking
// context is the moment to spend the tokens.
//
// Returns: { text, usage, model, tool_calls: [string, ...] }
//   tool_calls is the names of tools the model invoked, for logging.
const MAX_TOOL_ITERATIONS = 5;

export async function callSonnet(env, systemPrompt, history, tools, dispatchTool, tokenContext) {
  const messages = history.map(m => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const toolNamesUsed = [];
  let totalIn = 0;
  let totalOut = 0;
  let lastModel = 'claude-sonnet-4-5';

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const resp = await fetch(ANTHROPIC_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Sonnet error ${resp.status}: ${errText}`);
    }
    const data = await resp.json();
    if (data.usage) {
      totalIn += (data.usage.input_tokens || 0);
      totalOut += (data.usage.output_tokens || 0);
    }
    if (data.model) lastModel = data.model;

    const blocks = data.content || [];
    const toolUseBlocks = blocks.filter(b => b.type === 'tool_use');

    // No tool calls in this response — model is done answering.
    if (toolUseBlocks.length === 0 || data.stop_reason === 'end_turn') {
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
      return {
        text,
        usage: { input_tokens: totalIn, output_tokens: totalOut },
        model: lastModel,
        tool_calls: toolNamesUsed,
      };
    }

    // Append the assistant turn (text + tool_use blocks) verbatim
    messages.push({ role: 'assistant', content: blocks });

    // Execute every tool the model asked for, returning their results
    // as a single user turn with tool_result blocks.
    const toolResults = [];
    for (const tu of toolUseBlocks) {
      toolNamesUsed.push(tu.name);
      let result;
      try {
        result = await dispatchTool(env, tokenContext, tu.name, tu.input || {});
      } catch (err) {
        result = { error: 'tool_exec_failed', message: String(err && err.message || err) };
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  // Iteration cap hit — shouldn't happen in practice, but bail gracefully.
  return {
    text: "I got tangled up looking that up. Try asking me a slightly different way?",
    usage: { input_tokens: totalIn, output_tokens: totalOut },
    model: lastModel,
    tool_calls: toolNamesUsed,
    iteration_cap_hit: true,
  };
}

export function buildSystemPrompt(faqText, showtimesText, tokenContext = null) {
  // Build the optional "WHO YOU'RE TALKING TO" identity block when the user
  // is on a sponsor portal page (token resolved). When this is present, the
  // model is also given function-calling tools and should use them to look
  // up real booking data instead of inventing answers.
  const identityBlock = buildIdentityBlock(tokenContext);

  return `You are Booker, the friendly mascot-assistant for the Davis Education Foundation Gala 2026 — a fundraising event on Wednesday, June 10, 2026 at Megaplex Theatres at Legacy Crossing in Centerville, Utah.

Your job: answer attendee questions clearly and warmly using the FAQ knowledge base below. Stay concise (2-4 sentences usually).

Tone: warm, casual, conversational — like a friend walking someone through the night, not a corporate help desk. This is a casual gala (no suits, no formal anything), so your voice should match. A little playful is fine. Plain language always. No jargon.

The vibe of the event you're describing:
- It's at a movie theater. Casual dress.
- Social hour outside on the patios with music, chips & salsa, drinks, Nothing Bundt Cakes
- Auction items displayed in the lobby — browsing is part of the fun
- Dinner served IN the auditorium during the movie
- Then the movie itself in your assigned seat
- It's relaxed and fun, not stuffy

Rules:
- Only answer from the FAQ and showtimes data below. Do not invent specific prices, ticket counts, or policies you can't see.
- If asked about pricing specifics, refunds, sponsor details, accessibility specifics, or anything personal that isn't in the FAQ, suggest the user email Sherry Miggin directly at smiggin@dsdmail.net.
- The only names you should use are: Sherry Miggin (Executive Director, smiggin@dsdmail.net) and Scott (handles tech/seating questions).
- The Davis Education Foundation supports Davis School District in Utah — unrelated to similarly named foundations elsewhere.
- Don't mention "Live Help" or a live agent toggle — that feature isn't active right now.
${identityBlock}
# FAQ KNOWLEDGE BASE

${faqText}

# SHOWTIMES (live data from the seating system)

${showtimesText}

When in doubt, point people to Sherry's email or just answer what you can and let them know to reach out for the rest.`;
}

// Builds the identity + tool-use guidance block that gets injected into the
// system prompt when the user has a valid sponsor/delegation token. Returns
// an empty string when there's no token (FAQ-only mode).
function buildIdentityBlock(tokenContext) {
  if (!tokenContext) return '';

  let identity;
  if (tokenContext.kind === 'sponsor') {
    const r = tokenContext.record;
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.company;
    identity = `**${name}** from **${r.company}** — ${r.sponsorship_tier} sponsor with ${r.seats_purchased} seats.`;
  } else if (tokenContext.kind === 'delegation') {
    const r = tokenContext.record;
    identity = `**${r.delegate_name || 'A delegate'}** — invited by ${r.parent_company} (${r.parent_tier} sponsor), allocated ${r.seats_allocated} seat${r.seats_allocated === 1 ? '' : 's'}.`;
  } else {
    return '';
  }

  return `
# WHO YOU'RE TALKING TO

You're chatting with ${identity}

You have function-calling tools available. USE THEM when the user asks about THEIR specific booking — what they reserved, where their seats are, who's in their group, what movie they picked. Do NOT guess or use the FAQ for personalized questions; call \`get_my_booking\` and report what's actually in the database.

Tool usage guidance:
- "What did I book?" / "Where are my seats?" / "Who's in my group?" → \`get_my_booking\`
- "What movies are playing?" / "What are the options?" → \`list_movies\`
- "Are there seats left in the late showing?" → \`check_showing_availability\`
- "I want to change something" / "Can you switch me to..." → call \`get_portal_link\` and tell them they can make changes themselves on their booking page (Booker is read-only — writes go through the portal)

Do not invent attendee names, theater numbers, or seat assignments. If a tool returns no data or an error, say you couldn't find their booking and suggest they double-check the link from their email.
`;
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
