import { test, expect } from '@playwright/test';

test.describe('event preview landing page', () => {
  test('publishes the email-ready event preview with tier dates and Stream trailers', async ({ page }) => {
    await page.goto('/event/');

    await expect(page).toHaveTitle(/DEF Gala 2026 Movie Preview/i);
    await expect(page.getByRole('heading', { name: /Your Gala movie preview is here/i })).toBeVisible();
    await expect(page.getByText(/Wednesday, June 10, 2026/i).first()).toBeVisible();
    await expect(page.getByText(/Megaplex Theatres at Legacy Crossing/i).first()).toBeVisible();
    await expect(page.getByText(/4:30 PM/i).first()).toBeVisible();
    await expect(page.getByText(/7:15 PM/i).first()).toBeVisible();

    for (const [tier, date] of [
      ['Platinum', 'May 11'],
      ['Gold', 'May 14'],
      ['Silver', 'May 18'],
      ['Bronze', 'May 20'],
      ['Friends & Family', 'May 25'],
      ['Individual Seats', 'May 28'],
    ]) {
      const tierCard = page.getByTestId(`tier-${tier.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
      await expect(tierCard).toContainText(tier);
      await expect(tierCard).toContainText(date);
    }

    for (const title of [
      'How to Train Your Dragon',
      'Paddington 2',
      'Star Wars: The Mandalorian and Grogu',
      'The Breadwinner',
    ]) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }

    await expect(page.getByText(/99% · Audience 91%/i)).toBeVisible();
    await expect(page.getByText(/95% · Audience 88%/i)).toBeVisible();
    await expect(page.getByText(/Pending/i)).toBeVisible();

    await expect(page.locator('iframe[src*="cloudflarestream.com"]')).toHaveCount(4);
    await expect(page.locator('a[href*="youtube"], iframe[src*="youtube"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Request your private selection link/i }).first()).toHaveAttribute(
      'href',
      '/'
    );
  });

  test('keeps the movie lineup polished on mobile', async ({ page }) => {
    await page.goto('/event/');

    const movieCards = page.getByTestId('preview-movie-card');
    await expect(movieCards).toHaveCount(4);

    const posterRatios = await page.getByTestId('preview-poster').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width / rect.height;
      })
    );

    posterRatios.forEach((ratio) => {
      expect(ratio).toBeGreaterThan(0.62);
      expect(ratio).toBeLessThan(0.72);
    });
  });
});
