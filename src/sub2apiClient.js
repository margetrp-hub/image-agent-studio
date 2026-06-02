const SESSION_KEY = 'sub2api-studio:session:v1';
const SELECTED_KEY_ID = 'sub2api-studio:selected-key-id:v1';
const PROVIDER_SETTINGS_KEY = 'image-sub2api-studio:provider-settings:v1';
const LEGACY_PROVIDER_SETTINGS_KEY = 'ohlaoo-studio:provider-settings:v1';
const SUB2API_TOKEN_KEY = 'auth_token';
const SUB2API_REFRESH_TOKEN_KEY = 'refresh_token';
const SUB2API_USER_KEY = 'auth_user';
const SUB2API_EXPIRES_AT_KEY = 'token_expires_at';

const envBaseUrl = import.meta.env.VITE_SUB2API_BASE_URL || '';
const envGatewayBaseUrl = import.meta.env.VITE_SUB2API_GATEWAY_BASE_URL || '';
const envLoginUrl = import.meta.env.VITE_SUB2API_LOGIN_URL || '';
const envStudioHistoryBaseUrl = import.meta.env.VITE_STUDIO_HISTORY_BASE_URL || '';
const envImageRoute = String(import.meta.env.VITE_SUB2API_IMAGE_ROUTE || 'auto').toLowerCase();
const DEFAULT_RESPONSES_MODEL = 'gpt-5.5';
const envResponsesModel = String(import.meta.env.VITE_SUB2API_RESPONSES_MODEL || DEFAULT_RESPONSES_MODEL).trim() === 'gpt-5.4'
  ? DEFAULT_RESPONSES_MODEL
  : String(import.meta.env.VITE_SUB2API_RESPONSES_MODEL || DEFAULT_RESPONSES_MODEL).trim();
const envResponsesPartialImages = Number(import.meta.env.VITE_SUB2API_RESPONSES_PARTIAL_IMAGES || 2);
const envPromptOptimizerModel = import.meta.env.VITE_SUB2API_PROMPT_OPTIMIZER_MODEL || '';

const providerDefaults = {
  apiKeySource: 'sub2api',
  route: normalizeImageRoute(envImageRoute || 'auto'),
  manualApiKey: '',
  manualGatewayBaseUrl: '',
  responsesModel: envResponsesModel,
  partialImages: normalizePartialImageCount(envResponsesPartialImages)
};

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function defaultDevSub2ApiOrigin() {
  if (!import.meta.env.DEV) return '';
  if (import.meta.env.VITE_DEV_SUB2API_PROXY_TARGET) return '';
  const host = window.location.hostname;
  if ((host === 'localhost' || host === '127.0.0.1') && window.location.port !== '8080') {
    return `${window.location.protocol}//${host}:8080`;
  }
  return '';
}

function normalizeApiBaseUrl(value) {
  const raw = trimTrailingSlash(value || envBaseUrl || defaultDevSub2ApiOrigin() || window.location.origin);
  if (raw.endsWith('/api/v1')) return raw;
  return `${raw}/api/v1`;
}

function normalizeGatewayBaseUrl(value) {
  const raw = trimTrailingSlash(value || envGatewayBaseUrl || envBaseUrl || defaultDevSub2ApiOrigin() || window.location.origin);
  if (raw.endsWith('/v1')) return raw;
  return `${raw}/v1`;
}

function normalizeImageRoute(value) {
  const route = String(value || '').toLowerCase();
  if (route === 'legacy' || route === 'images' || route === 'image' || route === 'generations') return 'legacy';
  if (route === 'responses') return 'responses';
  if (route === 'auto') return 'auto';
  return 'auto';
}

function normalizeApiKeySource(value) {
  return value === 'manual' ? 'manual' : 'sub2api';
}

function normalizeResponsesModel(value) {
  const model = String(value || DEFAULT_RESPONSES_MODEL).trim();
  return model === 'gpt-5.4' ? DEFAULT_RESPONSES_MODEL : model;
}

function imageMimeType(format) {
  const normalized = String(format || 'png').toLowerCase();
  if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg';
  if (normalized === 'webp') return 'image/webp';
  return 'image/png';
}

function base64ToDataUrl(base64, format = 'png') {
  return base64 ? `data:${imageMimeType(format)};base64,${base64}` : '';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')
  );
}

function isDirectImageResponsesModel(value) {
  const model = String(value || '').toLowerCase();
  return /(^|[^a-z0-9])(gpt-)?image[-_a-z0-9]*\d/.test(model)
    || /(^|[^a-z0-9])dall[-_a-z0-9]*\d/.test(model);
}

function responsesImageParams({ size, quality, outputFormat, moderation }) {
  return compactObject({
    size: size || 'auto',
    quality: quality || 'auto',
    output_format: outputFormat || 'png',
    moderation: moderation || 'auto'
  });
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

function extractKeyItems(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.list)
        ? payload.list
        : Array.isArray(payload?.keys)
          ? payload.keys
          : Array.isArray(payload?.records)
            ? payload.records
            : Array.isArray(payload?.data)
              ? payload.data
              : [];
  return items.map(normalizeApiKeyItem);
}

function normalizeApiKeyItem(apiKey) {
  if (!apiKey || typeof apiKey !== 'object') return apiKey;
  return {
    ...apiKey,
    key: apiKey.key || apiKey.plain || apiKey.mask || '',
    displayKey: apiKey.mask || apiKey.name || ''
  };
}

function keyStatusIsUsable(status) {
  if (status === undefined || status === null || status === '') return true;
  if (typeof status === 'number') return status === 1;
  const normalized = String(status).toLowerCase();
  if (['1', 'active', 'enabled', 'enable', 'usable'].includes(normalized)) return true;
  if (['0', 'disabled', 'deleted', 'revoked', 'inactive'].includes(normalized)) return false;
  return true;
}

function keyIsUsable(apiKey) {
  return Boolean(apiKey?.key || apiKey?.plain || apiKey?.mask) && keyStatusIsUsable(apiKey?.status);
}

