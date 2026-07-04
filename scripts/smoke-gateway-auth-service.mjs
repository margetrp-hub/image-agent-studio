import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-image-workbench-gateway-auth-'));
const token = 'gateway-auth-smoke-token';
const port = 21000 + Math.floor(Math.random() * 1000);
const gatewayPort = port + 1000;
const baseUrl = `http://127.0.0.1:${port}`;
const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;
const userId = 'gateway-auth-user-1';
const userKey = createHash('sha256').update(userId).digest('hex');

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/studio-api/health`);
      if (response.ok) return;
    } catch {
      // Service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('History service did not become healthy.');
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP_${response.status}`);
  }
  return payload;
}

const gatewayHits = [];
const gateway = http.createServer((req, res) => {
  gatewayHits.push({
    url: req.url,
    auth: String(req.headers.authorization || '')
  });
  if (req.url === '/api/v1/auth/me') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      code: 0,
      data: {
        id: userId,
        email: 'gateway-auth-smoke@example.com',
        username: 'Gateway Auth Smoke'
      }
    }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'not found' }));
});

await new Promise((resolve) => gateway.listen(gatewayPort, '127.0.0.1', resolve));

const child = spawn(process.execPath, ['scripts/image-sub2api-studio-history-service.mjs'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: {
    ...process.env,
    PORT: String(port),
    STUDIO_HISTORY_PORT: String(port),
    STUDIO_HISTORY_HOST: '127.0.0.1',
    STUDIO_AUTH_MODE: 'gateway',
    AI_GATEWAY_BASE_URL: gatewayBaseUrl,
    STUDIO_DATA_DIR: dataDir,
    STUDIO_ALLOWED_ORIGINS: 'http://127.0.0.1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

try {
  await waitForHealth();
  const session = {
    sessionId: 'gateway-auth-session',
    mode: 'image',
    prompt: 'gateway auth smoke prompt',
    canvasNodes: [],
    results: []
  };
  await request('/studio-api/session', {
    method: 'POST',
    body: JSON.stringify(session)
  });
  const loaded = await request(`/studio-api/session?sessionId=${encodeURIComponent(session.sessionId)}`);
  const files = await fs.readdir(path.join(dataDir, 'users', userKey));
  const sessionFiles = await fs.readdir(path.join(dataDir, 'users', userKey, 'sessions'));

  assert(loaded.session?.sessionId === session.sessionId, 'Gateway-authenticated session should round-trip.', loaded);
  assert(files.includes('sessions'), 'Gateway-authenticated user directory should persist session directory.', files);
  assert(sessionFiles.includes(`${session.sessionId}.json`), 'Gateway-authenticated session should persist under sessions/<sessionId>.json.', sessionFiles);
  assert(gatewayHits.some((hit) => hit.url === '/api/v1/auth/me' && hit.auth === `Bearer ${token}`), 'History service should authenticate through the configured gateway.', gatewayHits);

  console.log(JSON.stringify({
    ok: true,
    dataDir,
    gatewayHits,
    userDirFiles: files,
    sessionFiles
  }, null, 2));
} finally {
  child.kill('SIGTERM');
  gateway.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
}

if (stderr.trim()) {
  console.error(stderr.trim());
}
