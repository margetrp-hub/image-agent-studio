import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, copyTracked, copyDist, prepare, finish } from './lite-artifacts.mjs';

// Explicit flags prevent a developer's full-version environment from leaking admin UI.
process.env.VITE_STUDIO_STANDALONE = 'false';
process.env.VITE_STUDIO_GATEWAY_PROXY = 'true';
process.env.STUDIO_BASE_PATH = '/studio/';
execFileSync(process.execPath, ['scripts/build-studio.mjs'], { cwd: root, stdio: 'inherit' });
const info = await prepare('image-agent-studio');
await copyDist(info.stage);
if (await fs.stat(path.join(info.stage, 'dist/admin.html')).then(() => true, () => false)) throw new Error('Admin page in lite package');
for (const file of ['scripts/image-agent-studio-history-service.mjs', 'scripts/studio-service', 'LICENSE']) await copyTracked(info.stage, file);
await copyTracked(info.stage, 'deploy/service-runtime/package.json', 'package.json');
await copyTracked(info.stage, 'deploy/service-runtime/package-lock.json', 'package-lock.json');
await copyTracked(info.stage, 'deploy/docker-nginx.conf.template', 'nginx.conf.template');
await copyTracked(info.stage, 'deploy/lite', '');
await copyTracked(info.stage, 'public', 'library');
await finish(info);
