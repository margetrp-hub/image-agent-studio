// Canvas geometry helpers — pure functions for node sizing, view framing,
// edge path computation, and edge lineage classification. No React, no DOM;
// safe to unit-test and reuse from snapshot serializers.

import { clamp } from './formatters.js';
import {
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
