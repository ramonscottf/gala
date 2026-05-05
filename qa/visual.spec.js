import { test, expect } from '@playwright/test';
import { ensureFreshState, ensurePlacedState, cleanupToken } from './lib/portal-api.js';
import { gotoSponsor, openSeatPicker, expectSeatMapReady } from './lib/ui.js';

test.describe.configure({ mode: 'serial' });

const screens = [
  { state: 'fresh', surface: 'home' },
  { state: 'fresh', surface: 'seat-picker' },
  { state: 'placed', surface: 'home' },
  { state: 'placed', surface: 'seat-picker' },
];

for (const screen of screens) {
  test(`${screen.state} ${screen.surface} visual baseline`, async ({ page }, testInfo) => {
    if (screen.state === 'fresh') await ensureFreshState();
    else await ensurePlacedState();

    await gotoSponsor(page);
    if (screen.surface === 'seat-picker') {
      await openSeatPicker(page, testInfo);
      await expectSeatMapReady(page);
    }
    await page.screenshot({ path: `output/playwright/visual-current/${testInfo.project.name}-${screen.state}-${screen.surface}.png` });
    await expect(page).toHaveScreenshot(`${screen.state}-${screen.surface}.png`, {
      fullPage: false,
      caret: 'hide',
      animations: 'disabled',
    });
  });
}

test.afterAll(async () => {
  await cleanupToken();
});

