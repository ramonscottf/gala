---
title: Booker Day-Of — booking-aware chat, night-of FAQ, Live Help self-activation
status: in-progress
project: gala
phase: "day-of readiness (June 10 2026)"
source_chat: 2026-06-02 gala-booker-dayof-build
created: 2026-06-02
last_updated: 2026-06-02
---

# Booker Day-Of Build

Goal: make the gala chatbot ("Booker") as useful as possible for the night of
**Wed June 10, 2026** at Megaplex Theatres at Legacy Crossing, Centerville.
Three workstreams: (1) booking-aware Booker on `/mytickets`, (2) night-of FAQ
top-up, (3) Live Help (Slack handoff) made self-activating.

## 1. Booking-aware Booker on /mytickets — ✅ LIVE (prod, verified)

The `/mytickets` walk-up page had no chat widget at all, and Booker only
personalized on `/sponsor/{token}` URLs. Added a **third tier**: read-only
booking awareness driven by a non-secret sponsor id.

**Flow:** guest looks up their tickets (by email or company) → the page hands
the widget the matched `sponsor_id` → widget forwards it as
`X-Gala-Mytickets-Sponsor: <id>` on chat calls → server re-queries the
read-only seat snapshot and injects it into Booker's system prompt. Booker
answers personalized day-of questions ("which theater am I in?", "when does my
movie start?", "what did I order for dinner?", "where do I go first?").

**Model:** Haiku (no tools). The booking facts are pre-fetched and injected, so
no Sonnet/tool-calling is needed — cheap + fast for the high-traffic night-of
path. (Sonnet+tools is still used for the token-bearing `/sponsor` concierge.)

**Security model (unchanged from the open lookup):**
- `sponsor_id` is a plain row id, NOT a credential. It exposes only the same
  non-secret seat data the open `/mytickets` lookup already shows on screen.
- NO edit token, NO portal link, NO contact info ever emitted by this path.
- Edit requests are refused and routed to the page's "Email me my portal link"
  button or to Sherry. Token always wins over mytickets context.
- With no header (any other page) Booker knows nothing — no leak.

**Files touched:**
- `public/assets/chat-widget.js` — `MYTICKETS_SPONSOR` state, `chatHeaders()`
  helper, `window.GalaChat.setBookingContext/clearBookingContext`. Existing
  sponsor-token behavior on all other pages unchanged.
- `public/mytickets/index.html` — include widget, set context on lookup, clear
  on reset, "ask Booker" nudge line.
- `functions/api/gala/mytickets/lookup.js` — return `sponsor_id`
  (email / company / by-id responses).
- `functions/api/gala/chat/_tools.js` — `getMyticketsContext()` read-only
  resolver (seats/movie/showtimes/dinner, grouped by showing).
- `functions/api/gala/chat/_helpers.js` — `buildSystemPrompt()` takes
  `myticketsContext`, injects read-only block w/ exact-times rule.
- `functions/api/gala/chat/message.js` — resolve mytickets ctx when no token.

**Verified on live prod:** correct theater/movie/exact times/dinner/seats,
greets contact by name, refuses edits w/o leaking token, empty-state directs to
seat-picking without inventing, no-header = no knowledge.

Commits: `f1f0db3`, `bbe831f`.

## 2. Night-of FAQ top-up — ✅ 5 entries LIVE; 3 pending Scott sign-off

FAQ loads from D1 (`chat_faq`) per request — no deploy needed for changes.
Existing 34 entries already covered parking, arrival timing, schedule,
accessibility, Givi auction, dinner setup, dress code, after-movie.

**Inserted (ids 60–64, active, priority 50–54):** arrival flow ("I just
arrived — what do I do first?"), finding your auditorium, running late / missed
start, restrooms, seat problem at the event. All derived from approved content
or generic-safe, reframed for night-of.

**PENDING — need Scott's factual sign-off before inserting (a wrong answer
night-of is worse than a missing one):**
1. Check-in process — is there a check-in/welcome table? Do guests show a
   ticket / QR at the door, or just find their seat? (Finalize email sends a
   QR — is it scanned?)
2. Where exactly the welcome/help table is, and how to identify volunteers
   (shirts? lanyards?).
3. Will-call / what to do if a guest can't find their tickets.

## 3. Live Help (Slack handoff) — ✅ code LIVE but inert; self-activates on Slack connect

The full loop was already built (start/toggle/message→Slack/slack-event
webhook/poll) but dark because the widget toggle was pulled when Slack went
offline. Made it **self-activating**:

- `start.js` reports `live_help_available = (SLACK_BOT_TOKEN && SLACK_HELPLINE_CHANNEL)`.
- `chat-widget.js` shows the AI↔Live "Talk to a person" toggle **only** when
  the server says Live Help is connected; `setMode` honors live mode (banner +
  6s polling) again. Fully inert otherwise — identical to current behavior.
- `buildSystemPrompt(liveHelp)` — Booker only offers the toggle when connected.
- `message.js` passes `liveHelp` through.

**Current prod state:** no Slack secrets → `live_help_available:false` →
no toggle, AI-only. Verified. Commit: `9a4506c`.

### To turn Live Help ON (Scott does the Slack side; assistant sets secrets)

SCOTT (in Slack — can't be done by assistant):
1. Create a Slack app (api.slack.com/apps) in the DEF workspace.
2. Bot Token Scopes: `chat:write`, `channels:read` (+ `channels:history` if
   needed). Install to workspace → copy **Bot User OAuth Token** (`xoxb-...`).
3. Basic Information → copy **Signing Secret**.
4. Create/identify channel **#gala-helpline** → copy its **channel ID**
   (`C...`). Invite the bot to that channel.
5. Event Subscriptions → enable → Request URL:
   `https://gala.daviskids.org/api/gala/chat/slack-event` (it answers the
   verification challenge automatically) → subscribe to bot event
   `message.channels` → save.

ASSISTANT (once Scott provides the 3 values) — set production secrets via the
SAFE PATCH (only the new keys; never GET-then-PATCH):
```
PATCH /accounts/{acct}/pages/projects/gala
{"deployment_configs":{"production":{"env_vars":{
  "SLACK_BOT_TOKEN":{"type":"secret_text","value":"xoxb-..."},
  "SLACK_HELPLINE_CHANNEL":{"type":"secret_text","value":"C..."},
  "SLACK_SIGNING_SECRET":{"type":"secret_text","value":"..."}
}}}}
```
Then POST a deployment to propagate. After that, Booker shows the toggle, the
prompt offers it, replies in the Slack thread flow back via poll. Co-test the
full loop with Scott (toggle → message → Slack post → reply → surfaces as
'agent' in the widget).

**Consideration for Scott:** Live Help routes guest questions to his phone via
Slack during an event he's running. Worth deciding whether he (or a volunteer)
will actively watch #gala-helpline that night, or leave it off and rely on the
booking-aware Booker + FAQ + the on-site welcome table.

## Deploy canon (this repo)
- CF Pages "gala", GitHub-connected → **git push to main auto-builds prod
  (~45–75s), Functions compiled correctly.** Branch push = preview at
  `<short_id>.gala-3z8.pages.dev`.
- FAQ/content edits in D1 are live immediately (no deploy).
- CF auth: `X-Auth-Key`/`X-Auth-Email` (never Bearer). D1 `gala-seating`
  `1468a0b3-cc6c-49a6-ad89-421e9fb00a86` bound `GALA_DB`.

## Test sponsors
- Wicko Waypoint = sponsor 89 (no seats → empty-state test).
- BHB Engineers = sponsor 7 (Auditorium 8, Star Wars late showing, movie
  7:40 PM, dinner 7:15 PM, seats E1/E2 Hot French Dip, contact "Amber").
