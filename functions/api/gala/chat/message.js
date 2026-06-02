// POST /api/gala/chat/message
// Body: { content }
// Routes message based on thread.mode ('ai' or 'live'):
//   - 'ai':   call Claude (Haiku for FAQ-only, Sonnet for token-bearing
//             concierge mode with tools) via the AI Gateway
//   - 'live': post to #gala-helpline Slack (creates thread on first message,
//             reply-to-thread thereafter), Scott replies in Slack and the
//             Slack Events API webhook routes replies back via /slack-event.
//
// Concierge mode is triggered by an X-Gala-Sponsor-Token request header,
// set by the chat widget when it's loaded on a /sponsor/{token} page.

import {
  getOrCreateThread, recordMessage, loadFaqContext, loadShowtimes,
  loadHistory, callHaiku, callSonnet, buildSystemPrompt, postToSlack, jsonResponse,
} from './_helpers.js';
import { TOOL_DEFINITIONS, SELFSERVE_TOOL_DEFINITIONS, getTokenContext, getMyticketsContext, dispatchTool } from './_tools.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 });
  }
  const content = (body.content || '').toString().trim();
  if (!content) return jsonResponse({ error: 'empty_message' }, { status: 400 });
  if (content.length > 2000) return jsonResponse({ error: 'message_too_long' }, { status: 400 });

  const session = await getOrCreateThread(request, env, null, null);
  if (!session.thread) {
    return jsonResponse({ error: 'no_session' }, { status: 401 });
  }
  const thread = session.thread;

  // Record the user's message immediately
  await recordMessage(env, thread.id, 'user', content);

  // Resolve the token context (null if no token or unrecognized). This is
  // what flips the model from FAQ-Haiku to concierge-Sonnet.
  const tokenContext = await getTokenContext(request, env);

  // On /mytickets there's no token, but the page may have handed us a
  // read-only booking snapshot (X-Gala-Mytickets-Sponsor). Only resolve it
  // when there's no sponsor token — token wins. This keeps Booker on Haiku
  // (no tools) but booking-aware for personalized day-of questions.
  const myticketsContext = tokenContext ? null : await getMyticketsContext(request, env);

  // /mytickets self-serve concierge: the widget sets X-Gala-Selfserve on the
  // My Tickets page so Booker runs Sonnet + the lookup_booking tool and finds
  // bookings conversationally ("do it for me"). Only when there's no token.
  const selfserve = !tokenContext && (request.headers.get('X-Gala-Selfserve') || '').trim() === '1';

  // ----- AI MODE -----
  if (thread.mode === 'ai') {
    try {
      const [faq, showtimes, history] = await Promise.all([
        loadFaqContext(env),
        loadShowtimes(env),
        loadHistory(env, thread.id, 20),
      ]);
      const liveHelp = !!(env.SLACK_BOT_TOKEN && env.SLACK_HELPLINE_CHANNEL);
      const systemPrompt = buildSystemPrompt(faq, showtimes, tokenContext, myticketsContext, liveHelp, selfserve);

      let reply;
      if (tokenContext) {
        // Concierge mode: Sonnet + full tools (token-scoped).
        reply = await callSonnet(env, systemPrompt, history, TOOL_DEFINITIONS, dispatchTool, tokenContext);
      } else if (selfserve) {
        // Self-serve My Tickets concierge: Sonnet + lookup_booking (no token).
        reply = await callSonnet(env, systemPrompt, history, SELFSERVE_TOOL_DEFINITIONS, dispatchTool, null);
      } else {
        // FAQ-only mode: Haiku, no tools.
        reply = await callHaiku(env, systemPrompt, history);
      }

      await recordMessage(env, thread.id, 'ai', reply.text, {
        ai_model: reply.model,
        ai_tokens_in: reply.usage.input_tokens,
        ai_tokens_out: reply.usage.output_tokens,
      });
      return jsonResponse({
        ok: true,
        mode: 'ai',
        reply: { sender: 'ai', content: reply.text },
        // tool_calls is included for clients that want to display "Booker
        // looked up your booking" affordances. Omitted when no tools used.
        ...(reply.tool_calls && reply.tool_calls.length ? { tool_calls: reply.tool_calls } : {}),
      });
    } catch (err) {
      console.error('AI call failed:', err);
      const fallback = "I'm having a little trouble thinking right now — try again in a moment, or email Sherry at smiggin@dsdmail.net if it's urgent.";
      await recordMessage(env, thread.id, 'ai', fallback);
      return jsonResponse({
        ok: true,
        mode: 'ai',
        reply: { sender: 'ai', content: fallback },
        error: 'ai_unavailable',
      });
    }
  }

  // ----- LIVE MODE -----
  const channelId = env.SLACK_HELPLINE_CHANNEL;
  if (!channelId || !env.SLACK_BOT_TOKEN) {
    const msg = "Live Help isn't connected yet — please email smiggin@dsdmail.net and we'll get back to you. Sorry about that!";
    await recordMessage(env, thread.id, 'system', msg);
    return jsonResponse({
      ok: true,
      mode: 'live',
      reply: { sender: 'system', content: msg },
    });
  }

  try {
    let parentTs = thread.slack_thread_ts;
    if (!parentTs) {
      // First live message in this thread → post a parent message that opens
      // a Slack thread. Subsequent messages reply to that thread.
      const displayName = thread.attendee_name || 'Anonymous visitor';
      const displayEmail = thread.attendee_email || 'no email provided';
      const headerText = `:wave: New gala question from *${displayName}* (${displayEmail})`;
      const headerResp = await postToSlack(env, channelId, headerText, null, [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: headerText },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Thread ID: \`${thread.id}\`  •  Reply in this Slack thread to respond.` },
          ],
        },
      ]);
      parentTs = headerResp.ts;
      await env.GALA_DB.prepare(
        'UPDATE chat_threads SET slack_thread_ts = ? WHERE id = ?'
      ).bind(parentTs, thread.id).run();
    }
    const userMsgResp = await postToSlack(env, channelId, content, parentTs);
    await env.GALA_DB.prepare(
      "UPDATE chat_messages SET slack_message_ts = ? WHERE thread_id = ? AND sender='user' AND slack_message_ts IS NULL ORDER BY id DESC LIMIT 1"
    ).bind(userMsgResp.ts, thread.id).run().catch(() => {});

    return jsonResponse({
      ok: true,
      mode: 'live',
      reply: {
        sender: 'system',
        content: "Got it — Scott will see this in Slack and reply soon. Hang tight!",
      },
    });
  } catch (err) {
    console.error('Slack post failed:', err);
    const msg = "I couldn't send that to the team just now. Please email smiggin@dsdmail.net or try again.";
    await recordMessage(env, thread.id, 'system', msg);
    return jsonResponse({
      ok: false,
      mode: 'live',
      reply: { sender: 'system', content: msg },
      error: 'slack_unavailable',
    });
  }
}
