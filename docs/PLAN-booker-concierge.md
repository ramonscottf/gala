---
title: Booker Booking Concierge v1 — Read-Only with Token Auth
status: in-progress
project: gala
phase: chat-v2
source_chat: 2026-05-09 morning session — gala chatbot evolution
created: 2026-05-09
last_updated: 2026-05-09
---

# Booker Booking Concierge v1

## Goal

Make Booker (the gala chat AI) personalized to the logged-in sponsor or
delegation, so he can answer "what did I book?", "who's in my group?",
"where are my seats?", "what movie did I pick?" using real D1 data.

**v1 is READ-ONLY.** Booker can see and discuss the user's bookings;
he cannot write seat assignments. Writes still go through the existing
`/sponsor/[token]` portal which has the orphan-seat validation, hold
state machine, and capacity enforcement we don't want to duplicate.

## Test Cohort (this weekend)

| Tester | Role | Sponsor / Delegation | Token-bearing URL |
|---|---|---|---|
| Scott | Sponsor | Wicko Waypoint #89 (20 seats, Platinum) | `/sponsor/f4a8p5bhfnfhjvmd` |
| Logan Toone | Sponsor | 2N Town #28 (5 seats, Platinum) | `/sponsor/lxwzqzxb8t2qfgev` |
| Kara Toone | Sponsor | 2N Family #98 (5 seats, Platinum) | `/sponsor/txu3ffammdlojxro6nr66n81gju08izk` |
| Aaron Sessions | Delegate of Scott | Wicko delegation TBD | `/sponsor/{deleg_token}` |
| Ali Foster | Delegate of Scott | Wicko delegation TBD | `/sponsor/{deleg_token}` |

Aaron and Ali aren't sponsors of their own — Scott will create
delegations for them through the existing portal flow before the
weekend test.

## Auth Model

The **page URL token** IS the auth. The chat widget is loaded on
sponsor portal pages, where the URL pattern is `/sponsor/{token}`.
The widget extracts the token from the URL and passes it to the
chat backend on every message. The backend then:

1. Calls `resolveToken(env, token)` (existing helper in
   `functions/api/gala/_sponsor_portal.js`)
2. Returns `{ kind: 'sponsor', record: {...} }` OR
   `{ kind: 'delegation', record: {...} }` OR `null`
3. If null: chat falls back to FAQ-only (current behavior)
4. If sponsor: Booker can see all attendees + seat_assignments
   `WHERE sponsor_id = X`
5. If delegation: Booker can see seats `WHERE delegation_id = X`

**No demo flag, no "Scott's email" gate.** The token-based scoping
naturally covers the test cohort because each tester gets their own
URL with their own token.

## Tools Booker Gets (Anthropic function-calling)

All tools take an implicit `tokenContext` (resolved sponsor/delegation
from the request) and return read-only data.

### `get_my_booking()`
Returns:
```json
{
  "kind": "sponsor" | "delegation",
  "name": "Wicko Waypoint" | "Aaron Sessions",
  "tier": "Platinum",
  "seats_purchased": 20,
  "seats_assigned": 14,
  "seats_remaining": 6,
  "showings_used": [1, 2],
  "attendees": [
    { "name": "Scott Foster", "email": "...", "theater_id": 8, "row": "F", "seat_num": "10",
      "showing_number": 1, "movie_title": "Wicked", "dinner_choice": null }
  ]
}
```

### `list_movies()`
Returns active movies with showing info pulled from the `movies` and
`showtimes` tables.

### `check_showing_availability(showing_number)`
Returns per-theater seat availability for either showing 1 (early)
or showing 2 (late):
```json
[
  { "theater_id": 8, "tier": "Platinum", "movie": "Wicked",
    "capacity": 266, "assigned": 102, "available": 164 }
]
```

### `get_dinner_options()`
Returns the available dinner choices (this comes from a fixed list,
not D1, but might be promoted to a `dinner_options` table later).

### `get_portal_link()`
Returns the user's portal URL so Booker can hand them off when they
want to make a change. Format: `/sponsor/{their_token}`.

## What Booker Won't Do in v1

- Add or remove seat assignments
- Change dinner choices
- Reassign attendees to different theaters
- Send invites to delegates
- Make any D1 writes

If a user asks for a write action, Booker says some version of:
"I can show you what's open, but to actually book/change/release
seats, hop over to your booking page — the link is right here."

## Implementation Notes

### File changes

- `functions/api/gala/chat/_helpers.js` — add token resolution
  function that the message handler calls at the top of each request.
  Pull the token from a custom request header `X-Gala-Sponsor-Token`
  (set by the chat widget on the page).
