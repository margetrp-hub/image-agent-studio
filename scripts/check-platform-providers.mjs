import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import http from 'node:http';
import { createPlatformProviderStore, createPlatformProviderTransport, validatePlatformUrl } from './studio-service/platformProviders.js';
import { serverJobFingerprint } from './studio-service/jobFingerprint.js';
import { createStandaloneAuthStore } from './studio-service/standaloneAuth.js';

const database = new DatabaseSync(':memory:');
const masterKey = Buffer.alloc(32, 31).toString('hex');
const apiKey = 'platform-unit-key-only';
let models = ['gpt-image-2', 'dall-e-3', 'sora-2', 'unknown-model'];
let waitForDiscovery;
const calls = [];
const store = createPlatformProviderStore({ database, masterKey, fetchImpl: async (url, options) => {
  calls.push({ url, options });
  if (waitForDiscovery) await waitForDiscovery;
  return new Response(JSON.stringify({ data: models.map((id) => ({ id, apiKey, debug: apiKey })), debug: apiKey }));
} });
try {
  assert.deepEqual(store.catalog(true).providers, []);
  for (const url of ['ftp://example.org', 'https://user:pass@example.org', 'https://example.org/?key=x', 'https://example.org/#x', 'http://localhost', 'http://127.1', 'http://2130706433', 'http://0.0.0.0', 'http://10.1.1.1', 'http://169.254.169.254', 'http://100.64.0.1', 'http://198.18.0.1', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://[fe80::1]', 'http://[fc00::1]', 'http://metadata.google.internal']) {
    assert.throws(() => validatePlatformUrl(url), /INVALID_PROVIDER_URL/, url);
  }
  assert.equal(validatePlatformUrl('https://api.example.org/prefix').pathname, '/prefix');
  assert.equal(validatePlatformUrl('http://127.0.0.1', true).hostname, '127.0.0.1');
  assert.throws(() => store.save({ name: 'Invalid', baseUrl: 'https://example.org', providerId: 'invalid' }), /INVALID_PROVIDER_TYPE/);
  const draft = store.save({ name: 'Draft', baseUrl: 'https://example.org', providerId: 'openai-compatible', apiKey });
  assert.equal(draft.enabled, false);
  assert.equal(draft.hasApiKey, true);
  assert.equal(JSON.stringify(draft).includes(apiKey), false);
  assert.throws(() => store.save({ enabled: true }, draft.id), /PLATFORM_PROVIDER_NOT_READY/);
  const encrypted = database.prepare('SELECT * FROM studio_platform_providers WHERE id = ?').get(draft.id);
  assert.equal(JSON.stringify(encrypted).includes(apiKey), false);
  let provider = await store.sync(draft.id);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${apiKey}`);
  assert.equal(provider.models.length, 4);
  assert.equal(provider.models.find((model) => model.id === 'dall-e-3').capabilities.imageEdit, false);
  assert.equal(provider.models.find((model) => model.id === 'unknown-model').supported, false);
  assert(provider.models.every((model) => !model.enabled && model.available));
  assert.equal(JSON.stringify(provider).includes(apiKey), false);
  for (const price of [-1, 0.5, '5', true, 10_000_001, Infinity, {}]) {
    assert.throws(() => store.save({ models: [{ id: 'gpt-image-2', prices: { image: price } }] }, draft.id), /INVALID_PLATFORM_MODEL_PRICE/);
  }
  assert.throws(() => store.save({ models: [{ id: 'gpt-image-2' }, { id: 'gpt-image-2' }] }, draft.id), /DUPLICATE_PLATFORM_MODEL/);
  provider = store.save({ enabled: true, models: provider.models.map((model) => ({ ...model, enabled: true, prices: { image: 7, edit: 9, video: 30 } })) }, draft.id);
  assert.equal(store.catalog(false).providers.length, 0);
  assert.equal(store.catalog(true).providers[0].models.length, 3);
  assert(!('baseUrl' in store.catalog(true).providers[0]));
  const input = { apiKeySource: 'platform', platformProviderId: draft.id, model: 'gpt-image-2', mode: 'image', count: 4, price: 0, providerId: 'invalid', apiKey: 'attacker' };
  assert.throws(() => store.runtime(input, false), /PLATFORM_CREDITS_DISABLED/);
  const runtime = store.runtime(input, true);
  assert.equal(runtime.apiKey, apiKey);
  assert.equal(runtime.profile.type, 'openai-compatible');
  assert.equal(runtime.cost.amount, 28);
  for (const count of [0, 5, -1, 1.5, '2', NaN]) assert.throws(() => store.runtime({ ...input, count }, true), /INVALID_GENERATION_COUNT/);
  assert.throws(() => store.runtime({ ...input, model: 'unknown-model' }, true), /MODEL_INVOCATION_NOT_VERIFIED/);
  assert.throws(() => store.runtime({ ...input, model: 'dall-e-3', mode: 'edit' }, true), /MODEL_INVOCATION_NOT_VERIFIED/);
  models = ['gpt-image-2', 'gpt-image-3'];
  provider = await store.sync(draft.id);
  assert.equal(provider.models.find((model) => model.id === 'gpt-image-2').prices.image, 7);
  assert.equal(provider.models.find((model) => model.id === 'sora-2').available, false);
  assert.equal(provider.models.find((model) => model.id === 'gpt-image-3').enabled, false);
  assert.equal(store.catalog(true).providers[0].models.length, 1);
  assert.throws(() => store.runtime({ ...input, model: 'sora-2' }, true), /PLATFORM_MODEL_UNAVAILABLE/);
  let release;
  waitForDiscovery = new Promise((resolve) => { release = resolve; });
  const syncing = store.sync(draft.id);
  store.save({ name: 'Changed during discovery' }, draft.id);
  release();
  await assert.rejects(syncing, /PLATFORM_PROVIDER_CHANGED/);
  waitForDiscovery = null;
  provider = store.save({ apiKey: 'rotated-platform-key' }, draft.id);
  assert.equal(provider.enabled, false);
  assert(provider.models.every((model) => !model.available));
  assert.equal(provider.lastSyncedAt, null);
  store.save({ apiKey: null }, draft.id);
  assert.equal(store.list()[0].hasApiKey, false);
  assert.throws(() => store.save({ name: apiKey, apiKey, baseUrl: 'https://example.org' }), /PROVIDER_SECRET_IN_PUBLIC_CONFIG/);
  assert.equal(store.remove(draft.id).removed, true);
  assert.throws(() => store.remove(draft.id), /PLATFORM_PROVIDER_NOT_FOUND/);

  const noKey = createPlatformProviderStore({ database });
  const emptyDraft = noKey.save({ name: 'Unconfigured', baseUrl: 'https://example.org' });
  assert.equal(emptyDraft.enabled, false);
  assert.throws(() => noKey.save({ apiKey }, emptyDraft.id), /PLATFORM_PROVIDERS_NOT_CONFIGURED/);
  await noKey.close();

  const auth = createStandaloneAuthStore({ databasePath: ':memory:', passwordIterations: 100_000 });
  try {
    const user = auth.createUser({ email: 'credit-check@example.org', username: 'credit-check', password: 'password-for-check' });
    auth.adjustCredits({ userId: user.id, amount: 100, reason: 'fixture' });
    auth.reserveCredits({ userId: user.id, amount: 7, referenceId: 'generation:fixture' });
    auth.refundCredits({ userId: user.id, amount: 1000, referenceId: 'generation-refund:fixture', chargeReferenceId: 'generation:fixture' });
    assert.equal(auth.getCreditSummary(user.id).balance, 100, 'refund derives amount from the ledger');
    auth.refundCredits({ userId: user.id, amount: 1000, referenceId: 'generation-refund:missing', chargeReferenceId: 'generation:missing' });
    assert.equal(auth.getCreditSummary(user.id).balance, 100);
    auth.reserveCredits({ userId: user.id, amount: 0, referenceId: 'generation:free', recordZero: true });
    assert.equal(auth.reserveCredits({ userId: user.id, amount: 0, referenceId: 'generation:free', recordZero: true }).duplicate, true);
    const metadata = { source: 'platform', unit: 3, quantity: 2, platformProviderId: 'supplier', model: 'gpt-image-2' };
    auth.reserveCredits({ userId: user.id, amount: 6, referenceId: 'generation:partial', metadata });
    auth.billing.recordGenerationOutput(user.id, 'partial', '/output-1.png');
    auth.billing.recordGenerationOutput(user.id, 'partial', '/output-1.png');
    auth.refundCredits({ userId: user.id, amount: 600, referenceId: 'generation-refund:partial', chargeReferenceId: 'generation:partial' });
    assert.equal(auth.getCreditSummary(user.id).balance, 97);
    assert.equal(auth.billing.getGenerationCharge(user.id, 'partial').refundedAmount, 3);
    assert.equal(auth.billing.getGenerationCharge(user.id, 'partial').metadata.deliveredOutputs.length, 1);
    auth.reserveCredits({ userId: user.id, amount: 6, referenceId: 'generation:settled', metadata });
    auth.billing.recordGenerationOutput(user.id, 'settled', '/output-2.png');
    auth.billing.recordGenerationOutput(user.id, 'settled', '/output-3.png');
    auth.billing.settleGenerationCharge(user.id, 'settled');
    auth.refundCredits({ userId: user.id, amount: 600, referenceId: 'generation-refund:settled', chargeReferenceId: 'generation:settled' });
    assert.equal(auth.getCreditSummary(user.id).balance, 91, 'settled jobs cannot be refunded by replay');
    assert.throws(() => auth.billing.attachGenerationTask(user.id, 'settled', 'forged-task'), { code: 'PLATFORM_RESERVATION_INVALID' });
  } finally { auth.close(); }

  const job = { count: 1, mode: 'image' };
  const fingerprintRuntime = { apiKey, images: [], apiKeySource: 'platform', platformProviderId: 'one' };
  const fingerprint = serverJobFingerprint(job, fingerprintRuntime);
  assert.notEqual(fingerprint, serverJobFingerprint({ ...job, count: 2 }, fingerprintRuntime));
  assert.notEqual(fingerprint, serverJobFingerprint(job, { ...fingerprintRuntime, platformProviderId: 'two' }));
} finally {
  await store.close();
  database.close();
}

let hits = 0;
const trap = http.createServer((_req, res) => { hits += 1; res.end('{}'); });
await new Promise((resolve) => trap.listen(0, '127.0.0.1', resolve));
const transport = createPlatformProviderTransport({ lookupImpl: (_host, _options, callback) => callback(null, [{ address: '127.0.0.1', family: 4 }]) });
try {
  await assert.rejects(transport.fetch(`http://public.example.org:${trap.address().port}/models`));
  assert.equal(hits, 0, 'private DNS targets must be rejected at connection time');
} finally {
  await transport.close();
  await new Promise((resolve) => trap.close(resolve));
}
console.log('Platform provider store, encryption, URL/DNS policy, model prices, ledger refunds and fingerprint checks passed.');
