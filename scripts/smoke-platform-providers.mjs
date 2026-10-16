import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStandaloneAuthStore } from './studio-service/standaloneAuth.js';

const rootDir = path.resolve(import.meta.dirname, '..');
const scratchDir = path.resolve(rootDir, '../../scratch');
await fs.mkdir(scratchDir, { recursive: true });
const dataDir = await fs.mkdtemp(path.join(scratchDir, 'platform-providers-smoke-'));
const databasePath = path.join(dataDir, 'auth.sqlite');
const masterKey = Buffer.alloc(32, 42).toString('hex');
const supplierKey = 'supplier-secret-http-fixture';
const byokKey = 'byok-secret-http-fixture';
const envKey = 'legacy-env-secret-http-fixture';
const password = 'platform-smoke-password';
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const hits = [];
let releaseSlow;
let discoveryFailure = false;
let videoReady = true;
let availableModels = ['gpt-image-2', 'dall-e-3', 'sora-2', 'unknown-model'];
let service;
let serviceUrl;
let adminToken;
let userToken;
let emptyToken;
let providerId;
let logs = '';
const upstream = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const json = req.headers['content-type']?.includes('application/json') ? JSON.parse(raw || '{}') : {};
  hits.push({ url: req.url, method: req.method, authorization: req.headers.authorization, raw, json });
  res.setHeader('Content-Type', 'application/json');
  if (req.url.endsWith('/v1/models')) {
    if (discoveryFailure) { res.writeHead(401); res.end(JSON.stringify({ error: { message: supplierKey } })); return; }
    res.end(JSON.stringify({ data: availableModels.map((id) => ({ id, secret: supplierKey })), debug: supplierKey }));
    return;
  }
  if (req.url === '/v1/images/generations' || req.url === '/v1/images/edits') {
    if (json.prompt === 'partial-failure' && hits.filter((hit) => hit.json.prompt === 'partial-failure').length === 2) {
      res.writeHead(422); res.end(JSON.stringify({ error: { message: 'second output failed' } })); return;
    }
    if (json.prompt === 'fail') { res.writeHead(422); res.end(JSON.stringify({ error: { message: `upstream rejected ${supplierKey}` } })); return; }
    if (json.prompt === 'slow') await new Promise((resolve) => { releaseSlow = resolve; });
    if (json.prompt === 'redirect') { res.writeHead(307, { Location: '/redirect-target' }); res.end(); return; }
    const count = req.url.endsWith('/edits') ? Number(raw.match(/name="n"\r\n\r\n(\d+)/)?.[1] || 1) : json.prompt === 'count-mismatch' ? 2 : 1;
    const activeKey = req.headers.authorization?.slice(7) || '';
    res.end(JSON.stringify({ data: Array.from({ length: count }, () => ({ b64_json: tinyPng.toString('base64') })), usage: { total_tokens: 1, debug: activeKey }, request_id: `request-${activeKey}` }));
    return;
  }
  if (req.url === '/v1/videos' && req.method === 'POST') {
    res.end(JSON.stringify({ id: 'video-fixture', status: 'queued' })); return;
  }
  if (req.url === '/v1/videos/video-fixture') {
    res.end(JSON.stringify({ id: 'video-fixture', status: videoReady ? 'completed' : 'in_progress', usage: { debug: supplierKey } })); return;
  }
  if (req.url === '/v1/videos/video-fixture/content') {
    res.setHeader('Content-Type', 'video/mp4'); res.end(Buffer.from('mock-mp4')); return;
  }
  res.writeHead(404); res.end('{}');
});
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
const seed = createStandaloneAuthStore({ databasePath, passwordIterations: 100_000, providerMasterKey: masterKey });
const admin = seed.createUser({ email: 'platform-admin@example.org', username: 'platform-admin', password, role: 'admin' });
const user = seed.createUser({ email: 'platform-user@example.org', username: 'platform-user', password });
const empty = seed.createUser({ email: 'platform-empty@example.org', username: 'platform-empty', password });
seed.adjustCredits({ userId: user.id, amount: 1000, reason: 'smoke fixture' });
seed.close();

