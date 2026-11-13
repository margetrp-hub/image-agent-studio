import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createGatewayAuth } from './studio-service/gatewayAuth.js';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = path.join(root, 'output', `gateway-connect-${Date.now()}`);
await fs.mkdir(evidenceDir, { recursive: true });
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';
const state = { unavailable: false, revoked: false, generations: 0, type: 'sub2api', keys: true };
const hits = [];
const gateway = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://gateway.test');
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  hits.push({ path: url.pathname, method: req.method, userId: req.headers['new-api-user'] });
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (state.unavailable) return send(503, { message: 'temporary outage' });
  if (state.revoked || !['inference-a', 'inference-b', 'account-a', 'account-b'].includes(token)) {
    return state.type === 'newapi' ? send(200, { success: false, message: 'invalid token' }) : send(401, { message: 'invalid token' });
  }
  const id = token.endsWith('-a') ? 42 : 43;
  const wrap = (data) => state.type === 'newapi' ? { success: true, data } : { code: 0, data };
  if (url.pathname === '/v1/models') {
    if (!token.startsWith('inference-')) return send(401, {});
    return send(200, { data: [{ id: 'gpt-image-2' }, { id: 'gpt-4o-mini' }, { id: 'veo3' }] });
  }
  if (url.pathname === '/api/user/self' || url.pathname === '/api/v1/auth/me') {
    if (!token.startsWith('account-')) return send(401, {});
    // Simulate a gateway that ignores the claimed user header. Studio must still reject a mismatch.
    return send(200, wrap({ id, username: `creator-${id}`, secret_field: 'must-not-leak' }));
  }
  if (url.pathname === '/api/token/' || url.pathname === '/api/v1/keys') {
    return send(200, wrap({ items: state.keys ? [{ id: 1, name: 'Studio', status: 1, key: state.type === 'newapi' ? 'sk-****' : `inference-${id === 42 ? 'a' : 'b'}` }] : [] }));
  }
  if (url.pathname === '/api/token/1/key' && req.method === 'POST') return send(200, wrap({ key: `inference-${id === 42 ? 'a' : 'b'}` }));
  if (url.pathname === '/v1/chat/completions') return send(200, { choices: [{ message: { content: 'Improved prompt' } }] });
  if (url.pathname === '/v1/images/generations' && req.method === 'POST') {
    for await (const _ of req) { /* Consume the real request body. */ }
    state.generations += 1;
    return send(200, { data: [{ b64_json: png }] });
  }
  if (url.pathname === '/v1/video/generations' && req.method === 'POST') return send(200, { data: { task_id: 'gateway-video', status: 'queued' } });
  if (url.pathname === '/v1/video/generations/gateway-video') return send(200, { data: { task_id: 'gateway-video', status: 'succeeded', url: '/v1/video/gateway-video/content' } });
  if (url.pathname === '/v1/video/gateway-video/content') {
    res.writeHead(200, { 'Content-Type': 'video/mp4' });
    return res.end(Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex'));
  }
  return send(404, {});
});
gateway.listen(0, '127.0.0.1');
await once(gateway, 'listening');
const gatewayUrl = `http://127.0.0.1:${gateway.address().port}`;

async function startService(type, credentialMode, configured = true) {
  const dataDir = path.join(evidenceDir, `${type}-${credentialMode}-${configured}`);
  const child = spawn(process.execPath, ['scripts/image-agent-studio-history-service.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: '0', STUDIO_HISTORY_HOST: '127.0.0.1', STUDIO_AUTH_MODE: 'gateway',
      AI_GATEWAY_BASE_URL: configured ? gatewayUrl : '', SUB2API_BASE_URL: '', STUDIO_GATEWAY_TYPE: type,
      STUDIO_GATEWAY_AUTH: credentialMode, STUDIO_DATA_DIR: dataDir, STUDIO_ALLOWED_ORIGINS: 'http://127.0.0.1', STUDIO_VIDEO_POLL_INTERVAL_MS: '100' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (value) => { output += value; });
  child.stderr.on('data', (value) => { output += value; });
  // Service reports the assigned listening port (including PORT=0 in tests).
  const deadline = Date.now() + 10000;
  while (!output.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/)) {
    if (child.exitCode !== null || Date.now() > deadline) { child.kill(); throw new Error(output || 'service startup timeout'); }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const port = output.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/)[1];
  return { child, dataDir, url: `http://127.0.0.1:${port}` };
}

