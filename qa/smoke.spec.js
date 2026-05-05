import { test, expect } from '@playwright/test';
import { ensureFreshState, ensurePlacedState, cleanupToken } from './lib/portal-api.js';
import { gotoSponsor, openSeatPicker, expectSeatMapReady } from './lib/ui.js';

test.describe.configure({ mode: 'serial' });

for (const state of ['fresh', 'placed']) {
  test(`${state} sponsor portal loads and exposes seat picking`, async ({ page }, testInfo) => {
    if (state === 'fresh') await ensureFreshState();
    else await ensurePlacedState();

    await gotoSponsor(page);
    await expect(page.locator('body')).toContainText(/Kara Toone|DEF Staff/i);

    if (state === 'fresh') {
      await expect(page.locator('body')).toContainText(/2 seats still to place|Place your 2 seats|2 remaining/i);
    } else {
      await expect(page.locator('body')).toContainText(/2\s*\/\s*2|2 placed|All 2 seats|B\d+/i);
    }

    await openSeatPicker(page, testInfo);
    await expectSeatMapReady(page);
  });
}

test.afterAll(async () => {
  await cleanupToken();
});