try {
  await start(false);
  adminToken = (await api('/auth/login', { method: 'POST', token: null, body: { identifier: admin.email, password } })).token;
  userToken = (await api('/auth/login', { method: 'POST', token: null, body: { identifier: user.email, password } })).token;
  emptyToken = (await api('/auth/login', { method: 'POST', token: null, body: { identifier: empty.email, password } })).token;
  for (const [route, method] of [
    ['/auth/admin/providers', 'GET'], ['/auth/admin/providers', 'POST'], ['/auth/admin/providers/missing', 'POST'],
    ['/auth/admin/providers/missing', 'DELETE'], ['/auth/admin/providers/missing/models', 'POST'], ['/auth/admin/system', 'GET']
  ]) {
    await api(route, { method, token: null, status: 401 });
    await api(route, { method, token: userToken, status: 403 });
  }
  await api('/auth/platform-models', { token: null, status: 401 });
  assert.deepEqual((await api('/auth/admin/providers')).providers, [], 'env supplier must not be seeded/enabled');
  assert.deepEqual(await api('/auth/platform-models', { token: userToken }), { ok: true, creditsEnabled: false, providers: [] });
  const system = (await api('/auth/admin/system')).system;
  assert.deepEqual(system, {
    registrationMode: 'disabled', passwordMinLength: 8, sessionTtlMs: 604800000,
    providerSecretsConfigured: true, allowPrivateProviderUrls: false, userProviderOnly: true,
    jobConcurrency: 1, jobTimeoutMs: 20000, maxImageBytes: 33554432, maxVideoBytes: 268435456, storage: 'sqlite'
  });
  assert(!JSON.stringify(system).includes(dataDir));
  await api('/auth/register', { token: null, method: 'POST', status: 403, body: { email: 'disabled@example.org', username: 'disabled', password } });
  for (const baseUrl of ['file:///secret', 'http://user:pass@example.org', 'http://127.0.0.1', 'http://[::1]', 'http://169.254.169.254', 'https://example.org?key=secret']) {
    await api('/auth/admin/providers', { method: 'POST', status: 400, body: { name: 'Invalid', baseUrl, apiKey: supplierKey } });
  }
  await api('/auth/admin/providers', { method: 'POST', status: 400, body: { name: 'Invalid enabled', baseUrl: 'https://example.org', enabled: true } });
  const draft = (await api('/auth/admin/providers', { method: 'POST', status: 201, body: { name: 'Disabled draft', baseUrl: 'https://example.org' } })).provider;
  assert.equal(draft.hasApiKey, false);
  await api(`/auth/admin/providers/${draft.id}`, { method: 'POST', status: 409, body: { enabled: true } });
  await api(`/auth/admin/providers/${draft.id}`, { method: 'DELETE' });
  await api(`/auth/admin/providers/${draft.id}`, { method: 'DELETE', status: 404 });

  await stop();
  await start(true);
  let provider = (await api('/auth/admin/providers', { method: 'POST', status: 201, body: { name: 'Fixture supplier', providerId: 'openai-compatible', baseUrl: upstreamUrl, apiKey: supplierKey } })).provider;
  providerId = provider.id;
  assert.equal(provider.enabled, false);
  await submit('credits-off', {}, 403);
  provider = (await api(`/auth/admin/providers/${providerId}/models`, { method: 'POST' })).provider;
  assert(provider.models.every((model) => !model.enabled && model.available));
  for (const price of [-1, 1.5, '10', true, 10_000_001]) {
    await api(`/auth/admin/providers/${providerId}`, { method: 'POST', status: 400, body: { models: [{ id: 'gpt-image-2', enabled: true, prices: { image: price } }] } });
  }
  const pricedModels = provider.models.map((model) => ({ id: model.id, enabled: true, prices: { image: 3, edit: 5, video: 11 } }));
  provider = (await api(`/auth/admin/providers/${providerId}`, { method: 'POST', body: { enabled: true, models: pricedModels, apiKey: '' } })).provider;
  assert.equal(provider.hasApiKey, true);
  await api('/auth/admin/billing/settings', { method: 'POST', body: { creditsEnabled: true, imageGenerationCost: 99, imageEditCost: 99, videoGenerationCost: 99 } });
  const catalog = await api('/auth/platform-models', { token: userToken });
  assert.equal(catalog.creditsEnabled, true);
  assert.equal(catalog.providers.length, 1);
  assert.equal(catalog.providers[0].models.length, 3);
  assert(!('baseUrl' in catalog.providers[0]));
  assert(!('hasApiKey' in catalog.providers[0]));
  const sync = await api('/model-sync', { method: 'POST', token: userToken, body: { apiKeySource: 'platform', platformProviderId: providerId } });
  assert.equal(sync.models.data.length, 3);
  await api('/prompt/optimize', { method: 'POST', token: userToken, status: 400, body: { apiKeySource: 'platform', platformProviderId: providerId, prompt: 'test' } });
  for (const count of [0, -1, 1.5, 5, '2']) await submit(`invalid-count-${String(count).replace(/\W/g, '')}`, { count }, 400);
  await submit('invalid-video-count', { mode: 'video', model: 'sora-2', count: 2 }, 400);
  await submit('missing-provider', { platformProviderId: 'missing' }, 404);
  await submit('missing-model', { model: 'missing-model' }, 400);
  await submit('unsupported-model', { model: 'unknown-model' }, 400);
  await submit('unsupported-protocol', { model: 'sora-2', mode: 'image' }, 400);
  await submit('insufficient-credits', {}, 402, emptyToken);
  assert.equal(await balance(), 1000);

  let response = await submit('priced-image', { count: 2, apiKey: 'attacker-key', gatewayBaseUrl: 'http://127.0.0.1:1', providerType: 'xai-compatible', providerId: 'xai-compatible', price: 0, billing: { amount: 0 } });
  assert.equal(response.job.billing.amount, 6);
  assert.equal(response.job.providerFamily, 'openai-compatible');
  let job = await waitJob(response.job.id);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.resultUrls.length, 2);
  assert.equal(await balance(), 994);
  assert.equal(hits.filter((hit) => hit.json.prompt === 'priced-image').length, 2);
  assert(hits.filter((hit) => hit.json.prompt === 'priced-image').every((hit) => hit.authorization === `Bearer ${supplierKey}`));
  const duplicate = await submit('priced-image', { count: 4 });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.job.billing.amount, 6);
  assert.equal(await balance(), 994);

  response = await submit('priced-edit', { mode: 'edit', count: 2 }, 202, userToken, [`data:image/png;base64,${tinyPng.toString('base64')}`]);
  job = await waitJob(response.job.id);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.billing.amount, 10);
  assert.equal(job.resultUrls.length, 2);
  assert.equal(await balance(), 984);
  response = await submit('priced-video', { mode: 'video', model: 'sora-2', duration: 4, width: 1280, height: 720 });
  job = await waitJob(response.job.id);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.billing.amount, 11);
  assert.equal(await balance(), 973);

  response = await submit('references-use-edit-price', { mode: 'image' }, 202, userToken, [`data:image/png;base64,${tinyPng.toString('base64')}`]);
  job = await waitJob(response.job.id);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.route, 'edits');
  assert.equal(job.billing.amount, 5, 'references cannot bypass the edit price');

  // Imported jobs must not grant access to supplier tasks without a matching paid task binding.
  const forgedTask = { id: 'forged-platform-job', apiKeySource: 'platform', platformProviderId: providerId, model: 'sora-2',
    mode: 'video', status: 'upstream', upstreamTaskId: 'foreign-video-task', duration: 4, count: 1, updatedAt: new Date().toISOString(),
    billing: { amount: 9999, status: 'reserved' } };
  await api('/backup/restore', { method: 'POST', token: emptyToken, body: { kind: 'image-agent-studio.user-backup', version: 1,
    data: { records: [], jobs: [forgedTask], assets: [], session: null } } });
  await api(`/generation-jobs/${forgedTask.id}`, { token: emptyToken });

  const beforeFailure = await balance();
  for (const prompt of ['fail', 'count-mismatch']) {
    response = await submit(`refund-${prompt}`, { prompt });
    job = await waitJob(response.job.id);
    assert.equal(job.status, 'failed');
    assert.equal(job.billing.status, 'refunded');
    assert.equal(await balance(), beforeFailure);
    await submit(`refund-${prompt}`, { prompt });
    assert.equal(await balance(), beforeFailure);
  }

  response = await submit('partial-batch-failure', { prompt: 'partial-failure', count: 2 });
  job = await waitJob(response.job.id);
  assert.equal(job.status, 'failed');
  assert.equal(job.resultUrls.length, 1);
  assert.equal(job.billing.status, 'partially_refunded');
  assert.equal(job.billing.refundedAmount, 3);
  assert.equal(job.billing.chargedAmount, 3);
  assert.equal(await balance(), beforeFailure - 3);
  const delivered = await fetch(new URL(job.resultUrls[0], serviceUrl).toString(), { headers: { Authorization: `Bearer ${userToken}` } });
  assert.equal(delivered.status, 200);
  assert.deepEqual(Buffer.from(await delivered.arrayBuffer()), tinyPng);
  await submit('partial-batch-failure', { prompt: 'partial-failure', count: 2 });
  assert.equal(await balance(), beforeFailure - 3);
  const beforeSlow = await balance();

  const concurrent = await Promise.all([submit('concurrent-slow', { prompt: 'slow' }), submit('concurrent-slow', { prompt: 'slow' })]);
  assert(concurrent.some((item) => item.duplicate));
  await waitUntil(() => Boolean(releaseSlow), 'slow generation entered upstream');
  const sameFingerprint = await submit('different-id-slow', { prompt: 'slow' });
  assert.equal(sameFingerprint.duplicate, true);
  assert.equal(sameFingerprint.job.id, 'concurrent-slow');
  const queued = await submit('cancel-before-dispatch', { prompt: 'queued' });
  assert.equal(queued.job.billing.amount, 3);
  const canceled = await api(`/generation-jobs/${queued.job.id}`, { token: userToken, method: 'DELETE' });
  assert.equal(canceled.job.status, 'canceled');
  assert.equal(canceled.job.billing.status, 'refunded');
  releaseSlow(); releaseSlow = null;
  assert.equal((await waitJob('concurrent-slow')).status, 'succeeded');
  assert.equal(await balance(), beforeSlow - 3);
  assert.equal(hits.filter((hit) => hit.json.prompt === 'slow').length, 1);
  assert.equal(hits.filter((hit) => hit.json.prompt === 'queued').length, 0);

  const beforeByok = await balance();
  response = await submit('manual-byok', { apiKeySource: 'manual', apiKey: byokKey, gatewayBaseUrl: upstreamUrl, providerId: 'openai-compatible' });
  job = await waitJob(response.job.id);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.billing, null);
  assert.equal(job.platformProviderId, '');
  const connection = (await api('/auth/provider-connections', { token: userToken, method: 'POST', status: 201, body: { providerType: 'sub2api-compatible', baseUrl: upstreamUrl, apiKey: byokKey } })).connection;
  response = await submit('linked-byok', { apiKeySource: 'linked', providerConnectionId: connection.id, providerType: 'sub2api-compatible' });
  job = await waitJob(response.job.id);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.billing, null);
  assert.equal(await balance(), beforeByok);
  assert(hits.filter((hit) => ['manual-byok', 'linked-byok'].includes(hit.json.prompt)).every((hit) => hit.authorization === `Bearer ${byokKey}`));

  await api(`/auth/admin/providers/${providerId}`, { method: 'POST', body: { models: pricedModels.map((model) => ({ ...model, prices: { ...model.prices, edit: null } })) } });
  await submit('unpriced-edit', { mode: 'edit' }, 400, userToken, [`data:image/png;base64,${tinyPng.toString('base64')}`]);
  assert.equal(await balance(), beforeByok);
  discoveryFailure = true;
  await api(`/auth/admin/providers/${providerId}/models`, { method: 'POST', status: 502 });
  discoveryFailure = false;

  // A restarted video task resumes polling and never creates or charges another task.
  videoReady = false;
  response = await submit('restart-video', { mode: 'video', model: 'sora-2', duration: 4 });
  await waitUntil(async () => (await api(`/generation-jobs/${response.job.id}`, { token: userToken })).job.status === 'upstream', 'video task persisted');
  const videoCreates = hits.filter((hit) => hit.method === 'POST' && hit.url === '/v1/videos').length;
  const restartBalance = await balance();
  await api(`/auth/admin/providers/${providerId}`, { method: 'POST', body: { name: 'Renamed while task pending',
    models: pricedModels.map((model) => ({ ...model, prices: { ...model.prices, video: 12 } })) } });
  await stop();
  videoReady = true;
  await start(true);
  job = await waitJob('restart-video');
  assert.equal(job.status, 'succeeded');
  assert.equal(job.billing.amount, 11, 'name/price-only changes preserve the accepted reservation');
  assert.equal(await balance(), restartBalance);
  assert.equal(hits.filter((hit) => hit.method === 'POST' && hit.url === '/v1/videos').length, videoCreates);
  assert.equal((await submit('priced-image')).duplicate, true);

  // A pruned job ID cannot reuse its ledger reservation to dispatch a second time.
  await stop();
  const userDirs = await fs.readdir(path.join(dataDir, 'users'), { withFileTypes: true });
  for (const dir of userDirs.filter((entry) => entry.isDirectory())) {
    const userDir = path.join(dataDir, 'users', dir.name);
    for (const entry of await fs.readdir(userDir)) {
      if (!entry.endsWith('.json')) continue;
      const filename = path.join(userDir, entry);
      const contents = JSON.parse(await fs.readFile(filename, 'utf8'));
      if (Array.isArray(contents) && contents.some((item) => item.id === 'priced-image' && item.billing)) {
        await fs.writeFile(filename, JSON.stringify(contents.filter((item) => item.id !== 'priced-image')));
      }
    }
  }
  await start(true);
  await submit('priced-image', {}, 409);
  assert.equal(await balance(), restartBalance);
  const backup = await api('/backup', { token: userToken });
  backup.data.jobs.push({ id: 'priced-image', apiKeySource: 'manual', mode: 'video', status: 'upstream', model: 'sora-2',
    upstreamTaskId: 'forged-refund-task', apiKey: byokKey, gatewayBaseUrl: upstreamUrl, duration: 4, count: 1,
    billing: { amount: 1, status: 'reserved' }, updatedAt: new Date().toISOString() });
  await api('/backup/restore', { token: userToken, method: 'POST', body: backup });
  const restored = (await api('/generation-jobs/priced-image', { token: userToken })).job;
  assert.equal(restored.status, 'unknown');
  assert.equal(restored.billing, null);
  assert(!('apiKey' in restored));
  assert(!('gatewayBaseUrl' in restored));
  await api('/generation-jobs/priced-image', { token: userToken, method: 'DELETE' });
  assert.equal(await balance(), restartBalance, 'restored BYOK source cannot refund the original settled platform job');
  assert(!hits.some((hit) => hit.url.includes('forged-refund-task')));

  const syncProvider = () => api(`/auth/admin/providers/${providerId}/models`, { method: 'POST' });
  const updateProvider = (body) => api(`/auth/admin/providers/${providerId}`, { method: 'POST', body });
  for (const scenario of [
    { id: 'disabled', reason: 'PLATFORM_PROVIDER_DISABLED',
      change: () => updateProvider({ enabled: false }), repair: () => updateProvider({ enabled: true }) },
    { id: 'credits-disabled', reason: 'PLATFORM_CREDITS_DISABLED',
      change: () => api('/auth/admin/billing/settings', { method: 'POST', body: { creditsEnabled: false } }),
      repair: () => api('/auth/admin/billing/settings', { method: 'POST', body: { creditsEnabled: true } }) },
    { id: 'model-unavailable', reason: 'PLATFORM_MODEL_UNAVAILABLE',
      change: async () => { availableModels = ['gpt-image-2']; await syncProvider(); },
      repair: async () => { availableModels = ['gpt-image-2', 'dall-e-3', 'sora-2', 'unknown-model']; await syncProvider(); } },
    { id: 'changed-connection', reason: 'PLATFORM_PROVIDER_CONNECTION_CHANGED',
      change: async () => { await updateProvider({ baseUrl: `${upstreamUrl}/changed`, enabled: false }); await syncProvider(); await updateProvider({ enabled: true }); },
      repair: async () => { await updateProvider({ baseUrl: upstreamUrl, enabled: false }); await syncProvider(); await updateProvider({ enabled: true }); } },
    { id: 'deleted', reason: 'PLATFORM_PROVIDER_NOT_FOUND',
      change: () => api(`/auth/admin/providers/${providerId}`, { method: 'DELETE' }),
      repair: async () => {
        providerId = (await api('/auth/admin/providers', { method: 'POST', status: 201,
          body: { name: 'Replacement fixture', baseUrl: upstreamUrl, providerId: 'openai-compatible', apiKey: supplierKey } })).provider.id;
        await syncProvider(); await updateProvider({ enabled: true, models: pricedModels });
      } }
  ]) {
    videoReady = false;
    const recoveryId = `recovery-${scenario.id}`;
    await submit(recoveryId, { mode: 'video', model: 'sora-2', duration: 4 });
    await waitUntil(async () => (await api(`/generation-jobs/${recoveryId}`, { token: userToken })).job.status === 'upstream', recoveryId);
    const reservedBalance = await balance();
    await scenario.change();
    await stop();
    videoReady = true;
    await start(true);
    const upstreamHits = hits.length;
    const blocked = await waitJob(recoveryId);
    assert.equal(blocked.status, 'unknown');
    assert.equal(blocked.billing.status, 'unknown');
    assert.equal(blocked.error.code, 'PLATFORM_RECOVERY_BLOCKED');
    assert.equal(blocked.error.reason, scenario.reason);
    assert.equal(await balance(), reservedBalance);
    assert.equal(hits.length, upstreamHits, 'blocked recovery must never contact changed/revoked upstream');
    const recoveryBackup = await api('/backup', { token: userToken });
    await api('/backup/restore', { token: userToken, method: 'POST', body: recoveryBackup });
    await scenario.repair();
  }
  await api(`/auth/admin/providers/${providerId}`, { method: 'POST', body: { enabled: false } });
  assert.equal((await api('/auth/platform-models', { token: userToken })).providers.length, 0);
  await submit('disabled-provider', {}, 403);
  await api(`/auth/admin/providers/${providerId}`, { method: 'DELETE' });
  await submit('deleted-provider', {}, 404);
  assert.equal((await api('/auth/admin/providers')).providers.length, 0);
  const transactions = (await api('/auth/credits/transactions', { token: userToken })).transactions;
  assert.equal(transactions.filter((item) => item.referenceId === 'generation:concurrent-slow').length, 1);
  assert.equal(transactions.filter((item) => item.referenceId === 'generation-refund:refund-fail').length, 1);
  assert.equal(transactions.filter((item) => item.referenceId === 'generation-refund:partial-batch-failure').length, 1);
  assert(!transactions.some((item) => /manual-byok|linked-byok/.test(item.referenceId)));
  assert(!hits.some((hit) => hit.url.includes('foreign-video-task')));
  await stop();
  const db = new DatabaseSync(databasePath);
  const rows = db.prepare('SELECT * FROM credit_transactions').all();
  assert.equal(JSON.stringify(rows).includes(supplierKey), false);
  db.close();
  for (const filename of await fs.readdir(dataDir, { recursive: true })) {
    if (!/\.(json|sqlite|sqlite-wal)$/.test(filename)) continue;
    const content = await fs.readFile(path.join(dataDir, filename));
    assert.equal(content.includes(Buffer.from(supplierKey)), false, `supplier secret leaked into ${filename}`);
    assert.equal(content.includes(Buffer.from(byokKey)), false, `BYOK secret leaked into ${filename}`);
  }
  assert.equal(logs.includes(supplierKey), false);
  assert.equal(logs.includes(masterKey), false);
  console.log('Platform HTTP smoke passed: authorization, CRUD, discovery, deployment limits, default BYOK policy, authoritative image/edit/video prices, duplicates, refunds, cancellation, restart recovery and secret redaction.');
} finally {
  releaseSlow?.();
  await stop();
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
  assert.equal(path.dirname(dataDir), scratchDir);
  await fs.rm(dataDir, { recursive: true, force: true });
}

