import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const baseline = process.argv.includes('--baseline');
const fixture = `<!doctype html><div id="root"></div><script type="module">
import React, { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useCanvasView } from '/src/studio/hooks/useCanvasView.js';
import { useCanvasNodes } from '/src/studio/hooks/useCanvasNodes.js';
import { useCanvasInteraction } from '/src/studio/hooks/useCanvasInteraction.js';
import { CanvasNodeCard } from '/src/studio/components/canvasNodeCard.jsx';
const frames = new Map();
let frameId = 0;
window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
window.cancelAnimationFrame = (id) => frames.delete(id);
const node = { id: 'a', x: 0, y: 0, width: 340, height: 280, prompt: 'test', title: 'test', canvasIndex: 1,
  url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
  downloadMeta: { id: 'a', createdAt: 1 } };
const noop = () => {};
const metrics = window.metrics = { commits: 0, translations: 0, calls: [] };
const t = (key, fallback) => { metrics.translations++; return fallback; };
function Harness() {
  const view = useCanvasView();
  const graph = useCanvasNodes({ canvasNodes: [node] });
  const [version, setVersion] = useState(0);
  const [visible, setVisible] = useState(true);
  const interaction = useCanvasInteraction({ ...view, ...graph, selectCanvasNode: noop,
    addCanvasCustomLink: (...args) => metrics.calls.push(args), setStatus: noop, setMessage: noop, t });
  useLayoutEffect(() => { metrics.commits++; });
  window.api = { ...view, ...graph, ...interaction, setVersion, setVisible };
  return React.createElement('div', { className: 'infiniteCanvas' }, React.createElement(CanvasNodeCard, {
    node: graph.canvasNodes[0], canvasPerformanceMode: true, visibleCanvasNodeIds: new Set(visible ? ['a'] : []),
    selectedCanvasNodeId: graph.selectedCanvasNodeId, childNodeIds: graph.childNodeIds, parentNodeIds: graph.parentNodeIds,
    linkedNodeIds: graph.linkedNodeIds, canvasLinkDraft: graph.canvasLinkDraft, canvasEditorNodeId: '', t,
    currentDownloadMeta: { createdAt: Date.now() }, onStartNodeDrag: interaction.startCanvasNodeDrag,
    onStartNodeResize: interaction.startCanvasNodeResize, onFinishCanvasLink: interaction.finishCanvasLink,
    onStartCanvasLink: interaction.startCanvasLink, onMediaClick: interaction.handleCanvasNodeMediaClick,
    onOpenEditor: () => metrics.calls.push(version), onPreview: noop, onDelete: noop, onCopyPrompt: noop,
    onSetAsReference: noop, onShare: noop
  }));
}
const lowZoomNodes = Array.from({ length: 120 }, (_, index) => ({
  ...node, id: 'zoom-' + index, canvasIndex: index + 1, url: '/__canvas_media__/' + index + '.svg'
}));
function LowZoomHarness() {
  const view = useCanvasView({ canvasView: { x: 0, y: 0, zoom: 0.05 } });
  const graph = useCanvasNodes({ canvasNodes: lowZoomNodes });
  const [editorId, setEditorId] = useState('');
  const interaction = useCanvasInteraction({ ...view, ...graph,
    selectCanvasNode: (node) => graph.setSelectedCanvasNodeId(node.id),
    addCanvasCustomLink: noop, setStatus: noop, setMessage: noop, t });
  window.api = { ...view, ...graph, ...interaction, setEditorId };
  return React.createElement('div', { className: 'infiniteCanvas',
    onPointerMove: interaction.moveCanvasPan, onPointerUp: interaction.endCanvasPan
  }, graph.canvasNodes.map((node) => React.createElement(CanvasNodeCard, {
    key: node.id, node, canvasZoom: view.canvasView.zoom, canvasPerformanceMode: true,
    visibleCanvasNodeIds: new Set(graph.canvasNodes.map((node) => node.id)),
    selectedCanvasNodeId: graph.selectedCanvasNodeId, childNodeIds: graph.childNodeIds, parentNodeIds: graph.parentNodeIds,
    linkedNodeIds: graph.linkedNodeIds, canvasEditorNodeId: editorId, canvasEditorPrompt: '', canvasEditorMode: 'image', t,
    onStartNodeDrag: interaction.startCanvasNodeDrag, onStartNodeResize: interaction.startCanvasNodeResize,
    onFinishCanvasLink: interaction.finishCanvasLink, onStartCanvasLink: interaction.startCanvasLink,
    onMediaClick: interaction.handleCanvasNodeMediaClick, onOpenEditor: (node) => setEditorId(node.id),
    onCloseEditor: () => setEditorId(''), onPreview: noop, onDelete: noop, onCopyPrompt: noop, onSetAsReference: noop
  })));
}
const root = createRoot(document.getElementById('root'));
window.flush = (callback) => flushSync(callback);
window.flushFrame = () => flushSync(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); });
window.pendingFrames = () => frames.size;
window.unmount = () => flushSync(() => root.unmount());
flushSync(() => root.render(React.createElement(location.search.includes('low-zoom') ? LowZoomHarness : Harness)));
</script>`;

