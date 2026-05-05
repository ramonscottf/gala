import { expect } from '@playwright/test';
import { preparePage, QA_TOKEN } from './config.js';

export async function gotoSponsor(page, suffix = '') {
  await preparePage(page);
  await page.goto(`/sponsor/${QA_TOKEN}${suffix}`, { waitUntil: 'networkidle' });
  await expect(page.locator('body')).not.toContainText(/couldn't load your portal/i);
}

export async function openSeatPicker(page, testInfo) {
  const isMobile = testInfo.project.name.startsWith('mobile');
  const buttonNames = isMobile
    ? [/^Place$/, /Place \d+ more seats/i, /Edit/i, /Manage/i]
    : [/^Begin\b/i, /Place seats/i, /Edit seats/i, /Select seats/i, /Review seats/i];

  for (const name of buttonNames) {
    const button = page.getByRole('button', { name }).first();
    if ((await button.isVisible().catch(() => false)) && (await button.isEnabled().catch(() => false))) {
      await button.click();
      await page.locator('[data-seat]').first().waitFor({ timeout: 5_000 }).catch(() => {});
      if ((await page.locator('[data-seat]').count()) > 0) return;
    }
  }

  await page.goto(`/sponsor/${QA_TOKEN}/seats`, { waitUntil: 'networkidle' });
  const start = page.getByRole('button', { name: /place your seats/i }).first();
  if ((await start.isVisible().catch(() => false)) && (await start.isEnabled().catch(() => false))) {
    await start.click();
  }
  await expect(page.locator('[data-seat]').first()).toBeVisible();
}

export async function expectSeatMapReady(page) {
  await expect(page.locator('[data-seat]').first()).toBeVisible();
  const count = await page.locator('[data-seat]').count();
  expect(count).toBeGreaterThan(20);
}
