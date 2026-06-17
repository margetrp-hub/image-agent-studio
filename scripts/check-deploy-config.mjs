import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function mustInclude(file, text, reason) {
  const body = read(file);
  if (!body.includes(text)) {
    failures.push(`${file}: missing ${JSON.stringify(text)} (${reason})`);
  }
}

function mustMatch(file, pattern, reason) {
  const body = read(file);
  if (!pattern.test(body)) {
    failures.push(`${file}: does not match ${pattern} (${reason})`);
  }
}

function mustScriptInclude(scriptName, command, reason) {
  const pkg = JSON.parse(read('package.json'));
  const script = pkg.scripts?.[scriptName] || '';
  if (!script.includes(command)) {
    failures.push(`package.json: script ${scriptName} missing ${JSON.stringify(command)} (${reason})`);
  }
}

mustMatch('vite.config.js', /base:\s*process\.env\.STUDIO_BASE_PATH\s*\|\|\s*process\.env\.VITE_BASE_PATH\s*,/, 'Vite must let CLI --base or STUDIO_BASE_PATH control /studio/ builds');

mustInclude('docker-compose.yml', 'VITE_BASE_PATH: ${VITE_BASE_PATH:-/studio/}', 'Docker web image should build for /studio/');
mustInclude('docker-compose.yml', 'STUDIO_BASE_PATH: ${STUDIO_BASE_PATH:-/studio/}', 'Docker web image should build with matching Studio base path');
mustInclude('docker-compose.yml', 'STUDIO_HISTORY_UPSTREAM: http://studio-history:8787', 'Nginx must proxy the history service container');
mustInclude('docker-compose.yml', 'STUDIO_AUTH_MODE: ${STUDIO_AUTH_MODE:-local}', 'Docker should support account-system-free local persistence');
mustInclude('docker-compose.yml', 'studio-data:/data', 'History, sessions, jobs, and generated assets must persist in a volume');
mustInclude('docker-compose.yml', 'STUDIO_JOB_CONCURRENCY: ${STUDIO_JOB_CONCURRENCY:-1}', 'Server-side queue concurrency must be explicit and conservative');
mustInclude('docker-compose.yml', 'STUDIO_GATEWAY_FETCH_TIMEOUT_MS: ${STUDIO_GATEWAY_FETCH_TIMEOUT_MS:-2640000}', 'Gateway fetch timeout must outlast slow native image jobs');

mustInclude('deploy/docker-nginx.conf.template', 'location /studio/', 'Docker Nginx must serve the Studio route');
mustInclude('deploy/docker-nginx.conf.template', 'try_files $uri $uri/ /studio.html;', 'Studio route must SPA-fallback to studio.html');
mustInclude('deploy/docker-nginx.conf.template', 'location /studio-api/', 'Docker Nginx must expose the persistence API');
mustInclude('deploy/docker-nginx.conf.template', 'proxy_pass ${STUDIO_HISTORY_UPSTREAM};', 'Persistence API must proxy to studio-history');
mustInclude('deploy/docker-nginx.conf.template', 'location /v1/images/', 'Image generation and edits must proxy through the same domain');
mustInclude('deploy/docker-nginx.conf.template', 'location /v1/chat/completions', 'Prompt assistant route must proxy through the same domain');
mustInclude('deploy/docker-nginx.conf.template', 'client_max_body_size ${STUDIO_NGINX_CLIENT_MAX_BODY_SIZE};', 'Reference image uploads need an explicit body limit');

mustInclude('deploy/sync-from-git.sh', 'STATIC_DIR="${STATIC_DIR:-/var/www/ohlaoo-studio}"', 'Git sync should default to the current VPS static root');
mustInclude('deploy/sync-from-git.sh', 'rm -rf "$STATIC_DIR/studio-assets"', 'Git sync should replace hashed assets without deleting the persistent data directory');
mustInclude('deploy/sync-from-git.sh', 'STUDIO_DATA_DIR=$DATA_DIR', 'Git sync must preserve and reuse the configured persistent data directory');
mustInclude('deploy/sync-from-git.sh', 'curl -fsS "$HEALTH_URL"', 'Git sync must verify the local history service health endpoint');
mustInclude('deploy/nginx-sub2api-studio.conf', 'alias /var/www/ohlaoo-studio/;', 'Nginx static root must match the Git sync default STATIC_DIR');
mustInclude('deploy/nginx-sub2api-studio.conf', 'alias /var/www/ohlaoo-studio/studio-assets/;', 'Nginx asset root must match the Git sync default STATIC_DIR');
mustInclude('deploy/nginx-sub2api-studio.conf', 'proxy_pass http://127.0.0.1:8787/studio-api/;', 'Nginx must proxy the Studio persistence API to the local service');
mustInclude('deploy/nginx-sub2api-studio.conf', 'location /v1/images/', 'Nginx must expose image generation and edits through the same public origin');

