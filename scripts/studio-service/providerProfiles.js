const PROVIDER_TYPES = new Set([
  'openai-compatible',
  'newapi-compatible',
  'sub2api-compatible',
  'xai-compatible'
]);

export const PROVIDER_INVOCATION_ADAPTERS = Object.freeze({
  OPENAI_IMAGES: 'openai-images',
  OPENAI_CHAT_IMAGES: 'openai-chat-images',
  XAI_IMAGES: 'xai-images',
  OPENAI_VIDEOS: 'openai-videos',
  XAI_VIDEOS: 'xai-videos',
  NEWAPI_TASK_VIDEO: 'newapi-task-video'
});

export function normalizeProviderType(value) {
  const type = String(value || '').trim().toLowerCase();
  return PROVIDER_TYPES.has(type) ? type : 'openai-compatible';
}

export function providerProfile(value) {
  const type = normalizeProviderType(value);
  return { type };
}

export function resolveProviderInvocation(providerType, modelId, mode) {
  const type = normalizeProviderType(providerType);
  const model = String(modelId || '').trim().toLowerCase();
  if (!model) return unsupported('Model id is empty');

  if (mode === 'image') {
    if (type === 'xai-compatible' && model.includes('grok') && model.includes('image')) {
      return verified(PROVIDER_INVOCATION_ADAPTERS.XAI_IMAGES);
    }
    if (type === 'newapi-compatible' && isChatImageModel(model)) {
      return verified(PROVIDER_INVOCATION_ADAPTERS.OPENAI_CHAT_IMAGES);
    }
    if (['openai-compatible', 'newapi-compatible', 'sub2api-compatible'].includes(type) && isDirectImageModel(model)) {
      return verified(PROVIDER_INVOCATION_ADAPTERS.OPENAI_IMAGES);
    }
  }

  if (mode === 'video') {
    if (type === 'xai-compatible' && model.includes('grok') && model.includes('video')) {
      return verified(PROVIDER_INVOCATION_ADAPTERS.XAI_VIDEOS);
    }
    if (['openai-compatible', 'newapi-compatible', 'sub2api-compatible'].includes(type) && model.includes('sora')) {
      return verified(PROVIDER_INVOCATION_ADAPTERS.OPENAI_VIDEOS);
    }
    if (['newapi-compatible', 'sub2api-compatible'].includes(type) && isTaskVideoModel(model)) {
      return verified(PROVIDER_INVOCATION_ADAPTERS.NEWAPI_TASK_VIDEO);
    }
  }

  return unsupported('No verified invocation adapter for this provider and model');
}

export function annotateProviderModels(payload, providerType) {
  const annotate = (item) => {
    const model = typeof item === 'string' ? { id: item } : { ...item };
    const id = model.id || model.name || model.model || '';
    return {
      ...model,
      discoveryStatus: 'discovered',
      invocations: {
        image: resolveProviderInvocation(providerType, id, 'image'),
        video: resolveProviderInvocation(providerType, id, 'video')
      }
    };
  };
  if (Array.isArray(payload)) return payload.map(annotate);
  if (Array.isArray(payload?.data)) return { ...payload, data: payload.data.map(annotate) };
  return payload;
}

export function buildProviderImageGenerationPlan(profile, job, imageDataUrls = []) {
  const decision = requireVerifiedInvocation(profile, job, 'image');
  const prompt = job.generationPrompt || job.prompt;
  if (decision.adapter === PROVIDER_INVOCATION_ADAPTERS.OPENAI_CHAT_IMAGES) {
    const references = imageDataUrls.filter(Boolean);
    const body = {
      model: job.model,
      messages: [{
        role: 'user',
        content: references.length
          ? [
              { type: 'text', text: prompt },
              ...references.map((url) => ({ type: 'image_url', image_url: { url } }))
            ]
          : prompt
      }],
      stream: false
    };
    const aspectRatio = imageAspectRatio(job.size);
    if (aspectRatio) {
      body.extra_body = { google: { image_config: { aspect_ratio: aspectRatio } } };
    }
    return { ...decision, endpoint: '/chat/completions', payloadFormat: 'json', body };
  }

  if (decision.adapter === PROVIDER_INVOCATION_ADAPTERS.XAI_IMAGES) {
    return {
      ...decision,
      endpoint: '/images/generations',
      payloadFormat: 'json',
      body: compactObject({
        model: job.model,
        prompt,
        n: 1,
        response_format: 'b64_json',
        aspect_ratio: imageAspectRatio(job.size)
      })
    };
  }

  validateOpenAIImageParameters(job);
  return {
    ...decision,
    endpoint: '/images/generations',
    payloadFormat: 'json',
    body: compactObject({ model: job.model, prompt, size: job.size, quality: job.quality, n: 1 })
  };
}

