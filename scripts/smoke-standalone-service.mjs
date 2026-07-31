import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createStandaloneAuthStore } from './studio-service/standaloneAuth.js';

const rootDir = path.resolve(import.meta.dirname, '..');
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-standalone-service-'));
const databasePath = path.join(dataDir, 'auth.sqlite');
const serverProviderKey = 'server-provider-secret-for-smoke';
const clientProviderKey = 'client-provider-secret-must-be-ignored';
const adminPassword = 'Admin Password 123!';
const memberPassword = 'Member Password 123!';
const creatorPassword = 'Creator Password 123!';
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const tinyMp4 = Buffer.from('fake-mp4-for-service-smoke');

const bootstrapStore = createStandaloneAuthStore({ databasePath, passwordIterations: 100_000 });
const admin = bootstrapStore.createUser({
  email: 'admin@yhoo.lol',
  username: 'Admin',
  password: adminPassword,
  role: 'admin'
});
bootstrapStore.close();

const providerHits = [];
const provider = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  providerHits.push({ method: req.method, url: req.url, authorization: req.headers.authorization, rawBody });
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'studio-image-model' }], debug: serverProviderKey }));
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/images/generations') {
    res.end(JSON.stringify({ data: [{ b64_json: tinyPng }], usage: { total_tokens: 1 } }));
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/videos/generations') {
    res.end(JSON.stringify({ request_id: 'grok-video-smoke-1', status: 'queued' }));
    return;
  }
  if (req.method === 'GET' && req.url === '/v1/videos/grok-video-smoke-1') {
    res.end(JSON.stringify({ request_id: 'grok-video-smoke-1', status: 'done', video: { url: '/v1/videos/grok-video-smoke-1/content' } }));
    return;
  }
  if (req.method === 'GET' && req.url === '/v1/videos/grok-video-smoke-1/content') {
    res.setHeader('Content-Type', 'video/mp4');
    res.end(tinyMp4);
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    res.end(JSON.stringify({ choices: [{ message: { content: 'Improved studio prompt' } }] }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: { message: 'not found' } }));
});
await listen(provider);
const providerPort = provider.address().port;

let maliciousHits = 0;
const malicious = http.createServer((_req, res) => {
  maliciousHits += 1;
  res.statusCode = 500;
  res.end('client-controlled provider URL was reached');
});
await listen(malicious);
const maliciousPort = malicious.address().port;

const servicePort = await freePort();
const service = startService(servicePort, {
  STUDIO_PROVIDER_BASE_URL: `http://127.0.0.1:${providerPort}`,
  STUDIO_PROVIDER_API_KEY: serverProviderKey,
  STUDIO_PROVIDER_TYPE: 'xai-compatible',
  STUDIO_PROVIDER_CHAT_MODEL: 'studio-chat-model'
});

