import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkPublicData } from './check-public-data.mjs';

const root = process.cwd();
const releaseDir = path.join(root, 'release');
const failures = [];
const legacyReleasePatterns = [
  /^image-sub2api-studio-(core|service)-update-.*\.zip$/,
  /^ai-image-workbench-(core|service)-update-.*\.zip$/
];

function fail(message) {
  failures.push(message);
}

function filesFor(prefix) {
  if (!fs.existsSync(releaseDir)) return [];
  return fs.readdirSync(releaseDir)
    .filter((file) => file.startsWith(prefix) && file.endsWith('.zip'))
    .sort();
}

function assertNoLegacyPackages() {
  if (!fs.existsSync(releaseDir)) return;
  const legacyFiles = fs.readdirSync(releaseDir)
    .filter((file) => legacyReleasePatterns.some((pattern) => pattern.test(file)))
    .sort();
  for (const file of legacyFiles) {
    fail(`release/${file}: remove legacy package; release artifacts must use image-agent-studio-* only.`);
  }
}

function latestPackage(kind) {
  const prefix = `image-agent-studio-${kind}-update-`;
  const file = filesFor(prefix).at(-1);
  if (!file) return null;
  const stamp = file.slice(prefix.length, -'.zip'.length);
  return {
    stamp,
    file: path.join(releaseDir, file)
  };
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listZip(file) {
  return execFileSync('tar', ['-tf', file], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((item) => item.replace(/^\.\//, '').trim())
    .filter(Boolean);
}

function extractZip(file, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  execFileSync('tar', ['-xf', file, '-C', targetDir], { stdio: 'ignore' });
}

function assertPair(kind, requiredEntries) {
  const pkg = latestPackage(kind);
  if (!pkg) {
    fail(`release/: missing image-agent-studio ${kind} package.`);
    return;
  }
  const entries = new Set(listZip(pkg.file));
  for (const entry of requiredEntries) {
    if (!entries.has(entry)) fail(`${path.basename(pkg.file)}: missing ${entry}.`);
  }

  if (kind === 'core') {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `image-agent-studio-${kind}-${pkg.stamp}-`));
    try {
      extractZip(pkg.file, tempDir);
      for (const item of checkPublicData({ baseDir: tempDir, prefix: '' })) {
        fail(`${path.basename(pkg.file)}: ${item}`);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

assertNoLegacyPackages();

assertPair('core', [
  'index.html',
  'studio.html',
  'studio-assets/',
  'cases.json',
  'inspirations.json',
  'inspiration-sources.json',
  'style-library.json'
]);

assertPair('service', [
  'package.json',
  'package-lock.json',
  'scripts/image-agent-studio-history-service.mjs',
  'scripts/image-sub2api-studio-history-service.mjs',
  'deploy/sync-from-git.sh',
  'deploy/install.sh',
  'deploy/upgrade.sh',
  'deploy/backup.sh',
  'deploy/restore.sh',
  'deploy/self-check.sh',
  'deploy/image-agent-studio-history.service',
  'deploy/image-sub2api-studio-history.service',
  'deploy/nginx-image-agent-studio.conf',
  'deploy/nginx-sub2api-studio.conf',
  'deploy/UPDATE-SERVER.zh-CN.md',
  'docs/DEPLOY.zh-CN.md',
  'docs/DOCKER.zh-CN.md',
  'docs/PROVIDERS.md',
  'docs/VPS-GIT-SYNC.zh-CN.md'
]);

if (failures.length) {
  console.error(`Release package check failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('Release package check passed.');
