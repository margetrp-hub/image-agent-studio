import { getImageProvider, PROVIDER_ROUTE_MODES, PROVIDER_VIDEO_TRANSPORTS, providerRoute } from './registry.js';

export function normalizeImageRouteMode(value) {
  const route = String(value || '').toLowerCase();
  if (route === 'legacy' || route === 'images' || route === 'image' || route === 'generations') return PROVIDER_ROUTE_MODES.IMAGES;
  if (route === PROVIDER_ROUTE_MODES.RESPONSES) return PROVIDER_ROUTE_MODES.RESPONSES;
  if (route === PROVIDER_ROUTE_MODES.AUTO) return PROVIDER_ROUTE_MODES.AUTO;
  return PROVIDER_ROUTE_MODES.AUTO;
}

export function resolveImageGenerationDispatch({ providerId, authMode, requestedRoute } = {}) {
  const provider = getImageProvider(providerId, authMode);
  const routeMode = normalizeImageRouteMode(requestedRoute || provider?.parameters?.routeMode || PROVIDER_ROUTE_MODES.AUTO);
  const useResponses = routeMode === PROVIDER_ROUTE_MODES.RESPONSES;
  return {
    provider,
    routeMode,
    transport: useResponses ? PROVIDER_ROUTE_MODES.RESPONSES : PROVIDER_ROUTE_MODES.IMAGES,
    endpoint: useResponses
      ? providerRoute(provider, 'responses') || '/v1/responses'
      : providerRoute(provider, 'generations') || '/v1/images/generations',
    allowImagesFallback: routeMode === PROVIDER_ROUTE_MODES.AUTO
  };
}

export function resolveImageEditDispatch({ providerId, authMode } = {}) {
  const provider = getImageProvider(providerId, authMode);
  return {
    provider,
    routeMode: PROVIDER_ROUTE_MODES.IMAGES,
    transport: PROVIDER_ROUTE_MODES.IMAGES,
    endpoint: providerRoute(provider, 'edits') || '/v1/images/edits'
  };
}

export function resolveVideoGenerationDispatch({ providerId, authMode } = {}) {
  const provider = getImageProvider(providerId, authMode);
  const transport = provider?.parameters?.videoTransport || PROVIDER_VIDEO_TRANSPORTS.TASK_JSON;
  const createEndpoint = providerRoute(provider, 'videoCreate') || (
    transport === PROVIDER_VIDEO_TRANSPORTS.OPENAI_VIDEOS ? '/v1/videos' : '/v1/video/generations'
  );
  return {
    provider,
    transport,
    createEndpoint,
    retrieveEndpoint: providerRoute(provider, 'videoRetrieve') || (
      transport === PROVIDER_VIDEO_TRANSPORTS.OPENAI_VIDEOS ? '/v1/videos/{id}' : '/v1/video/generations/{id}'
    ),
    contentEndpoint: providerRoute(provider, 'videoContent') || ''
  };
}
