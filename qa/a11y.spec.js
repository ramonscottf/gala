import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensureFreshState, ensurePlacedState, cleanupToken } from './lib/portal-api.js';
import { gotoSponsor, openSeatPicker, expectSeatMapReady } from './lib/ui.js';

test.describe.configure({ mode: 'serial' });

function formatViolations(violations) {
  return violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 3)
        .map((node) => `    - ${node.target.join(' ')}: ${node.failureSummary || 'no summary'}`)
        .join('\n');
      return `[${v.impact}] ${v.id}: ${v.help}\n${nodes}`;
    })
    .join('\n\n');
}

const checks = [
  { state: 'fresh', surface: 'home' },
  { state: 'fresh', surface: 'seat-picker' },
  { state: 'placed', surface: 'home' },
  { state: 'placed', surface: 'seat-picker' },
];

for (const check of checks) {
  test(`${check.state} ${check.surface} has no serious axe violations`, async ({ page }, testInfo) => {
    if (check.state === 'fresh') await ensureFreshState();
    else await ensurePlacedState();

    await gotoSponsor(page);
    if (check.surface === 'seat-picker') {
      await openSeatPicker(page, testInfo);
      await expectSeatMapReady(page);
    }

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const violations = results.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
    expect(violations, formatViolations(violations)).toEqual([]);
  });
}

test.afterAll(async () => {
  await cleanupToken();
});