export function buildProviderImageEditPlan(profile, job, imageDataUrls = []) {
  const decision = requireVerifiedInvocation(profile, job, 'image');
  if (decision.adapter === PROVIDER_INVOCATION_ADAPTERS.OPENAI_CHAT_IMAGES) {
    return buildProviderImageGenerationPlan(profile, job, imageDataUrls);
  }
  const model = String(job.model || '').toLowerCase();
  if (model.includes('dall-e-3') || model.includes('dall_e_3')) {
    throw providerError('IMAGE_EDIT_MODEL_NOT_SUPPORTED');
  }
  validateOpenAIImageParameters(job);
  return {
    ...decision,
    endpoint: '/images/edits',
    payloadFormat: 'multipart',
    body: compactObject({
      model: job.model,
      prompt: job.generationPrompt || job.prompt,
      size: decision.adapter === PROVIDER_INVOCATION_ADAPTERS.OPENAI_IMAGES ? job.size : undefined,
      quality: decision.adapter === PROVIDER_INVOCATION_ADAPTERS.OPENAI_IMAGES ? job.quality : undefined,
      output_format: decision.adapter === PROVIDER_INVOCATION_ADAPTERS.OPENAI_IMAGES ? job.outputFormat : undefined,
      moderation: decision.adapter === PROVIDER_INVOCATION_ADAPTERS.OPENAI_IMAGES ? job.moderation : undefined,
      n: job.count || 1
    })
  };
}

export function buildProviderVideoGenerationPlan(profile, job, imageDataUrl = '') {
  const decision = requireVerifiedInvocation(profile, job, 'video');
  const prompt = job.generationPrompt || job.prompt;

  if (decision.adapter === PROVIDER_INVOCATION_ADAPTERS.OPENAI_VIDEOS) {
    validateOpenAIVideoParameters(job);
    return {
      ...decision,
      endpoint: '/videos',
      retrieveEndpoint: '/videos/{id}',
      contentEndpoint: '/videos/{id}/content',
      payloadFormat: 'multipart',
      body: compactObject({ model: job.model, prompt, seconds: job.duration, size: videoSize(job) })
    };
  }

  if (decision.adapter === PROVIDER_INVOCATION_ADAPTERS.XAI_VIDEOS) {
    if (Number(job.duration) > 15) throw providerError('VIDEO_DURATION_NOT_SUPPORTED');
    return {
      ...decision,
      endpoint: '/videos/generations',
      retrieveEndpoint: '/videos/{id}',
      contentEndpoint: '/videos/{id}/content',
      payloadFormat: 'json',
      body: compactObject({
        model: job.model,
        prompt,
        duration: job.duration,
        aspect_ratio: job.aspectRatio || videoAspectRatio(job),
        resolution: videoResolution(job),
        image: imageDataUrl
      })
    };
  }

  return {
    ...decision,
    endpoint: '/video/generations',
    retrieveEndpoint: '/video/generations/{id}',
    contentEndpoint: '',
    payloadFormat: 'json',
    body: compactObject({
      model: job.model,
      prompt,
      size: videoSize(job),
      duration: job.duration,
      image: imageDataUrl,
      images: imageDataUrl ? [imageDataUrl] : undefined,
      n: 1,
      metadata: compactObject({
        aspect_ratio: job.aspectRatio,
        camera_motion: job.motion,
        style: job.videoStyle,
        quality_level: job.videoQuality,
        negative_prompt: job.negativePrompt
      })
    })
  };
}

export function normalizeProviderImageItems(adapter, payload) {
  if (adapter !== PROVIDER_INVOCATION_ADAPTERS.OPENAI_CHAT_IMAGES) {
    return Array.isArray(payload?.data) ? payload.data : [];
  }
  const content = payload?.choices?.[0]?.message?.content;
  const items = [];
  const parts = Array.isArray(content) ? content : [content];
  const texts = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      texts.push(part);
      continue;
    }
    if (part?.text) texts.push(String(part.text));
    const url = part?.image_url?.url || part?.image_url || part?.url;
    if (typeof url === 'string') appendImageItem(items, url);
    const inline = part?.inline_data || part?.inlineData;
    if (inline?.data) items.push({ b64_json: String(inline.data).replace(/\s+/g, '') });
  }
  const pattern = /!\[[^\]]*\]\((data:image\/[^;\s)]+;base64,([A-Za-z0-9+/=\s]+)|https?:\/\/[^\s)]+)\)/g;
  for (const value of texts) {
    for (const match of value.matchAll(pattern)) {
      appendImageItem(items, match[1], match[2]);
    }
  }
  return items;
}

