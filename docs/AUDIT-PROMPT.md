# Portal v2 Parity Audit — Fresh Session Prompt

**Created:** May 17, 2026
**Purpose:** A clean Skippy session will compare the LIVE production sponsor portal (v1) against the v2 preview portal, page-by-page, action-by-action, and produce a detailed parity report with prioritized recommendations.

**This document is the literal prompt to drop into a new Claude window.** Scott has the seat-redesign + Gift work already shipped on the preview branch. The remaining work is finding what's still missing.

---

## How to use this document

1. Scott opens a new Claude window
2. Pastes everything between the `>>>>>>>> START PROMPT` and `<<<<<<<< END PROMPT` markers below
3. The new Skippy session will know to fetch repos, walk both sites, and produce the audit

The prompt below is self-contained. It includes everything needed: URLs, test tokens, credentials, the working git state, known findings, audit checklist.

---

>>>>>>>> START PROMPT

You are Skippy, picking up Scott Foster's DEF Gala 2026 sponsor portal work. Scott has been redesigning the portal (v2, branch `feat/portal-soft-website`) to replace the live production version (v1, `main`). The visual redesign is shipped to a preview URL. A previous Skippy session shipped Phases 1–5 plus a Gift seat action. **Now we need a thorough audit comparing v1 prod against v2 preview, in detail, before merging.**

Scott calls this A++++ importance for detail and polish. Do not rush.

## Sync state — read these first

You are starting fresh. Before doing anything else, sync these three sources:

**1. Git repos.** Clone both with Scott's GitHub PAT (he'll provide it when you start — it's in his memory block under "GitHub PAT"):

```
git clone https://${GITHUB_PAT}@github.com/ramonscottf/gala.git
git clone https://${GITHUB_PAT}@github.com/ramonscottf/skippy-plans.git
```

Replace `${GITHUB_PAT}` with the actual token Scott pastes (format: `ghp_...`).

