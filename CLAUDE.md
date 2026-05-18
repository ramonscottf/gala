# DEF Gala Sponsor Portal — Claude Code Project Brief

**Last updated:** May 17, 2026
**Mission:** Audit v1 production against v2 preview. Find every gap, regression, polish issue, and visual nit. Then fix them. Then audit again. Repeat until perfect.

You are Claude Code working on Scott Foster's DEF Gala 2026 sponsor portal. The visual redesign (v2, "soft-website" branch) is mostly built but it has parity gaps versus the v1 production portal that real sponsors are currently using. Gala is **June 10, 2026** — about three weeks out. This needs to be perfect before merge.

## The mission, in one sentence

**Be ruthless. Audit, fix, retest, audit again. Don't stop until v2 is strictly better than v1 across every screen, every action, every edge case, on every viewport.**

---

## What "perfect" means here

A merge-ready v2 portal where:
1. **Every v1 feature works in v2** (no regression — see "known parity gaps" below)
2. **Every v2 improvement is preserved** (Gift, Change, Move-group, ReceiveOverlay, etc.)
3. **Mobile experience is first-class** at 390px viewport. No horizontal scroll. No tiny tap targets. No awkward stacks.
4. **Zero borders that feel like a "gutter cage"** (Scott's explicit ask — cards bleed into the page tone, no rectangle-with-1px-border-and-margins pattern)
5. **All builds pass.** `npm run build` clean. No console errors on the live preview.
6. **Cross-browser sanity.** Test in Chromium and WebKit at minimum.
7. **Edge cases handled.** Sponsor with 0 seats placed. Sponsor with all seats fully delegated. Delegate with 0 seats yet. Bronze tier viewing pre-window. Network failures during pick.

## The work pattern (this is non-negotiable)

You are running an **audit ↔ fix loop** until the audit comes back clean.

1. **Audit pass** — produce a numbered, prioritized findings list. Use Playwright to walk both URLs at multiple viewports, screenshot side-by-side, save to `/home/claude/audit/`. Cross-reference code in `src/portal/` (v1) vs `src/portal-v2/` (v2). Be specific: cite line numbers, paste DOM diffs, attach screenshots.
2. **Plan pass** — group findings by severity (P0 blocks gala / P1 should fix / P2 polish). Pick the next batch to ship (usually 3–5 P0/P1 items per cycle).
3. **Fix pass** — implement the batch. One commit per logical change with proper message. Build clean. Push.
4. **Verify pass** — wait for Cloudflare Pages deploy (≈45s), re-screenshot the affected screens, prove each fix worked. Update the findings list with ✅ on what's done.
5. **Loop** — back to audit. New findings may surface from the fixes. Keep going.

**Stop conditions (only):**
- All P0 findings resolved AND
- ≥90% of P1 findings resolved AND
- The audit pass surfaces no new P0/P1 findings (just polish/P2) AND
- The Skippy PM chat or Scott explicitly says "ship it"

If you hit a wall (something requires Scott's design call, or a backend change too risky to ship blind), write the question into `BLOCKERS.md` and continue with other findings. Don't stop the whole loop on one blocker.

## The codebase

**Repo:** `https://github.com/ramonscottf/gala` (clone with GITHUB_PAT from environment or the managing Skippy session)

**Working branch:** `feat/portal-soft-website`. Do NOT merge to `main` — that's the live v1. The whole point is making v2 mergeable.

**Key directories:**
- `src/portal/` — v1 production code. **Read-only reference.** Don't modify. This is what's live.
- `src/portal-v2/` — v2 redesign code. Your work happens here.
- `src/portal/components/` — shared components some of which v2 reuses (SeatPickSheet.jsx, SeatEngine.jsx). Be careful when modifying — v1 still depends on them.
- `functions/api/gala/portal/` — backend endpoints. Both versions hit these.
- `migrations/` — D1 schema migrations. Only add new ones; never edit applied ones.
- `docs/` — plan docs, audit reports, blockers.

**Entry point:** `src/App.jsx` unconditionally mounts `PortalShellV2` from `src/portal-v2/PortalShell.jsx`. The v1 `Portal.jsx` is dead code on this branch — it's still in the tree only for reference comparisons during the audit.

## The two URLs

**v1 PRODUCTION (the standard you're matching/exceeding):**
- `https://gala.daviskids.org/sponsor/sxnhcj7axdrllaku`
- Wicko Waypoint, sponsor 89, currently Platinum tier for testing
- Built from `main` branch

**v2 PREVIEW (your work):**
- `https://feat-portal-soft-website.gala-3z8.pages.dev/sponsor/sxnhcj7axdrllaku`
- Same data, same backend, different UI layer
- Built from `feat/portal-soft-website` branch (your branch)
- Deploys automatically ~45s after every push

If you need other test sponsors for breadth (different tiers, different seat-placement states), query D1 directly — see "Cloudflare / D1 access" below.

## Build & deploy

```bash
# Frontend prod build
npm run build

# Frontend preview build (the qa/preview-v2/ harness)
npx vite build --config vite.preview-v2.config.js

# Local preview server (serves the preview build)
cd /tmp/portal-v2-preview && python3 -m http.server 8765 &
# Then open http://localhost:8765/qa/preview-v2/index.html

# Production deploy is via Cloudflare Pages on git push.
# After `git push origin feat/portal-soft-website`, wait ~45s, then verify:
curl -s -H "X-Auth-Email: ramonscottf@gmail.com" -H "X-Auth-Key: ${CF_API_KEY}" \
  "https://api.cloudflare.com/client/v4/accounts/77f3d6611f5ceab7651744268d434342/pages/projects/gala/deployments?per_page=1"
```

## Cloudflare / D1 access

Cloudflare credentials live in the managing Skippy's memory block under "Cloudflare auth". The Skippy who hands you off will paste them as environment variables before launching you:

```bash
export CF_API_KEY=...           # X-Auth-Key
export CF_EMAIL=ramonscottf@gmail.com
export CF_ACCOUNT_ID=77f3d6611f5ceab7651744268d434342
export GALA_DB_UUID=1468a0b3-cc6c-49a6-ad89-421e9fb00a86
export GITHUB_PAT=...           # repo scope
```

**Always use `X-Auth-Key`/`X-Auth-Email` headers, NEVER `Bearer`.**

D1 query pattern:
```bash
curl -s -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/d1/database/$GALA_DB_UUID/query" \
  -d '{"sql":"SELECT id, company, sponsorship_tier, portal_token FROM sponsors LIMIT 5"}'
```

## Known parity gaps (start here — these are the ground truth)

Verified findings from the May 17 partial audit. **Confirm each is still present, then fix in priority order:**

### P0 — Blocks gala

**P0.1 — Missing `/finalize` "I'm done, send my confirmation" trigger**
- v1 has it (look at `Portal.jsx:2897`, `PostPickOverview.jsx`, the "Done" button after pick)
- v2 has NO call to `/api/gala/portal/{token}/finalize`
- This endpoint sends the QR code + summary email + summary SMS
- Without it, sponsors who pick seats never receive a confirmation summary
- Fix: surface a "I'm done — send my confirmation" CTA somewhere visible. Probably a sticky banner when `placed === allocated && allocated > 0`, dismissible, but firing /finalize on tap.

**P0.2 — Missing help footer with Scott's number**
- v1 has `HelpFooter` component (`Portal.jsx:1273`) with "Need help? Text Scott Foster — 801-810-6642" + `sms:` link
- v2 has zero help/support surface
- Fix: port the HelpFooter as a v2 component. Place at the bottom of the home shell, persistent.

### P1 — Should fix

**P1.1 — Missing FAQ surface**
- v1's NightTab pulls `/api/gala/chat/faq` (34 entries, search + accordion)
- v2 has nothing in-portal
- Public /faq exists at daviskids.org/faq so not catastrophic
- Component `src/portal/components/NightOfContent.jsx` is ready to port — wrap in a v2 modal triggered from a "Got questions?" CTA in the new help footer

**P1.2 — QR code per sponsor**
- v1's `TicketQrCard` (Portal.jsx:779)
- Already on Phase 6 roadmap — re-verify it works in v1 and port to v2

### Open phases on the existing plan (read these in docs/)

- `docs/PLAN-portal-v2-completion.md` — master plan, Phase 5 just shipped
- The mirror in `skippy-plans/plans/2026-05-15-portal-v2-completion.md`

Phase 5.7 (mobile horizontal-rail redesign per Scott's May 17 ask) is queued AFTER parity-fix. Don't start it until P0/P1 are clean.

## Audit checklist (run this every audit pass)

For each item, screenshot v1 and v2 side-by-side at **both 390px (mobile) and 1440px (desktop)**.

### Sponsor view
- [ ] Home page top — hero, status card, block stats
- [ ] Place seats CTA — fires the picker correctly
- [ ] Picker step 1 (showing select)
- [ ] Picker step 2 (movie select)
- [ ] Picker step 3 (seat map + auto-pick + manual)
- [ ] Picker commit → celebration overlay
- [ ] Tickets section, multi-seat group card
- [ ] Tickets section, single-seat ticket card
- [ ] Group modal — all per-seat actions (⋯, Change, Gift, Meal)
- [ ] Group modal — Manage group menu (Move all, Release whole)
- [ ] Single ticket modal — Change, Release
- [ ] Gift modal — picks existing delegate, invites new
- [ ] Invite modal — Mode A (quota) AND Mode B (preselected pills)
- [ ] Delegation manage modal — edit fields, save, resend, copy link, reclaim
- [ ] Profile modal — edit + sign out
- [ ] Lineup section
- [ ] Movie detail modal (with trailer)
- [ ] Night Of section / FAQ access ← P1
- [ ] Help footer ← P0
- [ ] Finalize CTA ← P0
- [ ] QR code surface ← P1

### Delegate view (guest portal)
- [ ] ReceiveOverlay first visit (confirmedAt NULL)
- [ ] ReceiveOverlay does NOT fire on second visit
- [ ] Modify flow → DelegationManageModal selfView mode
- [ ] Normal portal view after Keep
- [ ] Delegate's seats / meals / change/release actions

### Edge cases
- [ ] Sponsor with 0 placed (fresh)
- [ ] Sponsor with all seats placed (allocation full)
- [ ] Sponsor fully delegated (all seats in child delegations)
- [ ] Sponsor pre-tier-window (Bronze before window opens)
- [ ] Delegate with 0 seats yet (sponsor hasn't placed for them)
- [ ] Delegate confirming (POST action=confirm)
- [ ] Network failure during pick → graceful error
- [ ] Race condition: same seat picked by two parties → server error surfaces clearly

### Visual polish (Scott's "no borders, no gutters" mandate)
- [ ] Audit every `border:` in `portal-v2.css` — does it serve a purpose or is it a gutter cage?
- [ ] Audit every `box-shadow` — same question
- [ ] Cards: bleed into page tone, not floating boxes with margins
- [ ] Consistent gradient strip top on every modal
- [ ] Consistent close button style
- [ ] Consistent eyebrow + Fraunces title pattern
- [ ] Tap targets ≥ 44px square
- [ ] Mobile: no horizontal page-level scroll anywhere
- [ ] Mobile: chip clusters wrap gracefully

### Server parity
- [ ] All endpoints v1 hits are also hit by v2 (or have an equivalent path)
- [ ] No new endpoints v2 hits that aren't actually deployed

## Commands you'll use a lot

```bash
# Sync
git fetch origin && git checkout feat/portal-soft-website && git pull

# Quick screenshot pair
node -e "import('playwright').then(async ({chromium}) => {
  const b = await chromium.launch();
  const v1 = await b.newContext({viewport:{width:390,height:800},deviceScaleFactor:2});
  const v2 = await b.newContext({viewport:{width:390,height:800},deviceScaleFactor:2});
  const p1 = await v1.newPage(); const p2 = await v2.newPage();
  await Promise.all([
    p1.goto('https://gala.daviskids.org/sponsor/sxnhcj7axdrllaku'),
    p2.goto('https://feat-portal-soft-website.gala-3z8.pages.dev/sponsor/sxnhcj7axdrllaku'),
  ]);
  await Promise.all([p1.waitForTimeout(3000), p2.waitForTimeout(3000)]);
  await p1.screenshot({path:'/home/claude/audit/v1-home.png', fullPage:true});
  await p2.screenshot({path:'/home/claude/audit/v2-home.png', fullPage:true});
  await b.close();
})"

# Build + deploy + verify cycle
npm run build && git add -A && git commit -m "..." && git push origin feat/portal-soft-website
sleep 60
curl -s -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_API_KEY" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pages/projects/gala/deployments?per_page=1" \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['result'][0]; print(r['short_id'], r['latest_stage']['status'])"
```

## Critical rules

1. **Never modify v1 code** (`src/portal/`). It's a reference. The only exception is `src/portal/components/` shared utilities (SeatPickSheet, SeatEngine) — and even those, be surgical because v1 still depends on them.

2. **Never commit secrets.** GitHub push protection will reject. The API keys and PATs come from environment variables provided by the managing Skippy — never write them to a file.

3. **Never two coding agents on the same branch.** If a Skippy chat thinks you're stuck, they should rebase and continue, not spawn a parallel Claude Code session pushing the same repo.

4. **Always verify after push.** Check the Pages deploy status. Don't assume.

5. **Status hygiene.** When you complete a finding, mark it ✅ in your audit doc with the commit hash. When you discover something new, add it with a P-level. Keep the audit doc as the canonical state.

6. **Test on real production data.** The preview URL hits real D1. Don't mutate seats unless you're prepared to revert (or you're explicitly testing flows that mutate state, in which case revert after).

7. **Communicate via files, not stdout.** Your stdout disappears when the session ends. Anything important goes in `docs/AUDIT-REPORT-{date}.md`, `BLOCKERS.md`, or commit messages.

## Working principles

- **Verify-before-acting.** Don't assume a file looks how you remember. Re-read it. The codebase changes between sessions.
- **Mobile-first.** 80% of sponsors will use this on their phone. Anything that works on desktop but breaks mobile is a P0.
- **Side-by-side or it didn't happen.** Every finding needs both screenshots. Every fix needs a before-and-after.
- **Small commits, clear messages.** One logical change per commit. Future-you (and Scott) need to read the history.
- **No half-fixes.** If a fix uncovers a deeper issue, follow it. Don't ship the surface patch and leave the rot.

## What's done as of this brief

- Phases 1–5 shipped (visual shell, dinner pills, celebration, delegate flows, per-seat Change/Release, Move group, Gift seat)
- Latest commits on `feat/portal-soft-website`: `8f434ad` (docs), `4ba75e9` (Gift)
- Preview deploys are green
- Parity gaps documented above are confirmed but not yet fixed

You're picking up from there. Start by running a full audit pass to confirm the known gaps and surface new ones. Then start fixing P0.1 (`/finalize` trigger) — it's the most consequential.

Get to work. Scott trusts you to make this perfect.

— Skippy (the one who wrote this brief, May 17)
