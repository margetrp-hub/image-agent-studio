// Gateway model sync belongs to the generation/provider boundary, not the
// React page shell. Keep request shaping, model classification, and usage
// display normalization here so StudioApp only applies state updates.

import { AiGatewayClient } from '../../aiGatewayClient.js';
import { formatUsageValue } from '../util/billing.js';
import { defaultProviderGatewayBaseUrl } from '../util/providerSettings.js';

const IMAGE_MODEL_PATTERN = /(?:^|[^a-z0-9])(?:gpt-)?image[-_a-z0-9]*\d|(?:^|[^a-z0-9])dall[-_a-z0-9]*\d/i;

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
  return IMAGE_MODEL_PATTERN.test(source) || String(source).toLowerCase().includes('images/edits');
}

export function resolveProviderRequest(settings, apiKey) {
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
    usageSummary: usageResult
  };
}

async function listModels(client, providerRequest, signal) {
  try {
    const models = await client.listGatewayModels({ ...providerRequest, signal });
    const image = models.filter(modelLooksLikeImage);
    const video = models.filter(modelMatchesVideo);
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
    return emptyModelSyncResult('fallback');
  }
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

function modelMatchesVideo(item) {
  const raw = item?.raw || {};
  const values = [
    item?.type,
    item?.category,
    item?.mode,
    item?.modality,
    item?.endpoint,
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
  return [...values, ...capabilities].some((value) => value === 'video' || value === 'videos' || value.includes('video_generation') || value.includes('video-generation'));
}

function emptyModelSyncResult(modelsStatus) {
  return {
    modelOptions: { image: [], responses: [], video: [] },
    modelsStatus,
    usageSummary: ''
  };
}
