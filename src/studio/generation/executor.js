import { generationTaskFingerprint } from '../util/generationJobs.js';

export function imageGenerationRouteForMode({ mode, referenceCount = 0, hasCanvasReference = false, hasMask = false } = {}) {
  if (mode === 'mask' || hasMask) return 'edits';
  if (mode === 'edit' && (Number(referenceCount) > 0 || hasCanvasReference)) return 'edits';
  return 'generations';
}

export function endpointForGenerationTask({ mode, referenceCount = 0, hasCanvasReference = false, hasMask = false, endpoints = {} } = {}) {
  if (mode === 'video') return endpoints.video || '';
  const route = imageGenerationRouteForMode({ mode, referenceCount, hasCanvasReference, hasMask });
  return route === 'edits' ? endpoints.edits || '' : endpoints.generations || '';
}

export function buildServerImageGenerationJobPayload({
  apiKey,
  gatewayBaseUrl,
  images = [],
  mask = null,
  generationMeta,
  sessionId,
  parentCanvasNodeId = '',
  providerId,
  providerFamily,
  apiKeySource,
  providerLabel,
  mode,
  route,
  model,
  prompt,
  generationPrompt,
  size,
  quality,
  resolutionTier,
  outputFormat,
  moderation,
  count,
  referenceCount = 0,
  hasMask = false,
  workflow = null
} = {}) {
  const safeRoute = route || imageGenerationRouteForMode({ mode, referenceCount, hasMask });
  const safeCount = Number(count) || 1;
  return {
    apiKey,
    gatewayBaseUrl,
    images,
    mask,
    request: {
      id: generationMeta?.id || '',
      clientRequestId: `studio-${generationMeta?.id || Date.now()}`,
      sessionId,
      parentCanvasNodeId,
      providerId,
      providerFamily: providerFamily || providerId,
      apiKeySource,
      providerLabel,
      mode,
      route: safeRoute,
      fingerprint: generationTaskFingerprint({
        sessionId,
        mode,
        route: safeRoute,
        providerId,
        apiKeySource,
        model,
        prompt: generationPrompt,
        size,
        quality,
        resolutionTier,
        outputFormat,
        moderation,
        count: safeCount,
        parentCanvasNodeId,
        referenceCount,
        hasMask
      }),
      model,
      prompt,
      generationPrompt,
      size,
      quality,
      resolutionTier,
      outputFormat,
      moderation,
      n: safeCount,
      count: safeCount,
      ...(workflow ? { workflow } : {})
    }
  };
}
