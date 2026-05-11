---
title: Gala Homepage Swap + Sponsor Magic-Link + Admin Move
status: ✅ Live (deployed to prod, smoke-tested)
project: gala (ramonscottf/gala)
phase: 5.14
source_chat: 2026-05-11 — gala portal flow fixes session
created: 2026-05-11
last_updated: 2026-05-11
deploy: ac0a4b2 → CF Pages deploy b665142f
---

# Gala Homepage Swap + Sponsor Magic-Link + Admin Move

## Why

Ticket emails go out this week. Up to now, `gala.daviskids.org/` was just an
admin password form. The wrong landing page for sponsors clicking through from
their invitation email — they want to either pick seats or rewatch the
trailers, not stare at a password box that doesn't apply to them.

The `/event/` preview page (movie lineup, showtimes, tier windows) was the
right landing experience but lived on a sub-path. Scott called it: promote
`/event` to root, build a real sponsor sign-in (magic link), tuck admin
away in a corner.

Kara reported the underlying portal flow bugs in the same session — those
are tracked separately in Phase 5.13 (FlowError modal + the meals-first
seat-pick flow). 5.14 is the public-facing entry point.

## What shipped

**Root content swap.** `public/index.html` is now the former `/event` page,
retitled and re-canonicalled. Same trailer cards, same showtimes, same tier
windows, but with a new first section.

**Sponsor magic-link card.** The new first section under `<main>` is an
ID-anchored sign-in card (`#sign-in`). Email input + "Send my link" button.
Submits to `POST /api/gala/portal/request-link`. Hero CTA "Sign in to my
portal" anchors here; nav "Sign in" button anchors here; mid-page "Lost
your email?" cross-link also anchors here.

**Admin moved to `/admin-signin/`.** Same password form, same `/api/gala/login`
endpoint, same 30-day session cookie. New URL, `noindex,nofollow`, and the
"Sponsor?" fineprint at the bottom now links to `/#sign-in` instead of telling
the user "use your invitation link" (which was the old advice when there was
no self-service flow).

**Quiet admin footer link.** `<a href="/admin-signin/" class="admin-link">
Admin sign-in →</a>` in the footer of the new homepage. Muted color, small
font, doesn't compete with the sponsor CTA above it.

**Middleware fix.** `functions/_middleware.js` previously redirected
unauthenticated `/admin` and `/checkin` traffic to `/?from=admin` (or
`?from=checkin`), which now lands on the public homepage instead of the
admin form. Updated to redirect to `/admin-signin/?next=<original-path>`.
The admin sign-in script already reads `?next=` and routes there after
successful auth, so this completes the loop. Also fixed a subtle bug:
`PROTECTED_PREFIXES.some((p) => path.startsWith(p))` would have flagged
`/admin-signin` as protected (it starts with `/admin`), causing a redirect
loop on the new sign-in page itself. Switched to a segment-aware match.

**Magic-link endpoint.** New file `functions/api/gala/portal/request-link.js`.
Looks up the requesting email in `sponsors` (`email` OR `secondary_email`,
archived rows excluded) then in `sponsor_delegations.delegate_email`
(revoked rows excluded). If found, sends an email containing the canonical
portal URL (`https://gala.daviskids.org/sponsor/{token}`) via the existing
`sendEmail()` helper in `_notify.js` (SkippyMail primary via
`GALA_MAIL_TOKEN`, Resend fallback). Always returns the same generic
success message regardless of whether the email matched a real record —
we don't leak who's a sponsor. Console-logs the send for ops audit but
doesn't write to `marketing_send_log` (that table has strict
`send_id`/`send_run_id`/`channel`/`status` NOT NULL columns shaped for
the bulk pipeline; overloading it for self-service one-offs would pollute
the analytics rollups).

**`/event/` redirect.** `_redirects` now sends `/event/` and `/event` to
`/` with a 301. The actual `public/event/index.html` file was deleted so
the redirect fires (Pages serves static files before honoring `_redirects`).

