# Booker self-service tickets — Text / Email / Show QR (Phase 3.5)

Status: **in progress.** Goal: after Booker finds a guest, show tappable buttons
in the chat — **📲 Text my tickets · ✉️ Email my tickets · 🎟️ Show my QR** —
so guests are fully self-sufficient (Scott manages from the back of the theater;
no physical help desk). Decision locked (Scott, 2026-06-08): keep his phone
fallback in the prompt as-is; "leave me alone" meant *in person*, not the line.

## Reuse (all verified present)
- SMS: `sendSMS(env, to, body, {noHero:true})` in `_notify.js`. **MMS/hero is
  failing carrier-side — send plain SMS, noHero.**
- Email: `sendEmail(env,{to,subject,html,replyTo})` + `galaEmailHtml(...)` in `_notify.js`.
- QR: `GET /api/gala/qr?t={token}` → QR of `/checkin?t={token}` (svg/png).
- Token resolve: `_sponsor_portal.js` resolveToken — `sponsors.rsvp_token`
  (kind sponsor) or `sponsor_delegations.token` (kind delegation).
- Thread store: `chat_threads.found_token TEXT` — **column added 2026-06-08 (done).**

## Wiring (server keeps the token; browser never sees it)
1. **`_tools.js`** — add internal `_deliver:{token,kind,to_email,to_phone}` to each
   success result:
   - sponsor SELECTs (email path ~252, name path ~310) → add `rsvp_token, email`.
   - `bookingResult`: `_deliver={token:rsvp_token, kind:'sponsor', to_email:email, to_phone:null}`.
   - `delegationBookingResult`: select `token, delegate_email, delegate_phone` →
     `_deliver={token, kind:'delegation', to_email:delegate_email, to_phone:delegate_phone}`.
   - email merged path (~295): prefer the matched delegation's `_deliver`, else sponsor's.
2. **`_helpers.js callSonnet`** (~300-315): collect `{name, result}` per tool call →
   return `tool_results`. (3-line additive change; behavior unchanged.)
3. **`message.js`** selfserve branch: if a `lookup_booking` result has `found && _deliver.token`
   → `UPDATE chat_threads SET found_token=? WHERE id=?`; attach `buttons` to the JSON
   reply (Text only if `to_phone`, Email if `to_email`, Show QR always).
4. **NEW `functions/api/gala/chat/ticket-action.js`** — `POST {thread_id, action:'sms'|'email'|'qr', dry_run?}`:
   read `thread.found_token` → resolveToken → build ticket summary from seats.
   - `qr`  → `{qr_url:'/api/gala/qr?t='+token+'&format=svg&size=320'}` (read-only, safe).
   - `sms` → `sendSMS(to_phone, summary + ' Check-in QR: gala.daviskids.org/checkin?t='+token, {noHero:true})`.
   - `email`→ `sendEmail({to:to_email, subject, html: galaEmailHtml({... <img src=.../qr?t=token> ...})})`.
   - `dry_run:true` → return `{would_send_to, body|subject, qr_url}` WITHOUT firing.
5. **`chat-widget.js`** — render `reply.buttons` as gala-styled chips under the AI msg;
   tap → POST ticket-action; `qr` appends an `<img>`; `sms/email` appends a confirm line.
6. **`_helpers.js` selfserve block + LOOKUP_NOTE** — after a find, tell Booker to invite the
   guest to tap the buttons (text/email/QR); never output the token or a link. Keep Scott's number.

## Test plan (DO NOT spam Ali)
- Seed a thread `found_token` = Wicko delegation token; curl ticket-action `dry_run:true`
  → verify it resolves Ali's contact + builds SMS/email + QR URL.
- Real fire-test → **Scott only** (801-810-6642 / ramonscottf@gmail.com), never Ali's live booking.
- Device test Booker on Scott's phone (buttons + QR render; text/email arrive).

## Done so far
- help-desk hallucination killed in prompt (03bf679, live).
- `chat_threads.found_token` column added.
