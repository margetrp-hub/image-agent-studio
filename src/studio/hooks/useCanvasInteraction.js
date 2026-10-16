// useCanvasInteraction — owns the pointer-driven canvas interaction handlers
// (pan, node drag, node resize, link create/finish, media click, zoom/reset).
// All state and setters stay in CreationDesk and are passed in via `deps`;
// the hook just bundles the imperative event choreography so it can be
// reasoned about and tested as a unit. Continuous updates are coalesced per
// animation frame; pointer release flushes the final position synchronously.

import { useEffect, useRef } from 'react';

import {
  CANVAS_DRAG_CLICK_TOLERANCE,
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_HORIZONTAL_GAP,
  CANVAS_NODE_MAX_HEIGHT,
  CANVAS_NODE_MAX_WIDTH,
  CANVAS_NODE_MIN_HEIGHT,
  CANVAS_NODE_MIN_WIDTH,
  CANVAS_NODE_VERTICAL_GAP,
  CANVAS_NODE_WIDTH,
  CANVAS_PLANE_HEIGHT,
  CANVAS_PLANE_WIDTH
} from '../util/canvasConstants.js';
import { nodeHeight, nodeWidth } from '../util/canvasGeometry.js';
import { clamp } from '../util/formatters.js';

export function canvasPlanePointFromEvent(event, canvasView) {
  const eventTarget = event.currentTarget || event.target;
  const rect = eventTarget?.closest?.('.infiniteCanvas')?.getBoundingClientRect();
  const zoom = canvasView.zoom || 1;
  if (!rect) {
    return {
      x: CANVAS_PLANE_WIDTH / 2,
      y: CANVAS_PLANE_HEIGHT / 2
    };
  }
  return {
    x: (event.clientX - rect.left - rect.width / 2 - canvasView.x) / zoom + CANVAS_PLANE_WIDTH / 2,
    y: (event.clientY - rect.top - rect.height / 2 - canvasView.y) / zoom + CANVAS_PLANE_HEIGHT / 2
  };
}

export function findCanvasLinkTarget(event, fromId, canvasView, canvasNodes, canvasNodeMap) {
  const targetElement = document.elementFromPoint(event.clientX, event.clientY);
  const domNodeId = targetElement?.dataset?.nodeId || targetElement?.closest?.('.graphNode')?.dataset?.nodeId;
  if (domNodeId && domNodeId !== fromId && canvasNodeMap.has(domNodeId)) return domNodeId;

  const point = canvasPlanePointFromEvent(event, canvasView);
  const threshold = 56 / (canvasView.zoom || 1);
  let closest = null;
  for (const node of canvasNodes) {
    if (!node?.id || node.id === fromId) continue;
    const portX = CANVAS_PLANE_WIDTH / 2 + Number(node.x || 0);
    const portY = CANVAS_PLANE_HEIGHT / 2 + Number(node.y || 0) + nodeHeight(node) * 0.48;
    const distance = Math.hypot(point.x - portX, point.y - portY);
    if (distance <= threshold && (!closest || distance < closest.distance)) {
      closest = { nodeId: node.id, distance };
    }
  }
  return closest?.nodeId || '';
}

