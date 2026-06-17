import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function unique(items) {
  return [...new Set(items)].sort();
}

function envExampleKeys() {
  return new Set(read('.env.example')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => line.split('=')[0].trim()));
}

function extractImportMetaEnvKeys(file) {
  return unique([...read(file).matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)].map((match) => match[1]));
}

function extractProcessEnvKeys(file) {
  return unique([...read(file).matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((match) => match[1]));
}

function mustContain(file, text, reason) {
  if (!read(file).includes(text)) {
    fail(`${file}: missing ${text} (${reason})`);
  }
}

const exampleKeys = envExampleKeys();
const frontendEnvKeys = unique([
  ...extractImportMetaEnvKeys('src/aiGatewayClient.js'),
  ...extractImportMetaEnvKeys('src/studio.jsx')
]).filter((key) => key !== 'DEV' && key !== 'BASE_URL');
const dockerFrontendEnvKeys = frontendEnvKeys.filter((key) => key.startsWith('VITE_') && !key.startsWith('VITE_DEV_'));

const historyEnvKeys = extractProcessEnvKeys('scripts/image-sub2api-studio-history-service.mjs')
  .filter((key) => !['PORT', 'HOST'].includes(key));

for (const key of unique([...frontendEnvKeys, ...historyEnvKeys])) {
  if (!exampleKeys.has(key)) {
    fail(`.env.example: missing ${key} used by runtime code`);
  }
}

for (const key of dockerFrontendEnvKeys) {
  mustContain('Dockerfile', `ARG ${key}=`, `Vite build env ${key} must be accepted as a Docker build arg`);
  mustContain('Dockerfile', `ENV ${key}=$${key}`, `Vite build env ${key} must be exposed to npm run build`);
  mustContain('docker-compose.yml', `${key}:`, `Vite build env ${key} must be configurable in Compose`);
}

for (const key of [
  'AI_GATEWAY_BASE_URL',
  'SUB2API_BASE_URL',
  'STUDIO_AUTH_MODE',
  'STUDIO_DATA_DIR',
  'STUDIO_LIBRARY_DIR',
  'STUDIO_LIBRARY_ASSET_DIR',
  'STUDIO_HISTORY_LIMIT',
  'STUDIO_SESSION_NODE_LIMIT',
  'STUDIO_SESSION_URL_LIMIT',
  'STUDIO_SESSION_QUEUE_LIMIT',
  'STUDIO_SESSION_MESSAGE_LIMIT',
  'STUDIO_JOB_LIMIT',
  'STUDIO_JOB_TIMEOUT_MS',
  'STUDIO_GATEWAY_FETCH_TIMEOUT_MS',
  'STUDIO_JOB_CONCURRENCY',
  'STUDIO_MAX_BODY_BYTES',
  'STUDIO_MAX_IMAGE_BYTES',
  'STUDIO_ALLOWED_ORIGINS'
]) {
  mustContain('docker-compose.yml', `${key}:`, `history service env ${key} must be passed in Docker Compose`);
}

for (const key of [
  'AI_GATEWAY_UPSTREAM',
  'SUB2API_UPSTREAM',
  'STUDIO_AUTH_MODE',
  'STUDIO_HISTORY_LIMIT',
  'STUDIO_SESSION_NODE_LIMIT',
  'STUDIO_SESSION_URL_LIMIT',
  'STUDIO_SESSION_QUEUE_LIMIT',
  'STUDIO_SESSION_MESSAGE_LIMIT',
  'STUDIO_JOB_LIMIT',
  'STUDIO_JOB_TIMEOUT_MS',
  'STUDIO_GATEWAY_FETCH_TIMEOUT_MS',
  'STUDIO_JOB_CONCURRENCY',
  'STUDIO_MAX_BODY_BYTES',
  'STUDIO_MAX_IMAGE_BYTES',
  'STUDIO_ALLOWED_ORIGINS'
]) {
  if (!exampleKeys.has(key)) {
    fail(`.env.example: missing Docker/runtime key ${key}`);
  }
}

if (failures.length) {
  console.error(`Environment contract check failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('Environment contract check passed.');
