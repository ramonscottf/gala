import { test } from 'node:test';
import assert from 'node:assert/strict';

let importCounter = 0;
async function importFresh() {
  importCounter += 1;
  const url = new URL(`./config.js?t=${Date.now()}-${importCounter}`, import.meta.url);
  return import(url);
}

test('throws when QA_TOKEN is missing and QA_BASE_URL points at prod', async () => {
  delete process.env.QA_TOKEN;
  process.env.QA_BASE_URL = 'https://gala.daviskids.org';
  await assert.rejects(importFresh(), /QA_TOKEN/);
});

test('does not throw when QA_BASE_URL points at localhost (no token)', async () => {
  delete process.env.QA_TOKEN;
  process.env.QA_BASE_URL = 'http://localhost:8788';
  const mod = await importFresh();
  assert.equal(mod.QA_TOKEN, '');
});

test('uses the provided QA_TOKEN when set', async () => {
  process.env.QA_TOKEN = 'abc123';
  process.env.QA_BASE_URL = 'https://gala.daviskids.org';
  const mod = await importFresh();
  assert.equal(mod.QA_TOKEN, 'abc123');
});