async function api(service, route, token = 'inference-a', body, userId) {
  const response = await fetch(`${service.url}/studio-api${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(userId ? { 'New-Api-User': String(userId) } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json() };
}

async function stopService(service) {
  if (service.child.exitCode === null) { service.child.kill(); await once(service.child, 'exit'); }
}

const report = [];
try {
  for (const type of ['sub2api', 'newapi']) {
    for (const mode of ['api-key', 'account']) {
      state.type = type;
      const service = await startService(type, mode);
      const token = mode === 'api-key' ? 'inference-a' : 'account-a';
      const other = mode === 'api-key' ? 'inference-b' : 'account-b';
      const userId = mode === 'account' && type === 'newapi' ? 42 : undefined;
      try {
        assert.equal((await api(service, '/gateway/config')).body.configured, true);
        assert.equal((await api(service, '/gateway/auth/me', 'invalid')).status, 401);
        const me = await api(service, '/gateway/auth/me', token, undefined, userId);
        assert.equal(me.status, 200);
        assert.equal(me.body.data.secret_field, undefined);
        if (userId) assert.equal((await api(service, '/gateway/auth/me', token, undefined, 43)).status, 401);
        for (const route of ['/auth/admin/users', '/auth/credits', '/auth/config']) assert.equal((await api(service, route, token)).status, 404);
        assert.equal((await api(service, '/auth/register', token, { email: 'test@example.com', password: 'not-used' })).status, 404);
        const keys = await api(service, '/gateway/keys', token, undefined, userId);
        assert.equal(keys.body.data.length, 1);
        const key = await api(service, '/gateway/keys/1', token, undefined, userId);
        assert.equal(key.body.data.key, 'inference-a');
        await api(service, '/session', token, { sessionId: 'private-session', prompt: 'Private prompt' }, userId);
        assert.equal((await api(service, '/session?sessionId=private-session', token, undefined, userId)).body.session.prompt, 'Private prompt');
        assert.equal((await api(service, '/session?sessionId=private-session', other, undefined, userId ? 43 : undefined)).body.session, null);
        state.unavailable = true;
        assert.equal((await api(service, '/session?sessionId=private-session', token, undefined, userId)).status, 503);
        state.unavailable = false;
        assert.equal((await api(service, '/session?sessionId=private-session', token, undefined, userId)).body.session.prompt, 'Private prompt');
        const sync = await api(service, '/model-sync', token, { apiKey: key.body.data.key, gatewayBaseUrl: `${gatewayUrl}/v1`, providerId: 'gateway-account' }, userId);
        assert.equal(sync.status, 200);
        assert.equal((await api(service, '/model-sync', token, { apiKey: key.body.data.key, gatewayBaseUrl: 'http://127.0.0.1:1/v1' }, userId)).status, 400);
        const prompt = await api(service, '/prompt/optimize', token, { apiKey: key.body.data.key, prompt: 'A landscape', model: 'gpt-4o-mini' }, userId);
        assert.equal(prompt.body.text, 'Improved prompt');
        const body = { apiKey: key.body.data.key, request: { id: 'gateway-job', clientRequestId: 'gateway-job', sessionId: 'private-session', providerId: 'openai-compatible', mode: 'image', route: 'generations', model: 'gpt-image-2', prompt: 'A landscape', count: 1 } };
        const job = await api(service, '/generation-jobs', token, body, userId);
        assert.ok(job.status < 300, JSON.stringify(job));
        let terminal;
        for (let attempt = 0; attempt < 80; attempt += 1) {
          terminal = await api(service, `/generation-jobs/${job.body.job.id}`, token, undefined, userId);
          if (['succeeded', 'failed', 'unknown'].includes(terminal.body.job.status)) break;
          await new Promise((resolve) => setTimeout(resolve, 75));
        }
        assert.equal(terminal.body.job.status, 'succeeded', JSON.stringify(terminal));
        assert.equal((await api(service, '/history', token, undefined, userId)).body.records.length, 1);
        const generationCount = state.generations;
        await api(service, '/generation-jobs', token, body, userId);
        assert.equal(state.generations, generationCount, 'same job must not generate twice');
        state.revoked = true;
        assert.equal((await api(service, '/history', token, undefined, userId)).status, 401);
        assert.equal((await api(service, '/generation-jobs', token, body, userId)).status, 401);
        state.revoked = false;
        assert.equal((await api(service, '/history', token, undefined, userId)).body.records.length, 1);
        assert.equal(await fs.access(path.join(service.dataDir, 'auth.sqlite')).then(() => true, () => false), false);
        const video = await api(service, '/generation-jobs', token, { apiKey: key.body.data.key, request: { id: 'gateway-video', sessionId: 'private-session', providerId: 'gateway-account', mode: 'video', model: 'veo3', prompt: 'A landscape', count: 1 } }, userId);
        assert.ok(video.status < 300, JSON.stringify(video));
        let videoResult;
        for (let attempt = 0; attempt < 80; attempt += 1) {
          videoResult = await api(service, '/generation-jobs/gateway-video', token, undefined, userId);
          if (['succeeded', 'failed', 'unknown'].includes(videoResult.body.job.status)) break;
          await new Promise((resolve) => setTimeout(resolve, 75));
        }
        assert.equal(videoResult.body.job.status, 'succeeded', JSON.stringify(videoResult));
        assert.equal(videoResult.body.job.invocationAdapter, 'newapi-task-video');
        assert.equal(videoResult.body.job.providerFamily, `${type}-compatible`);
        report.push(`${type}/${mode}: identity, isolation, failure/recovery, models, prompt, image/video persistence, dedupe, revocation, no admin/DB passed`);
      } finally { state.revoked = false; state.unavailable = false; await stopService(service); }
    }
  }
  const missing = await startService('sub2api', 'api-key', false);
  try {
    assert.equal((await api(missing, '/gateway/config')).body.configured, false);
    assert.equal((await api(missing, '/gateway/auth/me')).status, 503);
  } finally { await stopService(missing); }
  const timeoutAdapter = createGatewayAuth({ baseUrl: gatewayUrl, credentialMode: 'api-key', fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } });
  await assert.rejects(timeoutAdapter.profile('inference-a'), (error) => error.status === 503);
  assert.equal(hits.some((hit) => hit.method === 'POST' && ['/api/token/', '/api/v1/keys'].includes(hit.path)), false, 'connector must not create gateway keys');
  console.log(report.join('\n'));
  console.log('Unconfigured gateway and timeout recovery passed. Evidence:', evidenceDir);
} finally { gateway.closeAllConnections(); await new Promise((resolve) => gateway.close(resolve)); }
