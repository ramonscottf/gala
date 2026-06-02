---
title: Gala Admin — Mobile & Visual Unification
status: in-progress
project: gala
phase: "Phase 3 of 6 (next up); Phase 0–2 shipped"
source_chat: 2026-06-02 gala admin mobile overhaul
created: 2026-06-02
last_updated: 2026-06-02
---

# Gala Admin — Mobile & Visual Unification

**The problem (Scott, verbatim):** "Every page is a slightly different theme.
Each one works different. The sponsors is the most important and looks the
worst. All that stuff is jammed in the center and two buttons in the right
third side by side? Charts that don't scroll. It's a mess. We need to clean up
and unify."

**Root cause (measured):** 629 inline `style=` attributes scattered across 8
tab panels, each hand-styled ad hoc instead of from shared classes. Plus the
Sponsors tab is a separate React island (`src/admin/sponsors/`, built by Vite
to `public/admin/assets/sponsors.{js,css}`) with its own theme tokens.

**The fix:** one shared component layer (cards, buttons, stat tiles, filter
pills, scroll wrappers, section headers, tables) applied across every tab, plus
a focused mobile pass on the React island. Mobile-first, ≥44px tap targets,
everything scrolls, consistent spacing.

**North star:** this becomes Scott's on-the-road control surface for the June
10 event, and the clean foundation for a future native iOS app. Web unified
first; app on top.

**The deal:** Skippy does one phase → comes back → marks it ✅ here → Scott
confirms on his phone → says "next." No giant blind commits 9 days out.

---

## Surfaces (the 8 tab panels)

| panel | kind | state |
|---|---|---|
| `panel-overview` | host inline | not yet touched |
| `panel-sponsors` | **React island** | pass 1 done (rows + invite card) |
| `panel-movies` | host console | already unified (timeline + cards) |
| `panel-volunteers` | host inline | not yet touched |
| `panel-lunchangels` | host inline (table) | not yet touched |
| `panel-food` | host inline (table) | not yet touched |
| `panel-saladgf` | host inline (table) | not yet touched |
| `panel-marketing` | host inline | not yet touched |

---

## PHASE STATUS

- [x] **Phase 0 — Foundation already shipped** ✅ (pre-plan, 2026-06-02)
- [x] **Phase 1 — Shared component layer (design system)** ✅ shipped+verified (`e47398e`)
- [x] **Phase 2 — Sponsors finish (React island pass 2)** ✅ shipped+verified (`512c23f`)
- [ ] **Phase 3 — Volunteers tab conversion**  ← NEXT
- [ ] **Phase 4 — Lunch Angels + Food + Salad GF (the tables)**
- [ ] **Phase 5 — Overview + Marketing tabs**
- [ ] **Phase 6 — Global polish + inline-style purge + a11y**

---

## Phase 0 — Foundation already shipped ✅

Done before this plan existed, this session:
- Floating pill nav (Foster signature, matches portal-v2 WickoPillNav) on
  mobile; slim wordmark-only header; desktop unchanged.
- Movies tab unified into one console: live timeline + auditorium card list +
  edit modal + TMDB + library. Retired the bounce-out to seating.html.
- `/schedule` rewired from hardcoded arrays to live D1 (`/api/gala/movies`).
- Sponsors mobile pass 1: row head stacks (no more right-third cram), Nudge
  buttons full-width, ≥44px taps, KPI strip 2-up, invite card stacks.

**Commits:** 796700d, 5812486, 1d85d78, c0f9bb0.

---

## Phase 1 — Shared component layer (design system)  ← NEXT

**Goal:** establish ONE canonical set of component classes in the host admin
page so every tab can stop reinventing. No tab conversions yet — just lay the
track and prove it doesn't regress what's there.

**Build:**
- A single `<style>` block of namespaced tokens + components:
  - `.ga-card` / `.ga-card--pad` — the one card treatment (replaces `card`,
    `vol-card`, ad-hoc divs).
  - `.ga-btn` + `.ga-btn--primary/secondary/danger/ghost` — one button family
    (≥44px on mobile), reconciled with existing `.btn`.
  - `.ga-stat` / `.ga-stat-grid` — the stat-tile pattern (one source for the
    KPI tiles across Overview/Movies/Volunteers).
  - `.ga-pill` / `.ga-pill-row` — filter pills (tier filters, status filters).
  - `.ga-scroll` — horizontal scroll wrapper for ANY table/wide content
    (`-webkit-overflow-scrolling:touch`, subtle edge fade).
  - `.ga-table` — one table style (sticky header, zebra, scrolls inside
    `.ga-scroll`).
  - `.ga-section-head` — consistent section titles.
- Tokens reuse existing admin `:root` vars (`--navy`, `--pink`, `--card`,
  `--border`, etc.) — no new color system, just consolidation.

**Files:** `public/admin/index.html` (one new `<style>` block near the top of
the existing admin CSS).

**Acceptance:**
- New classes exist and render; NO visual change to any tab yet (additive only).
- Bump admin `?v=`. Deploy green. Spot-check Movies + Sponsors still fine.

**Risk:** low (additive CSS, no markup changes).

**SHIPPED 2026-06-02 (`e47398e`):** layer injected after :root, built only on
existing tokens, balanced 53/53 braces, 0 markup usages (provably additive — no
tab changed). Live + verified in served admin HTML. ⏳ Scott: nothing to see yet
by design; confirm later phases as tabs convert onto it.

