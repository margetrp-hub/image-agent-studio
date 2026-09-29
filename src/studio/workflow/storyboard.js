function nodeOrder(node) {
  return Number(node?.canvasIndex) || 0;
}

export function buildWorkflowScenes(nodes = []) {
  const ordered = [...nodes].filter((node) => node?.id).sort((left, right) => nodeOrder(left) - nodeOrder(right));
  const nodeById = new Map(ordered.map((node) => [node.id, node]));
  const sceneByRoot = new Map();

  const rootFor = (node) => {
    let current = node;
    const visited = new Set();
    const chain = [];
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.push(current);
      if (!current.parentId || !nodeById.has(current.parentId)) return current;
      current = nodeById.get(current.parentId);
    }
    return chain.sort((left, right) => nodeOrder(left) - nodeOrder(right))[0] || node;
  };

  ordered.forEach((node) => {
    const root = rootFor(node);
    if (!sceneByRoot.has(root.id)) {
      sceneByRoot.set(root.id, {
        id: root.id,
        root,
        nodes: []
      });
    }
    sceneByRoot.get(root.id).nodes.push(node);
  });

  return [...sceneByRoot.values()]
    .sort((left, right) => nodeOrder(left.root) - nodeOrder(right.root))
    .map((scene, index) => ({
      ...scene,
      index: index + 1,
      nodes: scene.nodes.sort((left, right) => nodeOrder(left) - nodeOrder(right))
    }));
}

export function workflowStats(nodes = [], queueItems = []) {
  const imageCount = nodes.filter((node) => node?.kind !== 'video').length;
  const videoCount = nodes.filter((node) => node?.kind === 'video').length;
  const activeCount = queueItems.filter((item) => ['queued', 'running', 'dispatching', 'upstream', 'saving'].includes(item?.status)).length;
  return {
    total: nodes.length,
    imageCount,
    videoCount,
    activeCount
  };
}
