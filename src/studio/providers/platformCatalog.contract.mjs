import assert from 'node:assert/strict';
import { test } from 'node:test';
import { platformModelOptions, platformModelSupports, platformPriceLabel, platformProviderSettings } from './platformCatalog.js';
import { buildServerImageGenerationJobPayload, buildServerVideoGenerationJobPayload } from '../generation/executor.js';

const model = { id: 'gpt-image-2', enabled: true, supported: true, available: true, capabilities: { textToImage: true, imageEdit: true, videoGeneration: false }, prices: { image: 0, edit: 12, video: null } };

test('catalog gates operations on verified capability, availability, publication and integer pricing', () => {
  assert.equal(platformModelSupports(model, 'image'), true);
  assert.equal(platformPriceLabel(model, 'image'), '0 积分/张');
  assert.equal(platformPriceLabel(model, 'edit', 3), '12 积分/张，合计 36 积分');
  for (const patch of [{ enabled: false }, { supported: false }, { available: false }, { prices: { image: null } }, { prices: { image: '' } }, { prices: { image: '0' } }, { prices: { image: 0.5 } }, { prices: { image: -1 } }, { capabilities: { textToImage: false } }]) {
    assert.equal(platformModelSupports({ ...model, ...patch }, 'image'), false);
  }
  assert.equal(platformModelSupports({ ...model, prices: { ...model.prices, video: 10 } }, 'video'), false);
});

test('catalog never inserts default or unsupported models and keeps provider identity', () => {
  assert.deepEqual(platformModelOptions(null), { image: [], video: [], responses: [] });
  const options = platformModelOptions({ id: 'supplier-a', models: [model, { ...model, id: 'disabled', enabled: false }, { ...model, id: 'unknown', supported: false }] });
  assert.deepEqual(options.image.map((item) => [item.id, item.platformProviderId]), [['gpt-image-2', 'supplier-a']]);
  assert.deepEqual(options.responses, []);
  assert.deepEqual(options.video, []);
  assert.equal(platformProviderSettings({ id: 'supplier-a', providerId: 'openai-compatible', name: 'A', apiKey: 'must-not-copy' }).manualApiKey, '');
});

test('platform requests keep identity, omit browser credentials and separate duplicate model IDs', () => {
  for (const build of [buildServerImageGenerationJobPayload, buildServerVideoGenerationJobPayload]) {
    const input = { serverManaged: true, apiKeySource: 'platform', platformProviderId: 'supplier-a', providerId: 'openai-compatible', apiKey: 'must-not-send', gatewayBaseUrl: 'https://must-not-send.example', model: 'same-model', generationPrompt: 'test prompt', prompt: 'test prompt', count: 2 };
    const first = build(input);
    const other = build({ ...input, platformProviderId: 'supplier-b' });
    assert.equal(first.request.apiKeySource, 'platform');
    assert.equal(first.request.platformProviderId, 'supplier-a');
    assert.equal('apiKey' in first, false);
    assert.equal('gatewayBaseUrl' in first, false);
    assert.notEqual(first.request.fingerprint, other.request.fingerprint);
    const manual = build({ ...input, apiKeySource: 'manual' });
    assert.equal(manual.apiKey, 'must-not-send');
    assert.equal('platformProviderId' in manual.request, false);
    const linked = build({ ...input, apiKeySource: 'linked', providerProfileId: 'linked-provider' });
    assert.equal(linked.request.providerProfileId, 'linked-provider');
    assert.equal('apiKey' in linked, false);
  }
});
