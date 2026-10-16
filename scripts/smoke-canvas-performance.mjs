import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/canvas-performance.png`;
const TOTAL_NODES = 40;
const currentSessionKey = 'image-sub2api-studio:current-session:v1';

function svgDataUrl(label, color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${color}"/><text x="320" y="255" fill="white" font-family="Arial" font-size="76" text-anchor="middle">${label}</text></svg>`)}`;
}

function protectedAssetUrl(index) {
  return `/studio-api/history/perf-record-${index + 1}/assets/0.png`;
}

function canvasNodes({ protectedAssets = false } = {}) {
  return Array.from({ length: TOTAL_NODES }, (_, index) => {
    const column = index % 10;
    const row = Math.floor(index / 10);
    const url = protectedAssets ? protectedAssetUrl(index) : svgDataUrl(`#${index + 1}`, index % 2 ? '#7c5cff' : '#1f766e');
    return {
      id: `perf-node-${index + 1}`,
      parentId: index > 0 ? `perf-node-${index}` : '',
      canvasIndex: index + 1,
      kind: 'image',
      url,
      persistedUrl: protectedAssets ? url : '',
      prompt: `Performance canvas node ${index + 1}`,
      title: `Performance node ${index + 1}`,
      x: column * 520 - 240,
      y: row * 380 - 260,
      width: 340,
      height: 280,
      createdAt: new Date(Date.now() - index * 1000).toISOString(),
      downloadMeta: {
        mode: 'image',
        providerId: 'gpt-image-2',
        id: `perf-record-${index + 1}`,
        prompt: `Performance canvas node ${index + 1}`
      }
    };
  });
}

