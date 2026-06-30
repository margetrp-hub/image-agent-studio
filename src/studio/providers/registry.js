export const PROVIDER_AUTH_MODES = Object.freeze({
  MANUAL: 'manual',
  GATEWAY: 'gateway'
});

export const PROVIDER_ROUTE_MODES = Object.freeze({
  IMAGES: 'images',
  RESPONSES: 'responses',
  AUTO: 'auto'
});

export const PROVIDER_ADAPTER_TYPES = Object.freeze({
  OPENAI_COMPATIBLE_HTTP: 'openai-compatible-http'
});

export const PROVIDER_WORKSPACES = Object.freeze({
  IMAGE: 'image',
  VIDEO: 'video',
  ASSISTANT: 'assistant'
});

export const PROVIDER_ENDPOINT_STYLES = Object.freeze({
  OPENAI_COMPATIBLE: 'openai-compatible'
});

const OPENAI_COMPATIBLE_ROUTES = Object.freeze({
  generations: '/v1/images/generations',
  edits: '/v1/images/edits',
  assistant: '/v1/chat/completions',
  responses: '/v1/responses',
  models: '/v1/models'
});

const OPENAI_IMAGE_CAPABILITIES = Object.freeze({
  textToImage: true,
  imageEdit: true,
  referenceImages: true,
  mask: true,
  streamingImages: false,
  modelSync: false,
  accountKeys: false,
  videoGeneration: false
});

const OPENAI_IMAGE_PARAMETERS = Object.freeze({
  routeMode: PROVIDER_ROUTE_MODES.AUTO,
  sizes: Object.freeze(['1024x1024', '1024x1536', '1536x1024', 'auto']),
  resolutionTiers: Object.freeze(['1k', '2k', '4k']),
  qualities: Object.freeze(['low', 'medium', 'high', 'auto']),
  outputFormats: Object.freeze(['png', 'jpeg', 'webp']),
  countRange: Object.freeze([1, 4]),
  maxReferenceImages: 4,
  defaultImageModel: 'gpt-image-2',
  defaultAssistantModel: 'gpt-5.5'
});

const MANUAL_AUTH_FIELDS = Object.freeze([
  Object.freeze({ key: 'baseUrl', label: 'Base URL', secret: false, required: true }),
  Object.freeze({ key: 'apiKey', label: 'API Key', secret: true, required: true })
]);

const GATEWAY_AUTH_FIELDS = Object.freeze([
  Object.freeze({ key: 'account', label: 'Gateway account session', secret: true, required: true }),
  Object.freeze({ key: 'keyId', label: 'Selected account key', secret: false, required: false })
]);

function freezeModelSlots(slots) {
  return Object.freeze(slots.map((slot) => Object.freeze(slot)));
}

function providerDescriptor({
  endpointStyle = PROVIDER_ENDPOINT_STYLES.OPENAI_COMPATIBLE,
  workspaces = [PROVIDER_WORKSPACES.IMAGE, PROVIDER_WORKSPACES.ASSISTANT],
  authFields = MANUAL_AUTH_FIELDS,
  baseUrlExample = '',
  docsUrl = '',
  modelSync = false,
  modelSlots = [],
  setupHint = '',
  notes = []
} = {}) {
  return Object.freeze({
    endpointStyle,
    workspaces: Object.freeze([...workspaces]),
    authFields,
    baseUrlExample,
    docsUrl,
    modelSync: Object.freeze({
      supported: Boolean(modelSync),
      endpoint: modelSync ? OPENAI_COMPATIBLE_ROUTES.models : ''
    }),
    modelSlots: freezeModelSlots(modelSlots),
    setupHint,
    notes: Object.freeze([...notes])
  });
}

const OPENAI_IMAGE_MODEL_SLOTS = freezeModelSlots([
  { key: 'imageGenerationModel', label: 'Image generation', defaultModel: 'gpt-image-2', route: 'generations' },
  { key: 'imageEditModel', label: 'Image edit / mask', defaultModel: 'gpt-image-2', route: 'edits' },
  { key: 'responsesModel', label: 'Prompt assistant', defaultModel: 'gpt-5.5', route: 'assistant' }
]);

