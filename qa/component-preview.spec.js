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
  // Spec runs once per Playwright project (4 baselines: desktop-light/dark
  // + mobile-light/dark) the same way qa/visual.spec.js does. The component
  // uses CSS variables that flip with color scheme, so dark/light baselines
  // genuinely differ.
  test('PlacedTicketsPreview renders correctly', async ({ page }) => {
    await preparePage(page);
    await page.goto('http://localhost:5173/sponsor/qa/preview/placed-tickets.html');
    await expect(page.locator('#root').locator('> *').first()).toBeVisible();
    await expect(page.locator('#root')).toHaveScreenshot('placed-tickets.png', {
      maxDiffPixelRatio: 0.04, // looser than visual.spec.js — advisory
    });
  });
});