function normalizeProviderSettings(value = {}) {
  return {
    ...providerDefaults,
    ...value,
    apiKeySource: normalizeApiKeySource(value.apiKeySource),
    route: normalizeImageRoute(value.route || providerDefaults.route),
    manualApiKey: String(value.manualApiKey || ''),
    manualGatewayBaseUrl: String(value.manualGatewayBaseUrl || ''),
    responsesModel: normalizeResponsesModel(value.responsesModel),
    partialImages: normalizePartialImageCount(value.partialImages)
  };
}

export function getConfiguredBaseUrls() {
  return {
    apiBaseUrl: normalizeApiBaseUrl(envBaseUrl),
    gatewayBaseUrl: normalizeGatewayBaseUrl(envGatewayBaseUrl || envBaseUrl),
    studioHistoryBaseUrl: trimTrailingSlash(envStudioHistoryBaseUrl || window.location.origin)
  };
}

export function getDefaultProviderSettings() {
  return normalizeProviderSettings(providerDefaults);
}

export function loadProviderSettings() {
  try {
    const raw = localStorage.getItem(PROVIDER_SETTINGS_KEY) || localStorage.getItem(LEGACY_PROVIDER_SETTINGS_KEY);
    return normalizeProviderSettings(JSON.parse(raw || 'null') || {});
  } catch {
    return getDefaultProviderSettings();
  }
}

export function saveProviderSettings(settings) {
  const nextSettings = normalizeProviderSettings(settings);
  localStorage.setItem(PROVIDER_SETTINGS_KEY, JSON.stringify(nextSettings));
  return nextSettings;
}

