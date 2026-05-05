# Sponsor Portal QA

These checks target the sponsor portal without using Cloudflare API or Wrangler.

Default target:

- Base URL: `https://gala.daviskids.org`
- Token: `sgohonmgwicha15n`

Override with:

```bash
QA_BASE_URL=https://gala.daviskids.org QA_TOKEN=... npm run qa:smoke
```

## Commands

- `npm run qa:smoke` — desktop/mobile, light/dark, fresh/placed portal smoke checks.
- `npm run qa:install` — install the Chromium browser Playwright needs on a new machine.
- `npm run qa:visual` — Playwright screenshot diffing for critical screens.
- `npm run qa:visual:update` — refresh screenshot baselines after an intentional UI change.
- `npm run qa:a11y` — axe-core WCAG checks for contrast, labels, and structural issues.
- `npm run qa:stress` — reversible API stress harness for over-quota, orphan gaps, stale tabs, and seat-race safety.
- `npm run qa:lighthouse` — local mobile Lighthouse run, reports in `output/lighthouse/`.
- `npm run qa:webpagetest` — optional WebPageTest run when `WPT_API_KEY` is set.
- `npm run qa:all` — smoke, visual, a11y, stress, and Lighthouse.

`qa:stress` mutates the configured sponsor token with `/pick` finalize/unfinalize calls and cleans up after every scenario. It never calls `/finalize`, so it should not send final QR email/SMS.

For a true cross-sponsor race, set `QA_RIVAL_TOKEN` to another safe test token. Without it, the race scenario verifies duplicate safety for two same-token clients hitting the same seat at once.
