# Code Review — Sponsor Portal QA Harness

**Date:** 2026-05-06
**Reviewer:** Claude (code-reviewer subagent, dispatched from Opus 4.7)
**Range:** `10690c5..4340d2e` (3 commits)
**Status:** Already merged to `main`. Treat as APPROVE WITH FOLLOW-UPS.

## Commits in scope

- `23db5ef` Add sponsor portal QA harness
- `7537812` Harden sponsor QA harness
- `4340d2e` Improve sponsor portal lighthouse accessibility

```
git log --oneline 10690c5..4340d2e
git diff --stat 10690c5..4340d2e
```

41 files changed (~4000 insertions). New `qa/` tree (Playwright + perf scripts), 16 PNG baselines, accessibility tweaks across `src/portal/**` and `src/App.jsx`, plus a server-side change to `functions/api/gala/portal/[token]/pick.js`.

---

## Strengths

- **Solid concurrency fix in `pick.js`** (`functions/api/gala/portal/[token]/pick.js:255-279`). Catching the unique-constraint violation, re-querying to identify the winner, and returning idempotent success when it's the same sponsor/delegation vs. a 409 for genuine conflicts is the textbook fix for a check-then-insert race. The comment explaining *why* is excellent.
- **Clock freezing for visual baselines** (`qa/lib/config.js:14-32`). `freezeClockScript` patched into `addInitScript` is the right way to neutralize "days out" / countdown copy that would otherwise drift snapshots daily. Mocking via `extends NativeDate` preserves `instanceof` and the `static UTC(...)` contract.
- **Reversible stress harness** (`qa/api-stress.mjs:13-17, 30-33`). The `--yes` / `QA_ALLOW_MUTATION=1` gate plus per-scenario `cleanupToken` in a `finally` block is a thoughtful safety pattern for a script that mutates live state. The README note that it never calls `/finalize` (so no QR email/SMS) is exactly the disclosure operators need.
- **Smart seat-finding helpers** (`qa/lib/portal-api.js:114-163`). `wouldLeaveOrphan` and `findSeatBlock` actually understand the portal's domain rules (orphan-gap rejection) so the stress scenarios test the rules they claim to.
- **A11y filter is calibrated** (`qa/a11y.spec.js:41`). Asserting on `critical`/`serious` only — instead of every minor axe finding — is the right level for a CI gate.
- **A11y tweaks are mostly substantive, not cargo-culted**: explicit `width`/`height` on `<img>` (`src/brand/atoms.jsx:33-34`, `src/portal/Mobile.jsx:1865-1866`) prevents CLS; `<main id="main-content">` (`src/App.jsx:149`) gives a real landmark; removing `user-scalable=no` (`index.html:7`, `public/sponsor/index.html:7`) is a real accessibility win that Lighthouse penalizes. Adding `aria-label` on the auditorium `<select>` and the dialog close `×` buttons fixes legitimate violations.
- **README is concise and accurate** for the npm scripts; package.json scripts (`qa:install`, `qa:visual:update`, etc.) are well-named.

---

## Issues

### Critical (Must Fix)

None. No data-loss, security, or broken-prod issues.

### Important (Should Fix)

**1. `pick.js` change is a genuine scope leak in commit `23db5ef`.**
The unique-constraint race fix (`functions/api/gala/portal/[token]/pick.js:255-279`) is unrelated to a "QA harness" commit. It appears to have been bundled because the stress harness's race scenario surfaced the bug, but the commit message says nothing about a server fix.
- The fix itself is correct and worth keeping.
- For future hygiene, this should have been split: one commit for the server fix (with its own message explaining the race + remediation) and a separate commit for the harness. Reviewers and `git blame` will be confused if they ever bisect "why did this race condition get a 200 instead of a 409?" — the answer is buried in a QA commit.

**2. Visual baselines will flake across machines.**
The harness commits PNGs for `desktop-light/dark` × `mobile-light/dark` × {fresh,placed} × {home, seat-picker} (16 PNGs). Several factors will cause cross-machine pixel drift even with `animations: 'disabled'`:
- **Font rendering**: The portal loads Google Fonts (Inter, Source Serif 4) and `colorFor()` (`Desktop.jsx:60-64`) computes avatar gradients from sponsor name. macOS subpixel rendering vs. Linux CI vs. Windows will all differ. `maxDiffPixelRatio: 0.02` (`qa/playwright.config.js:15`) gives ~2% slack but text-heavy screens regularly exceed that.
- **Network-dependent layout**: `gotoPortalPath` waits up to 5s for `networkidle` but swallows the timeout (`qa/lib/ui.js:8`). If a font or theater-layouts.json call lags, the screenshot fires with FOUT, producing different pixels.
- **Live data**: baselines were captured against `https://gala.daviskids.org` with a real token. Any seat assignment by other sponsors changes the "all assignments" overlay on `placed-seat-picker` and breaks the diff.
- **`fullPage: false`** (`qa/visual.spec.js:26`) takes the viewport only — fine — but the viewport contains live "days out" text (the clock-freeze fixes that, good) and avatar gradients seeded by sponsor name (fragile in general).

