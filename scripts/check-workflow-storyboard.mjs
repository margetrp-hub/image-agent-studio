import assert from 'node:assert/strict';

import { buildGenerationTask } from '../src/studio/generation/taskBuilder.js';
import { buildWorkflowScenes, workflowStats } from '../src/studio/workflow/storyboard.js';

const nodes = [
  { id: 'root-a', canvasIndex: 1, kind: 'image', prompt: 'Scene A' },
  { id: 'child-a', parentId: 'root-a', canvasIndex: 2, kind: 'image', prompt: 'Scene A variation' },
  { id: 'video-a', parentId: 'child-a', canvasIndex: 3, kind: 'video', prompt: 'Scene A motion' },
  { id: 'root-b', canvasIndex: 4, kind: 'image', prompt: 'Scene B' },
  { id: 'cycle-a', parentId: 'cycle-b', canvasIndex: 5, kind: 'image' },
  { id: 'cycle-b', parentId: 'cycle-a', canvasIndex: 6, kind: 'image' }
];

const scenes = buildWorkflowScenes(nodes);
assert.equal(scenes.length, 3, 'lineage roots and a cyclic branch should produce stable scene groups');
assert.deepEqual(scenes[0].nodes.map((node) => node.id), ['root-a', 'child-a', 'video-a']);
assert.deepEqual(scenes[1].nodes.map((node) => node.id), ['root-b']);
assert.deepEqual(scenes[2].nodes.map((node) => node.id), ['cycle-a', 'cycle-b']);

assert.deepEqual(workflowStats(nodes, [
  { status: 'running' },
  { status: 'queued' },
  { status: 'done' }
]), {
  total: 6,
  imageCount: 5,
  videoCount: 1,
  activeCount: 2
});

const selectedReference = { name: 'selected.png' };
const task = buildGenerationTask({
  mode: 'image',
  model: 'image-model',
  aspect: '1:1',
  customSize: '1024x1024',
  size: '1024x1024',
  quality: 'medium',
  resolutionTier: '1k',
  outputFormat: 'png',
  moderation: 'auto',
  countValue: 1,
  videoModel: 'video-model',
  videoAspect: '16:9',
  videoDuration: 5,
  videoFps: 24,
  videoMotion: 'auto',
  videoStyle: 'cinematic',
  videoQuality: 'standard',
  negativePrompt: '',
  referenceItems: [],
  videoReferenceFiles: [{ name: 'stale.png' }],
  selectedCanvasNode: null,
  selectedCanvasNodeId: '',
  sessionId: 'workflow-check',
  providerSettings: { providerId: 'manual', apiKeySource: 'manual' },
  layoutSectionsReferences: false,
  maskFile: null,
  fallbackPrompt: ''
}, {
  mode: 'video',
  prompt: 'Animate the selected keyframe',
  videoReferenceFiles: [selectedReference]
});

assert.equal(task.mode, 'video');
assert.deepEqual(task.videoReferenceFiles, [selectedReference], 'per-shot video references must override stale composer references');

console.log(JSON.stringify({ ok: true, scenes: scenes.map((scene) => scene.nodes.map((node) => node.id)) }, null, 2));
