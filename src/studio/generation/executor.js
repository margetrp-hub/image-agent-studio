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
  serverManaged = false,
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
    ...(!serverManaged || apiKeySource === 'manual' ? { apiKey, gatewayBaseUrl } : {}),
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

export function buildServerVideoGenerationJobPayload({
  serverManaged = false,
  apiKey,
  gatewayBaseUrl,
  images = [],
  generationMeta,
  sessionId,
  parentCanvasNodeId = '',
  providerId,
  providerFamily,
  apiKeySource,
  providerLabel,
  model,
  prompt,
  generationPrompt,
  aspectRatio,
  duration,
  width,
  height,
  fps,
  motion,
  style,
  quality,
  negativePrompt,
  workflow = null
} = {}) {
  return {
    ...(!serverManaged || apiKeySource === 'manual' ? { apiKey, gatewayBaseUrl } : {}),
    images: images.slice(0, 1),
    request: {
      id: generationMeta?.id || '',
      clientRequestId: `studio-${generationMeta?.id || Date.now()}`,
      sessionId,
      parentCanvasNodeId,
      providerId,
      providerFamily: providerFamily || providerId,
      apiKeySource,
      providerLabel,
      mode: 'video',
      route: 'video',
      fingerprint: generationTaskFingerprint({
        sessionId,
        mode: 'video',
        route: 'video',
        providerId,
        apiKeySource,
        model,
        prompt: generationPrompt || prompt,
        size: aspectRatio,
        quality,
        count: 1,
        parentCanvasNodeId,
        referenceCount: images.length
      }),
      model,
      prompt,
      generationPrompt: generationPrompt || prompt,
      aspectRatio,
      duration,
      width,
      height,
      fps,
      motion,
      style,
      quality,
      negativePrompt,
      n: 1,
      count: 1,
      ...(workflow ? { workflow } : {})
    }
  };
}
