import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const baseline = process.argv.includes('--baseline');
const key = 'image-sub2api-studio:current-session:v1';
const sessionId = 'performance-autosave-smoke';
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.addInitScript(({ key, sessionId }) => {
    if (!localStorage.getItem(`${key}:${sessionId}`)) {
      const session = { sessionId, mode: 'image', prompt: 'Autosave performance', model: 'gpt-image-2',
        canvasView: { x: 0, y: 0, zoom: 1 }, canvasNodes: [], canvasCustomLinks: [], generationQueue: [], assistantMessages: [] };
      localStorage.setItem(key, JSON.stringify(session));
      localStorage.setItem(`${key}:${sessionId}`, JSON.stringify(session));
    }
    window.__sessionWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === `${key}:${sessionId}`) window.__sessionWrites++;
      return original.call(this, name, value);
    };
  }, { key, sessionId });
  await page.goto(new URL('studio.html', server.resolvedUrls.local[0]).href, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /无限画布/ }).click();
  await page.locator('.workflowViewSwitch').getByRole('button', { name: '画布', exact: true }).click();
  await page.waitForTimeout(500);
  const canvas = page.locator('.infiniteCanvas');
  const bounds = await canvas.boundingBox();
  const before = await page.evaluate(() => { window.__sessionWrites = 0; return document.querySelector('.canvasPlane')?.style.transform; });
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 140);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 230, bounds.y + 240, { steps: 48 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => ({ writes: window.__sessionWrites, transform: document.querySelector('.canvasPlane')?.style.transform }));
  const persisted = await page.evaluate(({ key, sessionId }) => JSON.parse(localStorage.getItem(`${key}:${sessionId}`)), { key, sessionId });
  assert.notEqual(after.transform, before, 'Pan must change the camera.');
  assert.ok(persisted.canvasView.x !== 0, 'Pan must persist after settling.');
  const textarea = page.locator('textarea').filter({ visible: true }).first();
  await textarea.fill('Latest draft saved before refresh');
  await page.reload({ waitUntil: 'networkidle' });
  const reloaded = await page.evaluate(({ key, sessionId }) => JSON.parse(localStorage.getItem(`${key}:${sessionId}`)), { key, sessionId });
  assert.equal(reloaded.prompt, 'Latest draft saved before refresh');
  assert.equal(reloaded.canvasView.x, persisted.canvasView.x);
  if (!baseline) assert.ok(after.writes <= 8, `48 pan steps produced ${after.writes} full session writes.`);
  const result = { panSteps: 48, sessionWrites: after.writes, panRestored: true, immediateRefreshRestoredPrompt: true };
  await fs.mkdir('output/playwright', { recursive: true });
  await fs.writeFile(`output/playwright/workspace-autosave-${baseline ? 'before' : 'after'}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await server.close();
}
