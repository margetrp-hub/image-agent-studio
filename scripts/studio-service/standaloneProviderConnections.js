import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';

const CIPHER = 'aes-256-gcm';

export class StandaloneProviderConnectionError extends Error {
  constructor(code, message, { status = 400 } = {}) {
    super(message);
    this.name = 'StandaloneProviderConnectionError';
    this.code = code;
    this.status = status;
  }
}

export function createStandaloneProviderConnectionStore({
  database,
  masterKey,
  allowPrivateUrls = false,
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  if (!database || typeof database.exec !== 'function') throw new TypeError('database is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required.');
  if (typeof now !== 'function') throw new TypeError('now must be a function.');

  const key = parseMasterKey(masterKey);
  database.exec(`
    CREATE TABLE IF NOT EXISTS studio_provider_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      external_user_id TEXT NOT NULL DEFAULT '',
      external_username TEXT NOT NULL DEFAULT '',
      secret_ciphertext TEXT NOT NULL,
      secret_iv TEXT NOT NULL,
      secret_tag TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      last_checked_at INTEGER,
      last_error TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS studio_provider_connections_user_idx
      ON studio_provider_connections(user_id, created_at DESC);
  `);

  function requireConfigured() {
    if (!key) throw new StandaloneProviderConnectionError('PROVIDER_CONNECTIONS_NOT_CONFIGURED', 'Provider connections require STUDIO_MASTER_KEY.', { status: 503 });
  }

  function list(userId) {
    const rows = database.prepare(`
      SELECT id, user_id, provider_type, base_url, external_user_id, external_username,
        active, last_checked_at, last_error, created_at, updated_at
      FROM studio_provider_connections
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(String(userId));
    return rows.map(toPublicConnection);
  }

  async function bind({ userId, providerType, baseUrl, identifier, username, password, accessToken, apiKey } = {}) {
    requireConfigured();
    const ownerId = normalizeRequired(userId, 'userId');
    const provider = normalizeProviderType(providerType);
    const endpoint = normalizeBaseUrl(baseUrl, provider, allowPrivateUrls);
    const credentials = await resolveExternalCredentials({
      provider,
      endpoint,
      identifier: identifier || username,
      username,
      password,
      accessToken,
      apiKey,
      fetchImpl
    });
    const id = randomUUID();
    const timestamp = now();
    const encrypted = encryptSecret({
      ownerId,
      connectionId: id,
      apiKey: credentials.apiKey,
      gatewayBaseUrl: credentials.gatewayBaseUrl
    }, key);
    database.prepare(`
      INSERT INTO studio_provider_connections
        (id, user_id, provider_type, base_url, external_user_id, external_username,
         secret_ciphertext, secret_iv, secret_tag, active, last_checked_at, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, '', ?, ?)
    `).run(
      id,
      ownerId,
      provider,
      endpoint.origin,
      credentials.externalUserId,
      credentials.externalUsername,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      timestamp,
      timestamp,
      timestamp
    );
    return get(ownerId, id);
  }

  function get(userId, connectionId) {
    const row = database.prepare('SELECT * FROM studio_provider_connections WHERE user_id = ? AND id = ?').get(String(userId), String(connectionId));
    return row ? toPublicConnection(row) : null;
  }

  function runtime(userId, connectionId) {
    requireConfigured();
    const row = database.prepare('SELECT * FROM studio_provider_connections WHERE user_id = ? AND id = ? AND active = 1').get(String(userId), String(connectionId));
    if (!row) throw new StandaloneProviderConnectionError('PROVIDER_CONNECTION_NOT_FOUND', 'Provider connection not found.', { status: 404 });
    const secret = decryptSecret(row, key, String(userId), String(connectionId));
    return {
      connectionId: row.id,
      providerType: row.provider_type,
      apiKey: secret.apiKey,
      gatewayBaseUrl: secret.gatewayBaseUrl
    };
  }

  function remove(userId, connectionId) {
    const result = database.prepare('DELETE FROM studio_provider_connections WHERE user_id = ? AND id = ?').run(String(userId), String(connectionId));
    if (!Number(result.changes)) throw new StandaloneProviderConnectionError('PROVIDER_CONNECTION_NOT_FOUND', 'Provider connection not found.', { status: 404 });
    return { removed: true };
  }

  async function test(userId, connectionId) {
    const current = runtime(userId, connectionId);
    const response = await fetchImpl(`${current.gatewayBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${current.apiKey}`, Accept: 'application/json' }
    });
    if (!response.ok) throw new StandaloneProviderConnectionError('PROVIDER_CONNECTION_TEST_FAILED', `Provider returned HTTP ${response.status}.`, { status: 502 });
    database.prepare('UPDATE studio_provider_connections SET last_checked_at = ?, last_error = \'\', updated_at = ? WHERE id = ? AND user_id = ?').run(now(), now(), String(connectionId), String(userId));
    return get(userId, connectionId);
  }

  return Object.freeze({ configured: Boolean(key), list, get, bind, runtime, remove, test });
}

async function resolveExternalCredentials({ provider, endpoint, identifier, username, password, accessToken, apiKey, fetchImpl }) {
  if (apiKey) {
    return {
      apiKey: normalizeRequired(apiKey, 'apiKey'),
      gatewayBaseUrl: endpoint.gatewayBaseUrl,
      externalUserId: '',
      externalUsername: ''
    };
  }
  if (accessToken) {
    return {
      apiKey: normalizeRequired(accessToken, 'accessToken'),
      gatewayBaseUrl: endpoint.gatewayBaseUrl,
      externalUserId: '',
      externalUsername: ''
    };
  }
  if (provider === 'sub2api-compatible') return resolveSub2Api(endpoint, { identifier, password, fetchImpl });
  return resolveNewApi(endpoint, { identifier: identifier || username, password, fetchImpl });
}

async function resolveSub2Api(endpoint, { identifier, password, fetchImpl }) {
  if (!identifier || !password) throw new StandaloneProviderConnectionError('EXTERNAL_LOGIN_REQUIRED', 'External account and password are required.');
  const login = await externalJson(fetchImpl, `${endpoint.apiBaseUrl}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: identifier, username: identifier, password }),
    headers: { 'Content-Type': 'application/json' }
  });
  if (login?.requires_2fa || login?.data?.requires_2fa) throw new StandaloneProviderConnectionError('EXTERNAL_2FA_REQUIRED', 'Complete external 2FA before binding this account.', { status: 409 });
  const token = login?.access_token || login?.accessToken || login?.data?.access_token || login?.data?.accessToken;
  if (!token) throw new StandaloneProviderConnectionError('EXTERNAL_LOGIN_FAILED', 'The external account login did not return a token.', { status: 502 });
  const profile = await externalJson(fetchImpl, `${endpoint.apiBaseUrl}/auth/me`, { headers: bearer(token) }).catch(() => ({}));
  const keyList = await externalJson(fetchImpl, `${endpoint.apiBaseUrl}/keys?page=1&page_size=50&status=active`, { headers: bearer(token) });
  let item = listItems(keyList).find((candidate) => candidate?.key || candidate?.plain || candidate?.full_key);
  if (!item) {
    item = await externalJson(fetchImpl, `${endpoint.apiBaseUrl}/keys`, {
      method: 'POST',
      headers: { ...bearer(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Image Agent Studio', scope: 'image,video,chat' })
    });
  }
  const resolvedKey = item?.key || item?.plain || item?.full_key || item?.data?.key;
  if (!resolvedKey) throw new StandaloneProviderConnectionError('EXTERNAL_PROVIDER_KEY_NOT_FOUND', 'No usable Sub2API provider key was found.', { status: 422 });
  const user = profile?.user || profile?.data?.user || profile?.data || profile;
  return {
    apiKey: String(resolvedKey),
    gatewayBaseUrl: endpoint.gatewayBaseUrl,
    externalUserId: String(user?.id || user?.user_id || ''),
    externalUsername: String(user?.email || user?.username || identifier)
  };
}

async function resolveNewApi(endpoint, { identifier, password, fetchImpl }) {
  if (!identifier || !password) throw new StandaloneProviderConnectionError('EXTERNAL_LOGIN_REQUIRED', 'External account and password are required.');
  const response = await externalRaw(fetchImpl, `${endpoint.apiBaseUrl}/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: identifier, password })
  });
  const login = unwrapExternalPayload(response.payload);
  const cookie = response.headers.get('set-cookie') || login?.cookie || '';
  if (!cookie) throw new StandaloneProviderConnectionError('EXTERNAL_SESSION_MISSING', 'The NewAPI login did not return a session cookie.', { status: 502 });
  const headers = { Cookie: cookie };
  const tokens = await externalJson(fetchImpl, `${endpoint.apiBaseUrl}/token?page=1&page_size=50`, { headers });
  const token = listItems(tokens).find((item) => item?.id !== undefined);
  if (!token) throw new StandaloneProviderConnectionError('EXTERNAL_PROVIDER_KEY_NOT_FOUND', 'No NewAPI user token was found. Create one in NewAPI first.', { status: 422 });
  const tokenPayload = await externalJson(fetchImpl, `${endpoint.apiBaseUrl}/token/${encodeURIComponent(token.id)}/key`, { method: 'POST', headers });
  const resolvedKey = tokenPayload?.key || tokenPayload?.data?.key;
  if (!resolvedKey) throw new StandaloneProviderConnectionError('EXTERNAL_PROVIDER_KEY_NOT_FOUND', 'NewAPI did not return the selected token key.', { status: 422 });
  const user = login?.data?.user || login?.user || login?.data || login;
  return {
    apiKey: String(resolvedKey),
    gatewayBaseUrl: endpoint.gatewayBaseUrl,
    externalUserId: String(user?.id || user?.user_id || ''),
    externalUsername: String(user?.username || user?.email || identifier)
  };
}

async function externalJson(fetchImpl, url, options = {}) {
  const response = await externalRaw(fetchImpl, url, options);
  return unwrapExternalPayload(response.payload);
}

async function externalRaw(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, { ...options, redirect: 'error' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new StandaloneProviderConnectionError('EXTERNAL_PROVIDER_REQUEST_FAILED', `External provider returned HTTP ${response.status}.`, { status: 502 });
  return { payload, headers: response.headers };
}

function unwrapExternalPayload(payload) {
  if (payload && typeof payload === 'object' && payload.code !== undefined && Number(payload.code) !== 0 && payload.code !== true) {
    throw new StandaloneProviderConnectionError('EXTERNAL_PROVIDER_REQUEST_FAILED', String(payload.message || 'External provider rejected the request.'), { status: 502 });
  }
  return payload?.data && payload.code === 0 ? payload.data : payload;
}

function listItems(payload) {
  if (Array.isArray(payload)) return payload;
  return [payload?.items, payload?.list, payload?.tokens, payload?.keys, payload?.data]
    .find((value) => Array.isArray(value)) || [];
}

function bearer(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

function normalizeProviderType(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (!['sub2api-compatible', 'newapi-compatible'].includes(provider)) {
    throw new StandaloneProviderConnectionError('UNSUPPORTED_PROVIDER_CONNECTION', 'Only Sub2API and NewAPI connections are supported.');
  }
  return provider;
}

function normalizeBaseUrl(value, provider, allowPrivateUrls) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new StandaloneProviderConnectionError('INVALID_PROVIDER_URL', 'Provider URL is invalid.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (!allowPrivateUrls && privateHost(url.hostname))) {
    throw new StandaloneProviderConnectionError('INVALID_PROVIDER_URL', 'Provider URL must be a public http(s) endpoint.');
  }
  const origin = url.origin;
  const rootPath = url.pathname.replace(/\/(?:api\/v1|api|v1)\/?$/i, '').replace(/\/$/, '');
  const root = `${origin}${rootPath}`;
  const apiSuffix = provider === 'sub2api-compatible' ? '/api/v1' : '/api';
  return {
    origin: root || origin,
    apiBaseUrl: `${root || origin}${apiSuffix}`.replace(/\/+$/, ''),
    gatewayBaseUrl: `${root || origin}/v1`.replace(/\/+$/, '')
  };
}

function privateHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function parseMasterKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const decoded = Buffer.from(raw, 'base64');
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

function encryptSecret(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, key, iv);
  const aad = `${value.ownerId}:${value.connectionId}`;
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

function decryptSecret(row, key, ownerId, connectionId) {
  try {
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(row.secret_iv, 'base64'));
    decipher.setAAD(Buffer.from(`${ownerId}:${connectionId}`));
    decipher.setAuthTag(Buffer.from(row.secret_tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.secret_ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  } catch {
    throw new StandaloneProviderConnectionError('PROVIDER_CONNECTION_SECRET_INVALID', 'Provider connection secret cannot be decrypted.', { status: 503 });
  }
}

function toPublicConnection(row) {
  return {
    id: row.id,
    providerType: row.provider_type,
    baseUrl: row.base_url,
    externalUserId: row.external_user_id,
    externalUsername: row.external_username,
    active: Boolean(row.active),
    credentialConfigured: true,
    lastCheckedAt: row.last_checked_at ? new Date(Number(row.last_checked_at)).toISOString() : null,
    lastError: row.last_error || '',
    createdAt: new Date(Number(row.created_at)).toISOString(),
    updatedAt: new Date(Number(row.updated_at)).toISOString()
  };
}

function normalizeRequired(value, field) {
  const text = String(value || '').trim();
  if (!text || text.length > 4096) throw new StandaloneProviderConnectionError('INVALID_PROVIDER_CONNECTION', `${field} is required.`);
  return text;
}
