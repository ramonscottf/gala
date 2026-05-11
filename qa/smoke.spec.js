import { test, expect } from '@playwright/test';
import { ensureFreshState, ensurePlacedState, cleanupToken, getPortal } from './lib/portal-api.js';
import { gotoSponsor, openSeatPicker, expectSeatMapReady } from './lib/ui.js';

test.describe.configure({ mode: 'serial' });

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const state of ['fresh', 'placed']) {
  test(`${state} sponsor portal loads and exposes seat picking`, async ({ page }, testInfo) => {
    let portal = null;
    if (state === 'fresh') {
      portal = await ensureFreshState();
    } else {
      await ensurePlacedState();
      portal = await getPortal();
    }

    const identity = portal.identity || {};
    const sponsorLabel = identity.company || identity.contactName || identity.email || 'Sponsor portal';
    const placedCount = (portal.myAssignments || []).length + (portal.myHolds || []).length;

    await gotoSponsor(page);
    await expect(page.locator('body')).toContainText(new RegExp(escapeRegExp(sponsorLabel), 'i'));

    if (state === 'fresh') {
      expect(placedCount).toBe(0);
      await expect(page.getByTestId('cta-place-seats')).toBeVisible();
    } else {
      expect(placedCount).toBeGreaterThanOrEqual(2);
    }

    await openSeatPicker(page, testInfo);
    await expectSeatMapReady(page);
  });
}

test.afterAll(async () => {
  await cleanupToken();
});
