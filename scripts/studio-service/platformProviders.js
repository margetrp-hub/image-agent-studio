import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { decryptSecret, encryptSecret, parseMasterKey } from './standaloneProviderConnections.js';
import { normalizeProviderType, providerProfile, resolveProviderInvocation } from './providerProfiles.js';

const MAX_MODELS = 2000;
const MAX_PRICE = 10_000_000;
const blockedAddresses = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]]) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

export class PlatformProviderError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function privateHost(value) {
  const host = value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const family = isIP(host);
  return family
    ? blockedAddresses.check(host, family === 6 ? 'ipv6' : 'ipv4')
    : !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(host);
}

export function validatePlatformUrl(value, allowPrivateUrls = false, { asset = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new PlatformProviderError('INVALID_PROVIDER_URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash
      || (!asset && url.search) || (!allowPrivateUrls && privateHost(url.hostname))) {
    throw new PlatformProviderError('INVALID_PROVIDER_URL');
  }
  return url;
}

// Check the addresses actually used by the socket, so DNS cannot bypass the URL policy.
export function createPlatformProviderTransport({ allowPrivateUrls = false, fetchImpl = undiciFetch, lookupImpl = lookup } = {}) {
  const dispatcher = new Agent({
    headersTimeout: 45 * 60_000,
    bodyTimeout: 45 * 60_000,
    connect: { lookup(host, options, callback) {
      lookupImpl(host, { ...options, all: true }, (error, addresses) => {
        if (error) return callback(error);
        if (!addresses?.length || (!allowPrivateUrls && addresses.some(({ address }) => privateHost(address)))) {
          return callback(new PlatformProviderError('INVALID_PROVIDER_URL'));
        }
        return options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family);
      });
    } }
  });
  return {
    async fetch(url, options = {}) {
      validatePlatformUrl(url, allowPrivateUrls, { asset: true });
      return fetchImpl(url, { ...options, dispatcher, redirect: 'error' });
    },
    close: () => dispatcher.close()
  };
}

export function redactPlatformValue(value, apiKey) {
  if (!apiKey) return value;
  const secrets = [...new Set([apiKey, encodeURIComponent(apiKey), JSON.stringify(apiKey).slice(1, -1)])];
  const scrub = (item) => {
    if (typeof item === 'string') return secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), item);
    if (Array.isArray(item)) return item.map(scrub);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [scrub(key), scrub(child)]));
    return item;
  };
  return scrub(value);
}

function requiredText(value, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x1f\x7f]/.test(value)) {
    throw new PlatformProviderError('INVALID_PLATFORM_PROVIDER');
  }
  return value.trim();
}

function boolean(value) {
  if (typeof value !== 'boolean') throw new PlatformProviderError('INVALID_PLATFORM_PROVIDER');
  return value;
}

function capabilities(providerId, model) {
  const textToImage = resolveProviderInvocation(providerId, model, 'image').status === 'verified';
  return {
    textToImage,
    imageEdit: textToImage && !/dall[-_]e[-_]3/i.test(model),
    videoGeneration: resolveProviderInvocation(providerId, model, 'video').status === 'verified'
  };
}

function usable(model) {
  return model.enabled && model.available && model.supported && (
    (model.capabilities.textToImage && model.prices.image !== null)
    || (model.capabilities.imageEdit && model.prices.edit !== null)
    || (model.capabilities.videoGeneration && model.prices.video !== null)
  );
}