export function normalizeProviderVideoTask(payload) {
  const source = payload?.data && !Array.isArray(payload.data) ? payload.data : payload || {};
  const dataItem = Array.isArray(payload?.data)
    ? payload.data.find((item) => item?.url || item?.video_url || item?.videoUrl || item?.video?.url)
    : null;
  const video = source?.video || payload?.video || dataItem?.video || {};
  const id = source?.request_id || source?.requestId || source?.task_id || source?.taskId || source?.id || source?.video_id || source?.videoId || '';
  const url = source?.url || source?.video_url || source?.videoUrl || source?.output_url || source?.outputUrl || source?.result_url || source?.resultUrl || source?.metadata?.url || video?.url || video?.video_url || dataItem?.url || dataItem?.video_url || '';
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

function appendImageItem(items, rawUrl, base64 = '') {
  const url = String(rawUrl || '');
  if (!url) return;
  if (url.startsWith('data:image/')) {
    const payload = base64 || url.split(',', 2)[1] || '';
    if (payload) items.push({ b64_json: payload.replace(/\s+/g, '') });
    return;
  }
  if (/^https?:\/\//i.test(url)) items.push({ url });
}

function verified(adapter) {
  return { status: 'verified', adapter };
}

function unsupported(reason) {
  return { status: 'unsupported', reason };
}

function requireVerifiedInvocation(profile, job, mode) {
  const decision = resolveProviderInvocation(profile?.type, job?.model, mode);
  if (decision.status !== 'verified') throw providerError('MODEL_INVOCATION_NOT_VERIFIED');
  return decision;
}

function providerError(code) {
  const error = new Error(code);
  error.status = 400;
  return error;
}

function containsAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function isDirectImageModel(model) {
  return containsAny(model, [
    'gpt-image', 'dall-e', 'dall_e', 'grok-imagine-image', 'imagen-', 'seedream', 'flux',
    'ideogram', 'recraft', 'stable-diffusion', 'stable_diffusion', 'sdxl', 'sd3',
    'doubao-image', 'doubao_image', 'qwen-image', 'qwen_image', 'cogview', 'kolors',
    'hunyuan-image', 'hunyuan_image'
  ]) || isJimengImageModel(model);
}

function isChatImageModel(model) {
  return model.includes('nano-banana') || model.includes('nano_banana') || (model.includes('gemini') && model.includes('image'));
}

function isTaskVideoModel(model) {
  return containsAny(model, [
    'veo', 'kling', 'seedance', 'vidu', 'hailuo', 'hunyuan-video', 'hunyuan_video',
    'pixverse', 'pika', 'runway', 'dreamina'
  ]) || isJimengVideoModel(model)
    || ((model.includes('wan') || model.includes('minimax') || model.includes('luma')) && hasVideoMarker(model));
}

function isJimengImageModel(model) {
  return model.includes('jimeng')
    && !hasVideoMarker(model)
    && containsAny(model, ['high_aes', 'image', 'imagegen']);
}

function isJimengVideoModel(model) {
  return model.includes('jimeng') && (hasVideoMarker(model) || model.includes('v30'));
}

function hasVideoMarker(model) {
  return containsAny(model, ['video', 't2v', 'i2v', 'ti2v', 'vgfm']);
}

function imageAspectRatio(size) {
  if (size === '1024x1024') return '1:1';
  if (['1536x1024', '1792x1024'].includes(size)) return '3:2';
  if (['1024x1536', '1024x1792'].includes(size)) return '2:3';
  return '';
}

function videoSize(job) {
  const width = Number(job?.width || 0);
  const height = Number(job?.height || 0);
  return width > 0 && height > 0 ? `${width}x${height}` : '';
}

function videoAspectRatio(job) {
  const size = videoSize(job);
  if (size === '1280x720') return '16:9';
  if (size === '720x1280') return '9:16';
  if (job?.width && job.width === job.height) return '1:1';
  return '';
}

function videoResolution(job) {
  const shortSide = Math.min(Number(job?.width || 0), Number(job?.height || 0));
  if (shortSide >= 1080) return '1080p';
  if (shortSide >= 720) return '720p';
  return shortSide > 0 ? '480p' : '';
}

function validateOpenAIVideoParameters(job) {
  if (![4, 8, 12].includes(Number(job.duration))) throw providerError('VIDEO_DURATION_NOT_SUPPORTED');
  const size = videoSize(job);
  if (size && !['720x1280', '1280x720', '1024x1792', '1792x1024'].includes(size)) {
    throw providerError('VIDEO_SIZE_NOT_SUPPORTED');
  }
}

function validateOpenAIImageParameters(job) {
  const model = String(job.model || '').toLowerCase();
  const size = String(job.size || '');
  const quality = String(job.quality || '').toLowerCase();
  if (model.includes('dall-e-3') || model.includes('dall_e_3')) {
    if (Number(job.count || 1) > 1) throw providerError('IMAGE_COUNT_NOT_SUPPORTED');
    if (size && !['1024x1024', '1792x1024', '1024x1792'].includes(size)) {
      throw providerError('IMAGE_SIZE_NOT_SUPPORTED');
    }
    if (quality && !['standard', 'hd'].includes(quality)) {
      throw providerError('IMAGE_QUALITY_NOT_SUPPORTED');
    }
  }
  if (model.includes('gpt-image')) {
    if (size && !['auto', '1024x1024', '1536x1024', '1024x1536'].includes(size)) {
      throw providerError('IMAGE_SIZE_NOT_SUPPORTED');
    }
    if (quality && !['auto', 'low', 'medium', 'high'].includes(quality)) {
      throw providerError('IMAGE_QUALITY_NOT_SUPPORTED');
    }
  }
}