export const IMAGE_PROVIDER_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'official-openai',
    label: 'Official OpenAI',
    authMode: PROVIDER_AUTH_MODES.MANUAL,
    adapterType: PROVIDER_ADAPTER_TYPES.OPENAI_COMPATIBLE_HTTP,
    routes: OPENAI_COMPATIBLE_ROUTES,
    capabilities: Object.freeze({
      ...OPENAI_IMAGE_CAPABILITIES,
      modelSync: true
    }),
    parameters: OPENAI_IMAGE_PARAMETERS,
    descriptor: providerDescriptor({
      authFields: MANUAL_AUTH_FIELDS,
      baseUrlExample: 'https://api.openai.com/v1',
      docsUrl: 'https://platform.openai.com/docs/api-reference/images',
      modelSync: true,
      modelSlots: OPENAI_IMAGE_MODEL_SLOTS,
      notes: ['Official OpenAI API using /v1/images and /v1/models.']
    })
  }),
  Object.freeze({
    id: 'openai-compatible',
    label: 'Custom OpenAI-compatible API',
    authMode: PROVIDER_AUTH_MODES.MANUAL,
    adapterType: PROVIDER_ADAPTER_TYPES.OPENAI_COMPATIBLE_HTTP,
    routes: OPENAI_COMPATIBLE_ROUTES,
    capabilities: Object.freeze({
      ...OPENAI_IMAGE_CAPABILITIES,
      modelSync: true
    }),
    parameters: OPENAI_IMAGE_PARAMETERS,
    descriptor: providerDescriptor({
      authFields: MANUAL_AUTH_FIELDS,
      baseUrlExample: 'https://gateway.example.com/v1',
      modelSync: true,
      modelSlots: OPENAI_IMAGE_MODEL_SLOTS,
      notes: ['Custom OpenAI-compatible endpoint with /v1/models support.']
    })
  }),
  Object.freeze({
    id: 'newapi-compatible',
    label: 'NewAPI Playground Gateway',
    authMode: PROVIDER_AUTH_MODES.MANUAL,
    adapterType: PROVIDER_ADAPTER_TYPES.OPENAI_COMPATIBLE_HTTP,
    routes: OPENAI_COMPATIBLE_ROUTES,
    capabilities: Object.freeze({
      ...OPENAI_IMAGE_CAPABILITIES,
      modelSync: true
    }),
    parameters: OPENAI_IMAGE_PARAMETERS,
    descriptor: providerDescriptor({
      authFields: MANUAL_AUTH_FIELDS,
      baseUrlExample: 'https://newapi.example.com/v1',
      docsUrl: 'https://github.com/QuantumNous/new-api',
      modelSync: true,
      modelSlots: OPENAI_IMAGE_MODEL_SLOTS,
      setupHint: 'Enter the NewAPI public endpoint root or /v1 endpoint. The studio normalizes both to /v1, then syncs models from /v1/models and sends image jobs to /v1/images/generations.',
      notes: ['Use for NewAPI Playground or compatible gateways with OpenAI-style /v1 routes and /v1/models support.']
    })
  }),
  Object.freeze({
    id: 'nano-banana-compatible',
    label: 'Nano Banana / Image Gateway',
    authMode: PROVIDER_AUTH_MODES.MANUAL,
    adapterType: PROVIDER_ADAPTER_TYPES.OPENAI_COMPATIBLE_HTTP,
    routes: OPENAI_COMPATIBLE_ROUTES,
    capabilities: Object.freeze({
      ...OPENAI_IMAGE_CAPABILITIES,
      modelSync: true
    }),
    parameters: Object.freeze({
      ...OPENAI_IMAGE_PARAMETERS,
      defaultImageModel: 'nano-banana'
    }),
    descriptor: providerDescriptor({
      authFields: MANUAL_AUTH_FIELDS,
      baseUrlExample: 'https://image-gateway.example.com/v1',
      modelSync: true,
      modelSlots: freezeModelSlots([
        { key: 'imageGenerationModel', label: 'Image generation', defaultModel: 'nano-banana', route: 'generations' },
        { key: 'imageEditModel', label: 'Image edit / mask', defaultModel: 'nano-banana', route: 'edits' },
        { key: 'responsesModel', label: 'Prompt assistant', defaultModel: 'gpt-5.5', route: 'assistant' }
      ]),
      notes: ['Preset for image-specialized OpenAI-compatible gateways.']
    })
  }),
  Object.freeze({
    id: 'video-compatible',
    label: 'Video Model Gateway',
    authMode: PROVIDER_AUTH_MODES.MANUAL,
    adapterType: PROVIDER_ADAPTER_TYPES.OPENAI_COMPATIBLE_HTTP,
    routes: OPENAI_COMPATIBLE_ROUTES,
    capabilities: Object.freeze({
      ...OPENAI_IMAGE_CAPABILITIES,
      modelSync: true,
      videoGeneration: true
    }),
    parameters: Object.freeze({
      ...OPENAI_IMAGE_PARAMETERS,
      defaultImageModel: 'gpt-image-2',
      defaultVideoModel: 'veo3'
    }),
    descriptor: providerDescriptor({
      authFields: MANUAL_AUTH_FIELDS,
      baseUrlExample: 'https://video-gateway.example.com/v1',
      modelSync: true,
      workspaces: [PROVIDER_WORKSPACES.IMAGE, PROVIDER_WORKSPACES.VIDEO, PROVIDER_WORKSPACES.ASSISTANT],
      modelSlots: freezeModelSlots([
        ...OPENAI_IMAGE_MODEL_SLOTS,
        { key: 'videoModel', label: 'Video generation', defaultModel: 'veo3', route: 'video' }
      ]),
      notes: ['Reserved for compatible video gateways while image routes stay OpenAI-compatible.']
    })
  }),
  Object.freeze({
    id: 'gateway-account',
    label: 'Gateway Account',
    authMode: PROVIDER_AUTH_MODES.GATEWAY,
    adapterType: PROVIDER_ADAPTER_TYPES.OPENAI_COMPATIBLE_HTTP,
    routes: Object.freeze({
      ...OPENAI_COMPATIBLE_ROUTES,
      profile: '/api/v1/user/profile',
      keys: '/api/v1/keys',
      models: '/v1/models'
    }),
    capabilities: Object.freeze({
      ...OPENAI_IMAGE_CAPABILITIES,
      modelSync: true,
      accountKeys: true
    }),
    parameters: OPENAI_IMAGE_PARAMETERS,
    descriptor: providerDescriptor({
      authFields: GATEWAY_AUTH_FIELDS,
      baseUrlExample: '/v1',
      modelSync: true,
      modelSlots: OPENAI_IMAGE_MODEL_SLOTS,
      notes: ['Uses the signed-in gateway account and selected key.']
    })
  })
]);

