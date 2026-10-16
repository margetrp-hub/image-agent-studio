import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvasFitViewForNodes, canvasGraphAdjacency, canvasReachableNodeIds, canvasViewForNodes, nodeHeight, nodeWidth } from './canvasGeometry.js';
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM } from './canvasConstants.js';

test('fit centers the complete node bounds inside screen-space padding', () => {
  const nodes = [
    { x: -1200, y: -400, width: 240, height: 200 },
    { x: 1800, y: 1000, width: 900, height: 700 }
  ];
  for (const viewport of [{ width: 1200, height: 720 }, { width: 390, height: 844 }]) {
    const padding = 32;
    const view = canvasFitViewForNodes(nodes, viewport, padding);
    for (const node of nodes) {
      const x = viewport.width / 2 + view.x + node.x * view.zoom;
      const y = viewport.height / 2 + view.y + node.y * view.zoom;
      assert.ok(x >= padding - 1e-9 && y >= padding - 1e-9);
      assert.ok(x + nodeWidth(node) * view.zoom <= viewport.width - padding + 1e-9);
      assert.ok(y + nodeHeight(node) * view.zoom <= viewport.height - padding + 1e-9);
    }
    assert.equal(view.x, -750 * view.zoom);
    assert.equal(view.y, -650 * view.zoom);
  }
  assert.deepEqual(canvasViewForNodes(nodes), { x: -750, y: -650, zoom: 1 });
});

test('fit supports wide boards below the previous zoom floor and clamps extremes', () => {
  const nodes = [{ x: -10000, y: 0 }, { x: 10000, y: 0 }];
  const view = canvasFitViewForNodes(nodes, { width: 1200, height: 720 });
  assert.ok(view.zoom >= CANVAS_MIN_ZOOM && view.zoom < 0.28);
  assert.equal(view.zoom, (1200 - 128) / 20340);
  assert.equal(canvasFitViewForNodes([{ x: 0, y: 0 }], { width: 10000, height: 10000 }).zoom, CANVAS_MAX_ZOOM);
  assert.equal(canvasFitViewForNodes([{ x: 0, y: 0 }, { x: 1000000, y: 0 }]).zoom, CANVAS_MIN_ZOOM);
});

test('fit tolerates empty, unmeasured and invalid geometry inputs', () => {
  assert.deepEqual(canvasFitViewForNodes([]), { x: 0, y: 0, zoom: 1 });
  assert.deepEqual(canvasFitViewForNodes([null, { x: Infinity }]), { x: 0, y: 0, zoom: 1 });
  const nodes = [{ x: '20', y: '-30', width: 500, height: 300 }];
  const fallback = canvasFitViewForNodes(nodes, { width: 1200, height: 720 });
  assert.deepEqual(canvasFitViewForNodes(nodes, { width: 0, height: NaN }), fallback);
  const tiny = canvasFitViewForNodes(nodes, { width: 1, height: 1 }, 100);
  assert.ok(Object.values(tiny).every(Number.isFinite));
});

test('lineage and custom links preserve branching, duplicate and cycle behavior', () => {
  const nodes = [
    { id: 'a' }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' },
    { id: 'd', parentId: 'a' }, { id: 'unrelated' }
  ];
  const links = [
    { fromId: 'a', toId: 'b' }, { fromId: 'c', toId: 'a' },
    { fromId: 'c', toId: 'c' }, { fromId: 'missing', toId: 'c' },
    { fromId: 'a', toId: 'missing' }
  ];
  const { children, parents } = canvasGraphAdjacency(nodes, links);
  assert.deepEqual(canvasReachableNodeIds(children, 'a'), new Set(['a', 'b', 'c', 'd']));
  assert.deepEqual(canvasReachableNodeIds(parents, 'c'), new Set(['a', 'b', 'c']));
  assert.deepEqual(canvasReachableNodeIds(children, 'unrelated'), new Set());
  assert.deepEqual(canvasReachableNodeIds(children, ''), new Set());
  assert.equal(children.get('a').size, 2);
});

test('long reverse-ordered chains traverse without recursion or repeated link scans', () => {
  const length = 20000;
  const nodes = Array.from({ length }, (_, index) => ({
    id: String(index), parentId: index ? String(index - 1) : ''
  })).reverse();
  const links = nodes.slice(0, -1).map((node) => ({ fromId: node.parentId, toId: node.id }));
  const { children, parents } = canvasGraphAdjacency(nodes, links);
  let lookups = 0;
  const countedChildren = { get(id) { lookups++; return children.get(id); } };
  assert.equal(canvasReachableNodeIds(countedChildren, '0').size, length - 1);
  assert.equal(lookups, length);
  assert.equal(canvasReachableNodeIds(parents, String(length - 1)).size, length - 1);
});
