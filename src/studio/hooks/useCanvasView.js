// useCanvasView — owns the pan/zoom view, viewport measurements, and the two
// drag refs (active drag state, suppress-click flag) that previously lived
// inline in CreationDesk. Pure event handlers (pan/zoom/resize) stay in the
// desk, but they now consume well-scoped setters/refs from this hook so the
// state ownership for "where is the camera looking" is decoupled.

import { useCallback, useRef, useState } from 'react';

import { canvasViewForNodes } from '../util/canvasGeometry.js';

export function useCanvasView(restoredSession) {
  const [canvasView, updateCanvasView] = useState(() => (
    restoredSession?.canvasView || { x: 0, y: 0, zoom: 1 }
  ));
  const [canvasViewport, setCanvasViewport] = useState({ width: 1200, height: 720 });
  const canvasDragRef = useRef(null);
  const suppressCanvasClickRef = useRef(false);

  const setCanvasView = useCallback((update) => {
    updateCanvasView((current) => {
      const next = typeof update === 'function' ? update(current) : update;
      return current.x === next.x && current.y === next.y && current.zoom === next.zoom ? current : next;
    });
  }, []);

  const focusCanvasOnNodes = useCallback((nodes, preferredId) => {
    setCanvasView(canvasViewForNodes(nodes, preferredId));
  }, [setCanvasView]);

  return {
    canvasView,
    setCanvasView,
    canvasViewport,
    setCanvasViewport,
    canvasDragRef,
    suppressCanvasClickRef,
    focusCanvasOnNodes
  };
}