mustInclude('scripts/package-release.mjs', 'image-agent-studio-core-update-${stamp}.zip', 'Release packages should use the Image Agent Studio name');
mustInclude('scripts/package-release.mjs', 'image-agent-studio-service-update-${stamp}.zip', 'Service packages should use the Image Agent Studio name');
mustInclude('README.md', 'image-agent-studio-core-update-*.zip', 'README must document the new package name');
mustInclude('README.zh-CN.md', 'image-agent-studio-core-update-*.zip', 'Chinese README must document the new package name');
mustInclude('deploy/UPDATE-SERVER.zh-CN.md', 'image-agent-studio-core-update-YYYYMMDD-HHMMSS.zip', 'VPS update guide must prefer the new package name');

mustInclude('Dockerfile', 'COPY --from=builder /app/dist /usr/share/nginx/html', 'Web image must serve built assets');
mustInclude('Dockerfile', 'ARG VITE_AI_GATEWAY_BASE_URL=', 'Docker web build must accept provider-neutral gateway base URL');
mustInclude('Dockerfile', 'ARG VITE_AI_GATEWAY_MODEL_BASE_URL=', 'Docker web build must accept provider-neutral model gateway base URL');
mustInclude('Dockerfile', 'ARG VITE_AI_IMAGE_ROUTE=auto', 'Docker web build must default provider-neutral image routing to auto');
mustInclude('Dockerfile', 'ENV VITE_AI_GATEWAY_BASE_URL=$VITE_AI_GATEWAY_BASE_URL', 'Docker web build must expose provider-neutral gateway base URL to Vite');
mustInclude('Dockerfile', 'ENV VITE_AI_GATEWAY_MODEL_BASE_URL=$VITE_AI_GATEWAY_MODEL_BASE_URL', 'Docker web build must expose provider-neutral model gateway base URL to Vite');
mustInclude('Dockerfile', 'ARG VITE_SUB2API_BASE_URL=', 'Docker web build must keep legacy Sub2API build args for upgrades');
mustInclude('Dockerfile', 'CMD ["node", "scripts/image-sub2api-studio-history-service.mjs"]', 'History image must start the persistence service');
mustInclude('Dockerfile', 'ENV STUDIO_DATA_DIR=/data', 'History image must write to the mounted data volume');

mustInclude('.dockerignore', 'node_modules', 'Docker context must not include local dependencies');
mustInclude('.dockerignore', 'dist', 'Docker context must not include stale build output');
mustInclude('.dockerignore', '.image-sub2api-studio-data', 'Docker context must not include local persisted data');
mustInclude('.dockerignore', '.env', 'Docker context must not include local secrets');
mustInclude('.dockerignore', 'output', 'Docker context must not include Playwright screenshots');
mustInclude('.dockerignore', 'release', 'Docker context must not include generated release packages');

mustInclude('.env.example', 'STUDIO_AUTH_MODE=local', 'Example config must document local persistence mode');
mustInclude('.env.example', 'AI_GATEWAY_UPSTREAM=http://host.docker.internal:8080', 'Example config must document host gateway proxying');
mustInclude('.env.example', 'STUDIO_ALLOWED_ORIGINS=https://studio.example.com', 'Example config must document production origin allow-listing');

