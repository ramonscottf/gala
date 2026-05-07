import { test, expect } from '@playwright/test';
import { preparePage } from './lib/config.js';

const PREVIEW_URL = 'http://localhost:5173/sponsor/qa/preview/sponsor-shell.html';

test.describe('sponsor shell preview', () => {
  test('desktop preview keeps the canonical mobile app and adds desktop notes', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto(`${PREVIEW_URL}?surface=desktop`);

    await expect(page.getByTestId('desktop-parity-shell')).toBeVisible();
    await expect(page.getByTestId('desktop-live-mobile-shell')).toBeVisible();
    await expect(page.getByTestId('desktop-companion-notes')).toBeVisible();
    await expect(page.getByTestId('desktop-companion-notes')).toContainText(/Same flow as mobile/i);
    await expect(page.getByTestId('cta-place-seats').first()).toBeVisible();
  });

  test('mobile preview renders the mobile shell without desktop companion chrome', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PREVIEW_URL}?surface=mobile`);

    await expect(page.getByTestId('mobile-shell-root')).toBeVisible();
    await expect(page.getByTestId('desktop-companion-notes')).toHaveCount(0);
    await expect(page.getByTestId('cta-place-seats').first()).toBeVisible();
  });
});
