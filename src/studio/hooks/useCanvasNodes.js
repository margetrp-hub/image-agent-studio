// useCanvasNodes — owns the pure canvas-graph state slice that was previously
// inline in CreationDesk. View state (pan/zoom, viewport, inline editor,
// pending generate) and DOM-coupled handlers stay in the desk; this hook only
// holds the node graph and its derived projections so that snapshots,
// selection, and link drafts can be reasoned about as a unit.
//
// Session binding: the desk remounts on sessionId change (key={deskSessionId}),
// so lazy initializers re-run and we get a clean graph per session. The
// restoredSession-sync effect below is a safety net for the case where the
// parent pushes a new sessionSnapshot for the SAME sessionId (e.g. the remote
// sync merges in a richer snapshot after mount) — in that narrow case we adopt
// the restored graph only if the user hasn't started editing yet (current
// graph is still empty). We never clobber a graph the user has built.

import { useEffect, useMemo, useRef, useState } from 'react';

export function useCanvasNodes(restoredSession) {
  const [canvasNodes, setCanvasNodes] = useState(() => (
    Array.isArray(restoredSession?.canvasNodes) ? restoredSession.canvasNodes : []
  ));
  const canvasNodesRef = useRef(canvasNodes);
  const [canvasCustomLinks, setCanvasCustomLinks] = useState(() => (
    Array.isArray(restoredSession?.canvasCustomLinks) ? restoredSession.canvasCustomLinks : []
  ));
  const [selectedCanvasNodeId, setSelectedCanvasNodeId] = useState(() => (
    restoredSession?.selectedCanvasNodeId || ''
  ));
  const [canvasLinkDraft, setCanvasLinkDraft] = useState(null);

  useEffect(() => {
    canvasNodesRef.current = canvasNodes;
  }, [canvasNodes]);

  // Safety net: if the parent pushes a richer restoredSession for the same
  // session (remote sync landing after mount) AND the user hasn't added any
  // nodes yet, adopt the restored graph. Once the user has touched the canvas,
  // their work wins — the desk's own saveCurrentSession effect will reconcile
  // upstream. This guard is what prevents cross-session bleed: a stale
  // restoredSession arriving for a *different* session is filtered out by the
  // desk's key-based remount, and a late arrival for the *same* session only
  // fills an empty canvas rather than overwriting an edited one.
  const restoredSessionIdRef = useRef(restoredSession?.sessionId || null);
  useEffect(() => {
    const nextSessionId = restoredSession?.sessionId || null;
    if (nextSessionId && nextSessionId === restoredSessionIdRef.current) {
      const restoredNodes = Array.isArray(restoredSession?.canvasNodes) ? restoredSession.canvasNodes : [];
      if (canvasNodesRef.current.length === 0 && restoredNodes.length > 0) {
        setCanvasNodes(restoredNodes);
        setCanvasCustomLinks(Array.isArray(restoredSession?.canvasCustomLinks) ? restoredSession.canvasCustomLinks : []);
        if (restoredSession?.selectedCanvasNodeId) {
          setSelectedCanvasNodeId(restoredSession.selectedCanvasNodeId);
        }
      }
    }
    restoredSessionIdRef.current = nextSessionId;
  }, [restoredSession?.sessionId, restoredSession?.canvasNodes, restoredSession?.canvasCustomLinks, restoredSession?.selectedCanvasNodeId]);

  const canvasNodeMap = useMemo(
    () => new Map(canvasNodes.map((node) => [node.id, node])),
    [canvasNodes]
  );

  const canvasEdges = useMemo(() => {
    const edges = [];
    const seen = new Set();
    const pushEdge = (fromId, toId, type = 'lineage') => {
      if (!fromId || !toId || fromId === toId) return;
      const from = canvasNodeMap.get(fromId);
      const to = canvasNodeMap.get(toId);
      if (!from || !to) return;
      const id = `${fromId}-${toId}`;
      if (seen.has(id)) return;
      seen.add(id);
      edges.push({ id, from, to, type });
    };
    canvasNodes.forEach((node) => pushEdge(node.parentId, node.id, 'lineage'));
    canvasCustomLinks.forEach((link) => pushEdge(link.fromId, link.toId, 'custom'));
    return edges;
  }, [canvasNodes, canvasCustomLinks, canvasNodeMap]);

  const canvasLinkPreview = useMemo(() => {
    if (!canvasLinkDraft?.fromId) return null;
    const from = canvasNodeMap.get(canvasLinkDraft.fromId);
    if (!from) return null;
    return { from, point: canvasLinkDraft.point || null };
  }, [canvasLinkDraft, canvasNodeMap]);

  const childNodeIds = useMemo(() => {
    if (!selectedCanvasNodeId) return new Set();
    const ids = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of canvasNodes) {
        const isCustomChild = canvasCustomLinks.some(
          (link) => link.toId === node.id
            && (link.fromId === selectedCanvasNodeId || ids.has(link.fromId))
        );
        if (
          !ids.has(node.id)
          && (node.parentId === selectedCanvasNodeId || ids.has(node.parentId) || isCustomChild)
        ) {
          ids.add(node.id);
          changed = true;
        }
      }
    }
    return ids;
  }, [canvasNodes, canvasCustomLinks, selectedCanvasNodeId]);

  const parentNodeIds = useMemo(() => {
    if (!selectedCanvasNodeId) return new Set();
    const ids = new Set();
    const visit = (nodeId) => {
      const current = canvasNodeMap.get(nodeId);
      const parentIds = [
        current?.parentId,
        ...canvasCustomLinks
          .filter((link) => link.toId === nodeId)
          .map((link) => link.fromId)
      ].filter(Boolean);
      parentIds.forEach((parentId) => {
        if (ids.has(parentId) || !canvasNodeMap.has(parentId)) return;
        ids.add(parentId);
        visit(parentId);
      });
    };
    visit(selectedCanvasNodeId);
    return ids;
  }, [canvasNodeMap, canvasCustomLinks, selectedCanvasNodeId]);

  const linkedNodeIds = useMemo(() => {
    if (!canvasLinkDraft?.fromId) return new Set();
    return new Set([
      canvasLinkDraft.fromId,
      ...canvasEdges
        .filter((edge) => edge.from.id === canvasLinkDraft.fromId || edge.to.id === canvasLinkDraft.fromId)
        .flatMap((edge) => [edge.from.id, edge.to.id])
    ]);
  }, [canvasEdges, canvasLinkDraft?.fromId]);

  const selectedCanvasNode = canvasNodes.find((node) => node.id === selectedCanvasNodeId) || null;

  return {
    canvasNodes,
    setCanvasNodes,
    canvasNodesRef,
    canvasCustomLinks,
    setCanvasCustomLinks,
    selectedCanvasNodeId,
    setSelectedCanvasNodeId,
    canvasLinkDraft,
    setCanvasLinkDraft,
    canvasNodeMap,
    canvasEdges,
    canvasLinkPreview,
    childNodeIds,
    parentNodeIds,
    linkedNodeIds,
    selectedCanvasNode
  };
}
