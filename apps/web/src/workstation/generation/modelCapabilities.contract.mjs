import assert from 'node:assert/strict';
import { imageOptionsForModel, modelsForMode, videoOptionsForModel } from './modelCapabilities.js';

const models = [
  {
    id: 'nano-banana-pro-preview',
    invocations: {
      image: { status: 'verified', adapter: 'openai-chat-images' },
      video: { status: 'unsupported', reason: 'No verified invocation adapter' }
    }
  },
  {
    id: 'sora-2',
    invocations: {
      image: { status: 'unsupported', reason: 'No verified invocation adapter' },
      video: { status: 'verified', adapter: 'openai-videos' }
    }
  },
  {
    id: 'unknown-image-looking-model',
    discoveryStatus: 'discovered',
    invocations: {
      image: { status: 'unsupported', reason: 'No verified invocation adapter' },
      video: { status: 'unsupported', reason: 'No verified invocation adapter' }
    }
  }
];

assert.deepEqual(modelsForMode(models, 'image').map((model) => model.id), ['nano-banana-pro-preview']);
assert.deepEqual(modelsForMode(models, 'video').map((model) => model.id), ['sora-2']);
assert.deepEqual(modelsForMode([{ id: 'gpt-image-2' }], 'image'), []);

assert.deepEqual(
  imageOptionsForModel('newapi-compatible', 'nano-banana-pro-preview', 'openai-chat-images'),
  { sizes: ['1024x1024', '1536x1024', '1024x1536'], qualities: [], counts: [1] }
);
assert.deepEqual(
  videoOptionsForModel('newapi-compatible', 'sora-2', 'openai-videos'),
  { aspects: ['16:9', '9:16'], durations: [4, 8, 12], fps: [] }
);
assert.deepEqual(
  videoOptionsForModel('xai-compatible', 'grok-imagine-video', 'xai-videos').durations,
  Array.from({ length: 15 }, (_, index) => index + 1)
);

console.log('workstation model invocation contract passed');