try {
  await waitForHealth(servicePort);
  const oversized = await request(servicePort, '/studio-api/auth/login', {
    method: 'POST',
    rawBody: JSON.stringify({ identifier: 'missing', password: 'x'.repeat(20_000) })
  });
  assert.equal(oversized.status, 413);

  for (let index = 0; index < 2; index += 1) {
    const failed = await request(servicePort, '/studio-api/auth/login', {
      method: 'POST',
      headers: { 'X-Real-IP': '203.0.113.10' },
      body: { identifier: 'missing', password: 'wrong', rateLimitKey: `attacker-${index}` }
    });
    assert.equal(failed.status, 401);
  }
  const limited = await request(servicePort, '/studio-api/auth/login', {
    method: 'POST',
    headers: { 'X-Real-IP': '203.0.113.10' },
    body: { identifier: 'missing', password: 'wrong', rateLimitKey: 'new-client-key' }
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.payload.error, 'LOGIN_RATE_LIMITED');
  assert(Number(limited.headers.get('retry-after')) >= 1);

  const concurrent = await Promise.all([
    request(servicePort, '/studio-api/auth/login', {
      method: 'POST',
      headers: { 'X-Real-IP': '203.0.113.21' },
      body: { identifier: 'missing-a', password: 'wrong' }
    }),
    request(servicePort, '/studio-api/auth/login', {
      method: 'POST',
      headers: { 'X-Real-IP': '203.0.113.22' },
      body: { identifier: 'missing-b', password: 'wrong' }
    })
  ]);
  assert.deepEqual(concurrent.map((item) => item.status).sort(), [401, 429]);
  assert(concurrent.some((item) => item.payload.error === 'LOGIN_BUSY'));

  const adminLogin = await login(servicePort, 'admin@yhoo.lol', adminPassword, '203.0.113.30');
  const adminToken = adminLogin.token;
  const me = await request(servicePort, '/studio-api/auth/me', { token: adminToken });
  assert.equal(me.status, 200);
  assert.equal(me.payload.user.id, admin.id);
  assert.equal(me.payload.user.role, 'admin');
  assert.equal(JSON.stringify(me.payload).includes(adminToken), false);

  const registered = await request(servicePort, '/studio-api/auth/register', {
    method: 'POST',
    headers: { 'X-Real-IP': '203.0.113.32' },
    body: { email: 'creator@yhoo.lol', username: 'Creator', password: creatorPassword }
  });
  assert.equal(registered.status, 201, registered.raw);
  assert.equal(registered.payload.user.email, 'creator@yhoo.lol');
  assert.equal(registered.payload.user.role, 'user');
  assert.match(registered.payload.token, /^[A-Za-z0-9_-]{43}$/);
  const registeredMe = await request(servicePort, '/studio-api/auth/me', { token: registered.payload.token });
  assert.equal(registeredMe.status, 200);
  assert.equal(registeredMe.payload.user.email, 'creator@yhoo.lol');
  assert.equal(JSON.stringify(registeredMe.payload).includes(registered.payload.token), false);

  const duplicateRegister = await request(servicePort, '/studio-api/auth/register', {
    method: 'POST',
    headers: { 'X-Real-IP': '203.0.113.33' },
    body: { email: 'CREATOR@yhoo.lol', username: 'OtherCreator', password: creatorPassword }
  });
  assert.equal(duplicateRegister.status, 409);
  assert.equal(duplicateRegister.payload.error, 'USER_EXISTS');

  const invalidRole = await request(servicePort, '/studio-api/auth/admin/users', {
    method: 'POST',
    token: adminToken,
    body: { email: 'owner@yhoo.lol', username: 'Owner', password: memberPassword, role: 'owner' }
  });
  assert.equal(invalidRole.status, 400);
  assert.equal(invalidRole.payload.error, 'INVALID_ROLE');

  const created = await request(servicePort, '/studio-api/auth/admin/users', {
    method: 'POST',
    token: adminToken,
    body: { email: 'member@yhoo.lol', username: 'Member', password: memberPassword, role: 'user' }
  });
  assert.equal(created.status, 201);
  const member = created.payload.user;
  const memberLogin = await login(servicePort, 'Member', memberPassword, '203.0.113.31');
  const memberToken = memberLogin.token;
  const forbidden = await request(servicePort, '/studio-api/auth/admin/users', { token: memberToken });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.payload.error, 'ADMIN_REQUIRED');

  const adminSession = await request(servicePort, '/studio-api/session?sessionId=shared_session', {
    method: 'POST',
    token: adminToken,
    body: { sessionId: 'shared_session', prompt: 'admin prompt', canvasNodes: [], results: [] }
  });
  assert.equal(adminSession.status, 200);
  const memberSession = await request(servicePort, '/studio-api/session?sessionId=shared_session', {
    method: 'POST',
    token: memberToken,
    body: { sessionId: 'shared_session', prompt: 'member prompt', canvasNodes: [], results: [] }
  });
  assert.equal(memberSession.status, 200);
  assert.equal((await request(servicePort, '/studio-api/session?sessionId=shared_session', { token: adminToken })).payload.session.prompt, 'admin prompt');
  assert.equal((await request(servicePort, '/studio-api/session?sessionId=shared_session', { token: memberToken })).payload.session.prompt, 'member prompt');

  const maliciousRestore = await request(servicePort, '/studio-api/backup/restore', {
    method: 'POST',
    token: adminToken,
    body: {
      kind: 'image-agent-studio.user-backup',
      version: 1,
      data: { sessions: [{ sessionId: '../member/session', prompt: 'attack' }] }
    }
  });
  assert.equal(maliciousRestore.status, 400);
  assert.equal(maliciousRestore.payload.error, 'SESSION_ID_INVALID');
  assert.equal((await request(servicePort, '/studio-api/session?sessionId=shared_session', { token: adminToken })).payload.session.prompt, 'admin prompt');

  const memberSentinel = path.join(dataDir, 'users', member.id, 'assets', 'sentinel', 'owner.txt');
  await fs.mkdir(path.dirname(memberSentinel), { recursive: true });
  await fs.writeFile(memberSentinel, 'member-owned');
  const maliciousRecordRestore = await request(servicePort, '/studio-api/backup/restore', {
    method: 'POST',
    token: adminToken,
    body: {
      kind: 'image-agent-studio.user-backup',
      version: 1,
      data: { records: [{ id: `../../${member.id}`, prompt: 'attack' }] }
    }
  });
  assert.equal(maliciousRecordRestore.status, 400);
  assert.equal(maliciousRecordRestore.payload.error, 'RECORD_ID_INVALID');
  assert.equal(await fs.readFile(memberSentinel, 'utf8'), 'member-owned');

  const adminRecordsPath = path.join(dataDir, 'users', admin.id, 'records.json');
  await fs.writeFile(adminRecordsPath, JSON.stringify([{ id: `../../${member.id}` }]), { mode: 0o600 });
  const deletePoisonedHistory = await request(servicePort, '/studio-api/history', {
    method: 'DELETE',
    token: adminToken
  });
  assert.equal(deletePoisonedHistory.status, 400);
  assert.equal(deletePoisonedHistory.payload.error, 'RECORD_ID_INVALID');
  assert.equal(await fs.readFile(memberSentinel, 'utf8'), 'member-owned');
  await fs.writeFile(adminRecordsPath, '[]\n', { mode: 0o600 });

  const traversalIds = ['../other-user/session', 'x/../../../../users', '..%2F..%2Fauth.sqlite'];
  const sentinels = [
    path.join(dataDir, 'auth.sqlite'),
    path.join(dataDir, 'users', member.id, 'sessions', 'shared_session.json')
  ];
  const sentinelContents = await Promise.all(sentinels.map((filePath) => fs.readFile(filePath)));
  for (const attack of traversalIds) {
    const encoded = encodeURIComponent(decodeURIComponent(attack));
    for (const method of ['GET', 'POST', 'DELETE']) {
      const response = await request(servicePort, `/studio-api/session?sessionId=${encoded}`, {
        method,
        token: adminToken,
        ...(method === 'POST' ? { body: { sessionId: decodeURIComponent(attack), prompt: 'attack' } } : {})
      });
      assert.equal(response.status, 400);
      assert.equal(response.payload.error, 'SESSION_ID_INVALID');
    }
  }
  for (let index = 0; index < sentinels.length; index += 1) {
    assert.deepEqual(await fs.readFile(sentinels[index]), sentinelContents[index]);
  }

  const modelSync = await request(servicePort, '/studio-api/model-sync', {
    method: 'POST',
    token: adminToken,
    body: { apiKey: clientProviderKey, gatewayBaseUrl: `http://127.0.0.1:${maliciousPort}` }
  });
  assert.equal(modelSync.status, 200);
  assert.equal(modelSync.raw.includes(serverProviderKey), false);
  assert(modelSync.raw.includes('[REDACTED]'));

  const promptResult = await request(servicePort, '/studio-api/prompt/optimize', {
    method: 'POST',
    token: adminToken,
    body: { prompt: 'a product photo', model: 'client-controlled-chat-model', apiKey: clientProviderKey, gatewayBaseUrl: `http://127.0.0.1:${maliciousPort}` }
  });
  assert.equal(promptResult.status, 200);
  assert.equal(promptResult.payload.prompt, 'Improved studio prompt');

  const jobId = 'job-standalone-123';
  const generation = await request(servicePort, '/studio-api/generation-jobs', {
    method: 'POST',
    token: adminToken,
    body: {
      apiKey: clientProviderKey,
      gatewayBaseUrl: `http://127.0.0.1:${maliciousPort}`,
      request: {
        id: jobId,
        clientRequestId: 'client-request-123',
        sessionId: 'shared_session',
        model: 'studio-image-model',
        prompt: 'server provider smoke',
        size: '1024x1024',
        n: 1
      }
    }
  });
  assert.equal(generation.status, 202);
  assert.equal(generation.raw.includes(serverProviderKey), false);
  const completedJob = await waitForJob(servicePort, adminToken, jobId);
  assert.equal(completedJob.status, 'succeeded');
  assert.equal(completedJob.resultUrls.length, 1);
  assert.equal(maliciousHits, 0);
  assert(providerHits.some((hit) => hit.url === '/v1/models' && hit.authorization === `Bearer ${serverProviderKey}`));
  const imageCreateHit = providerHits.find((hit) => hit.url === '/v1/images/generations');
  assert(imageCreateHit && imageCreateHit.authorization === `Bearer ${serverProviderKey}`);
  assert.equal(JSON.parse(imageCreateHit.rawBody).response_format, 'b64_json');
  assert(providerHits.some((hit) => hit.url === '/v1/chat/completions' && hit.authorization === `Bearer ${serverProviderKey}`));
  assert(providerHits.some((hit) => hit.url === '/v1/chat/completions' && JSON.parse(hit.rawBody).stream === false));
  assert(providerHits.some((hit) => hit.url === '/v1/chat/completions' && JSON.parse(hit.rawBody).model === 'studio-chat-model'));
  assert(providerHits.every((hit) => hit.authorization !== `Bearer ${clientProviderKey}`));

  const videoJobId = 'job-grok-video-123';
  const videoGeneration = await request(servicePort, '/studio-api/generation-jobs', {
    method: 'POST',
    token: adminToken,
    body: {
      request: {
        id: videoJobId,
        clientRequestId: 'client-video-request-123',
        sessionId: 'shared_session',
        mode: 'video',
        route: 'video',
        providerId: 'gateway-account',
        providerFamily: 'gateway-account',
        model: 'grok-imagine-video-1.5',
        prompt: 'A five second cinematic product shot.',
        duration: 5,
        width: 1280,
        height: 720,
        fps: 24,
        n: 1
      }
    }
  });
  assert.equal(videoGeneration.status, 202);
  const completedVideoJob = await waitForJob(servicePort, adminToken, videoJobId);
  assert.equal(completedVideoJob.status, 'succeeded');
  assert.equal(completedVideoJob.resultUrls.length, 1);
  assert.match(completedVideoJob.resultUrls[0], /0\.mp4$/);
  const videoAsset = await fetch(`http://127.0.0.1:${servicePort}${completedVideoJob.resultUrls[0]}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(videoAsset.status, 200);
  assert.equal(videoAsset.headers.get('content-type'), 'video/mp4');
  const rangedVideoAsset = await fetch(`http://127.0.0.1:${servicePort}${completedVideoJob.resultUrls[0]}`, {
    headers: { Authorization: `Bearer ${adminToken}`, Range: 'bytes=0-3' }
  });
  assert.equal(rangedVideoAsset.status, 206);
  assert.equal(rangedVideoAsset.headers.get('content-range'), `bytes 0-3/${tinyMp4.length}`);
  const videoCreateHit = providerHits.find((hit) => hit.url === '/v1/videos/generations');
  assert(videoCreateHit, 'xAI video create route was not called.');
  const videoBody = JSON.parse(videoCreateHit.rawBody);
  assert.equal(videoBody.model, 'grok-imagine-video-1.5');
  assert.equal(videoBody.duration, 5);
  assert.equal('width' in videoBody, false);
  assert.equal('fps' in videoBody, false);
  assert(providerHits.some((hit) => hit.url === '/v1/videos/grok-video-smoke-1'));
  assert(providerHits.some((hit) => hit.url === '/v1/videos/grok-video-smoke-1/content'));

  const jobsRaw = await fs.readFile(path.join(dataDir, 'users', admin.id, 'jobs.json'), 'utf8');
  assert.equal(jobsRaw.includes(serverProviderKey), false);
  assert.equal(jobsRaw.includes(clientProviderKey), false);
  const userDirs = await fs.readdir(path.join(dataDir, 'users'));
  assert(userDirs.includes(admin.id));
  assert(userDirs.includes(member.id));

  const disabled = await request(servicePort, `/studio-api/auth/admin/users/${member.id}/disable`, {
    method: 'POST',
    token: adminToken
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.payload.user.active, false);
  assert.equal((await request(servicePort, '/studio-api/auth/me', { token: memberToken })).status, 401);

  const logout = await request(servicePort, '/studio-api/auth/logout', { method: 'POST', token: adminToken });
  assert.equal(logout.status, 200);
  assert.equal((await request(servicePort, '/studio-api/auth/me', { token: adminToken })).status, 401);
} finally {
  await stopService(service);
}

