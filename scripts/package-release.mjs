import { mkdir, rm, stat } from 'node:fs/promises';
import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const distDir = join(root, 'dist');
const releaseDir = join(root, 'release');
const include = [
  'index.html',
  'studio.html',
  'favicon.svg',
  'demo-canvas-1.svg',
  'demo-canvas-2.svg',
  'cases.json',
  'inspirations.json',
  'inspiration-sources.json',
  'style-library.json',
  'studio-assets'
];
const serviceInclude = [
  'package.json',
  'package-lock.json',
  'scripts/image-sub2api-studio-history-service.mjs',
  'deploy/sync-from-git.sh',
  'deploy/image-sub2api-studio-history.service',
  'deploy/nginx-sub2api-studio.conf',
  'deploy/UPDATE-SERVER.zh-CN.md',
  'docs/VPS-GIT-SYNC.zh-CN.md'
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function stampLocal(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('');
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function zipDirectory(sourceDir, zipPath) {
  if (process.platform === 'win32') {
    execFileSync('tar.exe', ['-a', '-cf', zipPath, '-C', sourceDir, '.'], { stdio: 'inherit' });
    return;
  }
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: sourceDir, stdio: 'inherit' });
}

async function main() {
  execFileSync(
    process.platform === 'win32' ? 'cmd.exe' : 'npm',
    process.platform === 'win32' ? ['/c', 'npm', 'run', 'build:studio'] : ['run', 'build:studio'],
    { stdio: 'inherit' }
  );

  if (!(await exists(distDir))) {
    throw new Error('dist/ not found. Run `npm run build` first.');
  }

  const stamp = stampLocal();
  const tempDir = join(tmpdir(), `image-agent-studio-core-${stamp}`);
  const serviceTempDir = join(tmpdir(), `image-agent-studio-service-${stamp}`);
  const zipPath = join(releaseDir, `image-agent-studio-core-update-${stamp}.zip`);
  const serviceZipPath = join(releaseDir, `image-agent-studio-service-update-${stamp}.zip`);

  await rm(tempDir, { recursive: true, force: true });
  await rm(serviceTempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });
  await mkdir(serviceTempDir, { recursive: true });
  await mkdir(releaseDir, { recursive: true });

  for (const item of include) {
    const source = join(distDir, item);
    if (!(await exists(source))) continue;
    await cp(source, join(tempDir, item), { recursive: true });
  }

  for (const item of serviceInclude) {
    const source = join(root, item);
    if (!(await exists(source))) continue;
    await cp(source, join(serviceTempDir, item), { recursive: true });
  }

  zipDirectory(tempDir, zipPath);
  zipDirectory(serviceTempDir, serviceZipPath);

  await rm(tempDir, { recursive: true, force: true });
  await rm(serviceTempDir, { recursive: true, force: true });
  console.log(zipPath);
  console.log(serviceZipPath);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