async function start(allowPrivate) {
  const reserve = http.createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  serviceUrl = `http://127.0.0.1:${port}/studio-api`;
  service = spawn(process.execPath, ['scripts/image-agent-studio-history-service.mjs'], {
    cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1', STUDIO_AUTH_MODE: 'standalone',
      STUDIO_DATA_DIR: dataDir, STUDIO_AUTH_DB_PATH: databasePath, STUDIO_MASTER_KEY: masterKey,
      STUDIO_AUTH_PASSWORD_ITERATIONS: '100000', STUDIO_AUTH_REGISTRATION_MODE: 'disabled',
      STUDIO_AUTH_SESSION_TTL_MS: '604800000', STUDIO_AUTH_PASSWORD_MIN_LENGTH: '8',
      STUDIO_USER_PROVIDER_ONLY: 'true', STUDIO_CREDITS_ENABLED: 'false',
      STUDIO_ALLOW_PRIVATE_PROVIDER_URLS: String(allowPrivate), STUDIO_JOB_CONCURRENCY: '1', STUDIO_JOB_LIMIT: '0',
      STUDIO_JOB_TIMEOUT_MS: '20000', STUDIO_VIDEO_POLL_INTERVAL_MS: '100', STUDIO_MAX_IMAGE_BYTES: '33554432', STUDIO_MAX_VIDEO_BYTES: '268435456',
      STUDIO_PROVIDER_BASE_URL: upstreamUrl, STUDIO_PROVIDER_API_KEY: envKey, STUDIO_PROVIDER_TYPE: 'openai-compatible'
    }
  });
  service.stdout.on('data', (chunk) => { logs += chunk; });
  service.stderr.on('data', (chunk) => { logs += chunk; });
  await waitUntil(async () => {
    if (service.exitCode !== null) throw new Error(`Service exited: ${logs}`);
    try { return (await fetch(`${serviceUrl}/health`)).ok; } catch { return false; }
  }, 'service health');
}

