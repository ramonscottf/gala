# BLOCKERS — Portal v2 audit (2026-05-18)

## B1 — No Cloudflare credentials in this environment (NON-FATAL)

`CF_API_KEY`, `CF_EMAIL`, `CF_ACCOUNT_ID`, `GALA_DB_UUID` are unset. Impact:

- Cannot poll `pages/projects/gala/deployments` to confirm a deploy went green.
- Cannot query D1 for alternate test sponsors (other tiers / placement states),
  so edge-case audit is limited to the one Platinum test sponsor
  (`sxnhcj7axdrllaku`).

Mitigation: verifying fixes via `npm run build` (clean build gate) + direct code
review + Playwright screenshots of the live preview. Not stopping the loop.

Need from Scott/Skippy: paste CF creds as env vars if live deploy verification
is required before merge.

## B2 — Audit branch does not auto-deploy to the known preview URL

The preview URL `feat-portal-soft-website.gala-3z8.pages.dev` builds from
`feat/portal-soft-website`. This work is on `claude/audit-project-fvFT6` per the
git directives. Live screenshots of fixes on this branch require either a
Cloudflare Pages branch deploy for `claude/audit-project-fvFT6` or merging the
audit branch into `feat/portal-soft-website`. Not doing the merge without
explicit permission (CLAUDE.md rule + git directives).

Need from Scott/Skippy: confirm which branch should deploy to preview, or grant
permission to fast-forward `feat/portal-soft-website` from this audit branch.

## B3 — P2.1 numeric parity with v1 "Assigned" (needs Scott; NON-FATAL)

v1's stat card third cell: label "ASSIGNED", sub "To guests", value
that — in every live sample audited (Wicko 12/placed 12, Hughes
0/placed 0, Garn 18/placed 18) — equals the PLACED count, not the
delegated-to-guests count. v1's `assigned` therefore appears to
duplicate `placed` (likely a v1 quirk; the authoritative source is
the live `main` build, not this branch's dead Portal.jsx, so I can't
confirm the exact formula here).

Done now (safe, unambiguous, shipped): v2's third stat sub changed
"To guests" → "To delegates" so a returning v1 sponsor does NOT
equate v1's "ASSIGNED/To guests" with v2's "Delegated" row and think
seats vanished. Their seat count is plainly under "Placed / In
seats" (same number as v1's ASSIGNED), so nothing reads as lost.

Open question for Scott: should v2 also replicate v1's exact
"Assigned" NUMBER (= placed) under a parity label, or is v2's
corrected model (Total/Placed/Delegated/Open, Delegated = true
child-delegation count) the intended replacement? Replicating a
suspected-buggy v1 number to live sponsors blind is the risk I'm not
taking without your call. Not blocking the loop.
