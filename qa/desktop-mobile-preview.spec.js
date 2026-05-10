import { test, expect } from '@playwright/test';
import { preparePage } from './lib/config.js';

const PREVIEW_BASE_URL = (process.env.QA_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const PREVIEW_URL = `${PREVIEW_BASE_URL}/sponsor/qa/preview/sponsor-shell.html`;

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
    await expect(page.getByTestId('desktop-lineup-card').first()).toContainText(/RT 95%/i);
    await expect(page.getByTestId('desktop-lineup-poster')).toHaveCount(4);
    const desktopPosterBox = await page.getByTestId('desktop-lineup-poster').first().boundingBox();
    const desktopPosterRatio = (desktopPosterBox?.width || 1) / (desktopPosterBox?.height || 1);
    expect(desktopPosterRatio).toBeGreaterThan(0.62);
    expect(desktopPosterRatio).toBeLessThan(0.72);
    await expect(page.getByTestId('desktop-placed-ticket-card')).toHaveCount(2);
    await expect(page.getByTestId('desktop-placed-seat-placeholder')).toHaveCount(0);
    await expect(page.getByTestId('desktop-guests-stat')).toContainText(/Guests invited/i);

    await page.getByTestId('cta-place-seats').first().click();
    const picker = page.getByTestId('seat-pick-sheet');
    await expect(picker).toBeVisible();
    const box = await picker.boundingBox();
    expect(box?.width).toBeGreaterThan(680);
    await expect(picker.getByRole('button', { name: /4:30 PM/i })).toBeVisible();
    await expect(picker.getByRole('button', { name: /7:15 PM/i })).toBeVisible();
    await expect(page.getByTestId('seat-type-guide')).toContainText(/Luxury Recliner/i);
    await expect(page.getByTestId('seat-type-guide')).toContainText(/Standard/i);
    await expect(page.getByTestId('seat-type-guide')).toContainText(/D-BOX/i);
    await expect(page.getByTestId('seat-type-button')).toHaveCount(3);
    const dboxGuide = page.getByTestId('seat-type-button').filter({ hasText: /D-BOX/i });
    await dboxGuide.click();
    await expect(dboxGuide).toHaveAttribute('aria-pressed', 'true');
    await expect(picker).toHaveAttribute('data-highlighted-seat-type', 'dbox');
    await page.locator('[data-seat="E-1"]').click();
    await expect(page.getByTestId('selected-seat-preview')).toContainText(/E1/i);
    await expect(page.getByTestId('selected-seat-preview')).toContainText(/Standard/i);
  });

  test('desktop preview opens mobile tab information in desktop popups', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto(`${PREVIEW_URL}?surface=desktop`);

    await page.getByTestId('desktop-open-guests').click();
    await expect(page.getByRole('dialog', { name: 'Guests invited' })).toBeVisible();
    await expect(page.getByTestId('desktop-tab-modal')).toContainText(/Your guests/i);
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
    await expect(page.getByLabel(/Dinner for seat C-5/i)).toBeVisible();
    await expect(page.getByLabel(/Dinner for seat C-6/i)).toBeVisible();

    await page.getByLabel('Close dialog').click();
    await page.getByTestId('desktop-center-ticket').first().click();
    await expect(page.getByRole('dialog', { name: 'All tickets' })).toBeVisible();
    await expect(page.getByTestId('ticket-card')).toHaveCount(2);

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
    await expect(page.getByTestId('movie-detail-sheet')).toContainText(/RT 95%/i);
    await expect(page.getByTestId('movie-detail-sheet').locator('a[href*="youtube"]')).toHaveCount(0);
    const sheetBox = await page.getByTestId('movie-detail-sheet').boundingBox();
    expect(sheetBox?.width).toBeLessThan(760);
    expect(sheetBox?.height).toBeLessThan(680);

    const posterBox = await page.getByTestId('movie-detail-poster').boundingBox();
    await expect(page.getByTestId('movie-detail-poster-img')).toBeVisible();
    await expect(page.getByTestId('movie-detail-poster-img')).toHaveCSS('object-fit', 'contain');
    const titleBox = await page.getByTestId('movie-detail-title').boundingBox();
    expect(titleBox?.x).toBeGreaterThan((posterBox?.x || 0) + (posterBox?.width || 0));

    await page.getByRole('button', { name: /watch trailer/i }).click();
    const trailer = page.getByTestId('movie-trailer-frame');
    await expect(trailer).toBeVisible();
    await expect(trailer).toHaveAttribute('src', /cloudflarestream\.com\/preview-breadwinner-stream/);
    const trailerBox = await page.getByTestId('movie-trailer-player').boundingBox();
    const trailerRatio = (trailerBox?.width || 1) / (trailerBox?.height || 1);
    expect(trailerRatio).toBeGreaterThan(1.65);
    expect(trailerRatio).toBeLessThan(1.9);
  });

  test('seat picker movie info keeps the trailer in the in-app Stream player', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto(`${PREVIEW_URL}?surface=desktop`);

    await page.getByTestId('cta-place-seats').first().click();
    await expect(page.getByTestId('seat-pick-sheet')).toBeVisible();
    await page.getByText(/More about this movie/i).click();

    await expect(page.getByTestId('movie-detail-sheet')).toBeVisible();
    await expect(page.getByTestId('movie-detail-sheet').locator('a[href*="youtube"]')).toHaveCount(0);
    await page.getByRole('button', { name: /watch trailer/i }).click();
    await expect(page.getByTestId('movie-trailer-frame')).toHaveAttribute(
      'src',
      /cloudflarestream\.com\//
    );
    const trailerBox = await page.getByTestId('movie-trailer-player').boundingBox();
    const trailerRatio = (trailerBox?.width || 1) / (trailerBox?.height || 1);
    expect(trailerRatio).toBeGreaterThan(1.65);
    expect(trailerRatio).toBeLessThan(1.9);
  });

  test('mobile preview renders the mobile shell without desktop companion chrome', async ({ page }) => {
    await preparePage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PREVIEW_URL}?surface=mobile`);

    await expect(page.getByTestId('portal-shell-root')).toBeVisible();
    await expect(page.getByTestId('desktop-companion-notes')).toHaveCount(0);
    await expect(page.getByTestId('cta-place-seats').first()).toBeVisible();
    await expect(page.getByTestId('mobile-lineup-card')).toHaveCount(4);
    await expect(page.getByTestId('mobile-lineup-score').first()).toContainText(/RT/i);
    await expect(page.getByTestId('mobile-lineup-card').first()).not.toContainText(/★/);

    const mobilePosters = await page.getByTestId('mobile-lineup-poster').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
    );
    expect(mobilePosters).toHaveLength(4);
    mobilePosters.forEach((poster) => {
      const ratio = poster.width / poster.height;
      expect(ratio).toBeGreaterThan(0.62);
      expect(ratio).toBeLessThan(0.72);
    });
    expect(Math.abs(mobilePosters[0].y - mobilePosters[1].y)).toBeLessThan(2);
    expect(Math.abs(mobilePosters[2].y - mobilePosters[3].y)).toBeLessThan(2);
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
