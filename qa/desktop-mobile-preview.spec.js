import { test, expect } from '@playwright/test';
import { preparePage } from './lib/config.js';

const PREVIEW_BASE_URL = (process.env.QA_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const PREVIEW_URL = `${PREVIEW_BASE_URL}/sponsor/qa/preview/sponsor-shell.html`;

test.describe('sponsor shell preview', () => {
  test('desktop preview renders the responsive home layout and wide seat picker', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto(`${PREVIEW_URL}?surface=desktop`);

    await expect(page.getByTestId('portal-shell-root')).toBeVisible();
    await expect(page.getByTestId('home-hero-region')).toBeVisible();
    await expect(page.getByTestId('home-actions-region')).toBeVisible();
    await expect(page.getByTestId('home-lineup-region')).toBeVisible();
    await expect(page.getByTestId('mobile-lineup-card')).toHaveCount(4);
    await expect(page.getByTestId('cta-place-seats')).toBeVisible();

    const actionsBox = await page.getByTestId('home-actions-region').boundingBox();
    const lineupBox = await page.getByTestId('home-lineup-region').boundingBox();
    expect(actionsBox?.width).toBeGreaterThan(600);
    expect(lineupBox?.width).toBeGreaterThan(300);
    expect(lineupBox?.x || 0).toBeGreaterThan((actionsBox?.x || 0) + (actionsBox?.width || 0));

    await page.getByTestId('cta-place-seats').click();
    const picker = page.getByTestId('seat-pick-sheet');
    await expect(picker).toBeVisible();
    const pickerBox = await picker.boundingBox();
    expect(pickerBox?.width).toBeGreaterThan(900);
    await expect(picker.getByRole('button', { name: /4:30 PM/i })).toBeVisible();
    await expect(page.getByTestId('seat-type-guide')).toContainText(/Luxury Recliner/i);
    await expect(page.getByTestId('seat-type-guide')).toContainText(/Standard/i);
    await expect(page.getByTestId('seat-type-guide')).toContainText(/D-BOX/i);

    await page.locator('[data-seat="E-1"]').click();
    await expect(page.getByTestId('selected-seat-preview')).toContainText(/Seat E1/i);
    await expect(page.getByTestId('seat-pick-commit')).toContainText(/Commit 1 seat/i);
  });

  test('desktop movie detail opens from the lineup without sending users to YouTube', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto(`${PREVIEW_URL}?surface=desktop`);

    await page.getByTestId('mobile-lineup-card').first().click();
    await expect(page.getByTestId('movie-detail-sheet')).toBeVisible();
    await expect(page.getByTestId('movie-detail-sheet')).toContainText(/95%/i);
    await expect(page.getByTestId('movie-detail-sheet').locator('a[href*="youtube"]')).toHaveCount(0);
    await expect(page.getByTestId('movie-trailer-frame')).toHaveAttribute(
      'src',
      /cloudflarestream\.com\//
    );
  });

  test('mobile preview renders the mobile shell without desktop column layout', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PREVIEW_URL}?surface=mobile`);

    await expect(page.getByTestId('portal-shell-root')).toBeVisible();
    await expect(page.getByTestId('home-actions-region')).toBeVisible();
    await expect(page.getByTestId('home-lineup-region')).toBeVisible();
    await expect(page.getByTestId('cta-place-seats')).toBeVisible();
    await expect(page.getByTestId('mobile-lineup-card')).toHaveCount(4);
    await expect(page.getByTestId('mobile-lineup-score').first()).toContainText(/95%/i);
    await expect(page.getByTestId('mobile-lineup-card').first()).not.toContainText(/★/);

    const actionsBox = await page.getByTestId('home-actions-region').boundingBox();
    const lineupBox = await page.getByTestId('home-lineup-region').boundingBox();
    expect(lineupBox?.y || 0).toBeGreaterThan((actionsBox?.y || 0) + (actionsBox?.height || 0));
  });

  test('dinner picker reveals a done button after all just-placed dinners are selected', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto(`${PREVIEW_URL}?surface=desktop`);

    await page.getByTestId('cta-place-seats').click();
    await page.getByTestId('seat-pick-sheet').waitFor();
    await page.locator('[data-seat="A-1"]').click();
    await page.getByTestId('seat-pick-commit').click();

    await page.getByTestId('post-pick-pick-meals').click({ force: true });
    await expect(page.getByLabel('Dinner for seat A-1')).toBeVisible();
    await expect(page.getByTestId('dinner-done')).toHaveCount(0);

    await page.getByLabel('Dinner for seat A-1').selectOption('frenchdip');
    await expect(page.getByTestId('dinner-done')).toBeVisible();
  });
});