export function getLoginUrl() {
  const loginBase = envLoginUrl || `${trimTrailingSlash(envBaseUrl || defaultDevSub2ApiOrigin() || window.location.origin)}/login`;
  const loginUrl = new URL(loginBase, window.location.origin);
  const localRedirect = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`;
  if (!loginUrl.searchParams.has('redirect')) {
    loginUrl.searchParams.set('redirect', localRedirect);
  }
  return loginUrl.toString();
}

function readJsonStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function persistUrlTokens() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const accessToken = params.get('access_token') || hashParams.get('access_token');
  if (!accessToken) return false;

  const refreshToken = params.get('refresh_token') || hashParams.get('refresh_token') || '';
  const expiresIn = Number(params.get('expires_in') || hashParams.get('expires_in') || 0);
  const redirect = params.get('redirect') || hashParams.get('redirect') || '';

  localStorage.setItem(SUB2API_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(SUB2API_REFRESH_TOKEN_KEY, refreshToken);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    localStorage.setItem(SUB2API_EXPIRES_AT_KEY, String(Date.now() + expiresIn * 1000));
  }

  const nextUrl = redirect && redirect.startsWith('/')
    ? redirect
    : `${window.location.pathname}${window.location.search ? window.location.search.replace(/[?&](access_token|refresh_token|expires_in|token_type|redirect)=[^&]*/g, '').replace(/^&/, '?') : ''}`;
  window.history.replaceState(null, '', nextUrl || window.location.pathname);
  return true;
}

function loadSub2ApiSession() {
  persistUrlTokens();
  const accessToken = localStorage.getItem(SUB2API_TOKEN_KEY);
  if (!accessToken) return null;

  return {
    accessToken,
    refreshToken: localStorage.getItem(SUB2API_REFRESH_TOKEN_KEY) || '',
    expiresAt: Number(localStorage.getItem(SUB2API_EXPIRES_AT_KEY) || 0),
    user: readJsonStorage(SUB2API_USER_KEY)
  };
}

function authHeadersFromSession(session) {
  return session?.accessToken
    ? { Authorization: `Bearer ${session.accessToken}` }
    : {};
}

export function loadSession() {
  try {
    const sub2ApiSession = loadSub2ApiSession();
    if (sub2ApiSession?.accessToken) return sub2ApiSession;

    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (parsed?.accessToken) return parsed;
    return null;
  } catch {
    return loadSub2ApiSession();
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  if (session.accessToken) localStorage.setItem(SUB2API_TOKEN_KEY, session.accessToken);
  if (session.refreshToken) localStorage.setItem(SUB2API_REFRESH_TOKEN_KEY, session.refreshToken);
  if (session.expiresAt) localStorage.setItem(SUB2API_EXPIRES_AT_KEY, String(session.expiresAt));
  if (session.user) localStorage.setItem(SUB2API_USER_KEY, JSON.stringify(session.user));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SELECTED_KEY_ID);
  localStorage.removeItem(SUB2API_TOKEN_KEY);
  localStorage.removeItem(SUB2API_REFRESH_TOKEN_KEY);
  localStorage.removeItem(SUB2API_USER_KEY);
  localStorage.removeItem(SUB2API_EXPIRES_AT_KEY);
  localStorage.removeItem('sub2api-studio:api-base-url:v1');
  localStorage.removeItem('sub2api-studio:gateway-base-url:v1');
}

export function loadSelectedKeyId() {
  const value = localStorage.getItem(SELECTED_KEY_ID);
  return value ? Number(value) : null;
}

export function saveSelectedKeyId(keyId) {
  if (keyId) localStorage.setItem(SELECTED_KEY_ID, String(keyId));
  else localStorage.removeItem(SELECTED_KEY_ID);
}

function normalizeResponseData(payload) {
  if (payload && typeof payload === 'object' && 'code' in payload) {
    if (payload.code === 0) return payload.data;
    const error = new Error(payload.message || 'SUB2API_REQUEST_FAILED');
    error.code = payload.code;
    error.metadata = payload.metadata;
    throw error;
  }
  return payload;
}

function extractChatCompletionText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  const content = choice?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part && typeof part === 'object' && 'text' in part ? part.text : ''))
      .filter(Boolean)
      .join('');
    if (text.trim()) return text.trim();
  }
  const delta = choice?.delta?.content;
  if (typeof delta === 'string' && delta.trim()) return delta.trim();
  return '';
}

async function readChatCompletionStream(response, onText, signal) {
  if (!response.body) throw new Error('STREAM_UNAVAILABLE');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  function consume(block) {
    const event = parseSseBlock(block);
    if (!event) return;
    throwIfResponsesStreamError(event);

    const delta = event.payload?.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta) {
      text += delta;
      onText?.(text);
    }
  }

  while (true) {
    if (signal?.aborted) {
      try { await reader.cancel(); } catch { /* swallow cancel errors */ }
      throw new DOMException('Aborted', 'AbortError');
    }

    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    }

    let index = buffer.indexOf('\n\n');
    while (index !== -1) {
      consume(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf('\n\n');
    }

    if (done) break;
  }

  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer.replace(/\r\n/g, '\n'));
  return text.trim();
}

function normalizeModelItems(payload) {
  const source = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload?.list)
        ? payload.list
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
            ? payload
            : [];

  return source
    .map((item) => {
      if (typeof item === 'string') {
        return { id: item, label: item, raw: item };
      }
      const id = String(item?.id || item?.model || item?.model_code || item?.code || item?.name || '').trim();
      if (!id) return null;
      return {
        ...item,
        id,
        label: String(item?.label || item?.display_name || item?.displayName || item?.name || item?.model_code || id),
        raw: item
      };
    })
    .filter(Boolean);
}

function normalizePartialImageCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 2;
  return Math.max(0, Math.min(3, Math.trunc(number)));
}

function normalizeVideoStatus(value) {
  const status = String(value || '').toLowerCase();
  if (['completed', 'succeeded', 'success', 'done', 'finished'].includes(status)) return 'completed';
  if (['failed', 'fail', 'error', 'canceled', 'cancelled'].includes(status)) return 'failed';
  if (['processing', 'running', 'generating', 'in_progress', 'in-progress'].includes(status)) return 'in_progress';
  return status || 'queued';
}

function normalizeVideoTask(payload) {
  const source = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  const dataItem = Array.isArray(payload?.data) ? payload.data.find((item) => item?.url || item?.video_url || item?.videoUrl) : null;
  const id = source?.task_id || source?.taskId || source?.id || source?.video_id || source?.videoId || '';
  const url = source?.url || source?.video_url || source?.videoUrl || source?.output_url || source?.outputUrl || source?.result_url || source?.resultUrl || dataItem?.url || dataItem?.video_url || '';
  const status = normalizeVideoStatus(source?.status || payload?.status);
  const rawProgress = Number(source?.progress ?? payload?.progress);
  return {
    ...source,
    task_id: id,
    id,
    status,
    progress: Number.isFinite(rawProgress) ? rawProgress : undefined,
    url,
    video_url: url,
    format: source?.format || dataItem?.format || 'mp4',
    metadata: source?.metadata || payload?.metadata || {},
    error: source?.error || payload?.error || null,
    raw: payload
  };
}

function extractResponsesImages(payload) {
  const directData = Array.isArray(payload?.data) ? payload.data : [];
  const directImages = directData
    .filter((item) => item?.b64_json || item?.url || item?.image_url || item?.image_base64)
    .map((item) => ({
      b64_json: item.b64_json || item.image_base64 || '',
      url: item.url || item.image_url || '',
      revised_prompt: item.revised_prompt || ''
    }));
  if (directImages.length) {
    return {
      id: payload?.id || '',
      model: payload?.model || '',
      data: directImages,
      response: payload || null
    };
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const data = output
    .filter((item) => (
      item?.type === 'image_generation_call'
      || item?.type === 'output_image'
      || item?.b64_json
      || item?.url
      || item?.image_url
      || item?.image_base64
    ))
    .map((item) => ({
      b64_json: item.result || item.b64_json || item.image_base64 || '',
      url: item.url || item.image_url || '',
      revised_prompt: item.revised_prompt || ''
    }))
    .filter((item) => item.b64_json || item.url);

  return {
    id: payload?.id || '',
    model: payload?.model || '',
    data,
    response: payload || null
  };
}

function parseSseBlock(block) {
  if (!block.trim()) return null;

  let eventType = '';
  const dataLines = [];

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue;

    const separatorIndex = line.indexOf(':');
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1).replace(/^\s/, '');

    if (field === 'event') eventType = value;
    if (field === 'data') dataLines.push(value);
  }

  const rawData = dataLines.join('\n').trim();
  if (!rawData || rawData === '[DONE]') return null;

  try {
    const payload = JSON.parse(rawData);
    return { type: payload?.type || eventType, payload };
  } catch {
    return null;
  }
}

function streamErrorMessage(payload, fallback = 'RESPONSES_STREAM_FAILED') {
  return String(
    payload?.error?.message
      || payload?.response?.error?.message
      || payload?.message
      || fallback
  );
}

function throwIfResponsesStreamError(event) {
  if (!event) return;
  const type = String(event.type || '').toLowerCase();
  const response = event.payload?.response;
  const status = String(response?.status || '').toLowerCase();

  if (
    type === 'error'
    || type === 'response.failed'
    || type === 'response.incomplete'
    || type.endsWith('.failed')
    || status === 'failed'
    || status === 'incomplete'
    || event.payload?.error
  ) {
    const error = new Error(streamErrorMessage(event.payload));
    error.payload = event.payload;
    throw error;
  }
}

async function readResponsesStream(response, onEvent, signal) {
  if (!response.body) throw new Error('STREAM_UNAVAILABLE');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResponse = null;
  let fallbackItem = null;

  function consume(block) {
    const event = parseSseBlock(block);
    if (!event) return;

    throwIfResponsesStreamError(event);
    onEvent?.(event);

    if (event.type === 'response.completed') {
      finalResponse = event.payload?.response || finalResponse;
    } else if (
      event.type === 'response.output_item.done'
      && event.payload?.item?.type === 'image_generation_call'
    ) {
      fallbackItem = event.payload.item;
    }
  }

  while (true) {
    if (signal?.aborted) {
      try { await reader.cancel(); } catch { /* swallow cancel errors */ }
      throw new DOMException('Aborted', 'AbortError');
    }

    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    }

    let index = buffer.indexOf('\n\n');
    while (index !== -1) {
      consume(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf('\n\n');
    }

    if (done) break;
  }

  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer.replace(/\r\n/g, '\n'));

  return { finalResponse, fallbackItem };
}

function shouldFallbackToLegacy(error) {
  const status = Number(error?.status || 0);
  if ([404, 405, 415, 502, 503, 504].includes(status)) return true;

  const message = String(
    error?.payload?.error?.message
      || error?.payload?.message
      || error?.message
      || ''
  ).toLowerCase();

  return (
    message.includes('tool_choice')
    || message.includes('image_generation')
    || message.includes('responses')
    || message.includes('stream')
    || message.includes('sse')
  );
}

function sessionFromAuthResponse(data, previousSession = {}) {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || previousSession.refreshToken || '',
    expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : previousSession.expiresAt || 0,
    user: data.user || previousSession.user || null
  };
}

async function readJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : { message: await response.text().catch(() => '') };
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error?.message || `HTTP_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return normalizeResponseData(payload);
}

