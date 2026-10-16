import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const baseline = process.argv.includes('--baseline');
const phase = baseline ? 'before' : 'after';
const output = 'output/playwright';
const server = await createServer({
  logLevel: 'silent', cacheDir: 'node_modules/.vite-mobile-composer',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }
});

async function measure(page, name) {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const animations = document.getAnimations().filter((animation) =>
      Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
  });
  const result = await page.evaluate(() => {
    const pick = (selector) => {
      const el = document.querySelector(selector);
      if (!el || !el.getClientRects().length) return null;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const center = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return {
        x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom,
        hit: center === el || el.contains(center), display: style.display, position: style.position,
        rows: style.gridTemplateRows, columns: style.gridTemplateColumns,
        gridRow: style.gridRow, alignSelf: style.alignSelf, minHeight: style.minHeight, maxHeight: style.maxHeight,
        whiteSpace: style.whiteSpace
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      classes: document.querySelector('.bottomComposerBar')?.className,
      composer: pick('.bottomComposerBar'), head: pick('.composerPanelHead'),
      row: pick('.composerPromptRow'), input: pick('.bottomComposerInput'), textarea: pick('.bottomComposerInput textarea'),
      actions: pick('.composerActionGroup'), generate: pick('.composerGenerateAction'), optimize: pick('.composerAssistantAction'),
      params: pick('.composerParamShelf'), thread: pick('.composerThread'),
      singleInput: pick('.singlePromptBox textarea'), singleGenerate: pick('.singleGenerateButton')
    };
  });
  await page.screenshot({ path: `${output}/canvas-composer-${phase}-${name}.png` });
  await writeFile(`${output}/canvas-composer-${phase}-${name}.json`, JSON.stringify(result, null, 2));
  return { name, ...result };
}

function checkLayout(result, { folded = false } = {}) {
  const inside = (parent, child) => child && child.x >= parent.x - 1 && child.y >= parent.y - 1
    && child.right <= parent.right + 1 && child.bottom <= parent.bottom + 1;
  const overlap = (a, b) => a && b && Math.min(a.right, b.right) > Math.max(a.x, b.x) + 1
    && Math.min(a.bottom, b.bottom) > Math.max(a.y, b.y) + 1;
  const evidence = JSON.stringify(result, null, 2);
  assert(result.composer.height <= (folded ? 140 : result.viewport.height * 0.8), `Composer should leave canvas space. ${evidence}`);
  for (const part of ['textarea', 'generate', 'optimize']) {
    assert(inside(result.composer, result[part]), `${part} must stay inside composer. ${evidence}`);
    assert(result[part].hit, `${part} must be reachable, not covered. ${evidence}`);
    assert(!overlap(result.params, result[part]), `Parameter shelf must not overlap ${part}. ${evidence}`);
  }
  assert(!overlap(result.generate, result.optimize), `Actions must not overlap. ${evidence}`);
  assert(result.generate.height >= 40 && result.optimize.height >= 40, `Actions need usable touch targets. ${evidence}`);
  assert.equal(result.textarea.whiteSpace, 'pre-wrap', 'Mobile prompt should wrap in expanded and folded states.');
  if (!folded) {
    assert(result.textarea.height >= 96, `Prompt must have useful editing space. ${evidence}`);
    assert(result.textarea.height >= result.row.height - 16, `Prompt must fill its row. ${evidence}`);
    const contentTop = result.thread?.bottom || result.head.bottom;
    assert(result.row.y - contentTop <= 20, `No blank region above prompt. ${evidence}`);
  }
  assert(result.composer.bottom <= result.viewport.height + 1 && result.composer.y >= 0, `Composer must fit viewport. ${evidence}`);
}