Fix: either (a) commit baselines per-OS using Playwright's per-platform snapshot directories, (b) run baselines only on a single Docker image in CI and require `qa:visual:update` for local diffs, or (c) mark visual specs as advisory until baseline strategy is firmed up.

**3. Stress harness assumes `seatMath.available === 2`** (`qa/api-stress.mjs:59`). That asserts the test token's exact entitlement. If anyone changes the sponsor's seat allotment in production data, the test fails with a misleading error. At minimum, fetch the entitlement first and use it as the expected value, or guard with an `assert.ok(stalePortal.seatMath.available >= 2)`.

**4. `QA_TOKEN` default is a real production token committed in source** (`qa/lib/config.js:5`). `'sgohonmgwicha15n'` is presumably a magic-link to a real sponsor record. Anyone who clones the repo and runs `npm run qa:smoke` against the default `QA_BASE_URL=https://gala.daviskids.org` hits prod with a known token.
- If that token belongs to an actual sponsor, you've leaked their portal URL into git history.
- If it's a dedicated test sponsor, the README should say so explicitly, and the token should arguably still come from `.env` rather than the code.

Treat the default as production-only and either move it to `.env.example` or document it as a known test fixture.

**5. `qa:stress` race scenario is non-functional without `QA_RIVAL_TOKEN`** (`qa/api-stress.mjs:73`). The fallback `tokenB = QA_RIVAL_TOKEN || QA_TOKEN` makes both racers use the same token, so the server's idempotency path returns success twice and the assertion `matches.length <= 1` always passes — even if the underlying race protection were broken. The README admits this, but this scenario should either skip with a clear message or run an entirely different assertion (e.g. confirm only one DB row exists).

