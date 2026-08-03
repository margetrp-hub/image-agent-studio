// Gateway model sync belongs to the generation/provider boundary, not the
// React page shell. Keep request shaping, model classification, and usage
// display normalization here so StudioApp only applies state updates.

import { AiGatewayClient, STUDIO_STANDALONE } from '../../aiGatewayClient.js';
import { formatUsageValue } from '../util/billing.js';
import { defaultProviderGatewayBaseUrl } from '../util/providerSettings.js';

const IMAGE_MODEL_PATTERN = /(?:^|[^a-z0-9])(?:gpt-)?image[-_a-z0-9]*\d|(?:^|[^a-z0-9])dall[-_a-z0-9]*\d|grok[-_.]imagine[-_.]image|(?:^|[-_.])(seedream|nano[-_.]?banana|flux|ideogram|recraft|stable[-_.]?diffusion|sdxl|sd3|jimeng|doubao[-_.]?image|gemini[-_.a-z0-9]*image|imagen|midjourney|mj|firefly|leonardo|playground|kolors|qwen[-_.]?image|hunyuan[-_.]?image|hidream|photon|cogview)(?:[-_.0-9]|$)/i;
const VIDEO_MODEL_PATTERN = /grok[-_.]imagine[-_.]video|(?:^|[-_.])(video|sora|veo|kling|runway|luma|hailuo|jimeng|seedance|wan|vidu|minimax|hunyuan|pixverse|pika|dreamina)(?:[-_.0-9]|$)/i;
const IMAGE_MODEL_NAMES = ['即梦', '豆包图片', '豆包图像', '通义万相', '混元图片', '混元图像'];
const VIDEO_MODEL_NAMES = ['即梦', '可灵', '海螺', '豆包视频', '通义万相视频'];

export function modelLooksLikeImage(item) {
  const raw = item?.raw || {};
  const source = [
    item?.id,
    item?.label,
    item?.type,
    item?.category,
    item?.mode,
    item?.modality,
    item?.endpoint,
    raw.id,
    raw.model,
    raw.name,
    raw.type,
    raw.category,
    raw.mode,
    raw.modality,
    raw.endpoint,
    raw.group,
    raw.platform,
    ...(Array.isArray(item?.capabilities) ? item.capabilities : []),
    ...(Array.isArray(raw.capabilities) ? raw.capabilities : [])
  ].filter(Boolean).join(' ');
  return IMAGE_MODEL_PATTERN.test(source) || String(source).toLowerCase().includes('images/edits') || IMAGE_MODEL_NAMES.some((name) => source.includes(name));
}

export function resolveProviderRequest(settings, apiKey) {
  if (STUDIO_STANDALONE) {
    return {
      apiKey: apiKey?.key || (apiKey?.synthetic ? 'studio-managed' : ''),
      route: settings?.route || 'auto',
      responsesModel: settings?.responsesModel,
      partialImages: settings?.partialImages
    };
  }
  if (settings.apiKeySource === 'manual') {
    const manualApiKey = String(settings.manualApiKey || '').trim();
    return {
      apiKey: manualApiKey,
      gatewayBaseUrl: manualApiKey ? String(settings.manualGatewayBaseUrl || '').trim() || defaultProviderGatewayBaseUrl(settings) : '',
      route: settings.route || 'auto',
      responsesModel: settings.responsesModel,
      partialImages: settings.partialImages
    };
  }
  return {
    apiKey: apiKey?.key || '',
    route: settings.route || 'auto',
    responsesModel: settings.responsesModel,
    partialImages: settings.partialImages
  };
}

export async function syncGatewayModels({ session, providerSettings, apiKey, signal, GatewayClient = AiGatewayClient } = {}) {
  const providerRequest = resolveProviderRequest(providerSettings, apiKey);
  if (!providerRequest.apiKey) {
    return emptyModelSyncResult('idle');
  }

  const client = new GatewayClient({ session, providerSettings });
  const [modelsResult, usageResult] = await Promise.all([
    listModels(client, providerRequest, signal),
    getUsageSummary(client, providerRequest, signal)
  ]);

  return {
    modelOptions: modelsResult.modelOptions,
    modelsStatus: modelsResult.modelsStatus,
    usageSummary: usageResult,
    modelSyncError: modelsResult.modelSyncError || null
  };
}