async function stop() {
  if (!service) return;
  if (service.exitCode === null && service.signalCode === null) {
    const exited = once(service, 'exit');
    service.kill();
    await exited;
  }
  service = null;
}

async function api(route, { token = adminToken, method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(`${serviceUrl}${route}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000)
  });
  const raw = await response.text();
  assert.equal(raw.includes(supplierKey), false, `secret leaked in ${route}`);
  assert.equal(raw.includes(byokKey), false, `BYOK secret leaked in ${route}`);
  assert.equal(raw.includes(masterKey), false, `master key leaked in ${route}`);
  assert.equal(response.status, status, `${method} ${route}: ${raw}`);
  return JSON.parse(raw);
}

async function submit(id, patch = {}, status = 202, token = userToken, images = []) {
  return api('/generation-jobs', { method: 'POST', token, status, body: {
    request: { id, clientRequestId: `client-${id}`, sessionId: 'platform-smoke-session', mode: 'image', model: 'gpt-image-2', prompt: id,
      count: 1, apiKeySource: 'platform', platformProviderId: providerId, ...patch }, images
  } });
}

async function balance() { return (await api('/auth/credits', { token: userToken })).credits.balance; }

async function waitJob(id) {
  let job;
  await waitUntil(async () => {
    job = (await api(`/generation-jobs/${id}`, { token: userToken })).job;
    return ['succeeded', 'failed', 'canceled', 'unknown'].includes(job.status);
  }, `job ${id}`);
  return job;
}

async function waitUntil(predicate, description) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
