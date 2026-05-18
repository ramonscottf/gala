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
