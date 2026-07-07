export const PROVIDER_AUTH_MODES = Object.freeze({
  MANUAL: 'manual',
  GATEWAY: 'gateway'
});

export const PROVIDER_ROUTE_MODES = Object.freeze({
  IMAGES: 'images',
  RESPONSES: 'responses',
  AUTO: 'auto'
});

export const PROVIDER_VIDEO_TRANSPORTS = Object.freeze({
  TASK_JSON: 'task-json',
  OPENAI_VIDEOS: 'openai-videos'
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
  models: '/v1/models',
  videoCreate: '/v1/videos',
  videoRetrieve: '/v1/videos/{id}',
  videoContent: '/v1/videos/{id}/content'
});

const VIDEO_TASK_ROUTES = Object.freeze({
  videoCreate: '/v1/video/generations',
  videoRetrieve: '/v1/video/generations/{id}',
  videoContent: ''
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
  defaultAssistantModel: 'gpt-5.5',
  defaultVideoModel: 'sora-2',
  videoTransport: PROVIDER_VIDEO_TRANSPORTS.OPENAI_VIDEOS
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

const OPENAI_VIDEO_MODEL_SLOT = Object.freeze({ key: 'videoModel', label: 'Video generation', defaultModel: 'sora-2', route: 'video' });
const TASK_VIDEO_MODEL_SLOT = Object.freeze({ key: 'videoModel', label: 'Video generation', defaultModel: 'veo3', route: 'video' });

export const IMAGE_PROVIDER_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'official-openai',
    label: 'Official OpenAI',
    authMode: PROVIDER_AUTH_MODES.MANUAL,
    adapterType: PROVIDER_ADAPTER_TYPES.OPENAI_COMPATIBLE_HTTP,
    routes: OPENAI_COMPATIBLE_ROUTES,
    capabilities: Object.freeze({
      ...OPENAI_IMAGE_CAPABILITIES,
      modelSync: true,
      videoGeneration: true
    }),
    parameters: OPENAI_IMAGE_PARAMETERS,
    descriptor: providerDescriptor({
      authFields: MANUAL_AUTH_FIELDS,
      baseUrlExample: 'https://api.openai.com/v1',
      docsUrl: 'https://platform.openai.com/docs/api-reference/videos',
      modelSync: true,
      workspaces: [PROVIDER_WORKSPACES.IMAGE, PROVIDER_WORKSPACES.VIDEO, PROVIDER_WORKSPACES.ASSISTANT],
      modelSlots: freezeModelSlots([...OPENAI_IMAGE_MODEL_SLOTS, OPENAI_VIDEO_MODEL_SLOT]),
      notes: ['Official OpenAI API using /v1/images, /v1/videos, and /v1/models.']
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
      modelSync: true,
      videoGeneration: true
    }),
    parameters: OPENAI_IMAGE_PARAMETERS,
    descriptor: providerDescriptor({
      authFields: MANUAL_AUTH_FIELDS,
      baseUrlExample: 'https://gateway.example.com/v1',
      modelSync: true,
      workspaces: [PROVIDER_WORKSPACES.IMAGE, PROVIDER_WORKSPACES.VIDEO, PROVIDER_WORKSPACES.ASSISTANT],
      modelSlots: freezeModelSlots([...OPENAI_IMAGE_MODEL_SLOTS, OPENAI_VIDEO_MODEL_SLOT]),
      notes: ['Custom OpenAI-compatible endpoint with /v1/images, /v1/videos, and /v1/models support.']
    })
  }),
  Object.freeze({
    id: 'newapi-compatible',
    label: 'NewAPI Playground Gateway',
    authMode: PROVIDER_AUTH_MODES.MANUAL,
    adapterType: PROVIDER_ADAPTER_TYPES.OPENAI_COMPATIBLE_HTTP,
    routes: Object.freeze({
      ...OPENAI_COMPATIBLE_ROUTES,
      ...VIDEO_TASK_ROUTES
    }),
    capabilities: Object.freeze({
      ...OPENAI_IMAGE_CAPABILITIES,
      modelSync: true,
      videoGeneration: true
    }),
    parameters: Object.freeze({
      ...OPENAI_IMAGE_PARAMETERS,
      videoTransport: PROVIDER_VIDEO_TRANSPORTS.TASK_JSON,
      defaultVideoModel: 'veo3'
    }),
    descriptor: providerDescriptor({
      authFields: MANUAL_AUTH_FIELDS,
      baseUrlExample: 'https://newapi.example.com/v1',
      docsUrl: 'https://github.com/QuantumNous/new-api',
      modelSync: true,
      workspaces: [PROVIDER_WORKSPACES.IMAGE, PROVIDER_WORKSPACES.VIDEO, PROVIDER_WORKSPACES.ASSISTANT],
      modelSlots: freezeModelSlots([...OPENAI_IMAGE_MODEL_SLOTS, TASK_VIDEO_MODEL_SLOT]),
      setupHint: 'Enter the NewAPI public endpoint root or /v1 endpoint. The studio normalizes both to /v1, syncs models, sends image jobs to /v1/images/generations, and sends video jobs to /v1/video/generations when a video model is selected.',
      notes: ['Use for NewAPI Playground or compatible gateways with OpenAI-style /v1 routes, /v1/models support, and task-style video generation.']
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
    routes: Object.freeze({
      ...OPENAI_COMPATIBLE_ROUTES,
      ...VIDEO_TASK_ROUTES
    }),
    capabilities: Object.freeze({
      ...OPENAI_IMAGE_CAPABILITIES,
      modelSync: true,
      videoGeneration: true
    }),
    parameters: Object.freeze({
      ...OPENAI_IMAGE_PARAMETERS,
      defaultImageModel: 'gpt-image-2',
      defaultVideoModel: 'veo3',
      videoTransport: PROVIDER_VIDEO_TRANSPORTS.TASK_JSON
    }),
    descriptor: providerDescriptor({
      authFields: MANUAL_AUTH_FIELDS,
      baseUrlExample: 'https://video-gateway.example.com/v1',
      modelSync: true,
      workspaces: [PROVIDER_WORKSPACES.IMAGE, PROVIDER_WORKSPACES.VIDEO, PROVIDER_WORKSPACES.ASSISTANT],
      modelSlots: freezeModelSlots([
        ...OPENAI_IMAGE_MODEL_SLOTS,
        TASK_VIDEO_MODEL_SLOT
      ]),
      notes: ['Task-style compatible video gateways while image routes stay OpenAI-compatible.']
    })
  }),
  Object.freeze({
    id: 'gateway-account',
    label: 'Gateway Account',
    authMode: PROVIDER_AUTH_MODES.GATEWAY,
    adapterType: PROVIDER_ADAPTER_TYPES.OPENAI_COMPATIBLE_HTTP,
    routes: Object.freeze({
      ...OPENAI_COMPATIBLE_ROUTES,
      ...VIDEO_TASK_ROUTES,
      profile: '/api/v1/user/profile',
      keys: '/api/v1/keys',
      models: '/v1/models'
    }),
    capabilities: Object.freeze({
      ...OPENAI_IMAGE_CAPABILITIES,
      modelSync: true,
      accountKeys: true,
      videoGeneration: true
    }),
    parameters: Object.freeze({
      ...OPENAI_IMAGE_PARAMETERS,
      defaultVideoModel: 'veo3',
      videoTransport: PROVIDER_VIDEO_TRANSPORTS.TASK_JSON
    }),
    descriptor: providerDescriptor({
      authFields: GATEWAY_AUTH_FIELDS,
      baseUrlExample: '/v1',
      modelSync: true,
      workspaces: [PROVIDER_WORKSPACES.IMAGE, PROVIDER_WORKSPACES.VIDEO, PROVIDER_WORKSPACES.ASSISTANT],
      modelSlots: freezeModelSlots([...OPENAI_IMAGE_MODEL_SLOTS, TASK_VIDEO_MODEL_SLOT]),
      notes: ['Uses the signed-in gateway account and selected key.']
    })
  })
]);

