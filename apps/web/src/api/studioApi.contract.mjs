import assert from 'node:assert/strict';
import { createStudioApi, parseSSEFrames, SESSION_KEY } from './studioApi.js';

assert.equal(SESSION_KEY, 'image-agent-studio:session:v1');
const parsed = parseSSEFrames('id: 7\nevent: queued\ndata: {"status":"queued"}\n\nevent: heartbeat\ndata: {"at":"now"}\n\npartial');
assert.equal(parsed.events.length, 2);
assert.deepEqual(parsed.events[0], { id: '7', type: 'queued', data: { status: 'queued' } });
assert.equal(parsed.events[1].type, 'heartbeat');
assert.equal(parsed.remainder, 'partial');

const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  if (String(url).includes('/studio-api/assets/')) {
    return new Response(new Blob(['image-bytes'], { type: 'image/png' }), {
      status: 200,
      headers: { 'Content-Type': 'image/png' }
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

try {
  const api = createStudioApi({ baseUrl: 'https://studio.example', getToken: () => 'session-token' });
  const connection = {
    providerType: 'openai-compatible',
    label: 'Personal provider',
    enabled: true,
    baseUrl: 'https://api.example/v1',
    apiKey: 'provider-secret'
  };
  const job = { request: { providerId: 'connection/one', model: 'gpt-image-2', prompt: 'A lighthouse' } };

  await api.listSharedProviders();
  await api.listProviderConnections();
  await api.createProviderConnection(connection);
  await api.updateProviderConnection('connection/one', { ...connection, label: 'Updated provider' });
  await api.deleteProviderConnection('connection/one');
  await api.syncSharedProviderModels('shared/one');
  await api.syncProviderConnectionModels('connection/one');
  await api.createGenerationJob(job);
  await api.getJob('job/one');
  await api.executeJob('job/one');
  await api.cancelJob('job/one');
  const asset = await api.readAsset('abc/123');
  const assetFromPath = await api.readAsset('/studio-api/assets/def456');

  assert.deepEqual(calls.map(({ url, options }) => [url, options.method || 'GET']), [
    ['https://studio.example/studio-api/providers', 'GET'],
    ['https://studio.example/studio-api/provider-connections', 'GET'],
    ['https://studio.example/studio-api/provider-connections', 'POST'],
    ['https://studio.example/studio-api/provider-connections/connection%2Fone', 'PUT'],
    ['https://studio.example/studio-api/provider-connections/connection%2Fone', 'DELETE'],
    ['https://studio.example/studio-api/providers/shared%2Fone/models', 'GET'],
    ['https://studio.example/studio-api/provider-connections/connection%2Fone/models', 'GET'],
    ['https://studio.example/studio-api/generation-jobs', 'POST'],
    ['https://studio.example/studio-api/generation-jobs/job%2Fone', 'GET'],
    ['https://studio.example/studio-api/generation-jobs/job%2Fone/execute', 'POST'],
    ['https://studio.example/studio-api/generation-jobs/job%2Fone', 'DELETE'],
    ['https://studio.example/studio-api/assets/abc%2F123', 'GET'],
    ['https://studio.example/studio-api/assets/def456', 'GET']
  ]);
  for (const call of calls) {
    assert.equal(new Headers(call.options.headers).get('Authorization'), 'Bearer session-token');
    assert.equal(String(call.url).includes('session-token'), false);
  }
  assert.deepEqual(JSON.parse(calls[2].options.body), connection);
  assert.equal(JSON.parse(calls[3].options.body).label, 'Updated provider');
  assert.deepEqual(JSON.parse(calls[7].options.body), job);
  assert.equal(asset.type, 'image/png');
  assert.equal(await asset.text(), 'image-bytes');
  assert.equal(await assetFromPath.text(), 'image-bytes');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('studio web API contract passed');
