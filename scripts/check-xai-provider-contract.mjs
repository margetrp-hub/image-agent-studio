import assert from 'node:assert/strict';
import {
  PROVIDER_VIDEO_TRANSPORTS,
  resolveProviderAdapter,
  resolveVideoGenerationDispatch
} from '../src/studio/providers/index.js';
import { createImagesGenerationBody } from '../src/gateway/imageAdapters.js';
import {
  buildProviderVideoGenerationBody,
  normalizeProviderVideoTask,
  providerProfile
} from './studio-service/providerProfiles.js';

const provider = resolveProviderAdapter({ providerId: 'xai-compatible', authMode: 'manual' });
const video = resolveVideoGenerationDispatch({ providerId: 'xai-compatible', authMode: 'manual' });
const generation = provider.buildGenerationPlan({ requestedRoute: 'auto' });
const videoPlan = provider.buildVideoPlan();

assert.equal(generation.endpoint, '/v1/images/generations');
assert.equal(generation.payloadFormat, 'xai-images-json');
assert.equal(video.transport, PROVIDER_VIDEO_TRANSPORTS.XAI_VIDEOS);
assert.equal(video.createEndpoint, '/v1/videos/generations');
assert.equal(video.retrieveEndpoint, '/v1/videos/{id}');
assert.equal(videoPlan.payloadFormat, 'json');

const imageBody = createImagesGenerationBody({
  model: 'grok-imagine-image',
  prompt: 'a clean studio product photo',
  size: '1024x1024',
  quality: 'high',
  payloadFormat: generation.payloadFormat
});
assert.deepEqual(imageBody, {
  model: 'grok-imagine-image',
  prompt: 'a clean studio product photo',
  n: 1
});

const profile = providerProfile('xai-compatible');
const videoBody = buildProviderVideoGenerationBody(profile, {
  model: 'grok-imagine-video-1.5',
  prompt: 'A cinematic five second product shot.',
  duration: 5,
  width: 1280,
  height: 720,
  fps: 24,
  quality: 'high'
});
assert.deepEqual(videoBody, {
  model: 'grok-imagine-video-1.5',
  prompt: 'A cinematic five second product shot.',
  duration: 5
});

const normalized = normalizeProviderVideoTask({
  request_id: 'grok-request-123',
  status: 'done',
  video: { url: '/v1/videos/grok-request-123/content' }
});
assert.equal(normalized.id, 'grok-request-123');
assert.equal(normalized.status, 'completed');
assert.equal(normalized.url, '/v1/videos/grok-request-123/content');

console.log('xAI provider contract passed.');
