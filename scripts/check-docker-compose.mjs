import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

function assert(condition, message, evidence) {
  if (!condition) {
    const suffix = evidence ? `\n${JSON.stringify(evidence, null, 2)}` : '';
    throw new Error(`${message}${suffix}`);
  }
}

function composeConfigJson() {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'docker';
  const args = process.platform === 'win32'
    ? ['/d', '/c', 'docker', 'compose', '--env-file', '.env.example', '--profile', 'gradual-go', 'config', '--format', 'json']
    : ['compose', '--env-file', '.env.example', '--profile', 'gradual-go', 'config', '--format', 'json'];
  const raw = execFileSync(command, args, { encoding: 'utf8' });
  return JSON.parse(raw);
}

const config = composeConfigJson();
const services = config.services || {};
const web = services['studio-web'];
const history = services['studio-history'];
const serverGo = services['studio-server-go'];

assert(web, 'Docker Compose must define studio-web.');
assert(history, 'Docker Compose must define studio-history.');
assert(serverGo, 'Docker Compose must define the optional studio-server-go service.');

assert(web.build?.target === 'web', 'studio-web must build the web target.', web.build);
assert(history.build?.target === 'history', 'studio-history must build the history target.', history.build);
assert(serverGo.build?.target === 'server-go', 'studio-server-go must build the server-go target.', serverGo.build);
assert(serverGo.profiles?.length === 1 && serverGo.profiles[0] === 'gradual-go', 'studio-server-go must remain behind the gradual-go profile.', serverGo.profiles);
assert(web.build?.args?.VITE_BASE_PATH === '/studio/', 'studio-web must build assets for /studio/.', web.build?.args);
assert(web.build?.args?.STUDIO_BASE_PATH === '/studio/', 'studio-web must pass STUDIO_BASE_PATH=/studio/.', web.build?.args);
assert(web.build?.args?.VITE_AI_IMAGE_ROUTE === 'auto', 'studio-web must default image route to auto.', web.build?.args);
assert(web.environment?.STUDIO_HISTORY_UPSTREAM === 'http://studio-history:8787', 'studio-web must proxy to studio-history.', web.environment);
assert(!('AI_GATEWAY_UPSTREAM' in (web.environment || {})), 'standalone studio-web must not expose a direct gateway upstream.', web.environment);
assert(web.depends_on?.['studio-history']?.condition === 'service_healthy', 'studio-web must wait for a healthy history service.', web.depends_on);
assert(web.healthcheck?.test?.join(' ').includes('/studio/'), 'studio-web healthcheck must verify /studio/.', web.healthcheck);
assert(web.healthcheck?.interval === '30s' && web.healthcheck?.timeout === '5s' && web.healthcheck?.retries === 5, 'studio-web healthcheck must keep production timing.', web.healthcheck);

const webPort = web.ports?.[0];
assert(webPort?.target === 80 && String(webPort.published) === '8080', 'studio-web must publish host 8080 to container 80 by default.', web.ports);

assert(web.build?.args?.VITE_STUDIO_STANDALONE === 'true', 'studio-web must default to the standalone login path.', web.build?.args);
assert(history.environment?.STUDIO_AUTH_MODE === 'standalone', 'studio-history must default to Studio-owned authentication.', history.environment);
assert(history.environment?.STUDIO_AUTH_REGISTRATION_MODE === 'open', 'studio-history must default to user self-registration.', history.environment);
assert(history.environment?.STUDIO_PROVIDER_TYPE === 'openai-compatible', 'studio-history must expose the provider family setting.', history.environment);
assert(history.environment?.STUDIO_DATA_DIR === '/data', 'studio-history must write persisted data to /data.', history.environment);
assert(history.environment?.STUDIO_VERSION === '1.0.0', 'studio-history must expose the documented service version.', history.environment);
assert(history.environment?.STUDIO_GATEWAY_FETCH_TIMEOUT_MS === '2640000', 'studio-history must allow slow native image jobs to outlast the default fetch timeout.', history.environment);
assert(history.environment?.STUDIO_JOB_CONCURRENCY === '1', 'studio-history must default to conservative job concurrency.', history.environment);
assert(history.environment?.STUDIO_ALLOWED_ORIGINS === 'https://studio.example.com', 'studio-history must read allowed origins from .env.example.', history.environment);
assert(history.healthcheck?.test?.join(' ').includes('/studio-api/health'), 'studio-history healthcheck must verify /studio-api/health.', history.healthcheck);
assert(history.healthcheck?.interval === '30s' && history.healthcheck?.timeout === '5s' && history.healthcheck?.retries === 5, 'studio-history healthcheck must keep production timing.', history.healthcheck);
assert(web.image === 'image-agent-studio-web:local', 'studio-web image must use the Image Agent Studio name.', web.image);
assert(history.image === 'image-agent-studio-history:local', 'studio-history image must use the Image Agent Studio name.', history.image);
assert(serverGo.image === 'image-agent-studio-server-go:local', 'studio-server-go image must use the Image Agent Studio name.', serverGo.image);

