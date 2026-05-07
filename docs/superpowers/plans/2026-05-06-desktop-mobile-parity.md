# Desktop Mobile Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make desktop use the exact same sponsor portal experience as mobile, with desktop layout polish that feels intentional instead of like the old wizard or a bare phone frame.

**Architecture:** Keep `Mobile.jsx` as the canonical feature surface for home, tickets, group, night-of, settings, ticket management, assignment, seat picking, post-pick, dinner picking, and confirmation. Replace the separate `Desktop.jsx` wizard with a desktop parity shell: the live mobile app stays mounted in the center, while read-only desktop side panels summarize sponsor progress, ticket status, lineup, and night-of details. Put desktop-only layout polish in CSS so feature behavior cannot diverge again.

**Tech Stack:** Vite, React 18, React Router, existing inline component styles, global CSS in `src/brand/styles.css`, Playwright QA scripts.

---

### Task 1: Replace Desktop Wizard With Canonical Mobile Shell

**Files:**
- Modify: `src/portal/Desktop.jsx`

- [x] **Step 1: Remove duplicate desktop wizard implementation**

Delete the desktop-only wizard, stepper, group rail, modal flow, and duplicated finalize state from `src/portal/Desktop.jsx`.

- [x] **Step 2: Add the desktop parity shell**

Replace the old wizard with a component that:

- imports `Mobile` and `adaptPortalToMobileData`;
- renders `<Mobile {...props} desktopFrame />` as the single live interactive portal;
- computes progress/ticket/lineup summary data from the same mobile adapter;
- renders desktop-only side panels as read-only context, not a second workflow.

- [x] **Step 3: Confirm the prop contract stays compatible**

`App.jsx` already passes `portal`, `token`, `theaterLayouts`, `seats`, `isDev`, `openSheetOnMount`, `apiBase`, and `onRefresh` to `Desktop`. `Mobile` safely ignores extra `apiBase` because React function components destructure only the props they need. The new `desktopFrame` flag is desktop-only and lets mobile sheets use frame-local absolute positioning instead of viewport-level fixed positioning. No router changes are required.

### Task 2: Add Desktop Stage Layout

**Files:**
- Modify: `src/brand/styles.css`

- [x] **Step 1: Add desktop-only framing styles**

Added a desktop layout system near the global layout utilities:

- `.desktop-parity-stage`
- `.desktop-parity-shell`
- `.desktop-parity-panel`
- `.desktop-parity-phone`
- responsive collapse rules for 1180px and 980px desktop widths
- `.mobile-shell-root--desktop-frame` to keep mobile sheets inside the live portal frame

- [x] **Step 2: Keep desktop text and controls stable**

The live portal stays in the same width range as the proven mobile shell, so existing mobile text wrapping, tab spacing, bottom sheets, and seat picker controls remain within known constraints. Desktop panels use fixed responsive grid tracks and no nested action workflow.

### Task 3: Add Preview Harness and Notes

**Files:**
- Add: `qa/desktop-mobile-preview.spec.js`
- Add: `qa/preview/sponsor-shell.html`
- Add: `qa/preview/sponsor-shell.jsx`
- Add: `qa/preview/mock-sponsor-data.js`
- Modify: `vite.config.js`

- [x] **Step 1: Add local preview page**

Local preview URLs:

```text
http://127.0.0.1:5173/sponsor/qa/preview/sponsor-shell.html?surface=desktop
http://127.0.0.1:5173/sponsor/qa/preview/sponsor-shell.html?surface=mobile
```

- [x] **Step 2: Add preview test**

`qa/desktop-mobile-preview.spec.js` verifies the desktop preview mounts the parity shell, live mobile portal, desktop notes, and place-seats CTA. It also verifies mobile preview mounts the mobile shell without desktop companion chrome.

- [x] **Step 3: Make local assets visible in Vite preview**

Added a Vite dev proxy for `/assets` so local sponsor previews can load the same DEF/Megaplex assets that production serves.

### Task 4: Verify Mobile/Desktop Feature Parity

**Files:**
- No source edits expected.

- [x] **Step 1: Build**

Run:

```bash
npm run build
```

Expected: Vite build exits 0.

- [ ] **Step 2: Run shell parity when QA token is available**

Run:

```bash
npm run qa:parity
```

Expected: mobile, desktop canonical, and desktop `/seats` deep-link all drive the same canonical finalize path. If `QA_TOKEN` is not configured, record that the command is blocked by environment rather than code.

- [x] **Step 3: Browser check the layout**

Start Vite:

```bash
npm run dev -- --host 127.0.0.1
```

Open the local preview URLs in desktop and mobile-sized browser contexts. Verify desktop renders the live mobile portal inside the desktop parity shell, the bottom tab bar is visible, `Place` opens the same `SeatPickSheet`, and mobile preview has no desktop companion chrome.

### Self-Review

- Spec coverage: The user asked for the mobile experience to be the exact desktop experience, with a desktop interface that is laid out nicely. Task 1 makes `Mobile.jsx` the single behavior surface for both shells; Task 2 handles desktop formatting; Task 3 adds a local preview page and notes; Task 4 verifies build, parity, and visual layout.
- Placeholder scan: No TBD/TODO/fill-in steps remain.
- Type consistency: `Desktop(props)` forwards the existing `App.jsx` prop contract to `Mobile`; extra `apiBase` is ignored safely, and the desktop-only `desktopFrame` boolean only changes sheet positioning.

### Verification Log

- Red test first: `QA_BASE_URL=http://localhost:5173 npx playwright test -c qa/playwright.config.js qa/desktop-mobile-preview.spec.js --project=desktop-light` failed before the preview shell existed.
- Green test: same command passed after adding the desktop/mobile preview harness.
- Build: `npm run build` passed.
- Screenshots captured:
  - `output/playwright/desktop-mobile-parity/desktop-preview.png`
  - `output/playwright/desktop-mobile-parity/mobile-preview.png`