export const DEFAULT_IMAGE_PROVIDER_ID = 'gateway-account';
const PROVIDER_DISPLAY_ORDER = Object.freeze([
  'official-openai',
  'openai-compatible',
  'newapi-compatible',
  'gateway-account',
  'nano-banana-compatible',
  'video-compatible'
]);

export function normalizeProviderId(id, authMode = '') {
  const value = String(id || '').trim();
  if (findImageProvider(value)) return value;
  if (authMode === PROVIDER_AUTH_MODES.MANUAL) return 'openai-compatible';
  return DEFAULT_IMAGE_PROVIDER_ID;
}

export function findImageProvider(id) {
  return IMAGE_PROVIDER_REGISTRY.find((provider) => provider.id === id) || null;
}

export function orderedImageProviders() {
  return [...IMAGE_PROVIDER_REGISTRY].sort((left, right) => {
    const leftIndex = PROVIDER_DISPLAY_ORDER.indexOf(left.id);
    const rightIndex = PROVIDER_DISPLAY_ORDER.indexOf(right.id);
    const safeLeft = leftIndex >= 0 ? leftIndex : PROVIDER_DISPLAY_ORDER.length;
    const safeRight = rightIndex >= 0 ? rightIndex : PROVIDER_DISPLAY_ORDER.length;
    return safeLeft - safeRight || left.label.localeCompare(right.label);
  });
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
