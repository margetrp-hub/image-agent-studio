import { modelLooksLikeImage, syncGatewayModels } from '../src/studio/generation/modelSync.js';
import { readFileSync } from 'node:fs';

class GoodGateway {
  async listGatewayModels() {
    return [
      { id: 'gpt-image-2', label: 'Image' },
      { id: 'gpt-5.5', label: 'Chat' },
      { id: 'veo3', modality: 'video' }
    ];
  }

  async getGatewayUsage() {
    return { total: 12, requests: 3 };
  }
}

class BrokenGateway {
  async listGatewayModels() {
    throw new Error('MODEL_SYNC_FAILED');
  }

  async getGatewayUsage() {
    throw new Error('USAGE_SYNC_FAILED');
  }
}

const idle = await syncGatewayModels({
  providerSettings: { apiKeySource: 'manual', manualApiKey: '', manualGatewayBaseUrl: '' },
  GatewayClient: GoodGateway
});

const ready = await syncGatewayModels({
  providerSettings: { apiKeySource: 'manual', manualApiKey: 'sk-test', manualGatewayBaseUrl: 'https://example.com/v1' },
  GatewayClient: GoodGateway
});

const fallback = await syncGatewayModels({
  providerSettings: { apiKeySource: 'manual', manualApiKey: 'sk-test', manualGatewayBaseUrl: 'https://example.com/v1' },
  GatewayClient: BrokenGateway
});

const failures = [];

if (idle.modelsStatus !== 'idle') failures.push(`empty manual key should return idle, got ${idle.modelsStatus}`);
if (ready.modelsStatus !== 'ready') failures.push(`healthy sync should return ready, got ${ready.modelsStatus}`);
if (ready.modelOptions.image.length !== 1) failures.push(`expected 1 image model, got ${ready.modelOptions.image.length}`);
if (ready.modelOptions.responses.length !== 3) failures.push(`expected all models in responses list, got ${ready.modelOptions.responses.length}`);
if (ready.modelOptions.video.length !== 1) failures.push(`expected 1 video model, got ${ready.modelOptions.video.length}`);
if (!ready.usageSummary.includes('12') || !ready.usageSummary.includes('3')) failures.push(`usage summary did not include total/request counts: ${ready.usageSummary}`);
if (!modelLooksLikeImage({ id: 'gpt-image-2' })) failures.push('gpt-image-2 should be classified as an image model');
if (modelLooksLikeImage({ id: 'gpt-5.5' })) failures.push('gpt-5.5 should not be classified as an image model');
if (fallback.modelsStatus !== 'fallback') failures.push(`failed model sync should return fallback, got ${fallback.modelsStatus}`);

const gatewayClientSource = readFileSync(new URL('../src/aiGatewayClient.js', import.meta.url), 'utf8');
const historyServiceSource = readFileSync(new URL('./image-agent-studio-history-service.mjs', import.meta.url), 'utf8');
if (!gatewayClientSource.includes('listGatewayModelsViaStudio')) {
  failures.push('manual model sync should try the same-origin Studio proxy before browser-direct upstream fetch.');
}
if (!historyServiceSource.includes("parts[1] === 'model-sync'") || !historyServiceSource.includes('/models')) {
  failures.push('history service must expose /studio-api/model-sync and proxy only the /v1/models endpoint.');
}

if (failures.length) {
  console.error(`Model sync contract failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('Model sync contract passed.');