async function runCanvasPerformanceScenario({ baseUrl, protectedAssets = false }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const assetRequests = [];
  if (protectedAssets) {
    await page.route('**/studio-api/history/**/assets/0.png', async (route) => {
      assetRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#1f766e"/><text x="320" y="255" fill="white" font-family="Arial" font-size="76" text-anchor="middle">asset</text></svg>`
      });
    });
  }

  try {
    await page.addInitScript(({ nodes, protectedAssets: hasProtectedAssets, currentSessionKey: storageKey }) => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      const session = {
        sessionId: hasProtectedAssets ? 'canvas-performance-protected-smoke' : 'canvas-performance-smoke',
        mode: 'image',
        prompt: 'Large canvas performance smoke',
        model: 'gpt-image-2',
        status: 'idle',
        message: '',
        canvasView: { x: 0, y: 0, zoom: 1 },
        selectedCanvasNodeId: 'perf-node-1',
        canvasNodes: nodes,
        canvasCustomLinks: [],
        generationQueue: [],
        assistantMessages: []
      };
      localStorage.setItem(storageKey, JSON.stringify(session));
      localStorage.setItem(`${storageKey}:${session.sessionId}`, JSON.stringify(session));
    }, { nodes: canvasNodes({ protectedAssets }), protectedAssets, currentSessionKey });

    await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /无限画布/ }).click();
    await page.locator('.workflowViewSwitch').getByRole('button', { name: '画布' }).click();
    await page.waitForSelector('.workPreview.performanceMode', { timeout: 8000 });
    await page.waitForTimeout(800);
    if (!protectedAssets) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    const result = await page.evaluate((totalNodes) => {
      const allNodes = [...document.querySelectorAll('.graphNode')];
      const virtualizedNodes = allNodes.filter((node) => node.classList.contains('virtualized'));
      const realImages = document.querySelectorAll('.graphNode:not(.virtualized) .canvasNodeMedia img').length;
      const virtualizedImages = document.querySelectorAll('.graphNode.virtualized .canvasNodeMedia img').length;
      const placeholders = document.querySelectorAll('.graphNode.virtualized .canvasNodePlaceholder').length;
      const renderedEdges = document.querySelectorAll('.canvasLinkGroup').length;
      return {
        totalNodes: allNodes.length,
        virtualizedNodes: virtualizedNodes.length,
        realImages,
        virtualizedImages,
        placeholders,
        renderedEdges,
        performanceMode: Boolean(document.querySelector('.workPreview.performanceMode')),
        body: document.body.innerText.slice(0, 900),
        expectedTotal: totalNodes
      };
    }, TOTAL_NODES);

    await page.getByRole('button', { name: '显示全部图片', exact: true }).click();
    await page.waitForTimeout(300);
    const fit = await page.evaluate(() => {
      const viewport = document.querySelector('.infiniteCanvas').getBoundingClientRect();
      const composer = document.querySelector('.bottomComposerBar')?.getBoundingClientRect();
      const bottom = composer?.top > viewport.top ? Math.min(viewport.bottom, composer.top) : viewport.bottom;
      const nodes = [...document.querySelectorAll('.graphNode')].map((node) => node.getBoundingClientRect());
      const toolbar = document.querySelector('.canvasViewToolbar');
      const toolbarRect = toolbar.getBoundingClientRect();
      return {
        allInView: nodes.every((node) => node.left >= viewport.left - 1 && node.right <= viewport.right + 1 && node.top >= viewport.top - 1 && node.bottom <= bottom + 1),
        outside: nodes.filter((node) => node.left < viewport.left - 1 || node.right > viewport.right + 1 || node.top < viewport.top - 1 || node.bottom > bottom + 1).map((node) => node.toJSON()),
        viewport: viewport.toJSON(), bottom,
        toolbarVisible: getComputedStyle(toolbar).display !== 'none' && toolbarRect.bottom <= bottom,
        decorativeLayers: document.querySelectorAll('.canvasLinkGlow, .canvasLinkPulse, .canvasLinkJointCore').length
      };
    });
    assert(fit.allInView && fit.toolbarVisible, 'Fit-all must frame every node above the composer with accessible tools.', fit);
    assert(fit.decorativeLayers === 0, 'Hidden decorative edge layers should not be mounted.', fit);
    if (!protectedAssets) await page.screenshot({ path: `${screenshotDir}/canvas-fit-all.png`, fullPage: true });
    if (!protectedAssets) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: '收起参考图', exact: true }).click();
      await page.getByRole('button', { name: '显示全部图片', exact: true }).click();
      const mobileTools = await page.locator('.canvasViewToolbar').boundingBox();
      const mobileLayout = await page.evaluate(() => ({
        scroll: [scrollX, scrollY],
        regions: ['.studioLayout', '.creationDesk', '.infiniteCanvas', '.referenceSidePanel', '.workbenchTopControls', '.canvasViewToolbar'].map((selector) => {
          const el = document.querySelector(selector);
          if (!el) return { selector };
          const style = getComputedStyle(el);
          return { selector, rect: el.getBoundingClientRect().toJSON(), scroll: [el.scrollLeft, el.scrollTop], position: style.position, inset: style.inset, grid: style.gridTemplateColumns, transform: style.transform };
        })
      }));
      await page.screenshot({ path: `${screenshotDir}/canvas-fit-mobile.png`, fullPage: true });
      assert(mobileTools.x >= 0 && mobileTools.x + mobileTools.width <= 390 && mobileTools.y + mobileTools.height <= 844, 'Canvas tools must remain reachable on mobile.', { mobileTools, mobileLayout });
      assert(mobileLayout.regions.find(({ selector }) => selector === '.infiniteCanvas').scroll.every((value) => value === 0), 'Canvas focus must not scroll the fixed controls with the plane.', mobileLayout);
    }

    return {
      ...result,
      fit,
      protectedAssetRequests: assetRequests.length,
      protectedAssetUniqueRequests: new Set(assetRequests).size,
      protectedAssetRequestUrls: assetRequests
    };
  } finally {
    await page.close();
  }
}

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

const server = await createServer({
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false
  }
});

let browser;

try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  assert(baseUrl, 'Vite smoke server did not expose a local URL.');

  browser = await chromium.launch({ headless: true });
  const result = await runCanvasPerformanceScenario({ baseUrl });
  const protectedResult = await runCanvasPerformanceScenario({ baseUrl, protectedAssets: true });

  assert(result.totalNodes === TOTAL_NODES, `Expected ${TOTAL_NODES} canvas nodes, got ${result.totalNodes}.`, result);
  assert(result.performanceMode, 'Large canvas did not enter performance mode.', result);
  assert(result.virtualizedNodes >= 20, 'Large canvas did not virtualize enough offscreen nodes.', result);
  assert(result.placeholders === result.virtualizedNodes, 'Virtualized canvas nodes must render placeholders.', result);
  assert(result.virtualizedImages === 0, 'Virtualized canvas nodes should not render real images.', result);
  assert(result.realImages < TOTAL_NODES / 2, 'Large canvas rendered too many real images at once.', result);
  assert(result.renderedEdges < TOTAL_NODES - 1, 'Performance mode did not reduce rendered canvas edges.', result);
  assert(protectedResult.protectedAssetRequests === 0, 'Anonymous canvas smoke should not fetch protected assets without a session token.', protectedResult);
  assert(protectedResult.virtualizedImages === 0, 'Virtualized protected canvas nodes should not render real images.', protectedResult);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    result,
    protectedResult
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
