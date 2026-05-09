---
title: Gala FAQ + Help Bubble Chatbot
status: ✅ AI mode live and verified — Live Help mode awaiting Slack app setup
project: gala
phase: 1 (MVP)
source_chat: 2026-05-08 sync gala chatbot
created: 2026-05-08
last_updated: 2026-05-09
---

# Gala FAQ + Help Bubble Chatbot

## Goal

Give attendees a single corner-bubble UI on every gala.daviskids.org page that
answers questions automatically (Claude Haiku via the anthropic-proxy worker,
grounded in a live FAQ + showtime data) and escalates to Scott via Slack when
the AI can't help.

## Status (2026-05-09)

- ✅ **AI mode**: live, verified end-to-end. Smoke tests passing.
- ✅ **Bubble visible** on `/`, `/faq`, `/event`, `/sponsor`, `/volunteer`, `/schedule.html`
- ✅ **D1 schema** + 25 FAQ entries seeded
- ✅ **CHAT_COOKIE_SECRET** set in Pages env (via API)
- ⏳ **Live Help mode**: code shipped, awaiting Slack app + 3 env vars
- ⚠️ **Note**: parallel V1/V2 commits arrived during this build — no conflicts but worth flagging

## Decisions (locked 2026-05-08)

- **Live escalation**: Slack-only. New `#gala-helpline` channel.
- **UI**: corner bubble sitewide, with AI ↔ Live toggle inside.
- **Brain**: Claude Haiku 4.5 via AI Gateway (~$0.0008/turn).
- **Identity gate**: name + email required before chatting. Cookie persists 7d.
- **Theaters 6 & 10**: stay as overflow buffer; FAQ acknowledges this.
- **Breadwinner**: D1 row 14 has correct synopsis (Nate Bargatze comedy, PG).
  Runtime updated 100→95 min on 2026-05-08 to match MPAA listing.

## Architecture

```
Visitor browser
   │
   ├── chat-widget.js (vanilla JS, injected by middleware on every HTML page)
   │     ├── POST /api/gala/chat/start    (gate on name+email, sets cookie)
   │     ├── POST /api/gala/chat/message  (route to AI or Slack by mode)
   │     ├── POST /api/gala/chat/toggle   (flip ai ↔ live)
   │     └── GET  /api/gala/chat/poll     (6s poll for Slack replies)
   │
   ├── /faq                               (dedicated page, reads /faq.json endpoint)
   │
   ▼
Cloudflare Pages Functions
   │
   ├── chat/_helpers.js   (cookie, AI Gateway call, Slack helpers)
   ├── chat/start.js      (POST → create thread, set HMAC cookie)
   ├── chat/message.js    (POST → AI Gateway OR Slack post)
   ├── chat/toggle.js     (POST → update mode)
   ├── chat/poll.js       (GET → fetch new agent messages since timestamp)
   ├── chat/slack-event.js(POST → Slack Events webhook, agent reply ingest)
   └── chat/faq.js        (GET public, POST admin-only)
   │
   ▼
   GALA_DB (D1) — existing gala-seating database, three new tables:
      chat_threads, chat_messages, chat_faq
   AI Gateway → Anthropic → Claude Haiku
   Slack Web API (chat.postMessage + threading)
```

## Files added (in this commit)

- `migrations/005_chat.sql` — chat_threads, chat_messages, chat_faq tables
- `migrations/006_chat_faq_seed.sql` — 25 seed FAQ entries (already applied to live D1)
- `functions/api/gala/chat/_helpers.js` — shared helpers
- `functions/api/gala/chat/start.js`
- `functions/api/gala/chat/message.js`
- `functions/api/gala/chat/toggle.js`
- `functions/api/gala/chat/poll.js`
- `functions/api/gala/chat/slack-event.js`
- `functions/api/gala/chat/faq.js`
- `public/assets/chat-widget.js` — corner bubble UI
- `public/faq/index.html` — dedicated FAQ page

## Files modified

- `functions/_middleware.js` — injects `<script src="/assets/chat-widget.js">`
  before `</body>` on all HTML responses except `/admin`, `/review`, `/api`.
  Pages can opt out with `<body data-no-chat-widget>`.
- `.env.example` — documented new env vars

## Live D1 changes already applied

- Created tables `chat_threads`, `chat_messages`, `chat_faq`
- Seeded 25 FAQ entries
- Updated `movies.id=14` (Breadwinner) runtime 100 → 95

## Required follow-up (Scott has to do these)

### 1. Create Slack app + #gala-helpline channel

1. https://api.slack.com/apps → Create New App → "From scratch"
   - App name: "Gala Helpline"
   - Workspace: (DEF workspace)
2. **OAuth & Permissions** → Scopes → Bot Token Scopes:
   - `chat:write`
   - `channels:history` (for public channel)
   - `groups:history` (for private)
3. **Event Subscriptions** → Enable
   - Request URL: `https://gala.daviskids.org/api/gala/chat/slack-event`
   - Subscribe to bot events: `message.channels`, `message.groups`
4. Install app to workspace → copy:
   - Bot User OAuth Token (`xoxb-...`)
   - Signing Secret (Basic Information page)
5. Create channel `#gala-helpline`, invite the bot
   - Right-click channel → View channel details → bottom → Copy channel ID

### 2. Set Cloudflare Pages env vars (Production env)

Cloudflare dashboard → Pages → gala → Settings → Environment Variables.

`CHAT_COOKIE_SECRET` is already set via API (2026-05-09 deploy). The remaining vars to add:

```
SLACK_BOT_TOKEN          = xoxb-... (from step 1 #4)
SLACK_SIGNING_SECRET     = ... (from step 1 #4)
SLACK_HELPLINE_CHANNEL   = C09XXXXXX (from step 1 #5)
```

(No `ANTHROPIC_API_KEY` needed — chat routes through `anthropic-proxy.ramonscottf.workers.dev`.)

### 3. Deploy

`git push` triggers CF Pages build automatically.

### 4. Verification curl tests

```bash
# Public FAQ list (should return 25 entries)
curl https://gala.daviskids.org/api/gala/chat/faq | jq '.faq | length'

# Start a thread (cookie required; in browser visit gala.daviskids.org/faq)
# Then in DevTools console:
fetch('/api/gala/chat/message', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({content: 'What time should I arrive?'})
}).then(r => r.json()).then(console.log)
```

## What's next (Phase 2 ideas)

- **Office hours awareness** — banner says "Scott is asleep, expect reply by morning"
- **Auto-suggest AI fallback** — when AI confidence < threshold, suggest Live Help button inline
- **Sponsor pre-fill** — if user arrives via sponsor portal token, prefill name/email
- **Slack thread summary** — when thread closes, post summary to #gala-helpline parent
- **Multi-language** — Spanish FAQ option for Davis families
- **Analytics** — admin dashboard at /admin/chat showing top questions, resolution time, AI vs Live ratio
