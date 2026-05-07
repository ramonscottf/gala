import { test, expect } from '@playwright/test';
import { preparePage } from './lib/config.js';

const PREVIEW_URL = 'http://localhost:5173/sponsor/qa/preview/sponsor-shell.html';

test.describe('sponsor shell preview', () => {
  test('desktop preview renders a desktop main panel, right-rail lineup, and wide seat picker', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto(`${PREVIEW_URL}?surface=desktop`);

    await expect(page.getByTestId('desktop-parity-shell')).toBeVisible();
    await expect(page.getByTestId('desktop-main-panel')).toBeVisible();
    await expect(page.getByTestId('desktop-live-mobile-shell')).toHaveCount(0);
    await expect(page.getByTestId('desktop-companion-notes')).toBeVisible();
    await expect(page.getByTestId('desktop-companion-notes')).toContainText(/Same flow as mobile/i);
    await expect(page.getByTestId('cta-place-seats').first()).toBeVisible();

    await expect(page.getByTestId('desktop-lineup-rail')).toBeVisible();
    await expect(page.getByTestId('desktop-lineup-card')).toHaveCount(4);
    await expect(page.getByTestId('desktop-placed-ticket-card')).toHaveCount(2);
    await expect(page.getByTestId('desktop-placed-seat-placeholder')).toHaveCount(0);
    await expect(page.getByTestId('desktop-guests-stat')).toContainText(/Guests invited/i);

    await page.getByTestId('cta-place-seats').first().click();
    const picker = page.getByTestId('seat-pick-sheet');
    await expect(picker).toBeVisible();
    const box = await picker.boundingBox();
    expect(box?.width).toBeGreaterThan(680);
  });

  test('desktop preview opens mobile tab information in desktop popups', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto(`${PREVIEW_URL}?surface=desktop`);

    await page.getByTestId('desktop-open-guests').click();
    await expect(page.getByRole('dialog', { name: 'Guests invited' })).toBeVisible();
    await expect(page.getByTestId('desktop-tab-modal')).toContainText(/Your assignments/i);
    await expect(page.getByTestId('desktop-tab-modal')).toContainText(/pending/i);
    await expect(page.getByTestId('desktop-tab-modal')).toContainText(/Megan Foster/i);
    await expect(page.getByTestId('desktop-tab-modal')).toContainText(/G4/i);
    await expect(page.getByTestId('desktop-tab-modal')).toContainText(/Preview Guest/i);

    await page.getByLabel('Close dialog').click();
    await page.getByTestId('desktop-open-tickets').click();
    await expect(page.getByRole('dialog', { name: 'All tickets' })).toBeVisible();
    await expect(page.getByTestId('desktop-tab-modal')).toContainText(/All 10 seats/i);
    await expect(page.getByTestId('ticket-qr-card')).toBeVisible();
    await expect(page.getByTestId('ticket-card')).toHaveCount(2);
    await expect(page.getByTestId('ticket-card-details').first()).toHaveCount(0);
    await page.getByTestId('ticket-card-toggle').first().click();
    await expect(page.getByTestId('ticket-card-details').first()).toBeVisible();
    await expect(page.getByTestId('ticket-card-details').first()).toContainText(/Seat holder: Scott Foster/i);
    await expect(page.getByTestId('ticket-card-details').first()).toContainText(/Guest: Megan Foster/i);
    await expect(page.getByTestId('guest-ticket-card')).toHaveCount(1);
    await expect(page.getByTestId('guest-ticket-card').first()).toContainText(/Megan Foster guest seats/i);
    await expect(page.getByTestId('guest-ticket-card').first().getByRole('button', { name: 'View' })).toBeVisible();
    await page.getByTestId('guest-ticket-card').first().getByTestId('ticket-card-toggle').click();
    await expect(page.getByTestId('guest-ticket-card').first()).toContainText(/Guest: Megan Foster/i);
    await expect(page.getByTestId('guest-ticket-card').first()).toContainText(/G4/i);
    await expect(page.getByTestId('guest-ticket-card').first()).toContainText(/Cold turkey sandwich|not selected yet/i);

    await page.getByLabel('Close dialog').click();
    await page.getByTestId('desktop-open-night').click();
    await expect(page.getByRole('dialog', { name: 'Tonight details' })).toBeVisible();
    await expect(page.getByTestId('desktop-tab-modal')).toContainText(/What to expect/i);
  });

  test('desktop movie detail is a popup and keeps the title clear of the poster', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto(`${PREVIEW_URL}?surface=desktop`);

    await page.getByTestId('desktop-lineup-card').first().click();
    await expect(page.getByTestId('movie-detail-sheet')).toBeVisible();
    const sheetBox = await page.getByTestId('movie-detail-sheet').boundingBox();
    expect(sheetBox?.width).toBeLessThan(760);

    const posterBox = await page.getByTestId('movie-detail-poster').boundingBox();
    const titleBox = await page.getByTestId('movie-detail-title').boundingBox();
    expect(titleBox?.x).toBeGreaterThan((posterBox?.x || 0) + (posterBox?.width || 0));
  });

  test('mobile preview renders the mobile shell without desktop companion chrome', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PREVIEW_URL}?surface=mobile`);

    await expect(page.getByTestId('mobile-shell-root')).toBeVisible();
    await expect(page.getByTestId('desktop-companion-notes')).toHaveCount(0);
    await expect(page.getByTestId('cta-place-seats').first()).toBeVisible();
  });

  test('dinner picker reveals a done button after all just-placed dinners are selected', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto(`${PREVIEW_URL}?surface=desktop`);

    await page.getByTestId('cta-place-seats').first().click();
    await page.getByTestId('seat-pick-sheet').waitFor();
    await page.locator('[data-seat="A-1"]').click();
    await page.getByTestId('seat-pick-commit').click();

    await page.getByRole('button', { name: /Pick dinners/i }).click();
    await expect(page.getByLabel('Dinner for seat A-1')).toBeVisible();
    await expect(page.getByTestId('dinner-done')).toHaveCount(0);

    await page.getByLabel('Dinner for seat A-1').selectOption('brisket');
    await expect(page.getByTestId('dinner-done')).toBeVisible();
  });
});