**2. Plan docs in skippy-plans.** Read in order:
- `plans/2026-05-15-portal-v2-completion.md` — the master plan with all phases and the new P5.6 parity gaps
- This file itself: `plans/2026-05-17-portal-v2-audit-prompt.md` (you're reading it)

**3. Working branches.** In the gala repo:
```
git checkout feat/portal-soft-website
git pull origin feat/portal-soft-website
```
Then also fetch `main` for v1 comparison:
```
git fetch origin main:main
```

## The two URLs you'll compare

**v1 — LIVE PRODUCTION (the thing real sponsors see right now):**
- `https://gala.daviskids.org/sponsor/sxnhcj7axdrllaku`
- This is Wicko Waypoint (Scott's own sponsor, ID 89, currently flipped to Platinum tier for testing — D1 sponsors table).
- Code: `src/portal/Portal.jsx` (3870 lines), `src/portal/components/*.jsx`
- Built and served from `main` branch.

**v2 — PREVIEW (the redesign Scott is testing):**
- `https://feat-portal-soft-website.gala-3z8.pages.dev/sponsor/sxnhcj7axdrllaku`
- Same Wicko Waypoint token, same D1 data — but the soft-website redesign.
- Code: `src/portal-v2/*.jsx`, mounted from `src/App.jsx` unconditionally.
- Built and served from `feat/portal-soft-website` branch.

Both URLs hit the same backend (same D1, same /api/gala/portal/{token} endpoints). The data is identical. **What differs is the UI layer ONLY.** Any feature missing from v2 is a UI feature that the v2 components didn't implement.

## Other test tokens for breadth

If you want to see other tier behaviors, query the D1 for sample sponsors with placed seats and a variety of states. Hit this endpoint:

```bash
curl -H "X-Auth-Email: ramonscottf@gmail.com" \
     -H "X-Auth-Key: ${CF_API_KEY}" \
     -H "Content-Type: application/json" \
     "https://api.cloudflare.com/client/v4/accounts/77f3d6611f5ceab7651744268d434342/d1/database/1468a0b3-cc6c-49a6-ad89-421e9fb00a86/query" \
     -d '{"sql":"SELECT id, company, sponsorship_tier, portal_token FROM sponsors WHERE sponsorship_tier IN (\"Platinum\",\"Gold\",\"Silver\",\"Bronze\") LIMIT 10"}'
```

Use the returned `portal_token` values to test other sponsor states. **Stick mostly to sponsor 89 (Wicko)** to avoid disrupting real sponsors' portals — but a quick sanity check with one Bronze sponsor is worth doing to see tier-gating differences.

For delegations (the guest portal experience), check:
```bash
curl ... -d '{"sql":"SELECT id, delegate_name, token, parent_sponsor_id FROM sponsor_delegations LIMIT 5"}'
```
None likely exist for sponsor 89 (Scott confirmed he hasn't created any test delegations there yet), so the delegate-side audit may be limited or you can create one via the v1 portal's Invite flow to test both views.

## Cloudflare credentials for code-level work

- **Account ID:** `77f3d6611f5ceab7651744268d434342`
- **API Key (X-Auth-Key):** Scott will paste it (it's in his memory under "Cloudflare auth")
- **Email (X-Auth-Email):** `ramonscottf@gmail.com`
- **D1 Database UUID:** `1468a0b3-cc6c-49a6-ad89-421e9fb00a86` (gala-seating)
- **Pages project:** `gala`
- **Branch deploy URL pattern:** `https://feat-portal-soft-website.gala-3z8.pages.dev`
- **Production URL:** `https://gala.daviskids.org`

Use `X-Auth-Key`/`X-Auth-Email` headers, NEVER `Bearer`.

## What's already been audited (don't redo)

The previous Skippy session ran a partial audit and found these gaps. **Verify they're still true, then build on them — don't restart from zero.**

**P5.6.1 — `/finalize` "Done, send confirmation" trigger.** v1 has it. v2 doesn't. The /finalize endpoint sends QR + summary email + SMS to the sponsor. v2 has no UI calling it. Pick endpoint doesn't auto-confirm. **Sponsors will never receive a confirmation summary in v2 as it stands.**

**P5.6.2 — Help footer with Scott's number.** v1: "Need help? Text Scott Foster — 801-810-6642" with `sms:` link, on every screen. v2: nothing.

**P5.6.3 — FAQ surface.** v1 has a NightTab with 34 FAQ entries from `/api/gala/chat/faq` (component: `src/portal/components/NightOfContent.jsx`). v2: no FAQ surface. Note: `daviskids.org/faq` exists publicly so it's not a complete absence, but in-portal access is gone.

**P5.6.4 — QR code per sponsor.** v1: `TicketQrCard` (Portal.jsx:779). v2: nothing. Already on Phase 6 roadmap so flagged not "lost".

**Features CONFIRMED PRESENT in v2 (don't re-verify these unless suspicious):**
- Profile editing + Sign out (ProfileModal)
- Text my seats / Text all my seats
- Invite Mode A (quota) + Mode B (preselected pills)
- Celebration overlay (post-pick)
- Seat placement, unplace, assign to delegation
- Tier-window gating display
- Gift seat (new in v2, even better than v1)
- Per-seat: Change, Release (via ⋯), Meal
- Group-level: Move whole group, Release whole group, Add more seats
- Delegate-side receive flow with confirm-or-modify gate
- Sponsor-side delegation manage modal (edit name/phone/email + resend/copy/reclaim)

## What you need to produce

A detailed audit report saved as `/home/claude/gala/docs/AUDIT-2026-05-17-v1-vs-v2.md` covering:

### Section 1: Sponsor view — page-by-page comparison

Walk through every screen and modal a sponsor would see. For each, list:
- What v1 shows / what v2 shows
- What's identical, what changed (intentional improvement), what's broken or regressed
- Visual nits (alignment, spacing, color, font weight inconsistencies)
- Empty-state handling (sponsor with 0 placed, sponsor with all-placed, sponsor who's fully delegated their block)
- Loading states, error states (try a malformed token, try with no internet)

### Section 2: Delegate view (guest portal)

Same as Section 1 but for the delegate-side. The receive overlay is new — verify it works correctly:
- First visit (confirmedAt is NULL) → overlay should fire
- After Keep/Modify → overlay shouldn't fire again
- What happens for a delegate with 0 seats yet? Sub-delegations (delegate of a delegate)?

### Section 3: Seat picker (the big wizard)

Both v1 and v2 use the SAME SeatPickSheet component from `src/portal/components/SeatPickSheet.jsx`. v2 wraps it in `src/portal-v2/SeatPickerModal.jsx`. Verify:
- All 3 wizard steps work in v2 (showing → movie → seats)
- Auto-pick + manual select + the new initialMovieId/initialShowingNumber step-jump
- The commit flow (after picking seats, does the celebration overlay fire correctly?)
- Mobile and desktop both work

### Section 4: Server-side parity

Check that all endpoints v1 hits are also wired in v2:
- `/api/gala/portal/{token}` — both
- `/api/gala/portal/{token}/pick` — both
- `/api/gala/portal/{token}/assign` — both
- `/api/gala/portal/{token}/delegate` — both (v2 added `action=update`, `action=confirm`)
- `/api/gala/portal/{token}/finalize` — v1 only ⚠️
- `/api/gala/portal/{token}/sms` — both (kind=self)
- `/api/gala/portal/{token}/profile` — both
- Any others I missed? Walk the functions/api/gala/portal/[token]/ directory.

### Section 5: Visual polish list

Scott's note from May 17: "no borders. ever. clean. I don't want them to feel like they are in a gutter or column."

Audit every `border:` and `box-shadow:` in portal-v2.css. List which ones serve a real purpose vs which feel like a gutter cage. Same for the `border` props in inline styles inside the .jsx files.

Also audit consistency:
- Does the gradient strip (red→yellow→blue) appear on every modal? Should it?
- Do all modals use the same close button style?
- Are the eyebrow + Fraunces title pattern consistent across all surfaces?

### Section 6: Mobile layout audit

Open every screen at 390px viewport (iPhone width). For each, note:
- Anything that wraps awkwardly
- Anything that overflows horizontally (causing horizontal scroll on the page)
- Anything that stacks vertically when it could be a horizontal rail (the May 17 ask)
- Tap target sizes — anything < 44px square is iOS-broken

### Section 7: Prioritized recommendations

End with a numbered list of recommendations in priority order. Each rec gets:
- Effort estimate (XS/S/M/L)
- Whether it blocks gala (June 10, 2026)
- A one-line implementation sketch

## How to do the audit

**Use Playwright via the bash_tool computer.** Spin up headless chromium, screenshot every page on both URLs, save them side-by-side. Don't just describe — show.

Suggested approach:
```javascript
import { chromium } from 'playwright';
const browser = await chromium.launch();
async function pair(viewport, urlSuffix, file) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const v1 = await ctx.newPage();
  const v2 = await ctx.newPage();
  await Promise.all([
    v1.goto('https://gala.daviskids.org' + urlSuffix),
    v2.goto('https://feat-portal-soft-website.gala-3z8.pages.dev' + urlSuffix),
  ]);
  // wait, screenshot, save side by side
}
```

For mobile use `{ width: 390, height: 800 }`, for desktop `{ width: 1440, height: 900 }`.

For modals: use Playwright's `page.click()` to open each modal, then screenshot. Be systematic — there are ~10 modals.

## Don't shipping anything yet

This is an audit pass. You're producing a doc, not patches. The follow-up session will use your audit to prioritize and ship. **Do not commit code changes.** Do commit the audit doc to gala repo and mirror to skippy-plans.

## Working principles

- **VERIFY-BEFORE-ACTING.** Check the live URLs with Playwright, not just by reading code. The code on `main` may not match what's actually deployed.
- **No fabrication.** If you can't verify something, say so. Don't make up a finding.
- **Mobile-first.** Most sponsors will use this on their phone. If something works on desktop but breaks at 390px, that's a P0.
- **Side-by-side comparison.** For every finding, both screenshots. Don't say "v2 is missing X" without showing v1's X next to v2's absence.
- **Note also what v2 IMPROVED on v1.** The Gift action, the per-seat Change chip, the soft-website look, the receive overlay — these are wins. Document them.

## Output structure

The audit doc should be ~3000–5000 words with embedded screenshot file paths. Use markdown. Save to:

- `/home/claude/gala/docs/AUDIT-2026-05-17-v1-vs-v2.md` (committed to gala feat/portal-soft-website branch)
- Mirror to `/home/claude/skippy-plans/plans/2026-05-17-portal-v2-audit.md` (committed to skippy-plans main)

Commit and push both. Don't end your session telling Scott to read docs you haven't pushed.

End your audit with: "Audit complete. {N} findings. {M} P0 (must fix before gala). {K} P1 (should fix). {L} P2 (nice to have)."

Get to work, Skippy. Detail matters.

<<<<<<<< END PROMPT

---

## Notes for Scott (not part of the prompt)

After the audit is done, you'll have a doc telling you exactly what's broken or missing. Then we use a THIRD session to actually fix things, one at a time, with the audit doc as the canonical list. Three-session pattern:

1. **This session (current):** ship what's done (Gift), write the audit prompt, push everything to repos so docs match reality.
2. **Audit session (next):** fresh Skippy reads the prompt above, does the full v1↔v2 walkthrough with Playwright screenshots, produces `AUDIT-2026-05-17-v1-vs-v2.md`.
3. **Fix sessions (after that):** read the audit doc, work top-down through the P0 list. Each fix gets its own commit + plan update.

This is the proper "no stale docs ever" loop. The audit doc IS the plan for the fix sessions. The audit prompt IS the plan for the audit session.

## Sync instructions for the new chat window

When you open the fresh Claude window:

1. Start a new chat (Project Skippy)
2. Paste your system prompt v5 first as usual
3. Then paste **everything between the `>>>>>>>> START PROMPT` and `<<<<<<<< END PROMPT` markers above**
4. Hit enter — the new Skippy will sync the repos, read the plans, then start the audit
5. Wait ~30–60 minutes for it to walk through everything

If anything in the new session feels off (Skippy not finding the right state, getting confused about what's in v1 vs v2), tell them to re-read this doc. It's the canonical setup.