export const DEFAULT_IMAGE_PROVIDER_ID = 'gateway-account';

export function normalizeProviderId(id, authMode = '') {
  const value = String(id || '').trim();
  if (findImageProvider(value)) return value;
  if (authMode === PROVIDER_AUTH_MODES.MANUAL) return 'openai-compatible';
  return DEFAULT_IMAGE_PROVIDER_ID;
}

export function findImageProvider(id) {
  return IMAGE_PROVIDER_REGISTRY.find((provider) => provider.id === id) || null;
}

export function getImageProvider(id, authMode = '') {
  return findImageProvider(normalizeProviderId(id, authMode)) || findImageProvider(DEFAULT_IMAGE_PROVIDER_ID);
}

export function providerUsesGatewayAccount(providerOrId) {
  const provider = typeof providerOrId === 'string' ? getImageProvider(providerOrId) : providerOrId;
  return provider?.authMode === PROVIDER_AUTH_MODES.GATEWAY;
}

export function providerSupports(providerOrId, capability) {
  const provider = typeof providerOrId === 'string' ? getImageProvider(providerOrId) : providerOrId;
  return Boolean(provider?.capabilities?.[capability]);
}

export function providerRoute(providerOrId, routeName) {
  const provider = typeof providerOrId === 'string' ? getImageProvider(providerOrId) : providerOrId;
  return provider?.routes?.[routeName] || '';
}

export function providerCapabilityDescriptor(providerOrId) {
  const provider = typeof providerOrId === 'string' ? getImageProvider(providerOrId) : providerOrId;
  return provider?.descriptor || providerDescriptor();
}

export function providerModelSlots(providerOrId) {
  return providerCapabilityDescriptor(providerOrId).modelSlots;
}
