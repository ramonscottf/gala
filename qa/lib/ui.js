import { expect } from '@playwright/test';
import { preparePage, QA_TOKEN } from './config.js';

async function gotoPortalPath(page, path) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

    try {
      await expect(page.locator('body')).not.toContainText(/couldn't load your portal|failed to fetch/i, {
        timeout: 10_000,
      });
      await expect(page.locator('body')).toContainText(/Sponsor portal|Auditorium|Choose your seats|Welcome|Place seats|Your ticket/i, {
        timeout: 10_000,
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await page.waitForTimeout(750 * attempt);
    }
  }
  throw lastError;
}

export async function gotoSponsor(page, suffix = '') {
  await preparePage(page);
  await gotoPortalPath(page, `/sponsor/${QA_TOKEN}${suffix}`);
}

export async function openSeatPicker(page, testInfo) {
  const isMobile = testInfo.project.name.startsWith('mobile');
  const buttonNames = isMobile
    ? [/Place seats/i, /^Place$/, /Place \d+ more seats/i, /Edit/i, /Manage/i]
    : [/^Begin\b/i, /Place seats/i, /Edit seats/i, /Select seats/i, /Review seats/i];

  for (const name of buttonNames) {
    const button = page.getByRole('button', { name }).first();
    if ((await button.isVisible().catch(() => false)) && (await button.isEnabled().catch(() => false))) {
      await button.click();
      await advanceSeatPickerToMap(page);
      if ((await page.locator('[data-seat]').count()) > 0) return;
    }
  }

  await gotoPortalPath(page, `/sponsor/${QA_TOKEN}/seats`);
  const start = page.getByRole('button', { name: /place your seats/i }).first();
  if ((await start.isVisible().catch(() => false)) && (await start.isEnabled().catch(() => false))) {
    await start.click();
    await advanceSeatPickerToMap(page);
  }
  await expect(page.locator('[data-seat]').first()).toBeVisible();
}

export async function expectSeatMapReady(page) {
  await expect(page.locator('[data-seat]').first()).toBeVisible();
  const count = await page.locator('[data-seat]').count();
  expect(count).toBeGreaterThan(20);
}

async function clickFirstVisible(page, locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if ((await item.isVisible().catch(() => false)) && (await item.isEnabled().catch(() => false))) {
      await item.click();
      return true;
    }
  }
  return false;
}

async function advanceSeatPickerToMap(page) {
  for (let step = 0; step < 5; step += 1) {
    await page.locator('[data-seat]').first().waitFor({ timeout: 1_500 }).catch(() => {});
    if ((await page.locator('[data-seat]').count()) > 0) return;

    const continued = await clickFirstVisible(page, page.getByRole('button', { name: /continue/i }));
    if (continued) continue;

    const choseShowing = await clickFirstVisible(page, page.getByRole('button', { name: /\b\d{1,2}:\d{2}\s*(AM|PM)\b/i }));
    if (choseShowing) continue;
  }
}
