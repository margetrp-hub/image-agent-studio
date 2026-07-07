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

function mustInclude(file, text, reason) {
  const body = read(file);
  if (!body.includes(text)) {
    fail(`${file}: missing ${JSON.stringify(text)} (${reason})`);
  }
}

function mustNotInclude(file, text, reason) {
  const body = read(file);
  if (body.includes(text)) {
    fail(`${file}: contains ${JSON.stringify(text)} (${reason})`);
  }
}

function walk(target) {
  const fullPath = path.join(root, target);
  if (!fs.existsSync(fullPath)) return [];
  const stat = fs.statSync(fullPath);
  if (stat.isFile()) return [target.replace(/\\/g, '/')];

  return fs.readdirSync(fullPath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'release') return [];
    if (entry.name === 'output' || entry.name === 'test-results' || entry.name === '.git') return [];
    const child = path.join(target, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) return walk(child);
    return entry.isFile() ? [child] : [];
  });
}

function assertMissing(file, reason) {
  if (exists(file)) fail(`${file} must not exist. ${reason}`);
}

function assertNoPublicOldIdentity() {
  const allowedPublicOldIdentityFiles = new Set([
    'docs/NAMING-LINES.md'
  ]);
  const files = [
    'README.md',
    'README.zh-CN.md',
    'RELEASE_NOTES.md',
    'SECURITY.md',
    'CHANGELOG.md',
    'index.html',
    'studio.html',
    'deploy',
    'docs'
  ].flatMap(walk);

  for (const file of files) {
    if (allowedPublicOldIdentityFiles.has(file)) continue;
    const body = read(file);
    if (body.includes('AI Image Workbench')) {
      fail(`${file}: "AI Image Workbench" is deprecated; use "Image Agent Studio" unless this is a machine-readable backup kind.`);
    }
  }
}

const packageJson = JSON.parse(read('package.json'));

if (packageJson.name !== 'image-agent-studio') {
  fail('package.json: package name must be image-agent-studio.');
}

if (!packageJson.description?.includes('image creation workstation')) {
  fail('package.json: description should describe the workstation, not a gateway or legacy proxy.');
}

mustInclude('package.json', '"check:naming": "node scripts/check-naming-boundaries.mjs"', 'naming boundaries need a dedicated local gate');
mustInclude('package.json', 'npm run check:naming', 'check:local should include the naming boundary gate');
mustInclude('README.md', '# Image Agent Studio', 'English README must present the canonical product name');
mustInclude('README.zh-CN.md', '# Image Agent Studio', 'Chinese README must present the canonical product name');
mustInclude('docs/NAMING-LINES.md', '# Naming Lines', 'naming policy must be documented');
mustInclude('docs/NAMING-LINES.md', '## Product Line', 'product line must be explicit');
mustInclude('docs/NAMING-LINES.md', '## Codex Plugin Line', 'Codex plugin line must be explicit');
mustInclude('docs/NAMING-LINES.md', '## Provider Adapter Line', 'provider adapter line must be explicit');
mustInclude('docs/NAMING-LINES.md', '## Legacy Compatibility Line', 'legacy compatibility line must be explicit');
mustInclude('docs/adapters/upstream-isolation.md', '../NAMING-LINES.md', 'adapter isolation docs should point to naming boundaries');

mustInclude('scripts/package-release.mjs', 'image-agent-studio-core-update-${stamp}.zip', 'release core package must use the product line');
mustInclude('scripts/package-release.mjs', 'image-agent-studio-service-update-${stamp}.zip', 'release service package must use the product line');
mustInclude('scripts/check-release-packages.mjs', 'release artifacts must use image-agent-studio-* only', 'release checker must reject legacy release package names');

mustInclude('deploy/image-agent-studio-history.service', 'Description=Image Agent Studio history and session service', 'standard systemd unit must use the product line');
mustInclude('deploy/image-agent-studio-history.service', 'WorkingDirectory=/opt/image-agent-studio', 'standard systemd unit must use the product service root');
mustInclude('deploy/image-agent-studio-history.service', 'STUDIO_DATA_DIR=/var/lib/image-agent-studio', 'standard systemd unit must use the product data root');
mustInclude('deploy/install.sh', 'REPO_DIR="${REPO_DIR:-/opt/image-agent-studio-repo}"', 'new installs must default to the product repo root');
mustInclude('deploy/install.sh', 'SERVICE_NAME="${SERVICE_NAME:-image-agent-studio-history}"', 'new installs must default to the product service name');
mustInclude('deploy/sync-from-git.sh', 'STATIC_DIR="${STATIC_DIR:-/var/www/image-agent-studio}"', 'Git sync must default to the product static root');
mustInclude('deploy/sync-from-git.sh', 'DATA_DIR="${DATA_DIR:-/var/lib/image-agent-studio}"', 'Git sync must default to the product data root');

mustNotInclude('apps/server/src/server.js', 'image-sub2api-studio-server', 'health payloads should not expose the legacy product identity');
mustNotInclude('apps/server/src/index.js', 'image-sub2api-studio server', 'runtime logs should not expose the legacy product identity');
mustNotInclude('scripts/image-agent-studio-history-service.mjs', 'image-sub2api-studio history service', 'standard service logs should not expose the legacy product identity');
mustNotInclude('deploy/image-sub2api-studio-history.service', 'AI Image Workbench', 'legacy systemd wrapper should describe compatibility for Image Agent Studio');

assertMissing('.codex-plugin', 'Codex plugin manifests belong in the separate image-agent-canvas plugin.');
assertMissing('apps/canvas', 'Canvas plugin app code belongs in the separate image-agent-canvas plugin.');
assertMissing('server/mcp', 'MCP bridge code belongs in the separate image-agent-canvas plugin.');

const allDependencies = {
  ...(packageJson.dependencies || {}),
  ...(packageJson.devDependencies || {})
};
for (const dependency of Object.keys(allDependencies)) {
  if (/^(tldraw|@tldraw\/|@excalidraw\/)/i.test(dependency)) {
    fail(`package.json: plugin-only canvas dependency ${dependency} belongs in image-agent-canvas.`);
  }
}

assertNoPublicOldIdentity();

if (failures.length) {
  console.error(`Naming boundary check failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('Naming boundary check passed.');