const noProviderPort = await freePort();
const noProviderService = startService(noProviderPort, {});
try {
  await waitForHealth(noProviderPort);
  const loginResult = await login(noProviderPort, 'admin@yhoo.lol', adminPassword, '203.0.113.40');
  const history = await request(noProviderPort, '/studio-api/session?sessionId=history_only', { token: loginResult.token });
  assert.equal(history.status, 200);
  const unavailable = await request(noProviderPort, '/studio-api/model-sync', {
    method: 'POST',
    token: loginResult.token,
    body: {}
  });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.payload.error, 'STUDIO_PROVIDER_NOT_CONFIGURED');
} finally {
  await stopService(noProviderService);
}

const disabledRegistrationPort = await freePort();
const disabledRegistrationService = startService(disabledRegistrationPort, {
  STUDIO_AUTH_REGISTRATION_MODE: 'disabled'
});
try {
  await waitForHealth(disabledRegistrationPort);
  const disabledRegister = await request(disabledRegistrationPort, '/studio-api/auth/register', {
    method: 'POST',
    body: { email: 'closed@yhoo.lol', username: 'Closed', password: 'Closed Password 123!' }
  });
  assert.equal(disabledRegister.status, 403);
  assert.equal(disabledRegister.payload.error, 'REGISTRATION_DISABLED');
} finally {
  await stopService(disabledRegistrationService);
  provider.close();
  malicious.close();
}

