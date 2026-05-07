import { test, expect } from '@playwright/test';
import { preparePage } from './lib/config.js';

// Component-isolation snapshot test for PlacedTicketsPreview.
//
// LOCAL-DEV-ONLY: This spec assumes `npm run dev` is running (vite at
// http://localhost:5173). The harness lives at qa/preview/placed-tickets.html
// and is served via vite's base path /sponsor/.
//
// CI-runnable follow-up tracked in the issue referenced from the
// Task 9 commit body — once resolved, we'll build public/sponsor/ and
// serve via Playwright's webServer config so this can run in CI.
//
// Looser maxDiffPixelRatio (0.04) than visual.spec.js because this is
// advisory / local-only.

test.describe('component previews', () => {
  test('PlacedTicketsPreview renders correctly @desktop-light', async ({ page }) => {
    await preparePage(page);
    await page.goto('http://localhost:5173/sponsor/qa/preview/placed-tickets.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#root')).toHaveScreenshot('placed-tickets.png', {
      maxDiffPixelRatio: 0.04, // looser than visual.spec.js — advisory
    });
  });
});