export function useCanvasInteraction(deps) {
  const {
    canvasView,
    setCanvasView,
    canvasNodes,
    setCanvasNodes,
    canvasNodeMap,
    canvasEdges,
    canvasCustomLinks,
    setCanvasCustomLinks,
    canvasLinkDraft,
    setCanvasLinkDraft,
    selectedCanvasNodeId,
    setSelectedCanvasNodeId,
    canvasDragRef,
    suppressCanvasClickRef,
    addCanvasCustomLink,
    selectCanvasNode,
    setStatus,
    setMessage,
    t
  } = deps;

  const frameRef = useRef(null);
  const pendingUpdatesRef = useRef(new Map());
  const pendingZoomRef = useRef([]);

  function flushCanvasUpdates() {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const updates = [...pendingUpdatesRef.current.values()];
    pendingUpdatesRef.current.clear();
    updates.forEach((update) => update());
  }

  function scheduleCanvasUpdate(key, update) {
    pendingUpdatesRef.current.set(key, update);
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flushCanvasUpdates);
  }

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingUpdatesRef.current.clear();
    pendingZoomRef.current = [];
  }, []);

  function setCanvasZoom(nextZoom) {
    pendingZoomRef.current.push(nextZoom);
    scheduleCanvasUpdate('zoom', () => {
      const updates = pendingZoomRef.current;
      pendingZoomRef.current = [];
      setCanvasView((current) => {
        const zoom = updates.reduce((value, update) => (
          clamp(typeof update === 'function' ? update(value) : update, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM)
        ), current.zoom);
        return zoom === current.zoom ? current : { ...current, zoom };
      });
    });
  }

  function resetCanvasView() {
    flushCanvasUpdates();
    setCanvasView({ x: 0, y: 0, zoom: 1 });
  }

  useEffect(() => {
    function handleCanvasZoomShortcut(event) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.altKey) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setCanvasZoom((value) => value - 0.1);
      } else if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        setCanvasZoom((value) => value + 0.1);
      } else if (event.key === '0') {
        event.preventDefault();
        resetCanvasView();
      }
    }

    window.addEventListener('keydown', handleCanvasZoomShortcut);
    return () => window.removeEventListener('keydown', handleCanvasZoomShortcut);
  }, []);

  function startCanvasPan(event) {
    if (event.button !== 0) return;
    if (event.target.closest?.('button, a, video, input, select, textarea, .graphNode, .canvasPort')) return;
    if (canvasLinkDraft) setCanvasLinkDraft(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    canvasDragRef.current = {
      type: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: canvasView.x,
      originY: canvasView.y
    };
  }

  function moveCanvasPan(event) {
    const drag = canvasDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // React clears currentTarget after dispatch. Keep just the coordinates and
    // DOM references required by the deferred link geometry calculation.
    const pointEvent = {
      clientX: event.clientX,
      clientY: event.clientY,
      currentTarget: event.currentTarget,
      target: event.target
    };
    if (drag.type === 'node-move' && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= CANVAS_DRAG_CLICK_TOLERANCE) {
      drag.moved = true;
    }
    scheduleCanvasUpdate('pointer', () => applyCanvasMove(pointEvent, drag));
  }

  function applyCanvasMove(event, drag) {
    if (drag.type === 'node-resize') {
      resizeCanvasNode(event, drag);
      return;
    }
    if (drag.type === 'node-move') {
      moveCanvasNode(event, drag);
      return;
    }
    if (drag.type === 'link-create') {
      const point = canvasPlanePointFromEvent(event, canvasView);
      setCanvasLinkDraft((current) => current?.fromId === drag.fromId ? {
        ...current,
        point
      } : current);
      return;
    }
    setCanvasView((current) => ({
      ...current,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    }));
  }

  function endCanvasPan(event) {
    const drag = canvasDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.type === 'pointerup' && drag.type !== 'link-create') moveCanvasPan(event);
    flushCanvasUpdates();
    if (drag.type === 'node-move' && drag.moved) {
      suppressCanvasClickRef.current = true;
      window.setTimeout(() => {
        suppressCanvasClickRef.current = false;
      }, 0);
    }
    if (drag.type === 'link-create') {
      if (event.type === 'pointercancel') {
        setCanvasLinkDraft(null);
        canvasDragRef.current = null;
        return;
      }
      const targetNodeId = findCanvasLinkTarget(event, drag.fromId, canvasView, canvasNodes, canvasNodeMap);
      const linked = addCanvasCustomLink(drag.fromId, targetNodeId);
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= CANVAS_DRAG_CLICK_TOLERANCE;
      if (linked || moved) {
        setCanvasLinkDraft(null);
      } else {
        setCanvasLinkDraft((current) => current?.fromId === drag.fromId ? { fromId: drag.fromId, point: null } : { fromId: drag.fromId, point: null });
        setMessage(t('statusMessages.linkTargetHint', '选择另一张图左侧圆点，或拖到目标图片上建立关联。'));
      }
    }
    canvasDragRef.current = null;
  }

  function startCanvasNodeResize(event, node) {
    if (!node?.id || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    canvasDragRef.current = {
      type: 'node-resize',
      pointerId: event.pointerId,
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: nodeWidth(node),
      originHeight: nodeHeight(node)
    };
    setSelectedCanvasNodeId(node.id);
  }

  function startCanvasNodeDrag(event, node) {
    if (!node?.id || event.button !== 0) return;
    if (event.target.closest?.('a, input, select, textarea, .canvasPort, .canvasNodeResize, .canvasInlineEditor, .canvasNodeToolbar, .canvasNodeContinue')) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    canvasDragRef.current = {
      type: 'node-move',
      pointerId: event.pointerId,
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: Number(node.x) || 0,
      originY: Number(node.y) || 0,
      moved: false
    };
    setSelectedCanvasNodeId(node.id);
  }

  function resizeCanvasNode(event, drag) {
    const zoom = canvasView.zoom || 1;
    const nextWidth = clamp(
      drag.originWidth + (event.clientX - drag.startX) / zoom,
      CANVAS_NODE_MIN_WIDTH,
      CANVAS_NODE_MAX_WIDTH
    );
    const nextHeight = clamp(
      drag.originHeight + (event.clientY - drag.startY) / zoom,
      CANVAS_NODE_MIN_HEIGHT,
      CANVAS_NODE_MAX_HEIGHT
    );
    updateCanvasNode(drag.nodeId, { width: Math.round(nextWidth), height: Math.round(nextHeight) });
  }

  function updateCanvasNode(nodeId, patch) {
    setCanvasNodes((current) => {
      const index = current.findIndex((node) => node.id === nodeId);
      if (index < 0 || Object.keys(patch).every((key) => current[index][key] === patch[key])) return current;
      const next = current.slice();
      next[index] = { ...current[index], ...patch };
      return next;
    });
  }

  function moveCanvasNode(event, drag) {
    const zoom = canvasView.zoom || 1;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= CANVAS_DRAG_CLICK_TOLERANCE) {
      drag.moved = true;
    }
    updateCanvasNode(drag.nodeId, { x: Math.round(drag.originX + dx), y: Math.round(drag.originY + dy) });
  }

  function startCanvasLink(event, node) {
    if (!node?.id || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = canvasPlanePointFromEvent(event, canvasView);
    canvasDragRef.current = {
      type: 'link-create',
      pointerId: event.pointerId,
      fromId: node.id,
      startX: event.clientX,
      startY: event.clientY
    };
    setSelectedCanvasNodeId(node.id);
    setCanvasLinkDraft({ fromId: node.id, point });
    setStatus('idle');
    setMessage('');
  }

  function finishCanvasLink(event, node) {
    event.preventDefault();
    event.stopPropagation();
    const draft = canvasLinkDraft;
    if (!draft?.fromId) return;
    flushCanvasUpdates();
    addCanvasCustomLink(draft.fromId, node.id);
    setCanvasLinkDraft(null);
    canvasDragRef.current = null;
  }

  function handleCanvasNodeMediaClick(event, node) {
    event.stopPropagation();
    if (suppressCanvasClickRef.current) return;
    selectCanvasNode(node);
  }

  return {
    setCanvasZoom,
    resetCanvasView,
    startCanvasPan,
    moveCanvasPan,
    endCanvasPan,
    startCanvasNodeResize,
    startCanvasNodeDrag,
    startCanvasLink,
    finishCanvasLink,
    handleCanvasNodeMediaClick
  };
}
