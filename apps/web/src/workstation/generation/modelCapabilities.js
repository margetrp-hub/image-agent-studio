const IMAGE_MODEL_PATTERN = /(?:^|[^a-z0-9])(?:gpt-)?image[-_a-z0-9]*\d|(?:^|[^a-z0-9])dall[-_a-z0-9]*\d|grok[-_.]imagine[-_.]image|(?:^|[-_.])(seedream|nano[-_.]?banana|flux|ideogram|recraft|stable[-_.]?diffusion|sdxl|sd3|jimeng|doubao[-_.]?image|gemini[-_.a-z0-9]*image|imagen|midjourney|mj|firefly|leonardo|playground|kolors|qwen[-_.]?image|hunyuan[-_.]?image|hidream|photon|cogview)(?:[-_.0-9]|$)/i;
const VIDEO_MODEL_PATTERN = /grok[-_.]imagine[-_.]video|(?:^|[-_.])(video|sora|veo|kling|runway|luma|hailuo|jimeng|seedance|wan|vidu|minimax|hunyuan|pixverse|pika|dreamina)(?:[-_.0-9]|$)/i;
const IMAGE_MODEL_NAMES = ['即梦', '豆包图片', '豆包图像', '通义万相', '混元图片', '混元图像'];
const VIDEO_MODEL_NAMES = ['即梦', '可灵', '海螺', '豆包视频', '通义万相视频'];

export function modelLooksLikeImage(item) {
  const raw = item?.raw || {};
  const source = [
    item?.id, item?.label, item?.type, item?.category, item?.mode, item?.modality, item?.endpoint,
    raw.id, raw.model, raw.name, raw.type, raw.category, raw.mode, raw.modality, raw.endpoint, raw.group, raw.platform,
    ...(Array.isArray(item?.capabilities) ? item.capabilities : []),
    ...(Array.isArray(raw.capabilities) ? raw.capabilities : [])
  ].filter(Boolean).join(' ');
  return IMAGE_MODEL_PATTERN.test(source) || source.toLowerCase().includes('images/edits') || IMAGE_MODEL_NAMES.some((name) => source.includes(name));
}

export function modelLooksLikeVideo(item) {
  const raw = item?.raw || {};
  const values = [
    item?.id, item?.label, item?.type, item?.category, item?.mode, item?.modality, item?.endpoint,
    raw.id, raw.model, raw.name, raw.type, raw.category, raw.mode, raw.modality, raw.endpoint
  ].map((value) => String(value || '').toLowerCase());
  const capabilities = [
    item?.capabilities, item?.capability, raw.capabilities, raw.capability, raw.features,
    raw.supported_generation_types, raw.supportedGenerationTypes
  ].flatMap((value) => Array.isArray(value) ? value : value ? [value] : []).map((value) => String(value || '').toLowerCase());
  return [...values, ...capabilities].some((value) => (
    value === 'video'
    || value === 'videos'
    || value.includes('video_generation')
    || value.includes('video-generation')
    || VIDEO_MODEL_PATTERN.test(value)
    || VIDEO_MODEL_NAMES.some((name) => value.includes(name.toLowerCase()))
  ));
}

export function modelsForMode(models, mode) {
  return models.filter((model) => model?.invocations?.[mode]?.status === 'verified');
}

export function imageOptionsForModel(providerType, model, adapter = '') {
  const id = String(model || '').toLowerCase();
  if (adapter === 'xai-images' || providerType === 'xai-compatible') {
    return { sizes: [], qualities: [], counts: [1, 2, 3, 4] };
  }
  if (adapter === 'openai-chat-images') {
    return { sizes: ['1024x1024', '1536x1024', '1024x1536'], qualities: [], counts: [1] };
  }
  if (id.includes('dall-e-3') || id.includes('dall_e_3')) {
    return { sizes: ['1024x1024', '1792x1024', '1024x1792'], qualities: ['standard', 'hd'], counts: [1] };
  }
  if (id.includes('dall-e-2') || id.includes('dall_e_2')) {
    return { sizes: ['256x256', '512x512', '1024x1024'], qualities: ['standard'], counts: [1, 2, 3, 4] };
  }
  return {
    sizes: ['1024x1024', '1536x1024', '1024x1536'],
    qualities: ['auto', 'low', 'medium', 'high'],
    counts: [1, 2, 3, 4]
  };
}

export function videoOptionsForModel(providerType, model, adapter = '') {
  const id = String(model || '').toLowerCase();
  if (adapter === 'xai-videos') {
    return { aspects: ['16:9', '9:16', '1:1'], durations: Array.from({ length: 15 }, (_, index) => index + 1), fps: [] };
  }
  if (adapter === 'openai-videos' || (providerType === 'openai-compatible' && id.includes('sora'))) {
    return { aspects: ['16:9', '9:16'], durations: [4, 8, 12], fps: [] };
  }
  return { aspects: ['16:9', '9:16', '1:1'], durations: [4, 5, 8, 10, 12], fps: [24, 30] };
}
