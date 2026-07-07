export function createHistoryCanvasBuilder({
  canvasNodeWidth,
  canvasNodeHeight,
  canvasNodeHorizontalGap,
  downloadMetaFromHistoryItem
}) {
  function buildCanvasNodeFromHistoryItem(item, result, index = 0) {
    const resultItem = typeof result === 'string'
      ? { url: result, displayUrl: result }
      : (result || {});
    const url = resultItem.displayUrl || resultItem.url || '';
    const isVideo = item?.mode === 'video' || item?.kind === 'video';
    const prompt = resultItem.generationPrompt || resultItem.prompt || item?.generationPrompt || item?.prompt || item?.case?.promptPreview || '';
    const workflow = resultItem.workflow || item?.workflow || null;
    const downloadMeta = {
      ...downloadMetaFromHistoryItem({
        ...item,
        id: resultItem.recordId || resultItem.id || item?.id,
        taskId: resultItem.taskId || item?.taskId,
        createdAt: resultItem.createdAt || item?.createdAt,
        generationPrompt: resultItem.generationPrompt || item?.generationPrompt,
        prompt: resultItem.prompt || item?.prompt,
        providerId: resultItem.providerId || item?.providerId,
        provider: resultItem.provider || item?.provider,
        model: resultItem.model || item?.model
      }, isVideo),
      model: resultItem.model || item?.model || ''
    };
    return {
      id: `history-${item?.id || Date.now()}-${resultItem.id || index}`,
      parentId: '',
      canvasIndex: index + 1,
      kind: isVideo ? 'video' : 'image',
      url,
      sourceUrl: resultItem.url || url,
      prompt,
      generationPrompt: resultItem.generationPrompt || prompt,
      workflow,
      downloadMeta,
      title: isVideo ? `#${index + 1}` : `#${index + 1}`,
      x: index * (canvasNodeWidth + canvasNodeHorizontalGap),
      y: index % 2 ? 48 : -36,
      width: canvasNodeWidth,
      height: canvasNodeHeight,
      createdAt: item?.createdAt || new Date().toISOString()
    };
  }

  return { buildCanvasNodeFromHistoryItem };
}