mustInclude('package.json', '"check:docker": "node scripts/check-docker-compose.mjs"', 'Docker Compose config must have a dedicated parsed-config check');
mustInclude('package.json', '"check:docs": "node scripts/check-doc-encoding.mjs"', 'Documentation encoding must have a dedicated pre-release check');
mustInclude('package.json', '"check:html": "node scripts/check-html-entrypoints.mjs"', 'HTML entrypoints must have a dedicated pre-release check');
mustInclude('package.json', '"check:source": "node scripts/check-source-encoding.mjs"', 'Source encoding must have a dedicated pre-release check');
mustInclude('package.json', '"check:env": "node scripts/check-env-contract.mjs"', 'Runtime environment variables must have a dedicated sync check');
mustInclude('package.json', '"check:public-data": "node scripts/check-public-data.mjs"', 'Public starter data must have a dedicated structure, license, and encoding check');
mustInclude('package.json', '"check:repo": "node scripts/check-repo-clean.mjs"', 'Repository cleanliness must have a dedicated pre-release check');
mustInclude('package.json', '"check:release": "node scripts/check-release-packages.mjs"', 'Release package structure must have a dedicated check');
mustInclude('package.json', '"audit:readiness": "node scripts/audit-release-readiness.mjs"', 'Release readiness must have one explicit final audit command');
mustInclude('package.json', '"package:release": "node scripts/package-release.mjs && npm run check:release"', 'Release packaging must build packages and verify them in one command');
mustInclude('package.json', '"check:studio-base": "node scripts/check-studio-build-base.mjs"', 'Subpath builds must have a dedicated asset-base check');
mustInclude('package.json', '"check:studio-build": "npm run build:studio && npm run check:studio-base"', 'Subpath build check must rebuild before inspecting dist/studio.html');
mustInclude('package.json', '"smoke:history": "npm exec --yes --package=playwright -- node scripts/smoke-history-session.mjs"', 'Browser history/session recovery smoke must stay available');
mustInclude('package.json', '"smoke:history:idb": "npm exec --yes --package=playwright -- node scripts/smoke-history-indexeddb.mjs"', 'IndexedDB history recovery smoke must stay available');
mustInclude('package.json', '"smoke:projects": "npm exec --yes --package=playwright -- node scripts/smoke-project-session-grouping.mjs"', 'Sidebar projects must stay grouped by conversation/session');
mustInclude('package.json', '"smoke:image:route": "npm exec --yes --package=playwright -- node scripts/smoke-image-generation-route.mjs"', 'Text-to-image must keep using /v1/images/generations by default');
mustInclude('package.json', '"smoke:image:edit-route": "npm exec --yes --package=playwright -- node scripts/smoke-image-edit-route.mjs"', 'Reference image editing must keep using /v1/images/edits');
mustInclude('package.json', '"smoke:references": "npm exec --yes --package=playwright -- node scripts/smoke-reference-upload-preview.mjs"', 'Reference upload previews must stay visible and inspectable');
mustInclude('package.json', '"smoke:provider:security": "npm exec --yes --package=playwright -- node scripts/smoke-provider-settings-security.mjs"', 'Manual provider API keys must never persist in localStorage');
mustInclude('package.json', '"smoke:composer:layout": "npm exec --yes --package=playwright -- node scripts/smoke-composer-layout.mjs"', 'Bottom composer layout must stay non-overlapping on desktop and mobile');
mustInclude('package.json', '"smoke:canvas:performance": "npm exec --yes --package=playwright -- node scripts/smoke-canvas-performance.mjs"', 'Large canvas performance smoke must stay available');
mustInclude('package.json', '"smoke:canvas:blob-cleanup": "npm exec --yes --package=playwright -- node scripts/smoke-canvas-blob-cleanup.mjs"', 'Canvas blob URL cleanup smoke must stay available');
mustInclude('package.json', '"smoke:history:windowing": "npm exec --yes --package=playwright -- node scripts/smoke-history-windowing.mjs"', 'History gallery windowing smoke must stay available');
mustInclude('package.json', '"smoke:inspiration:windowing": "npm exec --yes --package=playwright -- node scripts/smoke-inspiration-windowing.mjs"', 'Video inspiration gallery windowing smoke must stay available');
mustInclude('package.json', '"smoke:template:windowing": "npm exec --yes --package=playwright -- node scripts/smoke-template-windowing.mjs"', 'Template gallery windowing smoke must stay available');
mustInclude('package.json', '"smoke:language:en": "npm exec --yes --package=playwright -- node scripts/smoke-language-english.mjs"', 'English UI smoke must stay available');
mustInclude('package.json', '"smoke:persistence": "node scripts/smoke-history-service-persistence.mjs"', 'Persistence, cancel, restart, and key-leak smoke must stay available');
mustInclude('package.json', '"smoke:docker": "node scripts/smoke-docker-runtime.mjs"', 'Docker runtime smoke must stay available for container deployment verification');

[
  'npm run build',
  'npm run check:studio-build',
  'npm run check:providers',
  'npm run check:deploy',
  'npm run check:docker',
  'npm run check:docs',
  'npm run check:html',
  'npm run check:source',
  'npm run check:i18n',
  'npm run check:env',
  'npm run check:public-data',
  'npm run check:repo',
  'npm run smoke:persistence',
  'npm run smoke:gateway:auth',
  'npm run smoke:history',
  'npm run smoke:history:idb',
  'npm run smoke:projects',
  'npm run smoke:history:queue',
  'npm run smoke:image:route',
  'npm run smoke:image:edit-route',
  'npm run smoke:session:modes',
  'npm run smoke:references',
  'npm run smoke:provider:security',
  'npm run smoke:composer:layout',
  'npm run smoke:canvas:performance',
  'npm run smoke:canvas:blob-cleanup',
  'npm run smoke:history:windowing',
  'npm run smoke:inspiration:windowing',
  'npm run smoke:template:windowing',
  'npm run smoke:language:en'
].forEach((command) => {
  mustScriptInclude('check:local', command, 'Local pre-release gate must cover build, routing, Docker config, persistence, browser recovery, queue recovery, IndexedDB history recovery, history gallery windowing, inspiration gallery windowing, and template gallery windowing');
});

if (failures.length) {
  console.error(`Deployment config check failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('Deployment config check passed.');
