// Derives the React state needed to repaint the editor from a saved session
// snapshot. Studio.jsx calls this once per restore (cold load + remote sync)
// and then plumbs the returned values into useState setters one-for-one.
//
// All of the actual decoding/normalization/fallback logic lives here so it
// can be exercised without standing up a React tree, and so studio.jsx is
// left with a flat block of `setX(next.x)` calls.
//
// The "interrupted generation" branch deserves a callout: when a snapshot is
// stored with status:'loading' (page was closed mid-generation), we have to
// pick between three messages — the upstream job is still pollable, the
// upstream job died but we kept some preview, or we have nothing and the
// user might have been billed. Each branch sets a distinct progress.stage
// so the UI can theme the banner accordingly.

export function deriveSessionStateFromSnapshot(snapshot, deps) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const {
    fallbackCustomSize,
    imageModels,
    videoModels,
    generationQueueLimit,
    assistantMessageLimit = 24,
    normalizeSize,
    normalizeAspect,
    normalizeQuality,
    normalizeResolutionTier,
    normalizeOutputFormat,
    normalizeModeration,
    normalizeCount,
    normalizeVideoAspect,
    normalizeVideoDuration,
    normalizeVideoFps,
    normalizeVideoMotion,
    normalizeVideoStyle,
    normalizeVideoQuality,
    serializeGenerationQueueItem,
    serializeAssistantMessage,
    serializePromptSuggestion,
    hasRestorableServerGeneration
  } = deps;

  const parameters = snapshot.parameters || {};
  const mode = snapshot.mode || 'image';
  const size = normalizeSize(parameters.size || parameters.customSize || fallbackCustomSize);

  const generationQueue = Array.isArray(snapshot.generationQueue)
    ? snapshot.generationQueue.map(serializeGenerationQueueItem).filter(Boolean).slice(-generationQueueLimit)
    : [];

  const assistantMessages = Array.isArray(snapshot.assistantMessages)
    ? snapshot.assistantMessages.map(serializeAssistantMessage).filter(Boolean).slice(-assistantMessageLimit)
    : [];

  const hasRestorableServerJob = hasRestorableServerGeneration(snapshot);
  // If the snapshot was loading but we already had partial output (preview
  // images, canvas thumbs), we want to surface that to the user as
  // "pending_review" instead of failing outright.
  const interruptedHasResult = snapshot.status === 'loading' && (
    (Array.isArray(snapshot.results) && snapshot.results.length)
    || (Array.isArray(snapshot.videoResults) && snapshot.videoResults.length)
    || (Array.isArray(snapshot.canvasNodes) && snapshot.canvasNodes.length)
  );

  const status = snapshot.status === 'loading'
    ? hasRestorableServerJob ? 'loading' : 'error'
    : (snapshot.status || 'idle');

  const message = snapshot.status === 'loading'
    ? hasRestorableServerJob
      ? '检测到服务端仍有生成任务，正在继续同步状态；刷新页面不会丢失队列。'
      : interruptedHasResult
      ? '页面刷新前有生成请求正在进行，已保留收到的预览/画布。上游可能仍已扣费，请先检查结果或等待，不要立刻重复提交。'
      : '页面刷新前有生成请求正在进行，但本页已断开监听。上游可能仍已扣费，请先到历史图库或服务端确认，再决定是否重试。'
    : (snapshot.message || '');

  const progress = snapshot.status === 'loading'
    ? {
      ...(snapshot.progress || {}),
      stage: hasRestorableServerJob
        ? (snapshot.progress?.stage || 'upstream')
        : interruptedHasResult ? 'pending_review' : 'failed',
      percent: snapshot.progress?.percent || (hasRestorableServerJob ? 52 : 0)
    }
    : (snapshot.progress || { stage: 'idle', percent: 0, completed: 0, total: 1 });

  return {
    mode,
    prompt: snapshot.prompt || '',
    model: snapshot.model || imageModels[0],
    aspect: normalizeAspect(parameters.aspect || parameters.aspectRatio, size),
    customSize: normalizeSize(parameters.customSize || size),
    quality: normalizeQuality(parameters.quality),
    resolutionTier: normalizeResolutionTier(parameters.resolutionTier),
    outputFormat: normalizeOutputFormat(parameters.outputFormat),
    moderation: normalizeModeration(parameters.moderation),
    count: normalizeCount(parameters.count),
    videoModel: parameters.videoModel || videoModels[0],
    videoAspect: normalizeVideoAspect(parameters.videoAspect || parameters.videoAspectRatio),
    videoDuration: normalizeVideoDuration(parameters.videoDuration || parameters.duration),
    videoFps: normalizeVideoFps(parameters.videoFps || parameters.fps),
    videoMotion: normalizeVideoMotion(parameters.videoMotion),
    videoStyle: normalizeVideoStyle(parameters.videoStyle),
    videoQuality: normalizeVideoQuality(parameters.videoQuality),
    negativePrompt: parameters.negativePrompt || '',
    results: Array.isArray(snapshot.results) ? snapshot.results : [],
    videoResults: Array.isArray(snapshot.videoResults) ? snapshot.videoResults : [],
    resultBatchMeta: snapshot.resultBatchMeta || null,
    canvasNodes: Array.isArray(snapshot.canvasNodes) ? snapshot.canvasNodes : [],
    canvasCustomLinks: Array.isArray(snapshot.canvasCustomLinks) ? snapshot.canvasCustomLinks : [],
    generationQueue,
    selectedCanvasNodeId: snapshot.selectedCanvasNodeId || '',
    canvasEditorNodeId: snapshot.canvasEditorNodeId || '',
    canvasView: snapshot.canvasView || { x: 0, y: 0, zoom: 1 },
    assistantMessages,
    promptSuggestion: serializePromptSuggestion(snapshot.promptSuggestion),
    status,
    message,
    progress,
    timing: snapshot.timing || null
  };
}

// Calls onSessionSnapshot iff the encoded payload changed — used everywhere
// we save the active canvas so an unchanged save (e.g. throttled re-render
// with identical fields) doesn't fire a redundant remote-sync round-trip.
export function notifySessionSnapshotChange(snapshot, {
  encodePayload,
  lastEncodedRef,
  onSessionSnapshot
}) {
  const encoded = encodePayload(snapshot);
  if (lastEncodedRef.current !== encoded) {
    lastEncodedRef.current = encoded;
    if (onSessionSnapshot) {
      window.queueMicrotask(() => onSessionSnapshot(snapshot));
    }
  }
  return snapshot;
}
