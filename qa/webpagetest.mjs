#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { sponsorUrl, QA_TOKEN } from './lib/config.js';

const apiKey = process.env.WPT_API_KEY;
const url = process.env.QA_WPT_URL || sponsorUrl(QA_TOKEN);
const outDir = path.resolve('output/webpagetest');
await fs.mkdir(outDir, { recursive: true });

if (!apiKey) {
  console.log(
    JSON.stringify(
      {
        skipped: true,
        reason: 'Set WPT_API_KEY to run WebPageTest. Lighthouse still runs locally via npm run qa:lighthouse.',
        url,
      },
      null,
      2
    )
  );
  process.exit(0);
}

const runUrl = new URL('https://www.webpagetest.org/runtest.php');
runUrl.searchParams.set('k', apiKey);
runUrl.searchParams.set('url', url);
runUrl.searchParams.set('f', 'json');
runUrl.searchParams.set('runs', process.env.WPT_RUNS || '3');
runUrl.searchParams.set('fvonly', '1');
runUrl.searchParams.set('mobile', '1');

const start = await fetch(runUrl);
const startBody = await start.json();
if (!start.ok || !startBody.data?.testId) {
  throw new Error(`WebPageTest start failed: ${JSON.stringify(startBody)}`);
}

const testId = startBody.data.testId;
const resultUrl = new URL('https://www.webpagetest.org/jsonResult.php');
resultUrl.searchParams.set('test', testId);

let resultBody = null;
for (let i = 0; i < 90; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  const result = await fetch(resultUrl);
  resultBody = await result.json();
  if (resultBody.statusCode === 200) break;
  console.log(`WebPageTest ${testId}: ${resultBody.statusText || 'pending'}`);
}

await fs.writeFile(path.join(outDir, `${testId}.json`), JSON.stringify(resultBody, null, 2));
if (resultBody?.statusCode !== 200) {
  throw new Error(`WebPageTest ${testId} did not complete before timeout`);
}

const median = resultBody.data?.median?.firstView;
console.log(
  JSON.stringify(
    {
      testId,
      url,
      summary: resultBody.data?.summary,
      metrics: median
        ? {
            loadTime: median.loadTime,
            fullyLoaded: median.fullyLoaded,
            speedIndex: median.SpeedIndex,
            lcp: median.chromeUserTiming?.LargestContentfulPaint,
            cls: median.chromeUserTiming?.CumulativeLayoutShift,
          }
        : null,
      report: path.join(outDir, `${testId}.json`),
    },
    null,
    2
  )
);