## Architecture notes

**Routing precedence.** `functions/api/gala/portal/request-link.js` is a
named route. `functions/api/gala/portal/[token].js` is the dynamic catch-all
for sponsor portal data. Per Cloudflare Pages routing rules, static paths
take precedence over dynamic params, so `request-link` correctly resolves
to the new endpoint rather than being passed as a token to the portal
lookup route.

**Why no session/cookie for the magic link.** Sponsors and delegates
already have permanent portal tokens stored in `sponsors.rsvp_token` /
`sponsor_delegations.token`. Those tokens are what marketing emails and
SMS sends already use. The magic-link flow just re-emails the existing
token. No need for HMAC-signed one-time tokens like the gala-review auth
flow uses — that flow needed to issue session credentials for an admin
surface; this flow is just "show me my link again."

**Why no rate limiting in the endpoint.** Volume is naturally tiny (99
active sponsors, plus a few hundred delegates at peak). SkippyMail has its
own rate limit; Cloudflare's edge throttles abusive IPs. If abuse appears,
add a sliding-window check in `SKIPPY_KV` keyed on IP+email-hash before
the DB lookup.

**Why generic-success-always.** A leak-resistant response shape means an
attacker can't enumerate which emails are sponsors by probing the endpoint.
The same pattern is used by `functions/api/gala/review/auth/request.js`
for the gala-review admin surface.

## Files touched

```
M  functions/_middleware.js                       (+24, -4)  redirect targets + segment-aware match
A  functions/api/gala/portal/request-link.js      (+220)     new magic-link endpoint
M  public/_redirects                              (+6, -0)   /event → /
A  public/admin-signin/index.html                 (+290)     admin sign-in's new home
D  public/event/index.html                        (-1121)    content moved to /
M  public/index.html                              (+1077)    new combined landing page
```

Total: 6 files, 1833 insertions, 1339 deletions. Net +494 lines (the magic-link
endpoint + new homepage CSS for the sign-in card).

## Smoke tests passed

| URL | Expected | Actual |
|---|---|---|
| `GET /` | 200, ~37KB, sign-in card visible | ✅ |
| `GET /event/` | 301 → `/` | ✅ |
| `GET /admin-signin/` | 200, ~8KB, password form | ✅ |
| `GET /admin` (logged out) | 302 → `/admin-signin/?next=%2Fadmin` | ✅ |
| `POST /api/gala/portal/request-link` with bogus email | 200, generic success message | ✅ |
| `POST /api/gala/portal/request-link` with `ramonscottf@gmail.com` (Wicko #89) | 200, generic success (email sent in background) | ✅ |
| Sign-in form HTML on live page | `id="signinForm"`, `id="signin-email"`, `data-testid="signin-submit"`, `data-testid="footer-admin"`, endpoint reference all present | ✅ |

## What's left for next session

- **Verify the email actually landed in Scott's inbox.** Live response was
  `ok:true` which means `sendEmail()` returned success (otherwise the
  endpoint would have returned 502). But the proof is in the inbox.
- **Send a real ticket email** to a small test cohort (Scott + Sherry +
  Kara) so the sign-in flow gets exercised by real users before the
  general blast.
- **Add `/admin-signin/` to `_routes.json` include[]?** Currently it's a
  static HTML file, no function, so it doesn't need to be in the include
  list. But if we ever want middleware (e.g., to redirect already-signed-in
  users away from the password form), it'll need to be added. Not blocking.
- **There's a mystery commit `05a8eff1 "Improve gala desktop sponsor flow"`**
  in the remote main between Phase 5.13 (`47db14c`) and 5.14 (`ac0a4b2`)
  that didn't come from this session. Worth checking the GitHub PR list
  next time so we know what it changed.
- **Theme polish on the sign-in card.** The card matches the navy/cyan
  gradient style of the rest of the event page but Scott hasn't seen it
  on his phone yet. If the visual lands wrong, iterate. (See no-entrance-
  animation rule — the card is static.)