let browser;
try {
  await mkdir(output, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const hasThread of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(({ hasThread }) => {
      const key = 'image-sub2api-studio:current-session:v1';
      const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#37766a"/></svg>')}`;
      const session = {
        sessionId: 'mobile-composer-fixture', mode: 'image', status: 'idle',
        prompt: 'Refine the product with softer lighting and a clean background.', model: 'gpt-image-2',
        selectedCanvasNodeId: 'composer-node', canvasView: { x: 0, y: 0, zoom: 1 }, generationQueue: [],
        canvasNodes: [{ id: 'composer-node', canvasIndex: 1, kind: 'image', url: image, prompt: 'Product', x: 180, y: 120, width: 340, height: 280 }],
        assistantMessages: hasThread ? [
          { id: 'user', role: 'user', content: 'Keep the composition and soften the shadows.' },
          { id: 'assistant', role: 'assistant', content: 'Use a broad softbox and a neutral background.' }
        ] : []
      };
      localStorage.setItem(key, JSON.stringify(session));
      localStorage.setItem(`${key}:${session.sessionId}`, JSON.stringify(session));
      localStorage.setItem('image-sub2api-studio:workbench-layout:v7', JSON.stringify({
        prompt: false, references: true, parameters: true, parametersRail: false,
        bottomComposer: true, composerParameters: false, composerFolded: false, flowMode: 'canvas'
      }));
    }, { hasThread });
    await page.goto(new URL('studio.html', server.resolvedUrls.local[0]).href, { waitUntil: 'networkidle' });
    await page.locator('.workflowModeSwitch button').nth(1).click();
    await page.locator('.workflowViewSwitch').getByRole('button', { name: '画布', exact: true }).click();
    await page.locator('.creationDesk.canvasFlowMode.composerOpen').waitFor();
    results.push(await measure(page, `desktop-${hasThread ? 'thread' : 'empty'}`));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '收起参考图', exact: true }).click();
    const prefix = hasThread ? 'thread' : 'empty';
    const record = async (name, options) => {
      const result = await measure(page, `${prefix}-${name}`);
      results.push(result);
      if (!baseline) checkLayout(result, options);
    };
    await record('390');
    await page.locator('.composerParamSummary').click();
    await record('parameters');
    await page.locator('.composerParamFoldButton').click();
    if (hasThread) {
      await page.locator('.composerHistoryToggle').click();
      await record('history');
      await page.locator('.composerHistoryToggle').click();
    }
    await page.locator('.composerFoldTogglePill').click();
    await record('folded', { folded: true });
    await page.locator('.composerFoldTogglePill').click();
    await record('restored');
    await page.locator('.composerClosePill').click();
    await page.locator('.bottomComposerBar.isFolded').waitFor();
    await page.locator('.composerFoldTogglePill').click();
    await record('reopened');
    await page.setViewportSize({ width: 320, height: 740 });
    await record('320');
    await page.locator('.workflowModeSwitch button').first().click();
    await page.locator('.singleGenerationWorkspace').waitFor();
    assert.equal(await page.locator('.singlePromptBox textarea').inputValue(),
      'Refine the product with softer lighting and a clean background.');
    assert.equal(await page.locator('.bottomComposerBar').count(), 0, 'Canvas composer must unmount in single mode.');
    assert.equal(await page.locator('.singleActionBar button').count(), 2);
    for (const button of await page.locator('.singleActionBar button').all()) {
      await button.scrollIntoViewIfNeeded();
      const action = await button.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height,
          hit: el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
      });
      assert(action.width > 0 && action.height > 0 && action.hit,
        `Single-mode actions must remain reachable. ${JSON.stringify(action)}`);
    }
    results.push(await measure(page, `single-${prefix}`));
    assert.deepEqual(errors, []);
    await page.close();
  }
  await writeFile(`${output}/canvas-composer-${phase}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ok: true, phase, results: results.map(({ name, composer, textarea, generate, optimize }) => ({
    name, height: composer?.height, inputHeight: textarea?.height,
    actionHeights: [generate?.height, optimize?.height], reachable: generate?.hit && optimize?.hit
  })) }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
