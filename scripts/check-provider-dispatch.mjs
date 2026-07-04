import {
  IMAGE_PROVIDER_REGISTRY,
  PROVIDER_ADAPTER_TYPES,
  PROVIDER_ROUTE_MODES,
  PROVIDER_VIDEO_TRANSPORTS,
  PROVIDER_WORKSPACES,
  resolveProviderAdapter,
  resolveImageEditDispatch,
  resolveImageGenerationDispatch,
  resolveVideoGenerationDispatch
} from '../src/studio/providers/index.js';

const EXPECTED_GENERATION_ENDPOINT = '/v1/images/generations';
const EXPECTED_EDIT_ENDPOINT = '/v1/images/edits';
const EXPECTED_RESPONSES_ENDPOINT = '/v1/responses';

const failures = [];
const rows = [];

for (const provider of IMAGE_PROVIDER_REGISTRY) {
  const generation = resolveImageGenerationDispatch({
    providerId: provider.id,
    authMode: provider.authMode,
    requestedRoute: PROVIDER_ROUTE_MODES.AUTO
  });
  const edit = resolveImageEditDispatch({
    providerId: provider.id,
    authMode: provider.authMode
  });
  const video = resolveVideoGenerationDispatch({
    providerId: provider.id,
    authMode: provider.authMode
  });
  const adapter = resolveProviderAdapter({
    providerId: provider.id,
    authMode: provider.authMode
  });
  const generationPlan = adapter.buildGenerationPlan({
    requestedRoute: PROVIDER_ROUTE_MODES.AUTO
  });
  const editPlan = adapter.buildEditPlan();
  const videoPlan = adapter.buildVideoPlan();
  const parameters = provider.parameters || {};
  const descriptor = provider.descriptor || {};

  rows.push({
    provider: provider.id,
    auth: provider.authMode,
    workspaces: Array.isArray(descriptor.workspaces) ? descriptor.workspaces.join(',') : '',
    generation: generation.endpoint,
    generationTransport: generation.transport,
    edit: edit.endpoint,
    editTransport: edit.transport,
    video: video.createEndpoint,
    videoTransport: video.transport,
    generationPlan: generationPlan.endpoint,
    editPlan: editPlan.endpoint,
    videoPlan: videoPlan.endpoint
  });

  if (generation.transport !== PROVIDER_ROUTE_MODES.IMAGES) {
    failures.push(`${provider.id}: auto generation transport must be images, got ${generation.transport}`);
  }
  if (generation.endpoint !== EXPECTED_GENERATION_ENDPOINT) {
    failures.push(`${provider.id}: auto generation endpoint must be ${EXPECTED_GENERATION_ENDPOINT}, got ${generation.endpoint}`);
  }
  if (edit.transport !== PROVIDER_ROUTE_MODES.IMAGES) {
    failures.push(`${provider.id}: edit transport must be images, got ${edit.transport}`);
  }
  if (edit.endpoint !== EXPECTED_EDIT_ENDPOINT) {
    failures.push(`${provider.id}: edit endpoint must be ${EXPECTED_EDIT_ENDPOINT}, got ${edit.endpoint}`);
  }
  if (generationPlan.transport !== PROVIDER_ROUTE_MODES.IMAGES) {
    failures.push(`${provider.id}: adapter auto generation transport must be images, got ${generationPlan.transport}`);
  }
  if (generationPlan.endpoint !== EXPECTED_GENERATION_ENDPOINT) {
    failures.push(`${provider.id}: adapter auto generation endpoint must be ${EXPECTED_GENERATION_ENDPOINT}, got ${generationPlan.endpoint}`);
  }
  if (editPlan.transport !== PROVIDER_ROUTE_MODES.IMAGES) {
    failures.push(`${provider.id}: adapter edit transport must be images, got ${editPlan.transport}`);
  }
  if (editPlan.endpoint !== EXPECTED_EDIT_ENDPOINT) {
    failures.push(`${provider.id}: adapter edit endpoint must be ${EXPECTED_EDIT_ENDPOINT}, got ${editPlan.endpoint}`);
  }
  if (!Object.values(PROVIDER_VIDEO_TRANSPORTS).includes(video.transport)) {
    failures.push(`${provider.id}: video transport is not registered: ${video.transport}`);
  }
  if (videoPlan.transport !== video.transport) {
    failures.push(`${provider.id}: adapter video transport must match dispatch transport`);
  }
  if (videoPlan.endpoint !== video.createEndpoint) {
    failures.push(`${provider.id}: adapter video endpoint must match dispatch endpoint`);
  }
  if (!Array.isArray(parameters.sizes) || !parameters.sizes.length) {
    failures.push(`${provider.id}: provider parameters must declare supported sizes`);
  }
  if (!Array.isArray(parameters.qualities) || !parameters.qualities.length) {
    failures.push(`${provider.id}: provider parameters must declare supported qualities`);
  }
  if (!Array.isArray(parameters.outputFormats) || !parameters.outputFormats.length) {
    failures.push(`${provider.id}: provider parameters must declare output formats`);
  }
  if (!Array.isArray(parameters.resolutionTiers) || !parameters.resolutionTiers.length) {
    failures.push(`${provider.id}: provider parameters must declare resolution tiers`);
  }
  if (!Array.isArray(parameters.countRange) || parameters.countRange.length !== 2 || Number(parameters.countRange[0]) < 1 || Number(parameters.countRange[1]) < Number(parameters.countRange[0])) {
    failures.push(`${provider.id}: provider parameters must declare a valid countRange`);
  }
  if (!parameters.defaultImageModel) {
    failures.push(`${provider.id}: provider parameters must declare defaultImageModel`);
  }
  if (!provider.adapterType) {
    failures.push(`${provider.id}: provider must explicitly declare adapterType`);
  }
  if (!Object.values(PROVIDER_ADAPTER_TYPES).includes(provider.adapterType)) {
    failures.push(`${provider.id}: provider adapterType is not registered: ${provider.adapterType}`);
  }
  if (generationPlan.adapterType !== provider.adapterType) {
    failures.push(`${provider.id}: generation plan adapterType must match registry adapterType`);
  }
  if (editPlan.adapterType !== provider.adapterType) {
    failures.push(`${provider.id}: edit plan adapterType must match registry adapterType`);
  }
  if (!adapter.descriptor) {
    failures.push(`${provider.id}: adapter must expose the provider descriptor`);
  }
  if (!Array.isArray(descriptor.workspaces) || !descriptor.workspaces.includes(PROVIDER_WORKSPACES.IMAGE)) {
    failures.push(`${provider.id}: descriptor must include the image workspace`);
  }
  if (!Array.isArray(descriptor.authFields) || !descriptor.authFields.length) {
    failures.push(`${provider.id}: descriptor must declare authFields`);
  }
  if (!Array.isArray(descriptor.modelSlots) || !descriptor.modelSlots.length) {
    failures.push(`${provider.id}: descriptor must declare modelSlots`);
  }
  if (!descriptor.modelSlots?.some((slot) => slot?.key === 'imageGenerationModel' && slot?.route === 'generations')) {
    failures.push(`${provider.id}: descriptor must include an imageGenerationModel slot for generations`);
  }
  if (!descriptor.modelSlots?.some((slot) => slot?.key === 'imageEditModel' && slot?.route === 'edits')) {
    failures.push(`${provider.id}: descriptor must include an imageEditModel slot for edits`);
  }
  if (provider.capabilities?.modelSync && descriptor.modelSync?.endpoint !== '/v1/models') {
    failures.push(`${provider.id}: modelSync providers must declare /v1/models as the sync endpoint`);
  }
  if (provider.capabilities?.videoGeneration && !descriptor.workspaces.includes(PROVIDER_WORKSPACES.VIDEO)) {
    failures.push(`${provider.id}: videoGeneration capability must include the video workspace`);
  }
  if (provider.capabilities?.videoGeneration && !descriptor.modelSlots?.some((slot) => slot?.key === 'videoModel' && slot?.route === 'video')) {
    failures.push(`${provider.id}: videoGeneration capability must include a videoModel slot`);
  }
  if (provider.capabilities?.videoGeneration && !provider.routes?.videoCreate) {
    failures.push(`${provider.id}: videoGeneration capability must declare a videoCreate route`);
  }
  if (provider.capabilities?.videoGeneration && !parameters.defaultVideoModel) {
    failures.push(`${provider.id}: videoGeneration capability must declare defaultVideoModel`);
  }
}

