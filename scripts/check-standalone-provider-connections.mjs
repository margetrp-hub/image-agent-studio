import assert from 'node:assert/strict';
import { createStandaloneAuthStore } from './studio-service/standaloneAuth.js';

const calls = [];

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

async function fetchMock(url, options = {}) {
  const parsed = new URL(url);
  calls.push({ url, method: options.method || 'GET', headers: options.headers || {} });
  if (parsed.hostname === 'sub.example') {
    if (parsed.pathname === '/api/v1/auth/login') return jsonResponse({ access_token: 'sub-session' });
    if (parsed.pathname === '/api/v1/auth/me') return jsonResponse({ data: { id: 'sub-user', username: 'sub-user' } });
    if (parsed.pathname === '/api/v1/keys') return jsonResponse({ items: [{ id: 'sub-key-id', key: 'sub-secret-key' }] });
    if (parsed.pathname === '/v1/models') return jsonResponse({ data: [] });
  }
  if (parsed.hostname === 'new.example') {
    if (parsed.pathname === '/api/user/login') return jsonResponse({ data: { id: 'new-user', username: 'new-user' } }, { headers: { 'set-cookie': 'session=new-session; Path=/; HttpOnly' } });
    if (parsed.pathname === '/api/token') return jsonResponse({ data: [{ id: 7, name: 'Studio token' }] });
    if (parsed.pathname === '/api/token/7/key') return jsonResponse({ data: { key: 'new-secret-key' } });
    if (parsed.pathname === '/v1/models') return jsonResponse({ data: [] });
  }
  return jsonResponse({ error: 'not found' }, { status: 404 });
}

const store = createStandaloneAuthStore({
  databasePath: ':memory:',
  passwordIterations: 100_000,
  minimumPasswordLength: 8,
  providerMasterKey: Buffer.alloc(32, 7).toString('hex'),
  providerFetchImpl: fetchMock
});
const user = store.createUser({ email: 'provider@example.com', username: 'provider-user', password: 'password8' });

const sub = await store.bindProviderConnection({
  userId: user.id,
  providerType: 'sub2api-compatible',
  baseUrl: 'https://sub.example/',
  identifier: 'provider@example.com',
  password: 'external-password'
});
assert.equal(sub.baseUrl, 'https://sub.example');
assert.equal(sub.externalUsername, 'sub-user');
assert.equal(Object.prototype.hasOwnProperty.call(sub, 'apiKey'), false);
const subRuntime = store.getProviderConnectionRuntime(user.id, sub.id);
assert.equal(subRuntime.apiKey, 'sub-secret-key');
assert.equal(subRuntime.gatewayBaseUrl, 'https://sub.example/v1');

const newApi = await store.bindProviderConnection({
  userId: user.id,
  providerType: 'newapi-compatible',
  baseUrl: 'https://new.example/api',
  identifier: 'new-user',
  password: 'external-password'
});
assert.equal(newApi.baseUrl, 'https://new.example');
assert.equal(store.getProviderConnectionRuntime(user.id, newApi.id).apiKey, 'new-secret-key');

const storedSecrets = store.database.prepare('SELECT secret_ciphertext FROM studio_provider_connections').all().map((row) => row.secret_ciphertext).join('\n');
assert.equal(storedSecrets.includes('sub-secret-key'), false);
assert.equal(storedSecrets.includes('new-secret-key'), false);
await store.testProviderConnection(user.id, sub.id);
assert.ok(calls.some((call) => call.url === 'https://sub.example/v1/models'));

store.removeProviderConnection(user.id, newApi.id);
assert.equal(store.listProviderConnections(user.id).length, 1);
console.log('Standalone provider connection contract check passed.');