export function createPlatformProviderStore({ database, masterKey, allowPrivateUrls = false, fetchImpl, now = Date.now } = {}) {
  const key = parseMasterKey(masterKey);
  const transport = createPlatformProviderTransport({ allowPrivateUrls, fetchImpl });
  database.exec(`
    CREATE TABLE IF NOT EXISTS studio_platform_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      base_url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      secret_ciphertext TEXT NOT NULL DEFAULT '',
      secret_iv TEXT NOT NULL DEFAULT '',
      secret_tag TEXT NOT NULL DEFAULT '',
      models_json TEXT NOT NULL DEFAULT '[]',
      last_synced_at INTEGER,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  function rowFor(id) {
    const row = database.prepare('SELECT * FROM studio_platform_providers WHERE id = ?').get(String(id || ''));
    if (!row) throw new PlatformProviderError('PLATFORM_PROVIDER_NOT_FOUND', 404);
    return row;
  }

  function secretFor(row) {
    if (!key) throw new PlatformProviderError('PLATFORM_PROVIDERS_NOT_CONFIGURED', 503);
    if (!row.secret_ciphertext) throw new PlatformProviderError('PLATFORM_PROVIDER_KEY_REQUIRED', 409);
    return decryptSecret(row, key, 'platform', row.id).apiKey;
  }

  function publicProvider(row) {
    return {
      id: row.id, name: row.name, providerId: row.provider_id, baseUrl: row.base_url,
      enabled: Boolean(row.enabled), hasApiKey: Boolean(row.secret_ciphertext),
      models: JSON.parse(row.models_json).map((model) => {
        const supportedCapabilities = capabilities(row.provider_id, model.id);
        return { ...model, supported: Object.values(supportedCapabilities).some(Boolean), capabilities: supportedCapabilities };
      }),
      lastSyncedAt: row.last_synced_at === null ? null : new Date(row.last_synced_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  function list() {
    return database.prepare('SELECT * FROM studio_platform_providers ORDER BY created_at, id').all().map(publicProvider);
  }

  function normalizeModels(input, previous = []) {
    if (!Array.isArray(input) || input.length > MAX_MODELS) throw new PlatformProviderError('INVALID_PLATFORM_MODELS');
    const ids = new Set();
    return input.map((item) => {
      const id = requiredText(item?.id);
      if (ids.has(id)) throw new PlatformProviderError('DUPLICATE_PLATFORM_MODEL');
      ids.add(id);
      const old = previous.find((model) => model.id === id);
      if (item.prices !== undefined && (!item.prices || typeof item.prices !== 'object' || Array.isArray(item.prices))) {
        throw new PlatformProviderError('INVALID_PLATFORM_MODEL_PRICE');
      }
      const prices = {};
      for (const operation of ['image', 'edit', 'video']) {
        const price = item.prices?.[operation] ?? null;
        if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > MAX_PRICE)) {
          throw new PlatformProviderError('INVALID_PLATFORM_MODEL_PRICE');
        }
        prices[operation] = price;
      }
      return { id, name: requiredText(item.name ?? old?.name ?? id), enabled: boolean(item.enabled ?? false), available: old?.available ?? false, prices };
    });
  }

  function save(input, id = '') {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PlatformProviderError('INVALID_PLATFORM_PROVIDER');
    const old = id ? rowFor(id) : null;
    if (!old && input.enabled === true) throw new PlatformProviderError('PLATFORM_PROVIDER_DRAFT_REQUIRED');
    const providerId = requiredText(input.providerId ?? old?.provider_id ?? 'openai-compatible');
    if (normalizeProviderType(providerId) !== providerId) throw new PlatformProviderError('INVALID_PROVIDER_TYPE');
    const name = requiredText(input.name ?? old?.name);
    const baseUrl = validatePlatformUrl(input.baseUrl ?? old?.base_url, allowPrivateUrls).toString().replace(/\/+$/, '');
    const providerKey = old?.id || randomUUID();
    let encrypted = { ciphertext: old?.secret_ciphertext || '', iv: old?.secret_iv || '', tag: old?.secret_tag || '' };
    let apiKey = '';
    if (input.apiKey !== undefined && input.apiKey !== '') {
      if (input.apiKey === null) encrypted = { ciphertext: '', iv: '', tag: '' };
      else {
        if (!key) throw new PlatformProviderError('PLATFORM_PROVIDERS_NOT_CONFIGURED', 503);
        apiKey = requiredText(input.apiKey, 4000);
        encrypted = encryptSecret({ ownerId: 'platform', connectionId: providerKey, apiKey }, key);
      }
    }
    const changedConnection = old && (providerId !== old.provider_id || baseUrl !== old.base_url || encrypted.ciphertext !== old.secret_ciphertext);
    const previous = old ? JSON.parse(old.models_json) : [];
    const models = input.models === undefined ? previous : normalizeModels(input.models, previous);
    if (changedConnection) for (const model of models) model.available = false;
    const enabled = boolean(input.enabled ?? (changedConnection ? false : Boolean(old?.enabled)));
    if (enabled && (!key || !encrypted.ciphertext || !models.some((model) => usable({ ...model, capabilities: capabilities(providerId, model.id), supported: true })))) {
      throw new PlatformProviderError('PLATFORM_PROVIDER_NOT_READY', 409);
    }
    // Never persist an accidentally echoed credential in public configuration.
    if (!apiKey && old?.secret_ciphertext && key) apiKey = secretFor(old);
    const publicFields = { name, baseUrl, models };
    if (JSON.stringify(redactPlatformValue(publicFields, apiKey)) !== JSON.stringify(publicFields)) {
      throw new PlatformProviderError('PROVIDER_SECRET_IN_PUBLIC_CONFIG');
    }
    const timestamp = now();
    database.prepare(`
      INSERT INTO studio_platform_providers (id, name, provider_id, base_url, enabled, secret_ciphertext, secret_iv, secret_tag, models_json, last_synced_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, provider_id=excluded.provider_id, base_url=excluded.base_url,
        enabled=excluded.enabled, secret_ciphertext=excluded.secret_ciphertext, secret_iv=excluded.secret_iv,
        secret_tag=excluded.secret_tag, models_json=excluded.models_json, last_synced_at=excluded.last_synced_at,
        revision=studio_platform_providers.revision+1, updated_at=excluded.updated_at
    `).run(providerKey, name, providerId, baseUrl, Number(enabled), encrypted.ciphertext, encrypted.iv, encrypted.tag, JSON.stringify(models), changedConnection ? null : old?.last_synced_at ?? null, old?.created_at ?? timestamp, timestamp);
    return publicProvider(rowFor(providerKey));
  }

  function remove(id) {
    rowFor(id);
    database.prepare('DELETE FROM studio_platform_providers WHERE id = ?').run(id);
    return { removed: true };
  }

  function gatewayUrl(row) {
    const base = row.base_url.replace(/\/+$/, '');
    return row.provider_id === 'gemini-compatible' ? base.replace(/\/v1(?:beta)?$/i, '') : base.endsWith('/v1') ? base : `${base}/v1`;
  }

  async function sync(id) {
    const row = rowFor(id);
    const apiKey = secretFor(row);
    const base = gatewayUrl(row);
    let discovered = [];
    let pageToken = '';
    let pages = 0;
    const tokens = new Set();
    try {
      do {
        if (++pages > 32) throw new Error('too many discovery pages');
        const url = new URL(`${base}${row.provider_id === 'gemini-compatible' ? '/v1beta/models' : '/models'}`);
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const response = await transport.fetch(url.toString(), {
          headers: { Authorization: `Bearer ${apiKey}`, ...(row.provider_id === 'gemini-compatible' ? { 'X-Goog-Api-Key': apiKey } : {}) },
          signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) { await response.body?.cancel(); throw new Error('discovery failed'); }
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024) throw new Error('discovery too large');
          chunks.push(Buffer.from(chunk));
        }
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const items = Array.isArray(payload) ? payload : payload.data ?? payload.models;
        if (!Array.isArray(items)) throw new Error('invalid discovery');
        for (const item of items) {
          const modelId = requiredText(String(typeof item === 'string' ? item : item?.id ?? item?.name ?? '').replace(/^models\//, ''));
          if (redactPlatformValue(modelId, apiKey) !== modelId) continue;
          discovered.push({ id: modelId, name: modelId });
        }
        pageToken = row.provider_id === 'gemini-compatible' ? payload.nextPageToken || '' : '';
        if (discovered.length > MAX_MODELS || tokens.has(pageToken)) throw new Error('discovery too large');
        tokens.add(pageToken);
      } while (pageToken);
    } catch {
      throw new PlatformProviderError('PLATFORM_PROVIDER_DISCOVERY_FAILED', 502);
    }
    discovered = [...new Map(discovered.map((model) => [model.id, model])).values()];
    const previous = JSON.parse(row.models_json);
    const models = previous.map((model) => ({ ...model, available: discovered.some((item) => item.id === model.id) }));
    for (const model of discovered) {
      if (!models.some((item) => item.id === model.id)) models.push({ ...model, enabled: false, available: true, prices: { image: null, edit: null, video: null } });
    }
    if (models.length > MAX_MODELS) throw new PlatformProviderError('INVALID_PLATFORM_MODELS');
    const result = database.prepare(`UPDATE studio_platform_providers SET models_json = ?, last_synced_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?`)
      .run(JSON.stringify(models), now(), now(), id, row.revision);
    if (Number(result.changes) !== 1) throw new PlatformProviderError('PLATFORM_PROVIDER_CHANGED', 409);
    return publicProvider(rowFor(id));
  }

  function catalog(creditsEnabled) {
    return { creditsEnabled: Boolean(creditsEnabled), providers: creditsEnabled && key ? list().filter((provider) => provider.enabled && provider.hasApiKey).map((provider) => ({
      id: provider.id, name: provider.name, providerId: provider.providerId, models: provider.models.filter(usable)
    })).filter((provider) => provider.models.length) : [] };
  }

  function runtime(request, creditsEnabled) {
    if (!creditsEnabled) throw new PlatformProviderError('PLATFORM_CREDITS_DISABLED', 403);
    const row = rowFor(request.platformProviderId);
    if (!row.enabled) throw new PlatformProviderError('PLATFORM_PROVIDER_DISABLED', 403);
    const model = publicProvider(row).models.find((item) => item.id === request.model);
    if (!model?.enabled || !model.available) throw new PlatformProviderError('PLATFORM_MODEL_UNAVAILABLE', 400);
    const operation = request.mode === 'video' ? 'video' : ['edit', 'mask'].includes(request.mode) || request.route === 'edits' ? 'edit' : 'image';
    const capability = { image: 'textToImage', edit: 'imageEdit', video: 'videoGeneration' }[operation];
    if (!model.capabilities[capability]) throw new PlatformProviderError('MODEL_INVOCATION_NOT_VERIFIED', 400);
    const unit = model.prices[operation];
    if (unit === null) throw new PlatformProviderError('PLATFORM_MODEL_OPERATION_UNPRICED', 400);
    const quantity = request.n ?? request.count ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > (operation === 'video' ? 1 : 4)) throw new PlatformProviderError('INVALID_GENERATION_COUNT');
    return {
      apiKey: secretFor(row), gatewayBaseUrl: gatewayUrl(row), profile: providerProfile(row.provider_id),
      connectionFingerprint: createHash('sha256').update(JSON.stringify([row.base_url, row.provider_id, row.secret_ciphertext])).digest('hex'),
      apiKeySource: 'platform', platformProviderId: row.id, providerLabel: row.name, fetch: transport.fetch,
      cost: { amount: unit * quantity, unit, quantity, operation, platformProviderId: row.id, source: 'platform' }
    };
  }

  return Object.freeze({ configured: Boolean(key), list, save, remove, sync, catalog, runtime, close: transport.close });
}
