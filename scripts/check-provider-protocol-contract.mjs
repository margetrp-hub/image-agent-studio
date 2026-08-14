import assert from 'node:assert/strict';
import {
  annotateProviderModels,
  buildProviderImageEditPlan,
  buildProviderImageGenerationPlan,
  buildProviderVideoGenerationPlan,
  normalizeProviderImageItems,
  providerProfile
} from './studio-service/providerProfiles.js';

const newApi = providerProfile('newapi-compatible');
const videoGateway = providerProfile('video-compatible');
const annotated = annotateProviderModels({
  object: 'list',
  data: [
    { id: 'nano-banana-pro-preview' },
    { id: 'jimeng_high_aes_general_v21_L' },
    { id: 'jimeng_vgfm_t2v_l20' },
    { id: 'sora-2' },
    { id: 'veo-3.1-generate-preview' },
    { id: 'unknown-creative-model' }
  ]
}, newApi.type);

assert.equal(annotated.data[0].invocations.image.adapter, 'openai-chat-images');
assert.equal(annotated.data[1].invocations.image.adapter, 'openai-images');
assert.equal(annotated.data[1].invocations.video.status, 'unsupported');
assert.equal(annotated.data[2].invocations.image.status, 'unsupported');
assert.equal(annotated.data[2].invocations.video.adapter, 'newapi-task-video');
assert.equal(annotated.data[3].invocations.video.adapter, 'openai-videos');
assert.equal(annotated.data[4].invocations.video.adapter, 'newapi-task-video');
assert.equal(annotated.data[5].discoveryStatus, 'discovered');
assert.equal(annotated.data[5].invocations.image.status, 'unsupported');

const genericVideoGatewayModels = annotateProviderModels({
  data: [{ id: 'grok-imagine-image' }, { id: 'grok-imagine-video' }, { id: 'veo3' }]
}, videoGateway.type);
assert.equal(genericVideoGatewayModels.data[0].invocations.image.adapter, 'xai-images');
assert.equal(genericVideoGatewayModels.data[1].invocations.video.adapter, 'xai-videos');
assert.equal(genericVideoGatewayModels.data[2].invocations.video.adapter, 'newapi-task-video');

const genericGrokVideoPlan = buildProviderVideoGenerationPlan(videoGateway, {
  model: 'grok-imagine-video',
  prompt: 'A short product shot.',
  duration: 5,
  aspectRatio: '16:9'
});
assert.equal(genericGrokVideoPlan.endpoint, '/videos/generations');
assert.equal(genericGrokVideoPlan.adapter, 'xai-videos');

const nanoPlan = buildProviderImageGenerationPlan(newApi, {
  model: 'nano-banana-pro-preview',
  prompt: 'Keep the product identity and improve the light.',
  size: '1536x1024'
}, ['data:image/png;base64,aW1hZ2U=']);
assert.equal(nanoPlan.endpoint, '/chat/completions');
assert.equal(nanoPlan.adapter, 'openai-chat-images');
assert.equal(nanoPlan.body.stream, false);
assert.equal(nanoPlan.body.messages[0].content[1].image_url.url, 'data:image/png;base64,aW1hZ2U=');
assert.equal(nanoPlan.body.extra_body.google.image_config.aspect_ratio, '3:2');

const nanoEditPlan = buildProviderImageEditPlan(newApi, {
  model: 'nano-banana-pro-preview',
  prompt: 'Remove the label.',
  size: '1024x1024'
}, ['data:image/png;base64,aW1hZ2U=']);
assert.equal(nanoEditPlan.endpoint, '/chat/completions');
assert.equal(nanoEditPlan.payloadFormat, 'json');

const jimengPlan = buildProviderImageGenerationPlan(newApi, {
  model: 'jimeng_high_aes_general_v21_L',
  prompt: 'A clean editorial portrait.',
  size: '1024x1024',
  count: 1
});
assert.equal(jimengPlan.endpoint, '/images/generations');
assert.equal(jimengPlan.adapter, 'openai-images');

const soraPlan = buildProviderVideoGenerationPlan(newApi, {
  model: 'sora-2',
  prompt: 'A slow product orbit.',
  duration: 8,
  width: 1280,
  height: 720
});
assert.equal(soraPlan.endpoint, '/videos');
assert.equal(soraPlan.payloadFormat, 'multipart');
assert.equal(soraPlan.body.seconds, 8);
assert.equal(soraPlan.body.size, '1280x720');

const veoPlan = buildProviderVideoGenerationPlan(newApi, {
  model: 'veo-3.1-generate-preview',
  prompt: 'A stable architectural flythrough.',
  duration: 8,
  width: 1280,
  height: 720,
  aspectRatio: '16:9'
});
assert.equal(veoPlan.endpoint, '/video/generations');
assert.equal(veoPlan.retrieveEndpoint, '/video/generations/{id}');
assert.equal(veoPlan.body.size, '1280x720');
assert.equal(veoPlan.body.metadata.aspect_ratio, '16:9');

assert.throws(() => buildProviderVideoGenerationPlan(providerProfile('openai-compatible'), {
  model: 'veo-3.1-generate-preview',
  prompt: 'Unsupported provider/model combination.',
  duration: 8
}), /MODEL_INVOCATION_NOT_VERIFIED/);

assert.throws(() => buildProviderImageGenerationPlan(providerProfile('openai-compatible'), {
  model: 'dall-e-3', prompt: 'Invalid count.', size: '1024x1024', quality: 'standard', count: 2
}), /IMAGE_COUNT_NOT_SUPPORTED/);
assert.throws(() => buildProviderImageGenerationPlan(providerProfile('openai-compatible'), {
  model: 'gpt-image-2', prompt: 'Invalid size.', size: '1792x1024', quality: 'high', count: 1
}), /IMAGE_SIZE_NOT_SUPPORTED/);

const chatImages = normalizeProviderImageItems('openai-chat-images', {
  choices: [{ message: { content: [
    { type: 'text', text: '![result](data:image/png;base64,aW1hZ2Ux)' },
    { type: 'image_url', image_url: { url: 'https://cdn.example.com/result.png' } },
    { inline_data: { mime_type: 'image/png', data: 'aW1hZ2Uy' } }
  ] } }]
});
assert.deepEqual(chatImages, [
  { url: 'https://cdn.example.com/result.png' },
  { b64_json: 'aW1hZ2Uy' },
  { b64_json: 'aW1hZ2Ux' }
]);

console.log('provider protocol contract passed');
