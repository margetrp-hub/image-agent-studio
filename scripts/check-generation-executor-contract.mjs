import assert from 'node:assert/strict';
import {
  buildServerImageGenerationJobPayload,
  endpointForGenerationTask,
  imageGenerationRouteForMode
} from '../src/studio/generation/executor.js';
import { buildCanvasContinuationPlan } from '../src/studio/generation/promptComposition.js';

const endpoints = {
  generations: '/v1/images/generations',
  edits: '/v1/images/edits',
  video: '/v1/video/generations'
};

assert.equal(imageGenerationRouteForMode({ mode: 'image' }), 'generations');
assert.equal(imageGenerationRouteForMode({ mode: 'edit' }), 'generations');
assert.equal(imageGenerationRouteForMode({ mode: 'edit', referenceCount: 1 }), 'edits');
assert.equal(imageGenerationRouteForMode({ mode: 'edit', hasCanvasReference: true }), 'edits');
assert.equal(imageGenerationRouteForMode({ mode: 'mask' }), 'edits');

assert.equal(endpointForGenerationTask({ mode: 'image', endpoints }), endpoints.generations);
assert.equal(endpointForGenerationTask({ mode: 'edit', referenceCount: 1, endpoints }), endpoints.edits);
assert.equal(endpointForGenerationTask({ mode: 'video', endpoints }), endpoints.video);

const payload = buildServerImageGenerationJobPayload({
  apiKey: 'session-secret',
  gatewayBaseUrl: 'https://gateway.example/v1',
  images: [{ name: 'reference.png', type: 'image/png', dataUrl: 'data:image/png;base64,a' }],
  mask: null,
  generationMeta: { id: 'job-1' },
  sessionId: 'session-1',
  parentCanvasNodeId: 'node-1',
  providerId: 'openai-compatible',
  apiKeySource: 'manual',
  providerLabel: 'Custom Gateway',
  mode: 'edit',
  route: 'edits',
  model: 'gpt-image-2',
  prompt: 'make it cleaner',
  generationPrompt: 'make it cleaner\n\nResolution target: 1K',
  size: '1024x1024',
  quality: 'medium',
  resolutionTier: '1k',
  outputFormat: 'png',
  moderation: 'auto',
  count: 1,
  referenceCount: 1,
  hasMask: false,
  workflow: {
    rootPrompt: 'original prompt',
    lineage: [{ index: 1, mode: 'image', route: 'generations', prompt: 'original prompt' }]
  }
});

assert.equal(payload.apiKey, 'session-secret');
assert.equal(payload.gatewayBaseUrl, 'https://gateway.example/v1');
assert.equal(payload.images.length, 1);
assert.equal(payload.request.id, 'job-1');
assert.equal(payload.request.clientRequestId, 'studio-job-1');
assert.equal(payload.request.providerId, 'openai-compatible');
assert.equal(payload.request.providerFamily, 'openai-compatible');
assert.equal(payload.request.route, 'edits');
assert.equal(payload.request.mode, 'edit');
assert.equal(payload.request.model, 'gpt-image-2');
assert.equal(payload.request.count, 1);
assert.equal(payload.request.n, 1);
assert.equal(payload.request.workflow.rootPrompt, 'original prompt');
assert.ok(payload.request.fingerprint.includes('edits'));
assert.ok(!payload.request.fingerprint.includes('session-secret'));

const firstNode = {
  id: 'node-1',
  kind: 'image',
  prompt: 'A cinematic hero image of a red bottle on marble.'
};
const second = buildCanvasContinuationPlan(firstNode, 'Make the background darker.', { mode: 'image' });
assert.equal(second.depth, 2);
assert.equal(second.workflow.rootPrompt, firstNode.prompt);
assert.equal(second.workflow.lineage.length, 2);
assert.equal(second.workflow.lineage[1].prompt, 'Make the background darker.');

const secondNode = {
  id: 'node-2',
  kind: 'image',
  generationPrompt: second.generationPrompt,
  workflow: second.workflow
};
const third = buildCanvasContinuationPlan(secondNode, 'Add stronger rim light.', { mode: 'image' });
assert.equal(third.depth, 3);
assert.equal(third.workflow.rootPrompt, firstNode.prompt);
assert.deepEqual(third.workflow.lineage.map((step) => step.prompt), [
  firstNode.prompt,
  'Make the background darker.',
  'Add stronger rim light.'
]);
assert.ok(third.generationPrompt.includes('#3 image'));

const video = buildCanvasContinuationPlan({
  id: 'video-node-1',
  kind: 'video',
  prompt: 'A five second product video, slow push-in.'
}, 'Continue with a logo macro shot.', { mode: 'video' });
assert.equal(video.mode, 'video');
assert.ok(video.generationPrompt.includes('motion/story beat'));

console.log('Generation executor contract passed.');
