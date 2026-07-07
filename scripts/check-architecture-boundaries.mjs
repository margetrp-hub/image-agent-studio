import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function fail(message) {
  failures.push(message);
}

function assertMissing(file, reason) {
  if (exists(file)) fail(`${file} must not exist in the workstation repo. ${reason}`);
}

function assertDoesNotInclude(file, pattern, reason) {
  const body = read(file);
  const matches = typeof pattern === 'string' ? body.includes(pattern) : pattern.test(body);
  if (matches) fail(`${file} crosses an architecture boundary. ${reason}`);
}

assertMissing('.codex-plugin', 'Codex plugin manifests belong in the separate image-agent-canvas plugin.');
assertMissing('apps/canvas', 'Canvas plugin app code belongs in the separate image-agent-canvas plugin.');
assertMissing('server/mcp', 'MCP bridge code belongs in the separate image-agent-canvas plugin.');

const packageJson = JSON.parse(read('package.json'));
const allDependencies = {
  ...(packageJson.dependencies || {}),
  ...(packageJson.devDependencies || {})
};
for (const dependency of Object.keys(allDependencies)) {
  if (/^(tldraw|@tldraw\/|@excalidraw\/)/i.test(dependency)) {
    fail(`package.json must not depend on ${dependency}; plugin-only canvas engines belong in image-agent-canvas.`);
  }
}

const uiBoundaryFiles = [
  'src/studio.jsx',
  'src/studio/components/settingsPanel.jsx',
  'src/studio/components/generationConfirmDialog.jsx',
  'src/studio/components/bottomComposerPanel.jsx'
];

for (const file of uiBoundaryFiles) {
  assertDoesNotInclude(file, /\bnewapi-compatible\b/i, 'Provider ids must stay inside src/studio/providers or docs.');
  assertDoesNotInclude(file, /\bsub2api-compatible\b/i, 'Legacy gateway ids must stay inside adapter docs or compatibility wrappers.');
  assertDoesNotInclude(file, /\bcodex2api\b/i, 'Codex2API-specific handling must be an adapter concern.');
  assertDoesNotInclude(file, /\bcpa-image\b/i, 'CPA Image references are learning material, not UI implementation dependencies.');
  assertDoesNotInclude(file, /\btldraw\b/i, 'tldraw belongs to the Codex plugin, not the workstation UI.');
  assertDoesNotInclude(file, /\/v1\/(?:images|responses|models|video)/i, 'Provider route endpoints must come from provider adapter plans.');
}

assertDoesNotInclude(
  'src/studio/components/settingsPanel.jsx',
  'IMAGE_PROVIDER_REGISTRY',
  'SettingsPanel should render ordered provider choices from the provider boundary, not own registry ordering.'
);
assertDoesNotInclude(
  'src/studio.jsx',
  'IMAGE_PROVIDER_REGISTRY',
  'StudioApp should consume provider helpers and adapters, not the raw provider registry.'
);
assertDoesNotInclude(
  'src/studio.jsx',
  'listGatewayModels',
  'Model sync should flow through src/studio/generation/modelSync.js.'
);
assertDoesNotInclude(
  'src/studio.jsx',
  'generationTaskFingerprint',
  'Server generation-job fingerprinting belongs in src/studio/generation, not the UI shell.'
);
assertDoesNotInclude(
  'src/studio.jsx',
  'clientRequestId:',
  'Server generation-job payload shape belongs in src/studio/generation/executor.js.'
);
assertDoesNotInclude(
  'src/studio.jsx',
  'providerFamily:',
  'Provider-family payload fields belong in the generation executor or provider adapters.'
);
assertDoesNotInclude(
  'src/studio.jsx',
  'new AiGatewayClient',
  'StudioApp should create gateway clients through src/studio/runtime/clients.js.'
);
assertDoesNotInclude(
  'src/studio.jsx',
  'new StudioHistoryClient',
  'StudioApp should create history clients through src/studio/runtime/clients.js.'
);

if (failures.length) {
  console.error(`Architecture boundary check failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('Architecture boundary check passed.');