export class Sub2ApiClient {
  constructor({ apiBaseUrl, gatewayBaseUrl, session, providerSettings } = {}) {
    const bases = getConfiguredBaseUrls();
    this.apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl || bases.apiBaseUrl);
    this.gatewayBaseUrl = normalizeGatewayBaseUrl(gatewayBaseUrl || bases.gatewayBaseUrl);
    this.session = session || loadSession();
    this.providerSettings = normalizeProviderSettings(providerSettings || loadProviderSettings());
  }

  setProviderSettings(settings) {
    this.providerSettings = normalizeProviderSettings(settings);
  }

  authHeaders() {
    return authHeadersFromSession(this.session);
  }

  async refreshSession() {
    if (!this.session?.refreshToken) {
      throw new Error('NO_REFRESH_TOKEN');
    }

    const data = await this.request('/auth/refresh', {
      method: 'POST',
      skipAuth: true,
      skipRefresh: true,
      body: JSON.stringify({ refresh_token: this.session.refreshToken })
    });

    const session = sessionFromAuthResponse(data, this.session);
    this.session = session;
    saveSession(session);
    return session;
  }

  async ensureFreshSession() {
    if (!this.session?.accessToken || !this.session?.refreshToken || !this.session.expiresAt) return;
    if (Date.now() < Number(this.session.expiresAt) - 60_000) return;
    await this.refreshSession();
  }

  async request(path, options = {}) {
    const {
      skipAuth = false,
      skipRefresh = false,
      headers = {},
      signal,
      ...fetchOptions
    } = options;

    if (!skipAuth && !skipRefresh) {
      await this.ensureFreshSession();
    }

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...fetchOptions,
      ...(signal ? { signal } : {}),
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(skipAuth ? {} : this.authHeaders())
      }
    });

    try {
      return await readJsonResponse(response);
    } catch (error) {
      if (error.status === 401 && !skipAuth && !skipRefresh && this.session?.refreshToken) {
        await this.refreshSession();
        return this.request(path, { ...options, skipRefresh: true });
      }
      throw error;
    }
  }

  async login({ email, password, turnstileToken }) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      skipAuth: true,
      skipRefresh: true,
      body: JSON.stringify({
        email,
        password,
        ...(turnstileToken ? { turnstile_token: turnstileToken } : {})
      })
    });

    if (data?.requires_2fa) {
      const error = new Error('TWO_FACTOR_REQUIRED');
      error.payload = data;
      throw error;
    }

    const session = sessionFromAuthResponse(data);
    this.session = session;
    saveSession(session);
    return session;
  }

  async login2FA({ tempToken, totpCode }) {
    const data = await this.request('/auth/login/2fa', {
      method: 'POST',
      skipAuth: true,
      skipRefresh: true,
      body: JSON.stringify({
        temp_token: tempToken,
        totp_code: totpCode
      })
    });

    const session = sessionFromAuthResponse(data);
    this.session = session;
    saveSession(session);
    return session;
  }

  async me() {
    const data = await this.request('/auth/me');
    this.session = {
      ...(this.session || {}),
      user: data
    };
    saveSession(this.session);
    return data;
  }

  async profile() {
    return this.request('/user/profile');
  }

  async listKeys() {
    const data = await this.request('/keys?page=1&page_size=50');
    return extractKeyItems(data);
  }

  async createStudioKey() {
    const created = await this.request('/keys', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Creative Studio',
        scope: 'image,video,chat'
      })
    });
    return normalizeApiKeyItem(created);
  }

  async ensureApiKey() {
    const selectedId = loadSelectedKeyId();
    const keys = await this.listKeys();
    const selected = keys.find((key) => key.id === selectedId);
    if (keyIsUsable(selected)) return selected;

    const reusable = keys.find(keyIsUsable);
    if (reusable) {
      saveSelectedKeyId(reusable.id);
      return reusable;
    }

    const created = await this.createStudioKey();
    if (created?.id) saveSelectedKeyId(created.id);
    return created;
  }

  async generateImageViaLegacy({ apiKey, model, prompt, size, quality, n, gatewayBaseUrl, onProgress, signal }) {
    const total = Math.max(1, Number(n || 1));
    const data = [];
    const payloads = [];
    const resolvedGatewayBaseUrl = normalizeGatewayBaseUrl(gatewayBaseUrl || this.gatewayBaseUrl);
    onProgress?.({
      stage: 'request',
      completed: 0,
      total,
      percent: 12
    });
    for (let index = 0; index < total; index += 1) {
      const response = await fetch(`${resolvedGatewayBaseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          prompt,
          size,
          quality,
          n: 1
        }),
        ...(signal ? { signal } : {})
      });
      const payload = await readJsonResponse(response);
      payloads.push(payload);
      const items = Array.isArray(payload?.data) ? payload.data : [];
      if (!items.length) throw new Error('IMAGES_GENERATIONS_RETURNED_NO_IMAGES');
      data.push(...items);
      onProgress?.({
        stage: 'image',
        completed: Math.min(data.length, total),
        total,
        percent: Math.min(99, Math.max(12, Math.round((Math.min(data.length, total) / total) * 100)))
      });
    }
    onProgress?.({
      stage: 'completed',
      completed: data.length,
      total,
      percent: 100
    });
    return {
      ...(payloads[0] || {}),
      created: payloads.at(-1)?.created || payloads[0]?.created || Math.floor(Date.now() / 1000),
      data: data.slice(0, total),
      usage: payloads.find((payload) => payload?.usage)?.usage,
      responses: payloads
    };
  }

  async optimizePrompt({ apiKey, prompt, instruction = '', size = '', aspectRatio = '', quality = '', resolutionTier = '', gatewayBaseUrl, model, onPartial, signal }) {
    const resolvedGatewayBaseUrl = normalizeGatewayBaseUrl(gatewayBaseUrl || this.gatewayBaseUrl);
    const optimizerModel = normalizeResponsesModel(model || envPromptOptimizerModel || this.providerSettings.responsesModel || envResponsesModel);
    const inputLines = [
      `原始提示词:\n${String(prompt || '').trim()}`
    ];
    if (String(instruction || '').trim()) {
      inputLines.push(`修改要求:\n${String(instruction || '').trim()}`);
    }
    const extra = [];
    if (aspectRatio) extra.push(`比例 ${aspectRatio}`);
    if (size) extra.push(`尺寸 ${size}`);
    if (resolutionTier) extra.push(`输出清晰度目标 ${resolutionTier}`);
    if (quality) extra.push(`质量 ${quality}`);
    if (extra.length) {
      inputLines.push(`当前参数: ${extra.join('，')}`);
    }

    const response = await fetch(`${resolvedGatewayBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: optimizerModel,
        messages: [
          {
            role: 'system',
            content: [
              '你是中文图像提示词整理师。',
              '请保留原始意图，不要删掉用户给出的主体、产品、人物、文字和限制。',
              '把优化建议拆成清晰字段，便于用户选择合并。',
              '只输出 JSON，不要输出 Markdown。',
              'JSON 字段必须是：subject, scene, composition, style, lighting, details, textRules, constraints, finalPrompt。',
              '所有字段内容使用中文；finalPrompt 可以保留必要英文专有名词、模型名和品牌名。'
            ].join('')
          },
          {
            role: 'user',
            content: inputLines.join('\n\n')
          }
        ],
        temperature: 0.5,
        max_tokens: 700,
        stream: true
      }),
      ...(signal ? { signal } : {})
    });

    if (!response.ok) {
      await readJsonResponse(response);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = contentType.includes('text/event-stream') && response.body
      ? await readChatCompletionStream(response, onPartial, signal)
      : extractChatCompletionText(await readJsonResponse(response));

    if (!text) {
      throw new Error('PROMPT_OPTIMIZER_RETURNED_EMPTY');
    }
    return {
      prompt: text,
      model: optimizerModel,
      raw: payload
    };
  }

  async chatPromptAssistant({ apiKey, prompt, basePrompt = '', userInstruction = '', selectedCanvasLabel = '', messages = [], size = '', aspectRatio = '', quality = '', resolutionTier = '', gatewayBaseUrl, model, onPartial, signal }) {
    const resolvedGatewayBaseUrl = normalizeGatewayBaseUrl(gatewayBaseUrl || this.gatewayBaseUrl);
    const assistantModel = normalizeResponsesModel(model || envPromptOptimizerModel || this.providerSettings.responsesModel || envResponsesModel);
    const context = [
      basePrompt ? `当前选中的画布基础提示词（仅作为上下文，不是必须保留）:\n${String(basePrompt).trim()}` : '',
      userInstruction ? `用户最新创作方向（最高优先级）:\n${String(userInstruction).trim()}` : '',
      !basePrompt && prompt ? `当前可生成提示词:\n${String(prompt).trim()}` : '',
      selectedCanvasLabel ? `当前画布: ${String(selectedCanvasLabel).trim()}` : '',
      aspectRatio || size || resolutionTier || quality
        ? `当前生图参数: ${[
          aspectRatio ? `比例 ${aspectRatio}` : '',
          size ? `尺寸 ${size}` : '',
          resolutionTier ? `清晰度 ${resolutionTier}` : '',
          quality ? `质量 ${quality}` : ''
        ].filter(Boolean).join('，')}`
        : ''
    ].filter(Boolean).join('\n\n');
    const safeMessages = (Array.isArray(messages) ? messages : [])
      .slice(-8)
      .map((item) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: String(item.content || '').slice(0, 4000)
      }))
      .filter((item) => item.content.trim());

    const response = await fetch(`${resolvedGatewayBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: assistantModel,
        messages: [
          {
            role: 'system',
            content: [
              '你是图片和视频创作工作台里的中文提示词助手。',
              '你和用户对话，帮助澄清想法、补全画面要素、整理可直接用于生成的提示词。',
              '不要直接生成图片，也不要假装已经生成图片。',
              '用户最新消息优先级最高。如果用户说“不是、不要、去掉、改成、替换、删除”，必须移除被否定的元素，不能再绕回旧设定。',
              '先判断方向：局部修改=保留未冲突的主体和风格；衍生=保留部分视觉语言但允许更换主体、场景或构图；重写=只按用户最新要求重新整理。',
              '基础提示词只作为上下文。不要为了延续而强行保留和用户最新要求冲突的主体、材质、场景、文字或限制。',
              '如果用户只是在聊天澄清，你可以简短追问；如果信息已足够，给出可直接生图的 finalPrompt。',
              '只输出 JSON，不要输出 Markdown。',
              'JSON 字段必须是：reply, finalPrompt。',
              'reply 是给用户看的简短中文回复；finalPrompt 是整理后的可生成提示词。'
            ].join('')
          },
          ...(context ? [{ role: 'user', content: context }] : []),
          ...safeMessages
        ],
        temperature: 0.6,
        max_tokens: 900,
        stream: true
      }),
      ...(signal ? { signal } : {})
    });

    if (!response.ok) {
      await readJsonResponse(response);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = contentType.includes('text/event-stream') && response.body
      ? await readChatCompletionStream(response, onPartial, signal)
      : extractChatCompletionText(await readJsonResponse(response));

    if (!text) {
      throw new Error('PROMPT_ASSISTANT_RETURNED_EMPTY');
    }
    return {
      text,
      model: assistantModel
    };
  }

  async listGatewayModels({ apiKey, gatewayBaseUrl, signal } = {}) {
    const resolvedGatewayBaseUrl = normalizeGatewayBaseUrl(gatewayBaseUrl || this.gatewayBaseUrl);
    const response = await fetch(`${resolvedGatewayBaseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      ...(signal ? { signal } : {})
    });
    const payload = await readJsonResponse(response);
    const models = normalizeModelItems(payload);
    try {
      const pricedModels = normalizeModelItems(await this.request('/models', { signal }));
      const priceById = new Map(pricedModels.map((item) => [item.id, item]));
      return models.map((item) => {
        const priced = priceById.get(item.id);
        if (!priced) return item;
        const rawItem = item.raw && typeof item.raw === 'object' ? item.raw : {};
        const rawPrice = priced.raw && typeof priced.raw === 'object' ? priced.raw : {};
        return {
          ...item,
          ...rawPrice,
          label: item.label || priced.label,
          raw: {
            ...rawItem,
            ...rawPrice
          }
        };
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return models;
    }
  }

  async getGatewayUsage({ apiKey, gatewayBaseUrl, signal } = {}) {
    const resolvedGatewayBaseUrl = normalizeGatewayBaseUrl(gatewayBaseUrl || this.gatewayBaseUrl);
    const response = await fetch(`${resolvedGatewayBaseUrl}/usage`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      ...(signal ? { signal } : {})
    });
    return readJsonResponse(response);
  }

  async createVideoTask({
    apiKey,
    model,
    prompt,
    image,
    duration,
    width,
    height,
    fps,
    n,
    seed,
    responseFormat = 'url',
    metadata = {},
    gatewayBaseUrl,
    signal
  }) {
    const resolvedGatewayBaseUrl = normalizeGatewayBaseUrl(gatewayBaseUrl || this.gatewayBaseUrl);
    const response = await fetch(`${resolvedGatewayBaseUrl}/video/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(compactObject({
        model,
        prompt,
        image,
        duration,
        width,
        height,
        fps,
        seed,
        n,
        response_format: responseFormat,
        metadata: compactObject(metadata)
      })),
      ...(signal ? { signal } : {})
    });
    return normalizeVideoTask(await readJsonResponse(response));
  }

  async getVideoTask({ apiKey, taskId, gatewayBaseUrl, signal }) {
    const resolvedGatewayBaseUrl = normalizeGatewayBaseUrl(gatewayBaseUrl || this.gatewayBaseUrl);
    const response = await fetch(`${resolvedGatewayBaseUrl}/video/generations/${encodeURIComponent(taskId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      ...(signal ? { signal } : {})
    });
    return normalizeVideoTask(await readJsonResponse(response));
  }

  async generateVideo({
    apiKey,
    model,
    prompt,
    image,
    duration,
    width,
    height,
    fps,
    n,
    seed,
    metadata,
    gatewayBaseUrl,
    onProgress,
    pollIntervalMs = 4000,
    maxPollAttempts = 90,
    signal
  }) {
    onProgress?.({ stage: 'request', percent: 8, completed: 0, total: Math.max(1, Number(n || 1)) });
    const created = await this.createVideoTask({
      apiKey,
      model,
      prompt,
      image,
      duration,
      width,
      height,
      fps,
      n,
      seed,
      metadata,
      gatewayBaseUrl,
      signal
    });
    const taskId = created.task_id || created.id;
    if (!taskId) throw new Error('VIDEO_TASK_ID_MISSING');

    onProgress?.({
      stage: created.status === 'in_progress' ? 'video' : 'queued',
      percent: Math.max(12, Number(created.progress || 0)),
      taskId,
      task: created,
      completed: 0,
      total: Math.max(1, Number(n || 1))
    });

    if (created.status === 'completed') return created;
    if (created.status === 'failed') throw new Error(created.error?.message || 'VIDEO_GENERATION_FAILED');

    let latest = created;
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      await sleep(pollIntervalMs, signal);
      latest = await this.getVideoTask({ apiKey, taskId, gatewayBaseUrl, signal });
      const fallbackPercent = Math.min(96, 16 + Math.round(((attempt + 1) / maxPollAttempts) * 76));
      onProgress?.({
        stage: latest.status === 'completed' ? 'completed' : latest.status === 'failed' ? 'failed' : latest.status === 'in_progress' ? 'video' : 'queued',
        percent: Math.max(12, Number(latest.progress ?? fallbackPercent)),
        taskId,
        task: latest,
        completed: latest.status === 'completed' ? 1 : 0,
        total: Math.max(1, Number(n || 1))
      });
      if (latest.status === 'completed') return latest;
      if (latest.status === 'failed') throw new Error(latest.error?.message || 'VIDEO_GENERATION_FAILED');
    }

    return latest;
  }

  async generateImageViaResponses({ apiKey, model, prompt, size, quality, outputFormat, moderation, n, referenceImages = [], onPartial, onProgress, gatewayBaseUrl, responsesModel, partialImages, signal }) {
    const count = Math.max(1, Number(n || 1));
    const selectedModel = String(model || '').trim();
    const directImageModel = isDirectImageResponsesModel(selectedModel);
    const responseModel = directImageModel
      ? selectedModel
      : String(selectedModel || responsesModel || this.providerSettings.responsesModel || envResponsesModel).trim();
    const partialImageCount = normalizePartialImageCount(partialImages ?? this.providerSettings.partialImages ?? envResponsesPartialImages);
    const resolvedGatewayBaseUrl = normalizeGatewayBaseUrl(gatewayBaseUrl || this.gatewayBaseUrl);
    const resultFormat = outputFormat || 'png';
    const imageParams = responsesImageParams({ size, quality, outputFormat: resultFormat, moderation });
    const inputContent = [{ type: 'input_text', text: prompt }];
    for (const file of referenceImages.slice(0, 4)) {
      inputContent.push({ type: 'input_image', image_url: await fileToDataUrl(file) });
    }
    const input = inputContent.length > 1
      ? [{ role: 'user', content: inputContent }]
      : prompt;
    const data = [];

    for (let index = 0; index < count; index += 1) {
      const progressBase = Math.round((index / count) * 90);
      onProgress?.({
        stage: 'request',
        completed: data.length,
        total: count,
        percent: Math.max(5, progressBase)
      });
      const response = await fetch(`${resolvedGatewayBaseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: directImageModel ? 'application/json' : 'text/event-stream'
        },
        body: JSON.stringify(directImageModel
          ? {
            model: responseModel,
            input,
            ...imageParams
          }
          : {
            model: responseModel,
            input,
            stream: true,
            tools: [
              {
                type: 'image_generation',
                partial_images: partialImageCount,
                ...imageParams
              }
            ]
          }),
        ...(signal ? { signal } : {})
      });

      if (!response.ok) {
        await readJsonResponse(response);
      }

      onProgress?.({
        stage: 'connected',
        completed: data.length,
        total: count,
        percent: Math.min(92, progressBase + 18)
      });

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const partials = [];
        const { finalResponse, fallbackItem } = await readResponsesStream(response, ({ type, payload }) => {
          if (type !== 'response.image_generation_call.partial_image' && type !== 'response.output_image.delta' && type !== 'response.output_image.done') return;
          const base64 = payload?.partial_image_b64 || payload?.b64_json || payload?.image_base64 || payload?.delta || '';
          if (!base64) return;

          const partialIndex = Number.isFinite(Number(payload?.partial_image_index))
            ? Number(payload.partial_image_index)
            : partials.length;
          partials[partialIndex] = base64;
          const partialUrls = partials.filter(Boolean).map((item) => base64ToDataUrl(item, resultFormat));
          onPartial?.([...data.map((item) => base64ToDataUrl(item.b64_json, resultFormat)), ...partialUrls]);
          onProgress?.({
            stage: 'partial',
            completed: data.length,
            total: count,
            partials: partialUrls.length,
            percent: Math.min(96, progressBase + 35 + partialUrls.length * 12)
          });
        }, signal);

        const normalized = extractResponsesImages(finalResponse || {
          model: responseModel,
          output: fallbackItem ? [fallbackItem] : []
        });
        if (!normalized.data.length && fallbackItem?.result) {
          normalized.data.push({
            b64_json: fallbackItem.result,
            revised_prompt: fallbackItem.revised_prompt || ''
          });
        }
        if (!normalized.data.length && partials.filter(Boolean).length) {
          normalized.data.push({
            b64_json: partials.filter(Boolean).at(-1),
            revised_prompt: ''
          });
        }
        if (!normalized.data.length) {
          throw new Error('RESPONSES_IMAGE_GENERATION_RETURNED_NO_IMAGES');
        }

        data.push(...normalized.data);
        onPartial?.(data.map((item) => base64ToDataUrl(item.b64_json, resultFormat)));
        onProgress?.({
          stage: 'image',
          completed: Math.min(data.length, count),
          total: count,
          percent: Math.min(99, Math.round((Math.min(data.length, count) / count) * 100))
        });
        continue;
      }

      const payload = await readJsonResponse(response);
      const normalized = extractResponsesImages(payload);
      if (!normalized.data.length) {
        throw new Error('RESPONSES_IMAGE_GENERATION_RETURNED_NO_IMAGES');
      }
      data.push(...normalized.data);
      onPartial?.(data.map((item) => base64ToDataUrl(item.b64_json, resultFormat)));
      onProgress?.({
        stage: 'image',
        completed: Math.min(data.length, count),
        total: count,
        percent: Math.min(99, Math.round((Math.min(data.length, count) / count) * 100))
      });
    }

    onProgress?.({
      stage: 'completed',
      completed: data.length,
      total: count,
      percent: 100
    });

    return {
      route: 'responses',
      model: responseModel,
      outputFormat: resultFormat,
      data
    };
  }

  async generateImage({ apiKey, model, prompt, size, quality, outputFormat, moderation, n, referenceImages, onPartial, onProgress, route, gatewayBaseUrl, responsesModel, partialImages, signal }) {
    const explicitRoute = route === undefined || route === null || route === '' ? '' : route;
    const imageRoute = normalizeImageRoute(explicitRoute || 'legacy');
    const effectiveImageRoute = imageRoute === 'auto' ? 'legacy' : imageRoute;
    if (effectiveImageRoute !== 'legacy') {
      try {
        return await this.generateImageViaResponses({
          apiKey,
          prompt,
          size,
          quality,
          outputFormat,
          moderation,
          n,
          model,
          referenceImages,
          onPartial,
          onProgress,
          gatewayBaseUrl,
          responsesModel,
          partialImages,
          signal
        });
      } catch (error) {
        if (effectiveImageRoute === 'responses' || !shouldFallbackToLegacy(error)) {
          throw error;
        }
      }
    }

    return this.generateImageViaLegacy({
      apiKey,
      model,
      prompt,
      size,
      quality,
      outputFormat,
      moderation,
      n,
      gatewayBaseUrl,
      onProgress,
      signal
    });
  }

  async editImage({ apiKey, model, prompt, size, quality, outputFormat, moderation, n, images, mask, gatewayBaseUrl, onProgress, signal }) {
    onProgress?.({
      stage: 'request',
      completed: 0,
      total: Math.max(1, Number(n || 1)),
      percent: 12
    });
    const form = new FormData();
    form.set('model', model);
    form.set('prompt', prompt);
    form.set('size', size);
    form.set('quality', quality);
    form.set('output_format', outputFormat || 'png');
    form.set('moderation', moderation || 'auto');
    form.set('n', String(n || 1));
    images.forEach((file) => form.append('image', file));
    if (mask) form.set('mask', mask);

    const response = await fetch(`${normalizeGatewayBaseUrl(gatewayBaseUrl || this.gatewayBaseUrl)}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form,
      ...(signal ? { signal } : {})
    });
    const payload = await readJsonResponse(response);
    onProgress?.({
      stage: 'completed',
      completed: Array.isArray(payload?.data) ? payload.data.length : Math.max(1, Number(n || 1)),
      total: Math.max(1, Number(n || 1)),
      percent: 100
    });
    return payload;
  }
}

