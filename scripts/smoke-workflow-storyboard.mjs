import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = new URL('../output/playwright/', import.meta.url);
const screenshotPath = new URL('workflow-storyboard.png', screenshotDir);
const mobileScreenshotPath = new URL('workflow-storyboard-mobile.png', screenshotDir);

function assert(condition, message, evidence) {
  if (!condition) throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
}

function image(label, color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="${color}"/><text x="320" y="230" fill="white" font-family="Arial" font-size="72" text-anchor="middle">${label}</text></svg>`)}`;
}

await mkdir(screenshotDir, { recursive: true });

const server = await createServer({
  logLevel: 'silent',
  server: { host: '127.0.0.1', port: 0, strictPort: false }
});

let browser;
try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  assert(baseUrl, 'Vite smoke server did not expose a local URL.');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
  await page.route('**/studio-api/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, records: [], cases: [], session: null })
  }));
  await page.addInitScript(({ rootUrl, childUrl, secondUrl }) => {
    if (sessionStorage.getItem('workflow-smoke-seeded')) return;
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('workflow-smoke-seeded', '1');
    localStorage.setItem('image-sub2api-studio:workbench-layout:v7', JSON.stringify({
      prompt: false,
      references: false,
      parameters: true,
      parametersRail: false,
      bottomComposer: true,
      composerParameters: false,
      composerFolded: true,
      flowMode: 'canvas',
      workflowView: 'board'
    }));
    localStorage.setItem('image-sub2api-studio:current-session:v1', JSON.stringify({
      sessionId: 'workflow-storyboard-smoke',
      mode: 'image',
      prompt: '',
      model: 'gpt-image-2',
      status: 'idle',
      message: '',
      canvasView: { x: 0, y: 0, zoom: 1 },
      selectedCanvasNodeId: '',
      generationQueue: [],
      assistantMessages: [],
      canvasNodes: [
        { id: 'scene-1', canvasIndex: 1, kind: 'image', url: rootUrl, prompt: 'Rainy street establishing shot', title: 'Street opening', x: -460, y: -120 },
        { id: 'scene-1-close', parentId: 'scene-1', canvasIndex: 2, kind: 'image', url: childUrl, prompt: 'Continue with a close portrait', title: 'Portrait close-up', x: 0, y: -120 },
        { id: 'scene-2', canvasIndex: 3, kind: 'image', url: secondUrl, prompt: 'Interior product scene', title: 'Interior product', x: 460, y: -120 }
      ],
      canvasCustomLinks: []
    }));
  }, {
    rootUrl: image('S1', '#0f766e'),
    childUrl: image('S1.2', '#2563eb'),
    secondUrl: image('S2', '#7c3aed')
  });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.workflowStoryboard', { timeout: 10000 });
  assert(await page.locator('.workflowScene').count() === 2, 'storyboard did not group lineage into two scenes');
  assert(await page.locator('.workflowShot').count() === 3, 'storyboard did not render all shots');

  await page.locator('.workflowShotCheck').first().click();
  await page.getByRole('button', { name: '批量视频' }).click();
  await page.waitForSelector('.workflowBatchDialog', { timeout: 5000 });
  const batchDialogText = await page.locator('.workflowBatchDialog').innerText();
  assert(batchDialogText.includes('1 个关键帧'), 'batch video confirmation did not honor the selected shot', batchDialogText);
  await page.locator('.workflowBatchDialog').getByRole('button', { name: '取消' }).click();
  assert(await page.locator('.workflowBatchDialog').count() === 0, 'batch video confirmation did not close');

  await page.locator('.workflowViewSwitch').getByRole('button', { name: '画布' }).click();
  await page.waitForSelector('[data-node-id="scene-1-close"]', { timeout: 8000 });
  await page.waitForFunction(() => {
    const layout = JSON.parse(localStorage.getItem('image-sub2api-studio:workbench-layout:v7') || '{}');
    return layout.workflowView === 'canvas';
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.workflowViewSwitch', { timeout: 8000 });
  assert(await page.locator('.workflowViewSwitch button.active').innerText() === '画布', 'canvas view was not restored after reload');
  await page.waitForSelector('.canvasPlane', { timeout: 8000 });
  const restored = await page.evaluate(() => {
    const key = 'image-sub2api-studio:current-session:v1';
    const activeId = localStorage.getItem(`${key}:active`);
    const session = JSON.parse(localStorage.getItem(activeId ? `${key}:${activeId}` : key) || '{}');
    return {
      storedNodeCount: session.canvasNodes?.length || 0,
      renderedNodeCount: document.querySelectorAll('[data-node-id]').length
    };
  });
  assert(restored.storedNodeCount === 3, 'workflow nodes were not persisted after reload', restored);
  assert(restored.renderedNodeCount >= 1, 'restored canvas did not render persisted nodes', restored);
  await page.locator('.workflowViewSwitch').getByRole('button', { name: '分镜' }).click();
  await page.waitForSelector('.workflowStoryboard');
  assert(await page.locator('.workflowViewSwitch button.active').innerText() === '分镜', 'storyboard view did not become active');
  await page.screenshot({ path: screenshotPath.pathname.slice(1), fullPage: true });

  const bounds = await page.locator('.workflowStoryboard').boundingBox();
  assert(bounds && bounds.width > 600 && bounds.height > 300, 'storyboard did not occupy the work area', bounds);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: mobileScreenshotPath.pathname.slice(1), fullPage: true });
  const mobileLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    storyboardVisible: Boolean(document.querySelector('.workflowStoryboard'))
  }));
  assert(mobileLayout.storyboardVisible, 'storyboard disappeared at mobile viewport', mobileLayout);
  assert(mobileLayout.documentWidth <= mobileLayout.viewportWidth + 2, 'storyboard caused horizontal page overflow', mobileLayout);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath: screenshotPath.pathname.slice(1),
    mobileScreenshotPath: mobileScreenshotPath.pathname.slice(1),
    bounds,
    mobileLayout
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
