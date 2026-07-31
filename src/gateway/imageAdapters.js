import { resolveProviderAdapter } from '../studio/providers/index.js';

export function compactGatewayObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')
  );
}

export function isDirectImageResponsesModel(value) {
  const model = String(value || '').toLowerCase();
  return /(^|[^a-z0-9])(gpt-)?image[-_a-z0-9]*\d/.test(model)
    || /(^|[^a-z0-9])dall[-_a-z0-9]*\d/.test(model);
}

export function responsesImageParams({ size, quality, outputFormat, moderation }) {
  return compactGatewayObject({
    size: size || 'auto',
    quality: quality || 'auto',
    output_format: outputFormat || 'png',
    moderation: moderation || 'auto'
  });
}

export function providerDefaultModel(provider, key, fallback = '') {
  const slotDefault = provider?.descriptor?.modelSlots?.find((slot) => slot?.key === key)?.defaultModel;
  if (slotDefault) return slotDefault;
  if (key === 'imageGenerationModel' || key === 'imageEditModel') return provider?.parameters?.defaultImageModel || fallback;
  if (key === 'videoModel') return provider?.parameters?.defaultVideoModel || fallback;
  if (key === 'responsesModel') return provider?.parameters?.defaultAssistantModel || fallback;
  return fallback;
}

export function resolveImageAdapterContext({ providerSettings, route, parameters = {} } = {}) {
  const explicitRoute = route === undefined || route === null || route === '' ? '' : route;
  const adapter = resolveProviderAdapter({
    providerId: providerSettings?.providerId,
    authMode: providerSettings?.apiKeySource
  });
  const normalizedParameters = adapter.normalizeImageParameters(parameters);
  const plan = adapter.buildGenerationPlan({
    requestedRoute: explicitRoute || providerSettings?.route || 'auto'
  });
  return { adapter, normalizedParameters, plan };
}

export function resolveImageEditAdapterContext({ providerSettings, parameters = {} } = {}) {
  const adapter = resolveProviderAdapter({
    providerId: providerSettings?.providerId,
    authMode: providerSettings?.apiKeySource
  });
  return {
    adapter,
    normalizedParameters: adapter.normalizeImageParameters(parameters),
    plan: adapter.buildEditPlan()
  };
}

export function selectImageGenerationModel({ requestedModel, providerSettings, provider, fallback = 'gpt-image-2' } = {}) {
  return String(
    requestedModel
      || providerSettings?.imageGenerationModel
      || providerDefaultModel(provider, 'imageGenerationModel', fallback)
  ).trim();
}

export function selectImageEditModel({ requestedModel, providerSettings, provider, fallback = 'gpt-image-2' } = {}) {
  return String(
    requestedModel
      || providerSettings?.imageEditModel
      || providerSettings?.imageGenerationModel
      || providerDefaultModel(provider, 'imageEditModel', fallback)
  ).trim();
}

export function createImagesGenerationBody({ model, prompt, size, quality, payloadFormat = 'images-json' }) {
  if (payloadFormat === 'xai-images-json') {
    return compactGatewayObject({ model, prompt, n: 1 });
  }
  return {
    model,
    prompt,
    size,
    quality,
    n: 1
  };
}

export function createResponsesImageBody({
  model,
  input,
  directImageModel,
  partialImageCount,
  imageParams
}) {
  if (directImageModel) {
    return {
      model,
      input,
      ...imageParams
    };
  }

  return {
    model,
    input,
    stream: true,
    tools: [
      {
        type: 'image_generation',
        partial_images: partialImageCount,
        ...imageParams
      }
    ]
  };
}

export function createImageEditForm({
  model,
  prompt,
  size,
  quality,
  outputFormat,
  moderation,
  n,
  images = [],
  mask
}) {
  const form = new FormData();
  form.set('model', model);
  form.set('prompt', prompt);
  form.set('size', size);
  form.set('quality', quality);
  form.set('output_format', outputFormat);
  form.set('moderation', moderation);
  form.set('n', String(n));
  images.forEach((file) => form.append('image', file));
  if (mask) form.set('mask', mask);
  return form;
}

export function shouldFallbackToImagesTransport(error) {
  const status = Number(error?.status || 0);
  if ([404, 405, 415, 502, 503, 504].includes(status)) return true;

  const message = String(
    error?.payload?.error?.message
      || error?.payload?.message
      || error?.message
      || ''
  ).toLowerCase();

  return (
    message.includes('tool_choice')
    || message.includes('image_generation')
    || message.includes('responses')
    || message.includes('stream')
    || message.includes('sse')
  );
}