async function listModels(client, providerRequest, signal) {
  try {
    const models = await client.listGatewayModels({ ...providerRequest, signal });
    const hasInvocationContracts = models.some((model) => modelInvocation(model, 'image') || modelInvocation(model, 'video'));
    const image = hasInvocationContracts
      ? models.filter((model) => modelInvocation(model, 'image')?.status === 'verified')
      : models.filter(modelLooksLikeImage);
    const video = hasInvocationContracts
      ? models.filter((model) => modelInvocation(model, 'video')?.status === 'verified')
      : models.filter(modelLooksLikeVideo);
    if (!models.length) {
      return emptyModelSyncResult('empty', describeModelSyncError({ code: 'MODEL_LIST_EMPTY' }, {
        endpoint: modelSyncEndpoint(providerRequest)
      }));
    }
    return {
      modelOptions: {
        image: image.length ? image : [],
        responses: models,
        video
      },
      modelsStatus: 'ready'
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return emptyModelSyncResult('fallback', describeModelSyncError(error, {
      endpoint: modelSyncEndpoint(providerRequest)
    }));
  }
}

function modelInvocation(model, mode) {
  return model?.invocations?.[mode] || model?.raw?.invocations?.[mode] || null;
}

async function getUsageSummary(client, providerRequest, signal) {
  try {
    const usage = await client.getGatewayUsage({ ...providerRequest, signal });
    const parts = [];
    const total = usage?.total || usage?.total_usage || usage?.used || usage?.amount || usage?.cost;
    const requests = usage?.requests || usage?.request_count || usage?.count;
    if (total !== undefined) parts.push(`已用 ${formatUsageValue(total)}`);
    if (requests !== undefined) parts.push(`${formatUsageValue(requests)} 次`);
    return parts.join('，') || '后台未返回消费汇总';
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return '后台未开放消费接口';
  }
}

export function modelLooksLikeVideo(item) {
  const raw = item?.raw || {};
  const values = [
    item?.id,
    item?.label,
    item?.type,
    item?.category,
    item?.mode,
    item?.modality,
    item?.endpoint,
    raw.id,
    raw.model,
    raw.name,
    raw.type,
    raw.category,
    raw.mode,
    raw.modality,
    raw.endpoint
  ].map((value) => String(value || '').toLowerCase());
  const capabilities = [
    item?.capabilities,
    item?.capability,
    raw.capabilities,
    raw.capability,
    raw.features,
    raw.supported_generation_types,
    raw.supportedGenerationTypes
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

function emptyModelSyncResult(modelsStatus, modelSyncError = null) {
  return {
    modelOptions: { image: [], responses: [], video: [] },
    modelsStatus,
    usageSummary: '',
    modelSyncError
  };
}

function modelSyncEndpoint(providerRequest = {}) {
  if (STUDIO_STANDALONE) return '/studio-api/model-sync';
  const baseUrl = String(providerRequest.gatewayBaseUrl || '').replace(/\/+$/, '');
  return baseUrl ? `${baseUrl}/models` : '/v1/models';
}

export function describeModelSyncError(error, { endpoint = '' } = {}) {
  const status = Number(error?.status || error?.statusCode || 0) || 0;
  const rawCode = String(error?.code || '').trim().toUpperCase();
  const rawMessage = String(
    error?.message
      || error?.payload?.error?.message
      || error?.payload?.message
      || rawCode
      || 'MODEL_SYNC_FAILED'
  ).trim();
  const message = sanitizeModelSyncMessage(rawMessage);
  let code = rawCode === 'MODEL_LIST_EMPTY' ? 'empty_response' : 'unknown';
  if (status === 401 || /unauthorized|invalid api key|api[_ -]?key required|authentication/i.test(message)) {
    code = 'unauthorized';
  } else if (status === 403 || /forbidden|permission|not enabled|access denied/i.test(message)) {
    code = 'forbidden';
  } else if (status === 404 || /not found|cannot find|no route|endpoint/i.test(message)) {
    code = 'not_found';
  } else if ([408, 425, 429, 500, 502, 503, 504].includes(status) || /timeout|temporar|upstream|gateway/i.test(message)) {
    code = 'upstream_unavailable';
  } else if (error?.name === 'TypeError' || /failed to fetch|network|cors|fetch/i.test(message)) {
    code = 'network';
  }

  return {
    code,
    status,
    message: message.slice(0, 320),
    endpoint: String(endpoint || '').slice(0, 320),
    retryable: ['network', 'upstream_unavailable', 'empty_response'].includes(code),
    requestId: String(error?.requestId || error?.payload?.request_id || '').slice(0, 160)
  };
}

function sanitizeModelSyncMessage(value) {
  return String(value || 'MODEL_SYNC_FAILED')
    .replace(/bearer\s+[a-z0-9._~+/=-]+/ig, 'Bearer [redacted]')
    .replace(/(?:sk|key|token)[-_]?[a-z0-9]{12,}/ig, '[redacted]')
    .replace(/https?:\/\/[^\s"']+/ig, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return '[endpoint]';
      }
    });
}
