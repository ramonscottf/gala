#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { QA_BASE_URL, QA_TOKEN, sponsorUrl } from './lib/config.js';

const outDir = path.resolve('output/lighthouse');
await fs.mkdir(outDir, { recursive: true });

const url = process.env.QA_PERF_URL || sponsorUrl(QA_TOKEN);
const threshold = Number(process.env.QA_LIGHTHOUSE_MIN_PERF || 0);
const chrome = await launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});

try {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: ['json', 'html'],
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      disabled: false,
    },
    throttlingMethod: 'simulate',
  });

  const [json, html] = result.report;
  const slug = new URL(url, QA_BASE_URL).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
  await fs.writeFile(path.join(outDir, `${slug}.json`), json);
  await fs.writeFile(path.join(outDir, `${slug}.html`), html);

  const scores = Object.fromEntries(
    Object.entries(result.lhr.categories).map(([key, category]) => [
      key,
      Math.round((category.score || 0) * 100),
    ])
  );
  console.log(JSON.stringify({ url, scores, reports: outDir }, null, 2));

  if (threshold && scores.performance < threshold) {
    console.error(`Performance score ${scores.performance} is below QA_LIGHTHOUSE_MIN_PERF=${threshold}`);
    process.exit(1);
  }
} finally {
  await chrome.kill();
}

