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

async function main() {
  if (!(await exists(distDir))) {
    throw new Error('dist/ not found. Run `npm run build` first.');
  }

  const stamp = stampLocal();
  const tempDir = join(tmpdir(), `image-sub2api-studio-core-${stamp}`);
  const zipPath = join(releaseDir, `image-sub2api-studio-core-update-${stamp}.zip`);

  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });
  await mkdir(releaseDir, { recursive: true });

  for (const item of include) {
    const source = join(distDir, item);
    if (!(await exists(source))) continue;
    await cp(source, join(tempDir, item), { recursive: true });
  }

  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path (Join-Path '${tempDir.replace(/'/g, "''")}' '*') -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`
    ],
    { stdio: 'inherit' }
  );

  await rm(tempDir, { recursive: true, force: true });
  console.log(zipPath);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
