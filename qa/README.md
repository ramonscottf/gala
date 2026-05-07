# Sponsor Portal QA

These checks target the sponsor portal without using Cloudflare API or Wrangler.

## Setup

Copy `.env.example` to `.env.local` (or export the vars in your shell) before running any `qa:*` script. `QA_TOKEN` is **required** unless `QA_BASE_URL` points at `localhost`. See `.env.example` for the full list.

Run against prod (default base URL):
```bash
QA_TOKEN=<your-test-sponsor-token> npm run qa:smoke
```

Run against local wrangler:
```bash
QA_BASE_URL=http://localhost:8788 npm run qa:smoke
```

## Commands

- `npm run qa:smoke` — desktop/mobile, light/dark, fresh/placed portal smoke checks.
- `npm run qa:install` — install the Chromium browser Playwright needs on a new machine.
- `npm run qa:visual` — Playwright screenshot diffing for critical screens.
- `npm run qa:visual:update` — refresh screenshot baselines after an intentional UI change.
- `npm run qa:a11y` — axe-core WCAG checks for contrast, labels, and structural issues.
- `npm run qa:parity` — shell-parity gate. Drives mobile and desktop-canonical paths through pick → finalize and asserts (a) /finalize POSTs exactly once per shell, (b) ConfirmationScreen renders with a QR image, and (c) the normalized request body is equal across shells. Mocks /finalize so the test sponsor's rsvp_status stays clean across runs. The desktop-legacy run is gated behind Task 5/6 in `docs/IMPL-flow-unification.md` (re-enables once SeatPickSheet replaces StepShowing+StepSeats).
- `npm run qa:stress` — reversible API stress harness for over-quota, orphan gaps, stale tabs, and seat-race safety.
- `npm run qa:lighthouse` — local mobile Lighthouse run, reports in `output/lighthouse/`.
- `npm run qa:webpagetest` — optional WebPageTest run when `WPT_API_KEY` is set.
- `npm run qa:all` — smoke, a11y, parity, visual (advisory), Lighthouse, and stress.

`qa:all` runs in this order: smoke → a11y → **parity** → visual (advisory; wrapped to never short-circuit the chain) → lighthouse → stress. Visual is intentionally tolerant of cross-machine pixel drift; real regressions are caught by smoke + a11y + parity.

`qa:stress` mutates the configured sponsor token with `/pick` finalize/unfinalize calls and cleans up after every scenario. It never calls `/finalize`, so it should not send final QR email/SMS.

For a true cross-sponsor race, set `QA_RIVAL_TOKEN` to another safe test token. Without it, the race scenario verifies duplicate safety for two same-token clients hitting the same seat at once.