---

## Phase 2 — Sponsors finish (React island pass 2)

**Goal:** the priority surface, fully mobile-clean — beyond the row stacking
already done in pass 1.

**Build (in `src/admin/sponsors/` → rebuild bundle):**
- Expanded panel (`.gs-exp`, seats & movies, touchpoint timeline): stack to one
  column cleanly; the seat grid scrolls horizontally (`.gs-seatmodal` content).
- Seat modal + Move-show modal: full-height sheet on mobile, scrolls, ≥44px
  controls, close button reachable.
- Search bar + Add-sponsor: stack, full-width, no width fight.
- Touchpoint timeline rows: readable on narrow screens (no clipped meta).
- Status pills / tier badges: wrap, don't overflow.
- Confirm the seat-selector invite preview is legible on mobile.

**Files:** `src/admin/sponsors/*.jsx`, `src/admin/sponsors/theme.css`; then
`npm run build:sponsors` → `public/admin/assets/sponsors.{js,css}`; bump `?v=`.

**Acceptance:** Scott can, one-handed: scan stalled sponsors, expand one, see
seats/movies without horizontal page scroll, fire a Nudge, open & use the seat
modal. Deploy green; live bundle carries the changes.

**Risk:** medium (React build step; test the seat-assignment modal carefully —
it's load-bearing for the event).

**SHIPPED 2026-06-02 (`512c23f`):** CSS-only (no JSX/logic change, seat flow
untouched). Composer/Change-seats/Move-show modals → full-height bottom sheets
that scroll; forms single-column w/ 16px inputs (no iOS zoom); seat map scrolls
horizontally; footers stack to full-width ≥44px buttons; timeline time wraps;
badges nowrap. Rebuilt bundle, live-verified. ⏳ Scott: open Sponsors → expand a
row → open Change-seats; confirm it's a usable sheet, not a cramped box.

---

## Phase 3 — Volunteers tab conversion

**Goal:** convert `panel-volunteers` to the Phase 1 components.

**Build:** progress rings + counts → `.ga-stat-grid`; volunteer rows →
`.ga-card`; Message/Test Pipes/Export/Refresh/Public Signup → `.ga-btn` row
that wraps; search full-width; the Adults/Students/status filter →
`.ga-pill-row`. Kill the tab's inline styles.

**Files:** `public/admin/index.html` (markup + the volunteers render JS that
emits inline styles).

**Acceptance:** matches the shared system; rings legible; buttons ≥44px and
wrap; no horizontal overflow. Deploy green.

**Risk:** low–medium (touches the volunteers render function).

---

## Phase 4 — Lunch Angels + Food + Salad GF (the tables)

**Goal:** the table-heavy tabs — Scott's "charts that don't scroll" complaint.

**Build:** wrap every table in `.ga-scroll` + `.ga-table`; sticky header;
shift labels readable; the "Remind those awaiting / Export / Refresh" and
food-choice action rows → `.ga-btn` rows. Lunch Angels intro card →
`.ga-card`. Salad GF + Food share the same table treatment.

**Files:** `public/admin/index.html` (3 panels + their render JS).

**Acceptance:** every table scrolls horizontally on a phone without breaking
the page; headers stick; actions thumb-friendly. Deploy green.

**Risk:** low (mostly wrapper + class swaps).

---

## Phase 5 — Overview + Marketing tabs

**Goal:** convert the last two host tabs.

**Build:** Overview KPI tiles + lineup strip + any dashboards → `.ga-stat` /
`.ga-card`. Marketing edit/test/save buttons → `.ga-btn`; cards unified;
kill the `mkt-*` one-off button variants where they duplicate `.ga-btn`.

**Files:** `public/admin/index.html`.

**Acceptance:** both tabs visually match the rest; no leftover bespoke themes.
Deploy green.

**Risk:** low.

---

## Phase 6 — Global polish + inline-style purge + a11y

**Goal:** final consistency sweep.

**Build:** drive the inline-`style=` count down (target: structural styles
moved to classes; only truly dynamic values stay inline); verify ≥44px tap
targets everywhere; consistent vertical rhythm/spacing scale; one last
cross-tab visual audit on a real phone width (390px); quick WCAG AA pass
(contrast, focus states, labels) consistent with the DEF site remediation.

**Files:** `public/admin/index.html` (+ island if anything surfaces).

**Acceptance:** open every tab at 390px — they look like one app, all
interactive targets comfortable, nothing clipped, nothing unscrollable.
Final `?v=` bump. Deploy green.

**Risk:** low (cleanup), but it's the longest single pass.

---

## Standing rules for every phase

- Verify against live bytes/D1, not memory or chat history.
- Inline JS/CSS into the DYNAMIC (uncached) admin HTML to dodge the cache trap;
  bump `?v=` on the fixed-name bundle whenever admin HTML or the island changes.
- Never `sed` production HTML for content; CSS-only changes reviewed first.
- React island changes require `npm run build:sponsors` + a `?v=` bump.
- Deploy via git push (Pages auto-build); poll deploy green before claiming done.
- Don't mark a phase ✅ as *confirmed* until Scott taps it on his real phone.
  Skippy marks "shipped + self-verified"; Scott marks "confirmed."
- One phase per turn unless Scott says otherwise. Come back, mark off, wait for
  "next."