const server = await createServer({
  logLevel: 'silent',
  plugins: [{ name: 'canvas-interaction-fixture', configureServer(vite) {
    vite.middlewares.use('/__canvas_interaction__', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/__canvas_interaction__', fixture));
    });
  } }],
  server: { host: '127.0.0.1', port: 0 }
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(new URL('/__canvas_interaction__', server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => Boolean(window.api)).catch((error) => {
    throw new Error(`${error.message}: ${errors.join('; ')}`);
  });
  const result = await page.evaluate(() => {
    const event = (x, y, type = 'pointermove') => ({ pointerId: 1, button: 0, clientX: x, clientY: y, type,
      currentTarget: document.querySelector('.infiniteCanvas'), target: document.querySelector('.infiniteCanvas'),
      preventDefault() {}, stopPropagation() {} });
    // Flush each event independently, as separate native events are not one React batch.
    window.api.startCanvasPan(event(0, 0));
    const originalImage = document.querySelector('.graphNode img');
    const before = window.metrics.commits;
    for (let i = 1; i <= 120; i++) window.flush(() => window.api.moveCanvasPan(event(i, i * 2)));
    const commitsBeforeFrame = window.metrics.commits - before;
    const pendingFrames = window.pendingFrames();
    window.flushFrame();
    const pan = window.api.canvasView;
    const panCommits = window.metrics.commits - before;
    const imageStayedMounted = originalImage === document.querySelector('.graphNode img');
    window.flush(() => window.api.endCanvasPan(event(120, 240, 'pointerup')));
    const beforeTranslations = window.metrics.translations;
    window.flush(() => window.api.setVersion(7));
    const cardTranslationsOnParentRender = window.metrics.translations - beforeTranslations;
    document.querySelector('.canvasNodeContinue').click();
    const callbackVersion = window.metrics.calls.at(-1);
    const controlsBefore = document.querySelectorAll('.graphNode button, .graphNode a').length;
    window.flush(() => window.api.setVisible(false));
    const controlsOffscreen = document.querySelectorAll('.graphNode button, .graphNode a').length;
    window.flush(() => window.api.setVisible(true));
    window.flush(() => window.api.startCanvasNodeDrag(event(0, 0), window.api.canvasNodes[0]));
    window.flush(() => window.api.moveCanvasPan(event(80, 50)));
    // Release before the scheduled frame: the final coordinates must not be lost.
    window.flush(() => window.api.endCanvasPan(event(90, 60, 'pointerup')));
    const releasedNode = { x: window.api.canvasNodes[0].x, y: window.api.canvasNodes[0].y };
    window.flush(() => window.api.resetCanvasView());
    for (let i = 0; i < 8; i++) window.flush(() => window.api.setCanvasZoom((zoom) => zoom + 0.1));
    window.flushFrame();
    const zoom = window.api.canvasView.zoom;
    window.flush(() => window.api.setCanvasView({ x: 0, y: 0, zoom: 2 }));
    window.flush(() => window.api.startCanvasNodeResize(event(0, 0), window.api.canvasNodes[0]));
    window.flush(() => window.api.moveCanvasPan(event(100, 80)));
    window.flush(() => window.api.endCanvasPan(event(120, 100, 'pointerup')));
    const resizedNode = { width: window.api.canvasNodes[0].width, height: window.api.canvasNodes[0].height };
    const unchangedNodes = window.api.canvasNodes;
    window.flush(() => window.api.startCanvasNodeResize(event(0, 0), window.api.canvasNodes[0]));
    window.flush(() => window.api.moveCanvasPan(event(0.1, 0.1)));
    window.flushFrame();
    const noOpResizePreservedNodes = unchangedNodes === window.api.canvasNodes;
    window.flush(() => window.api.endCanvasPan(event(0.1, 0.1, 'pointerup')));
    const callsBeforeCancel = window.metrics.calls.length;
    window.flush(() => window.api.startCanvasLink(event(0, 0), window.api.canvasNodes[0]));
    window.flush(() => window.api.moveCanvasPan(event(100, 100)));
    window.flush(() => window.api.endCanvasPan(event(100, 100, 'pointercancel')));
    const cancelledLink = window.api.canvasLinkDraft === null && window.metrics.calls.length === callsBeforeCancel;
    window.flush(() => window.api.startCanvasNodeDrag(event(0, 0), window.api.canvasNodes[0]));
    window.flush(() => window.api.moveCanvasPan(event(30, 0)));
    window.flush(() => window.api.moveCanvasPan(event(0, 0)));
    window.flush(() => window.api.endCanvasPan(event(0, 0, 'pointerup')));
    const returnedDragSuppressesClick = window.api.suppressCanvasClickRef.current;
    window.flush(() => window.api.setCanvasZoom(50));
    window.flushFrame();
    const clampedZoom = window.api.canvasView.zoom;
    window.flush(() => window.api.setCanvasZoom(0.05));
    window.flushFrame();
    window.flush(() => window.api.setCanvasZoom((zoom) => zoom + 0.1));
    window.flushFrame();
    const zoomFromWideFit = window.api.canvasView.zoom;
    window.flush(() => window.api.setCanvasZoom(0.5));
    window.flush(() => window.api.resetCanvasView());
    window.flushFrame();
    const resetZoom = window.api.canvasView.zoom;
    window.api.startCanvasPan(event(0, 0));
    window.api.moveCanvasPan(event(10, 10));
    window.unmount();
    return { commitsBeforeFrame, pendingFrames, panCommits, pan, imageStayedMounted, cardTranslationsOnParentRender,
      callbackVersion, controlsBefore, controlsOffscreen, releasedNode, zoom, resizedNode, noOpResizePreservedNodes,
      cancelledLink, returnedDragSuppressesClick, clampedZoom, zoomFromWideFit, resetZoom, framesAfterUnmount: window.pendingFrames() };
  });
  assert.deepEqual(errors, []);
  assert.equal(result.callbackVersion, 7, 'Memoized card must call the latest parent handler');
  assert.deepEqual(result.pan, { x: 120, y: 240, zoom: 1 });
  assert.ok(Math.abs(result.zoom - 1.8) < 1e-9, 'Zoom bursts must accumulate');
  if (!baseline) {
    assert.equal(result.commitsBeforeFrame, 0);
    assert.equal(result.pendingFrames, 1);
    assert.equal(result.panCommits, 1);
    assert.equal(result.imageStayedMounted, true);
    assert.equal(result.cardTranslationsOnParentRender, 0);
    assert.ok(result.controlsOffscreen < result.controlsBefore / 2);
    assert.deepEqual(result.releasedNode, { x: 90, y: 60 });
    assert.deepEqual(result.resizedNode, { width: 400, height: 330 });
    assert.equal(result.noOpResizePreservedNodes, true);
    assert.equal(result.cancelledLink, true);
    assert.equal(result.returnedDragSuppressesClick, true);
    assert.equal(result.clampedZoom, 2.4);
    assert.ok(Math.abs(result.zoomFromWideFit - 0.15) < 1e-9);
    assert.equal(result.resetZoom, 1);
    assert.equal(result.framesAfterUnmount, 0);
  }
  let lowZoom;
  if (!baseline) {
    const requests = [];
    await page.route('**/__canvas_media__/*.svg', async (route) => {
      requests.push(route.request().url());
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>' });
    });
    await page.goto(new URL('/__canvas_interaction__?low-zoom', server.resolvedUrls.local[0]).href, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.graphNode').count(), 120);
    assert.equal(await page.locator('.graphNode img, .graphNode video').count(), 0);
    assert.equal(await page.locator('.canvasNodeMedia .canvasNodePlaceholder').count(), 120);
    assert.equal(await page.locator('button.canvasNodeMedia').count(), 120);
    assert.equal(await page.locator('.canvasPortOut').count(), 120);
    assert.equal(requests.length, 0, 'Fit-all must not fetch original images for low-detail nodes');
    await page.locator('button.canvasNodeMedia').first().click();
    await page.waitForFunction(() => document.querySelector('.graphNode img')?.naturalWidth > 0);
    assert.equal(await page.locator('.graphNode img').count(), 1);
    assert.equal(await page.evaluate(() => window.api.selectedCanvasNodeId), 'zoom-0');
    assert.equal(requests.length, 1, 'Selection should load only the selected image');
    lowZoom = { nodes: 120, initialImages: 0, initialRequests: 0, selectedImages: 1, selectedRequests: requests.length };

    const details = await page.evaluate(() => {
      window.flush(() => {
        window.api.setSelectedCanvasNodeId('');
        window.api.setEditorId('zoom-1');
      });
      const editorImage = Boolean(document.querySelector('[data-node-id="zoom-1"] img'));
      const editorImages = document.querySelectorAll('.graphNode img').length;
      window.flush(() => window.api.setEditorId(''));
      window.flush(() => window.api.setCanvasView({ x: 0, y: 0, zoom: 0.199 }));
      const belowThreshold = document.querySelectorAll('.graphNode img').length;
      window.flush(() => window.api.setCanvasView({ x: 0, y: 0, zoom: 0.2 }));
      const atThreshold = document.querySelectorAll('.graphNode img').length;
      window.flush(() => window.api.setCanvasView({ x: 0, y: 0, zoom: 0.05 }));
      const element = document.querySelector('.graphNode');
      const event = (x, y, type) => ({ pointerId: 1, button: 0, clientX: x, clientY: y, type,
        currentTarget: element, target: element, preventDefault() {}, stopPropagation() {} });
      window.flush(() => window.api.startCanvasNodeDrag(event(0, 0, 'pointerdown'), window.api.canvasNodes[0]));
      window.flush(() => window.api.moveCanvasPan(event(10, 5, 'pointermove')));
      window.flush(() => window.api.endCanvasPan(event(10, 5, 'pointerup')));
      const dragged = { x: window.api.canvasNodes[0].x, y: window.api.canvasNodes[0].y };
      window.unmount();
      return { editorImage, editorImages, belowThreshold, atThreshold, dragged };
    });
    assert.equal(details.editorImage, true);
    assert.equal(details.editorImages, 1);
    assert.equal(details.belowThreshold, 0);
    assert.equal(details.atThreshold, 120);
    assert.deepEqual(details.dragged, { x: 200, y: 100 });
    assert.deepEqual(errors, []);
    lowZoom = { ...lowZoom, ...details };
  }
  console.log(JSON.stringify({ baseline, ...result, lowZoom }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
