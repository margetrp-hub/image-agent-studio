import { getImageProvider, PROVIDER_ADAPTER_TYPES, PROVIDER_ROUTE_MODES } from './registry.js';
import { resolveImageEditDispatch, resolveImageGenerationDispatch } from './dispatch.js';

function adapterTypeForProvider(provider) {
  return provider?.adapterType || PROVIDER_ADAPTER_TYPES.OPENAI_COMPATIBLE_HTTP;
}

function providerCapabilitySnapshot(provider) {
  return {
    textToImage: Boolean(provider?.capabilities?.textToImage),
    imageEdit: Boolean(provider?.capabilities?.imageEdit),
    referenceImages: Boolean(provider?.capabilities?.referenceImages),
    mask: Boolean(provider?.capabilities?.mask),
    modelSync: Boolean(provider?.capabilities?.modelSync),
    accountKeys: Boolean(provider?.capabilities?.accountKeys),
    videoGeneration: Boolean(provider?.capabilities?.videoGeneration)
  };
}

function normalizeParameterFromList(value, list, fallback) {
  return Array.isArray(list) && list.includes(value) ? value : fallback;
}

function normalizeProviderCount(value, provider) {
  const [minValue, maxValue] = Array.isArray(provider?.parameters?.countRange)
    ? provider.parameters.countRange
    : [1, 1];
  const min = Math.max(1, Math.round(Number(minValue) || 1));
  const max = Math.max(min, Math.round(Number(maxValue) || min));
  const count = Math.round(Number(value || min));
  return Math.min(max, Math.max(min, Number.isFinite(count) ? count : min));
}

export function normalizeProviderImageParameters(provider, parameters = {}) {
  const providerParameters = provider?.parameters || {};
  const sizes = Array.isArray(providerParameters.sizes) && providerParameters.sizes.length ? providerParameters.sizes : ['1024x1024'];
  const qualities = Array.isArray(providerParameters.qualities) && providerParameters.qualities.length ? providerParameters.qualities : ['auto'];
  const outputFormats = Array.isArray(providerParameters.outputFormats) && providerParameters.outputFormats.length ? providerParameters.outputFormats : ['png'];
  const resolutionTiers = Array.isArray(providerParameters.resolutionTiers) && providerParameters.resolutionTiers.length ? providerParameters.resolutionTiers : ['1k'];
  return {
    ...parameters,
    size: normalizeParameterFromList(parameters.size, sizes, sizes.includes('1024x1024') ? '1024x1024' : sizes[0]),
    quality: normalizeParameterFromList(parameters.quality, qualities, qualities.includes('medium') ? 'medium' : qualities[0]),
    outputFormat: normalizeParameterFromList(parameters.outputFormat, outputFormats, outputFormats.includes('png') ? 'png' : outputFormats[0]),
    moderation: parameters.moderation || 'auto',
    resolutionTier: normalizeParameterFromList(parameters.resolutionTier, resolutionTiers, resolutionTiers[0]),
    n: normalizeProviderCount(parameters.n ?? parameters.count, provider),
    count: normalizeProviderCount(parameters.count ?? parameters.n, provider)
  };
}

export function resolveProviderAdapter({ providerId, authMode } = {}) {
  const provider = getImageProvider(providerId, authMode);
  return {
    id: provider?.id || '',
    label: provider?.label || providerId || '',
    authMode: provider?.authMode || authMode || '',
    type: adapterTypeForProvider(provider),
    provider,
    capabilities: providerCapabilitySnapshot(provider),
    descriptor: provider?.descriptor || null,
    normalizeImageParameters(parameters = {}) {
      return normalizeProviderImageParameters(provider, parameters);
    },
    buildGenerationPlan({ requestedRoute } = {}) {
      const dispatch = resolveImageGenerationDispatch({
        providerId: provider?.id || providerId,
        authMode: provider?.authMode || authMode,
        requestedRoute
      });
      return {
        provider,
        adapterType: adapterTypeForProvider(provider),
        mode: 'generation',
        method: 'POST',
        transport: dispatch.transport,
        routeMode: dispatch.routeMode,
        endpoint: dispatch.endpoint,
        allowImagesFallback: dispatch.allowImagesFallback,
        payloadFormat: dispatch.transport === PROVIDER_ROUTE_MODES.RESPONSES ? 'responses-json' : 'images-json'
      };
    },
    buildEditPlan() {
      const dispatch = resolveImageEditDispatch({
        providerId: provider?.id || providerId,
        authMode: provider?.authMode || authMode
      });
      return {
        provider,
        adapterType: adapterTypeForProvider(provider),
        mode: 'edit',
        method: 'POST',
        transport: dispatch.transport,
        routeMode: dispatch.routeMode,
        endpoint: dispatch.endpoint,
        allowImagesFallback: false,
        payloadFormat: 'multipart'
      };
    }
  };
}