const serverGoPort = serverGo.ports?.[0];
assert(serverGoPort?.target === 8788 && String(serverGoPort.published) === '8788', 'studio-server-go must publish host 8788 to container 8788 by default.', serverGo.ports);
assert(serverGo.environment?.STUDIO_GO_HOST === '0.0.0.0', 'studio-server-go must listen on all container interfaces.', serverGo.environment);
assert(String(serverGo.environment?.STUDIO_GO_PORT) === '8788', 'studio-server-go must listen on container port 8788.', serverGo.environment);
assert(serverGo.environment?.STUDIO_DATA_DIR === '/data/server-go', 'studio-server-go must isolate gradual data below the shared volume.', serverGo.environment);
assert(serverGo.environment?.STUDIO_VERSION === '1.0.0', 'studio-server-go must expose the documented service version.', serverGo.environment);
assert('STUDIO_MASTER_KEY' in (serverGo.environment || {}), 'studio-server-go must accept the server-side master key.', serverGo.environment);
assert(serverGo.environment?.STUDIO_MASTER_KEY_VERSION === 'v1', 'studio-server-go must expose the master key version.', serverGo.environment);
assert(String(serverGo.environment?.STUDIO_ALLOW_PRIVATE_PROVIDER_URLS) === 'false', 'studio-server-go must block private provider URLs by default.', serverGo.environment);
assert(String(serverGo.environment?.STUDIO_REGISTRATION_ENABLED) === 'true', 'studio-server-go must expose registration control.', serverGo.environment);
assert(String(serverGo.environment?.STUDIO_ASSET_MAX_BYTES) === '268435456', 'studio-server-go must expose the asset size limit.', serverGo.environment);
assert(String(serverGo.environment?.STUDIO_GO_EXECUTION_ENABLED) === 'false', 'studio-server-go execution must remain disabled by default.', serverGo.environment);
assert(String(serverGo.environment?.STUDIO_GO_EXECUTION_TIMEOUT_SECONDS) === '300', 'studio-server-go must expose a bounded execution timeout.', serverGo.environment);
assert(serverGo.environment?.STUDIO_ALLOWED_ORIGINS === 'https://studio.example.com', 'studio-server-go must read allowed origins from .env.example.', serverGo.environment);
assert(serverGo.healthcheck?.test?.join(' ').includes('127.0.0.1:8788/studio-api/health'), 'studio-server-go healthcheck must verify /studio-api/health.', serverGo.healthcheck);
assert(serverGo.healthcheck?.interval === '30s' && serverGo.healthcheck?.timeout === '5s' && serverGo.healthcheck?.retries === 5, 'studio-server-go healthcheck must keep production timing.', serverGo.healthcheck);

const historyVolumes = history.volumes || [];
assert(historyVolumes.some((volume) => volume.type === 'volume' && volume.source === 'studio-data' && volume.target === '/data'), 'studio-history must persist /data in the studio-data volume.', historyVolumes);
assert(historyVolumes.some((volume) => volume.type === 'bind' && volume.target === '/app/library' && volume.read_only === true), 'studio-history must mount library data read-only.', historyVolumes);
const serverGoVolumes = serverGo.volumes || [];
assert(serverGoVolumes.some((volume) => volume.type === 'volume' && volume.source === 'studio-data' && volume.target === '/data'), 'studio-server-go must reuse the studio-data volume.', serverGoVolumes);
assert(config.volumes?.['studio-data'], 'Docker Compose must declare the studio-data volume.', config.volumes);

const dockerDoc = fs.readFileSync('docs/DOCKER.zh-CN.md', 'utf8');
const deployDoc = fs.readFileSync('docs/DEPLOY.zh-CN.md', 'utf8');
const nginxTemplate = fs.readFileSync('deploy/docker-nginx.conf.template', 'utf8');
const upgradeScript = fs.readFileSync('scripts/ops-upgrade.mjs', 'utf8');
const selfCheckScript = fs.readFileSync('scripts/ops-self-check.mjs', 'utf8');

assert(dockerDoc.includes('docker compose --env-file .env.example config') && dockerDoc.includes('npm run check:docker'), 'Docker doc must include compose/static validation commands.');
assert(dockerDoc.includes('npm run ops:self-check'), 'Docker doc must include the production self-check command.');
assert(dockerDoc.includes('npm run ops:upgrade'), 'Docker doc must document the upgrade helper.');
assert(dockerDoc.includes('STUDIO_SKIP_BACKUP=true'), 'Docker doc must mention the explicit backup bypass flag.');
assert(dockerDoc.includes('STUDIO_SKIP_PULL=true'), 'Docker doc must mention the local-image pull bypass flag.');
assert(dockerDoc.includes('STUDIO_VERSION=1.0.0'), 'Docker doc must document the Docker service version.');
assert(dockerDoc.includes('image-agent-studio-web:local') && dockerDoc.includes('image-agent-studio-history:local'), 'Docker doc must use the Image Agent Studio image names.');
assert(deployDoc.includes('npm run check:docker') && deployDoc.includes('npm run smoke:docker'), 'Deploy doc must include Docker verification commands.');
for (const route of ['location /v1/', 'location /api/', 'location /login']) {
  assert(!nginxTemplate.includes(route), `standalone Docker Nginx must not expose ${route}.`);
}
assert(nginxTemplate.includes('proxy_pass ${STUDIO_HISTORY_UPSTREAM};'), 'standalone Docker Nginx must keep the Node history upstream as the default.', nginxTemplate);
assert(upgradeScript.includes('ops-backup.mjs') && upgradeScript.includes('ops-self-check.mjs'), 'Upgrade script must run backup before deploy and self-check after deploy.');
assert(upgradeScript.includes('STUDIO_SKIP_BACKUP') && upgradeScript.includes('STUDIO_SKIP_PULL'), 'Upgrade script must keep explicit backup/pull bypass flags.');
assert(selfCheckScript.includes('/studio-api/health') && selfCheckScript.includes('/studio/'), 'Self-check script must verify Studio and history health endpoints.');

console.log('Docker Compose check passed.');
