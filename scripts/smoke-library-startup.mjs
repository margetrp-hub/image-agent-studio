import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const baseline = process.argv.includes('--baseline');
const entries = Array.from({ length: 2400 }, (_, i) => ({
  id: i + 1,
  title: `Library sample ${i + 1}`,
  category: 'Products & e-commerce',
  promptPreview: 'A product photograph',
  prompt: i === 2399 ? 'A ceramic teapot with cobalt glaze and bamboo handle.' : 'A detailed product photograph in a daylight studio.',
  imageUnavailable: true
}));
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const requests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/studio-api/library', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ json: { cases: entries } });
  });
  await page.goto(new URL('studio.html', server.resolvedUrls.local[0]).href);
  await page.locator('[data-workspace="inspiration"]').first().waitFor();
  await page.waitForTimeout(500);
  const startupRequests = requests.length;
  await page.locator('[data-workspace="inspiration"]').first().click();
  await page.locator('.gallerySearch input').waitFor();
  await page.waitForFunction(() => document.body.innerText.includes('Library sample'));
  const search = page.locator('.gallerySearch input');
  const started = performance.now();
  await search.fill('cobalt bamboo');
  await page.waitForTimeout(250);
  const fullPromptFound = await page.getByText('Library sample 2400', { exact: true }).count() > 0;
  const searchMs = Math.round(performance.now() - started);
  await search.fill('');
  await page.locator('[data-workspace="image"]').first().click();
  await page.locator('[data-workspace="inspiration"]').first().click();
  await page.locator('.gallerySearch input').waitFor();
  await page.waitForTimeout(200);
  const result = { startupRequests, totalLibraryRequests: requests.length, entries: entries.length, fullPromptFound, searchMs, errors };
  await fs.mkdir('output/playwright', { recursive: true });
  await fs.writeFile(`output/playwright/library-startup-${baseline ? 'before' : 'after'}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!baseline) {
    assert.equal(startupRequests, 0, 'Workstation must not eagerly download the library.');
    assert.equal(requests.length, 1, 'Returning to the library must reuse the loaded catalog.');
    assert.ok(fullPromptFound, 'Search must match multiple terms in the complete prompt.');
    assert.deepEqual(errors, []);
  }
} finally {
  await browser?.close();
  await server.close();
}