- `functions/api/gala/chat/_tools.js` — NEW: tool definitions and
  dispatch function. Each tool runs against D1 with the resolved
  `tokenContext`. Tools return JSON.
- `functions/api/gala/chat/message.js` — wire the Anthropic API call
  to use tool-calling mode. Loop on `tool_use` blocks until the model
  returns `text`. (Anthropic API supports a tool-use loop natively.)
- `public/assets/chat-widget.js` — extract token from URL on init,
  send `X-Gala-Sponsor-Token` header on `start` and `message` POSTs.

### Anthropic API tool-calling pattern

The current chat backend uses plain message completion. For tools,
we switch to:

```js
const response = await fetch('https://anthropic-proxy.ramonscottf.workers.dev/v1/messages', {
  method: 'POST',
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    system: SYSTEM_PROMPT,
    messages: history,
    tools: TOOL_DEFINITIONS,
    max_tokens: 1024,
  }),
});
// If response.stop_reason === 'tool_use', execute the tool, append
// the result to history, call again. Loop until stop_reason === 'end_turn'.
```

Cap the tool-loop at 5 iterations to prevent runaway recursion.

### System prompt update

Add a new section to the gala system prompt:

> "If the user is on a sponsor portal page, you have tools to look up
> their actual booking. When they ask about THEIR booking ('what did
> I book', 'where are my seats', 'who's in my group'), USE THE TOOLS
> rather than the FAQ. The FAQ is for general questions about the
> event; the tools are for personalized lookups.
>
> You CAN answer questions and suggest changes. You CANNOT make
> changes — if they want to add/remove/change seats, point them at
> their booking page."

## Acceptance Criteria

1. Scott opens `/sponsor/f4a8p5bhfnfhjvmd` and asks Booker "what did I
   book?" → gets a personalized answer listing his Wicko attendees,
   their theaters, their movies, their seats.
2. Logan opens his own portal URL and asks the same → gets HIS
   booking, not Scott's.
3. Aaron opens his delegation URL and asks "what's my seat?" → gets
   ONLY his single seat (not all of Wicko's seats).
4. Anyone on `/event/` (no token) asks the same → Booker says
   something like "I can answer questions about the event in general,
   but to look up your specific booking, open the link from your
   email."
5. Asking Booker "can you change my movie?" → Booker says no, but
   provides the portal link.
6. The 8 existing FAQ flows still work — auction questions, schedule
   questions, etc.
7. No regressions on Scott's iPhone Safari (the chat input zoom fix
   from yesterday holds).

## Out of Scope (deferred)

- Booker writes to D1 — v2.
- Booker can do dinner choices — v2 (need dinner_options table first).
- Booker can switch a delegate to a different sponsor — never; that's
  always an admin action.
- Booker handles brand-new seat creation (not just changes) — v3.
- Mobile portal-link affordance (a richer card with a button) — v2.

## Status

- [x] Plan committed (this file + project repo mirror)
- [x] Token resolution wired in `_helpers.js` (via `getTokenContext` in `_tools.js`)
- [x] Tool dispatcher in `_tools.js` (4 tools: get_my_booking, list_movies, check_showing_availability, get_portal_link)
- [x] Message handler converted to tool-use loop (`callSonnet` runs the loop)
- [x] Chat widget passes token from URL (X-Gala-Sponsor-Token header)
- [x] System prompt updated (WHO YOU'RE TALKING TO block when token resolves)
- [x] **Model split:** Haiku for FAQ-only (anonymous), Sonnet 4.5 for concierge (token)
- [x] Smoke test: Scott URL → real attendees, theaters, seats, dinner choices
- [x] Smoke test: Logan URL → only his 2 booked seats (Kara Toone)
- [x] Smoke test: Kara URL → only her 5 seats in Row D 10-14
- [x] Smoke test: anonymous → FAQ-only Haiku, no tool calls
- [x] Smoke test: regression — auction-close question still answered
- [ ] Aaron + Ali delegations created in admin portal (Scott to do via existing portal flow)
- [ ] Smoke test: Aaron URL → only his single seat (after delegation created)
- [ ] Push to all 5 testers Saturday for weekend trial

## Live as of 2026-05-09 morning session

Concierge mode is fully wired and verified end-to-end. Three sponsor URLs
tested, each correctly scoped to their own data with no cross-contamination.
Tool calls verified: `get_my_booking` and `get_portal_link` both fire and
return real D1 data through Sonnet 4.5.

Cost note: Sonnet calls observed at ~1500 input + 250 output tokens per
two-turn conversation (system prompt + history + tools + booking result +
response). At Sonnet 4.5 pricing that's about \$0.008/conversation. Haiku
fallback for anonymous chat keeps that path at ~\$0.0005/conversation.