assert.equal(service.stdout.includes(serverProviderKey), false);
assert.equal(service.stderr.includes(serverProviderKey), false);
console.log(JSON.stringify({
  ok: true,
  dataDir,
  providerHits: providerHits.map(({ method, url }) => ({ method, url })),
  maliciousHits
}, null, 2));

function startService(port, providerEnv) {
  const state = { stdout: '', stderr: '' };
  state.child = spawn(process.execPath, ['scripts/image-agent-studio-history-service.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      STUDIO_HISTORY_HOST: '127.0.0.1',
      STUDIO_AUTH_MODE: 'standalone',
      STUDIO_DATA_DIR: dataDir,
      STUDIO_AUTH_DB_PATH: databasePath,
      STUDIO_AUTH_LOGIN_MAX_FAILURES: '2',
      STUDIO_AUTH_LOGIN_MAX_CONCURRENCY: '1',
      STUDIO_AUTH_GLOBAL_LOGIN_MAX_ATTEMPTS: '50',
      STUDIO_AUTH_LOGIN_MAX_BODY_BYTES: '16384',
      STUDIO_ALLOWED_ORIGINS: 'http://127.0.0.1',
      ...providerEnv
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  state.child.stdout.on('data', (chunk) => { state.stdout += chunk.toString(); });
  state.child.stderr.on('data', (chunk) => { state.stderr += chunk.toString(); });
  return state;
}

async function stopService(serviceState) {
  if (serviceState.child.exitCode === null) serviceState.child.kill('SIGTERM');
  await new Promise((resolve) => {
    if (serviceState.child.exitCode !== null) resolve();
    else serviceState.child.once('exit', resolve);
    setTimeout(resolve, 1000);
  });
  if (serviceState.stderr.trim()) process.stderr.write(serviceState.stderr);
}

async function login(port, identifier, password, ip) {
  const response = await request(port, '/studio-api/auth/login', {
    method: 'POST',
    headers: { 'X-Real-IP': ip },
    body: { identifier, password }
  });
  assert.equal(response.status, 200, response.raw);
  return response.payload;
}

async function request(port, pathname, { method = 'GET', token, headers = {}, body, rawBody } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((body !== undefined || rawBody !== undefined) ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = await response.text();
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch {}
  return { status: response.status, headers: response.headers, payload, raw };
}

async function waitForHealth(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/studio-api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Service did not become healthy on port ${port}.`);
}

async function waitForJob(port, token, jobId) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await request(port, `/studio-api/generation-jobs/${jobId}`, { token });
    assert.equal(response.status, 200, response.raw);
    if (['completed', 'succeeded', 'failed', 'canceled'].includes(response.payload.job?.status)) return response.payload.job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Job ${jobId} did not finish.`);
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
