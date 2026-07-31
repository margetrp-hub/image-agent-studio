const PROVIDER_TYPES = new Set([
  'openai-compatible',
  'newapi-compatible',
  'sub2api-compatible',
  'xai-compatible'
]);

export function normalizeProviderType(value) {
  const type = String(value || '').trim().toLowerCase();
  return PROVIDER_TYPES.has(type) ? type : 'openai-compatible';
}

export function providerProfile(value) {
  const type = normalizeProviderType(value);
  if (type === 'xai-compatible') {
    return {
      type,
      imagePayload: 'xai-images-json',
      videoTransport: 'xai-videos',
      videoCreate: '/videos/generations',
      videoRetrieve: '/videos/{id}',
      videoContent: '/videos/{id}/content'
    };
  }
  if (type === 'newapi-compatible' || type === 'sub2api-compatible') {
    return {
      type,
      imagePayload: 'images-json',
      videoTransport: 'task-json',
      videoCreate: '/video/generations',
      videoRetrieve: '/video/generations/{id}',
      videoContent: ''
    };
  }
  return {
    type,
    imagePayload: 'images-json',
    videoTransport: '',
    videoCreate: '',
    videoRetrieve: '',
    videoContent: ''
  };
}

export function buildProviderImageGenerationBody(profile, job) {
  const body = {
    model: job.model,
    prompt: job.generationPrompt || job.prompt,
    n: 1
  };
  if (profile?.imagePayload !== 'xai-images-json') {
    body.size = job.size;
    body.quality = job.quality;
  }
  return compactObject(body);
}

export function buildProviderVideoGenerationBody(profile, job, imageDataUrl = '') {
  if (!profile?.videoCreate) {
    const error = new Error('STUDIO_PROVIDER_VIDEO_NOT_CONFIGURED');
    error.status = 503;
    throw error;
  }
  if (profile.videoTransport === 'xai-videos') {
    return compactObject({
      model: job.model,
      prompt: job.generationPrompt || job.prompt,
      duration: job.duration,
      image: imageDataUrl
    });
  }
  return compactObject({
    model: job.model,
    prompt: job.generationPrompt || job.prompt,
    image: imageDataUrl,
    duration: job.duration,
    width: job.width,
    height: job.height,
    fps: job.fps,
    n: 1,
    metadata: compactObject({
      aspect_ratio: job.aspectRatio,
      camera_motion: job.motion,
      style: job.videoStyle,
      quality_level: job.videoQuality,
      negative_prompt: job.negativePrompt
    })
  });
}

export function normalizeProviderVideoTask(payload) {
  const source = payload?.data && !Array.isArray(payload.data) ? payload.data : payload || {};
  const dataItem = Array.isArray(payload?.data)
    ? payload.data.find((item) => item?.url || item?.video_url || item?.videoUrl || item?.video?.url)
    : null;
  const video = source?.video || payload?.video || dataItem?.video || {};
  const id = source?.request_id || source?.requestId || source?.task_id || source?.taskId || source?.id || source?.video_id || source?.videoId || '';
  const url = source?.url || source?.video_url || source?.videoUrl || source?.output_url || source?.outputUrl || source?.result_url || source?.resultUrl || video?.url || video?.video_url || dataItem?.url || dataItem?.video_url || '';
  const progress = Number(source?.progress ?? payload?.progress);
  return {
    id: String(id || ''),
    status: normalizeVideoStatus(source?.status || payload?.status),
    url: String(url || ''),
    progress: Number.isFinite(progress) ? progress : undefined,
    error: source?.error || payload?.error || null,
    raw: payload
  };
}

export function applyProviderEndpoint(template, values = {}) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => encodeURIComponent(values[key] || ''));
}

function normalizeVideoStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (['completed', 'succeeded', 'success', 'done', 'finished'].includes(status)) return 'completed';
  if (['failed', 'fail', 'error', 'canceled', 'cancelled'].includes(status)) return 'failed';
  if (['processing', 'running', 'generating', 'in_progress', 'in-progress'].includes(status)) return 'in_progress';
  return status || 'queued';
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}
