// Canvas geometry helpers — pure functions for node sizing, view framing,
// edge path computation, and edge lineage classification. No React, no DOM;
// safe to unit-test and reuse from snapshot serializers.

import { clamp } from './formatters.js';
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_MAX_HEIGHT,
  CANVAS_NODE_MAX_WIDTH,
  CANVAS_NODE_MIN_HEIGHT,
  CANVAS_NODE_MIN_WIDTH,
  CANVAS_NODE_WIDTH
} from './canvasConstants.js';

export function nodeWidth(node) {
  return clamp(Number(node?.width) || CANVAS_NODE_WIDTH, CANVAS_NODE_MIN_WIDTH, CANVAS_NODE_MAX_WIDTH);
}

export function nodeHeight(node) {
  return clamp(Number(node?.height) || CANVAS_NODE_HEIGHT, CANVAS_NODE_MIN_HEIGHT, CANVAS_NODE_MAX_HEIGHT);
}

export function canvasGraphAdjacency(nodes, links = []) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const children = new Map();
  const parents = new Map();
  const connect = (fromId, toId) => {
    if (!fromId || !nodeIds.has(toId)) return;
    if (!children.has(fromId)) children.set(fromId, new Set());
    children.get(fromId).add(toId);
    if (!nodeIds.has(fromId)) return;
    if (!parents.has(toId)) parents.set(toId, new Set());
    parents.get(toId).add(fromId);
  };
  nodes.forEach((node) => connect(node.parentId, node.id));
  links.forEach((link) => connect(link.fromId, link.toId));
  return { children, parents };
}

export function canvasReachableNodeIds(adjacency, fromId) {
  const ids = new Set();
  if (!fromId) return ids;
  const pending = [fromId];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const id of adjacency.get(current) || []) {
      ids.add(id);
      if (!visited.has(id)) pending.push(id);
    }
  }
  return ids;
}

export function canvasViewForNodes(nodes = [], preferredId = '') {
  const visibleNodes = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
  if (!visibleNodes.length) return { x: 0, y: 0, zoom: 1 };
  const preferred = preferredId ? visibleNodes.find((node) => node.id === preferredId) : null;
  const focusNodes = preferred ? [preferred] : visibleNodes;
  const left = Math.min(...focusNodes.map((node) => node.x));
  const top = Math.min(...focusNodes.map((node) => node.y));
  const right = Math.max(...focusNodes.map((node) => node.x + nodeWidth(node)));
  const bottom = Math.max(...focusNodes.map((node) => node.y + nodeHeight(node)));
  return {
    x: -((left + right) / 2),
    y: -((top + bottom) / 2),
    zoom: 1
  };
}

// Padding is in screen pixels. The minimum zoom still bounds extremely wide
// boards; center their bounds even when fitting would require a smaller scale.
export function canvasFitViewForNodes(nodes = [], viewport = {}, padding = 64) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node) continue;
    const x = Number(node.x ?? 0);
    const y = Number(node.y ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + nodeWidth(node));
    bottom = Math.max(bottom, y + nodeHeight(node));
  }
  if (left === Infinity) return { x: 0, y: 0, zoom: 1 };
  const width = Number(viewport?.width);
  const height = Number(viewport?.height);
  const inset = Number.isFinite(Number(padding)) ? Math.max(0, Number(padding)) : 64;
  const availableWidth = Math.max(1, (Number.isFinite(width) && width > 0 ? width : 1200) - inset * 2);
  const availableHeight = Math.max(1, (Number.isFinite(height) && height > 0 ? height : 720) - inset * 2);
  const zoom = clamp(Math.min(availableWidth / (right - left), availableHeight / (bottom - top)), CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);
  return { x: -(left + (right - left) / 2) * zoom, y: -(top + (bottom - top) / 2) * zoom, zoom };
}

// Compute the cubic-bezier path geometry for a canvas edge between two nodes.
// `planeWidth`/`planeHeight` are the infinite-canvas plane dimensions used to
// translate node-local coordinates into plane space (matching the SVG viewBox).
export function canvasEdgeGeometry(from, to, planeWidth, planeHeight) {
  const fromWidth = nodeWidth(from);
  const fromHeight = nodeHeight(from);
  const toHeight = nodeHeight(to);
  const x1 = planeWidth / 2 + from.x + fromWidth + 2;
  const y1 = planeHeight / 2 + from.y + fromHeight * 0.48;
  const x2 = planeWidth / 2 + to.x - 2;
  const y2 = planeHeight / 2 + to.y + toHeight * 0.48;
  const bend = Math.max(96, Math.abs(x2 - x1) * 0.46);
  const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  return {
    x1, y1, x2, y2, bend, path,
    jointX: (x1 + x2) / 2,
    jointY: (y1 + y2) / 2
  };
}

// Compute the dashed preview path drawn while the user is dragging out a new
// custom link from `from` toward an arbitrary `point` (in plane coordinates).
export function canvasLinkPreviewGeometry(from, point, planeWidth, planeHeight) {
  const fromWidth = nodeWidth(from);
  const fromHeight = nodeHeight(from);
  const x1 = planeWidth / 2 + from.x + fromWidth + 2;
  const y1 = planeHeight / 2 + from.y + fromHeight * 0.48;
  const x2 = point.x;
  const y2 = point.y;
  const bend = Math.max(70, Math.abs(x2 - x1) * 0.38);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

// Classify an edge's lineage role relative to the currently selected node so
// the SVG layer can style active/dimmed branches. Pure: takes the edge plus
// the selection-derived id sets that useCanvasNodes already computes.
export function canvasEdgeLineageClass(edge, selectedCanvasNodeId, childNodeIds, parentNodeIds) {
  if (!selectedCanvasNodeId) return 'idle';
  const fromSelected = edge.from.id === selectedCanvasNodeId;
  const toSelected = edge.to.id === selectedCanvasNodeId;
  const fromChild = childNodeIds.has(edge.from.id);
  const toChild = childNodeIds.has(edge.to.id);
  const fromParent = parentNodeIds.has(edge.from.id);
  const toParent = parentNodeIds.has(edge.to.id);

  if (toChild && (fromSelected || fromChild)) {
    return fromSelected ? 'active branchRoot' : 'active branchDown';
  }
  if ((toSelected && fromParent) || (fromParent && toParent)) {
    return toSelected ? 'active branchIntoSelected' : 'active branchUp';
  }
  if (fromSelected || toSelected) return 'active direct';
  return 'idle';
}