**6. `gotoPortalPath` retry loop will mask real failures** (`qa/lib/ui.js:6-23`). Three retries with positive-text matching means transient regressions (e.g. portal showing the wrong sponsor's name) will only fail after a long timeout. The error-text negative match is good, but consider failing fast on HTTP 5xx via response interception rather than waiting on text appearance/non-appearance.

**7. `qa:webpagetest` has no overall timeout** (`qa/webpagetest.mjs:45-51`). The poll loop runs up to 90 × 10s = 15 min, but if WPT returns `statusCode === 200` it exits — fine. If the API hangs without statusCode, the whole script hangs for 15 min. Add an `AbortController` per `fetch` so a stuck connection doesn't pin CI for 15 minutes.

**8. `aria-label` for settings button is partially cargo-culted** (`src/portal/Desktop.jsx:232`, `src/portal/Mobile.jsx:1893`). `aria-label={`${initialsFor(name)} ${name || 'Sponsor'} settings`}` produces something like "AS Alice Smith settings" — the screen reader will speak "A S Alice Smith settings" because the initials are interpreted letter by letter. The original "Open settings" was clearer for screen reader users. The visible button content is the avatar (which already has visible initials), so just `aria-label={`Settings for ${name || 'sponsor'}`}` is what you want. Same fix for Mobile.

**9. Lighthouse script assumes Chrome is launchable** (`qa/performance.mjs:13-15`). On a stripped-down CI image, `chrome-launcher` will fail with a cryptic error. The chrome flags include `--no-sandbox` and `--disable-gpu` (good for headless containers), but there's no graceful skip / error message if Chrome is absent. Add a try/catch around `launch()` with an actionable error.

**10. `qa:all` short-circuits on first failure** (`package.json:30`). Chained `&&` means a flaky visual diff blocks the lighthouse and stress runs. Consider `npm-run-all` or wrapping in a script that always runs all and aggregates.

### Minor (Nice to Have)

**11. `initialsFor` is referenced before declaration** (`src/portal/Desktop.jsx:66` references it; declared at `:90`. Same shape in `Mobile.jsx:76` vs `:100`). Works at runtime because the const is module-scoped and read inside a function body, but it triggers the temporal-dead-zone smell. Hoist the helper above `Avatar` for clarity.

**12. Dead arg in `freezeClockScript`** — `MockDate.parse(value)` (`qa/lib/config.js:25`) accepts only `value` but native `Date.parse` also accepts numerics; the spread `static UTC(...args)` is correct. Minor, low risk.

**13. `apiJson` retries on network errors but not on 5xx** (`qa/lib/portal-api.js:12-26`). For a flaky CI, transient `502` from Cloudflare won't be retried even though it would benefit. Either retry on `res.status >= 500 && res.status < 600` or document that retries are only for connection errors.

**14. `splitSeatId` assumes a single dash and a numeric tail** (`qa/lib/portal-api.js:52-58`). If a row label ever contains a dash (e.g., "A-1" or "Mezz-Front"), this silently returns garbage. Add `Number.isFinite` validation or split on the last dash.

**15. Snapshot path is unstable across OSes**. `snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}'` (`qa/playwright.config.js:18`) drops the platform suffix Playwright normally inserts. If you ever run the suite on Linux locally and macOS in CI, no platform-specific baselines exist. Add `{platform}` to the template once you decide on multi-OS support.

**16. `expectSeatMapReady` magic number** (`qa/lib/ui.js:57`). `expect(count).toBeGreaterThan(20)` is a heuristic. If the smallest theater has fewer seats one day, this breaks. Consider using `>= someMinFromLayout`.

**17. README missing a few things for production-grade harness**:
- No mention of how to run against a local wrangler dev server (`QA_BASE_URL=http://localhost:8788`?).
- No documentation of `QA_FIXED_NOW` or what date it freezes to.
- No troubleshooting section ("if visual diffs flake, run `qa:visual:update` after confirming intentional changes").
- No mention that `qa:all` mutates live data via the stress step.

**18. `output/` ignored, baselines under `qa/__screenshots__/` are tracked** — that's correct; just confirming the `.gitignore` change doesn't accidentally swallow them.

**19. Color change in `SeatPickSheet.jsx:469`** changed `BRAND.red` to hardcoded `'#ff6f86'` to fix contrast. The hex should at least be in `tokens.js` as a named constant (`BRAND.redLightOnDark` or similar) so it's reusable and themable. Same for `'rgba(255,255,255,0.72)'` (`:515`).

---

## Recommendations

- **Split commits by concern.** The `pick.js` race fix should have been its own commit with its own message — this is the kind of change that needs to be findable years later.
- **Decide a baseline policy now**, before someone runs `qa:visual` on a different machine and either (a) sees noise diffs and stops trusting the suite, or (b) accidentally updates baselines and erases drift. Recommend: snapshots only run in CI on a pinned Linux Playwright Docker image; locally, devs run `qa:visual` for debugging only.
- **Add a `qa:dev` script** that targets `http://localhost:8788` against a wrangler dev session — enables running the harness without touching prod data.
- **Move `QA_TOKEN` default out of source.** Use a `.env.example` and have `config.js` throw if `QA_TOKEN` isn't set when `QA_BASE_URL` points at a non-localhost domain.
- **Add a contract test** for the `pick.js` race fix specifically — the stress race scenario is the only thing exercising the new code path, and it's neutered without `QA_RIVAL_TOKEN`. A unit test against a mocked D1 binding would lock in the behavior cheaply.
- **Coverage gap**: the harness is smoke + visual + a11y + perf, but no actual *functional* coverage of dinner/movie picking flows. The README mentions "seat picking" but the smoke spec only opens the seat picker — never picks, never asserts the picked seat appears. For a production-grade harness, you want at least one happy-path end-to-end test (pick → confirm → cleanup) for each surface.

---

## Assessment

**Ready to merge?** Already merged. Treat as: APPROVE WITH FOLLOW-UPS.

**Reasoning:** The harness delivers on its three stated goals (smoke, visual, a11y, plus perf scripts) with thoughtful safety patterns (clock freezing, reversible mutations, axe severity filter), and the bundled `pick.js` race fix is genuinely correct. The largest risks are the inevitable visual-snapshot flake without a pinned-platform CI policy, the production-token default in `qa/lib/config.js:5`, and the scope-leak of the server fix into a QA-harness commit. None block production but all warrant follow-up tickets.

---

## Suggested follow-up ticket list

1. Move `QA_TOKEN` default out of `qa/lib/config.js`; add `.env.example`; throw on missing token against non-localhost. *(Important #4)*
2. Pin visual baselines to a single CI image; document policy in `qa/README.md`. *(Important #2)*
3. Replace `seatMath.available === 2` assertion with entitlement-derived value. *(Important #3)*
4. Either remove or rework race scenario; without `QA_RIVAL_TOKEN` it's a no-op. *(Important #5)*
5. Fix settings-button `aria-label` to drop letter-by-letter initials. *(Important #8)*
6. Add `AbortController` + per-fetch timeouts in `webpagetest.mjs`. *(Important #7)*
7. Wrap `qa:all` so it doesn't short-circuit on first failure. *(Important #10)*
8. Add unit/contract test for the `pick.js` unique-constraint race path. *(Recommendation)*
9. Add `qa:dev` npm script targeting local wrangler. *(Recommendation)*
10. Add functional E2E (pick → confirm → cleanup) per surface. *(Recommendation)*

---

## Files read during review

- `functions/api/gala/portal/[token]/pick.js`
- `qa/lib/portal-api.js`, `qa/lib/config.js`, `qa/lib/ui.js`
- `qa/playwright.config.js`
- `qa/smoke.spec.js`, `qa/visual.spec.js`, `qa/a11y.spec.js`
- `qa/api-stress.mjs`, `qa/performance.mjs`, `qa/webpagetest.mjs`
- `qa/README.md`
- `package.json`, `.gitignore`
- `index.html`, `public/sponsor/index.html`
- `src/App.jsx`, `src/brand/atoms.jsx`
- `src/portal/Desktop.jsx`, `src/portal/Mobile.jsx`, `src/portal/MobileWizard.jsx`
- `src/portal/components/SeatPickSheet.jsx`