export function getImageUrls(payload) {
  const items = Array.isArray(payload?.data) ? payload.data : [];
  return items
    .map((item) => {
      if (item.url) return item.url;
      if (item.b64_json) return base64ToDataUrl(item.b64_json, item.output_format || item.outputFormat || payload?.output_format || payload?.outputFormat);
      return '';
    })
    .filter(Boolean);
}

export function getVideoUrls(payload) {
  const task = normalizeVideoTask(payload);
  const urls = [
    task.url,
    task.video_url,
    payload?.url,
    payload?.video_url,
    payload?.videoUrl,
    payload?.output_url,
    payload?.result_url
  ];
  if (Array.isArray(payload?.data)) {
    urls.push(...payload.data.map((item) => item?.url || item?.video_url || item?.videoUrl || '').filter(Boolean));
  }
  return [...new Set(urls.filter(Boolean))];
}

export class StudioHistoryClient {
  constructor({ baseUrl, session } = {}) {
    const bases = getConfiguredBaseUrls();
    this.baseUrl = trimTrailingSlash(baseUrl || bases.studioHistoryBaseUrl);
    this.session = session || loadSession();
  }

  async request(path, options = {}) {
    if (!this.session?.accessToken) {
      throw new Error('AUTH_REQUIRED');
    }

    const response = await fetch(`${this.baseUrl}/studio-api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeadersFromSession(this.session),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `HTTP_${response.status}`);
    }
    return payload;
  }

  async listRecords() {
    const payload = await this.request('/history');
    return Array.isArray(payload.records) ? payload.records : [];
  }

  async listLibrary() {
    const payload = await this.request('/library');
    return {
      ...payload,
      cases: Array.isArray(payload.cases) ? payload.cases : []
    };
  }

  async getLibraryCase(caseId) {
    const payload = await this.request(`/library/${encodeURIComponent(caseId)}`);
    return payload.case || null;
  }

  async getPromptPreset(presetId) {
    const payload = await this.request(`/prompt-presets/${encodeURIComponent(presetId)}`);
    return payload.preset || null;
  }

  async getVideoInspiration(inspirationId) {
    const payload = await this.request(`/video-inspirations/${encodeURIComponent(inspirationId)}`);
    return payload.inspiration || null;
  }

  async getCurrentSession() {
    const payload = await this.request('/session');
    return payload.session || null;
  }

  async saveCurrentSession(session) {
    const payload = await this.request('/session', {
      method: 'POST',
      body: JSON.stringify(session)
    });
    return payload.session || session;
  }

  async clearCurrentSession() {
    await this.request('/session', { method: 'DELETE' });
  }

  async createGenerationJob(job) {
    const payload = await this.request('/generation-jobs', {
      method: 'POST',
      body: JSON.stringify(job)
    });
    return payload.job || null;
  }

  async listGenerationJobs({ sessionId = '', limit = 40 } = {}) {
    const params = new URLSearchParams();
    if (sessionId) params.set('sessionId', sessionId);
    if (limit) params.set('limit', String(limit));
    const payload = await this.request(`/generation-jobs${params.toString() ? `?${params}` : ''}`);
    return Array.isArray(payload.jobs) ? payload.jobs : [];
  }

  async getGenerationJob(jobId) {
    const payload = await this.request(`/generation-jobs/${encodeURIComponent(jobId)}`);
    return payload.job || null;
  }

  async cancelGenerationJob(jobId) {
    const payload = await this.request(`/generation-jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
    return payload.job || null;
  }

  async saveRecord(record) {
    const payload = await this.request('/history', {
      method: 'POST',
      body: JSON.stringify(record)
    });
    return payload.record || record;
  }

  async deleteRecord(recordId) {
    await this.request(`/history/${encodeURIComponent(recordId)}`, { method: 'DELETE' });
  }

  async clearRecords() {
    await this.request('/history', { method: 'DELETE' });
  }

  async resolveAssetUrl(url) {
    const value = String(url || '');
    if (
      !value.startsWith('/studio-api/history/')
      && !value.startsWith('/studio-api/generation-jobs/')
      && !value.startsWith('/studio-api/library-assets/')
    ) return value;
    if (!this.session?.accessToken) return value;

    const response = await fetch(`${this.baseUrl}${value}`, {
      headers: authHeadersFromSession(this.session)
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  async resolveSessionAssets(session) {
    if (!session) return null;
    const resultUrls = Array.isArray(session.results) ? session.results : [];
    const videoUrls = Array.isArray(session.videoResults) ? session.videoResults : [];
    const canvasNodes = Array.isArray(session.canvasNodes) ? session.canvasNodes : [];
    return {
      ...session,
      persistedResults: resultUrls,
      persistedVideoResults: videoUrls,
      results: resultUrls,
      videoResults: videoUrls,
      canvasNodes: canvasNodes.map((node, index) => ({
        ...node,
        persistedUrl: canvasNodes[index]?.url || ''
      }))
    };
  }

  async resolveRecordAssets(record) {
    const resultUrls = Array.isArray(record?.resultUrls) ? record.resultUrls : [];
    return {
      ...record,
      displayResultUrls: resultUrls
    };
  }
}