const explicitResponses = resolveImageGenerationDispatch({
  providerId: 'openai-compatible',
  authMode: 'manual',
  requestedRoute: PROVIDER_ROUTE_MODES.RESPONSES
});
const explicitResponsesPlan = resolveProviderAdapter({
  providerId: 'openai-compatible',
  authMode: 'manual'
}).buildGenerationPlan({
  requestedRoute: PROVIDER_ROUTE_MODES.RESPONSES
});

rows.push({
  provider: 'openai-compatible',
  auth: 'manual',
  generation: explicitResponses.endpoint,
  generationTransport: explicitResponses.transport,
  edit: '-',
  editTransport: '-',
  generationPlan: explicitResponsesPlan.endpoint,
  editPlan: '-',
  note: 'explicit responses compatibility'
});

if (explicitResponses.transport !== PROVIDER_ROUTE_MODES.RESPONSES) {
  failures.push(`explicit responses transport must be responses, got ${explicitResponses.transport}`);
}
if (explicitResponses.endpoint !== EXPECTED_RESPONSES_ENDPOINT) {
  failures.push(`explicit responses endpoint must be ${EXPECTED_RESPONSES_ENDPOINT}, got ${explicitResponses.endpoint}`);
}
if (explicitResponsesPlan.transport !== PROVIDER_ROUTE_MODES.RESPONSES) {
  failures.push(`adapter explicit responses transport must be responses, got ${explicitResponsesPlan.transport}`);
}
if (explicitResponsesPlan.endpoint !== EXPECTED_RESPONSES_ENDPOINT) {
  failures.push(`adapter explicit responses endpoint must be ${EXPECTED_RESPONSES_ENDPOINT}, got ${explicitResponsesPlan.endpoint}`);
}

console.table(rows);

if (failures.length) {
  console.error(`Provider dispatch contract failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('Provider dispatch contract passed.');
