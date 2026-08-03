export const SESSION_KEY = 'image-agent-studio:session:v1';

const configuredBase = typeof import.meta.env !== 'undefined'
  ? import.meta.env.VITE_STUDIO_API_BASE
  : '';

export class StudioApiError extends Error {
  constructor(message, { code = 'REQUEST_FAILED', status = 0 } = {}) {
    super(message);
    this.name = 'StudioApiError';
    this.code = code;
    this.status = status;
  }
}

export function loadSession(storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
    return typeof value?.token === 'string' && value.token ? value : null;
  } catch {
    storage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(session, storage = globalThis.localStorage) {
  if (!storage) return;
  if (!session?.token) {
    storage.removeItem(SESSION_KEY);
    return;
  }
  storage.setItem(SESSION_KEY, JSON.stringify({
    token: session.token,
    expiresAt: session.expiresAt || null,
    user: session.user || null
  }));
}

export function clearSession(storage = globalThis.localStorage) {
  storage?.removeItem(SESSION_KEY);
}

export function createStudioApi({ baseUrl = configuredBase || '', getToken = () => loadSession()?.token } = {}) {
  const request = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new StudioApiError(payload.message || payload.error || `Request failed (${response.status})`, {
        code: payload.error || 'REQUEST_FAILED', status: response.status
      });
    }
    return payload;
  };

  const readAsset = async (pathOrDigest) => {
    const value = String(pathOrDigest || '').trim();
    const path = value.startsWith('/studio-api/assets/')
      ? value
      : `/studio-api/assets/${encodeURIComponent(value)}`;
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${baseUrl}${path}`, { headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new StudioApiError(payload.message || payload.error || `Request failed (${response.status})`, {
        code: payload.error || 'REQUEST_FAILED', status: response.status
      });
    }
    return response.blob();
  };

  return {
    getMe: () => request('/studio-api/auth/me'),
    login: (input) => request('/studio-api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    register: (input) => request('/studio-api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
    listProjects: () => request('/studio-api/projects'),
    createProject: (input) => request('/studio-api/projects', { method: 'POST', body: JSON.stringify(input) }),
    listSharedProviders: () => request('/studio-api/providers'),
    listProviderConnections: () => request('/studio-api/provider-connections'),
    createProviderConnection: (input) => request('/studio-api/provider-connections', { method: 'POST', body: JSON.stringify(input) }),
    updateProviderConnection: (connectionId, input) => request(`/studio-api/provider-connections/${encodeURIComponent(connectionId)}`, { method: 'PUT', body: JSON.stringify(input) }),
    deleteProviderConnection: (connectionId) => request(`/studio-api/provider-connections/${encodeURIComponent(connectionId)}`, { method: 'DELETE' }),
    syncSharedProviderModels: (providerId) => request(`/studio-api/providers/${encodeURIComponent(providerId)}/models`),
    syncProviderConnectionModels: (connectionId) => request(`/studio-api/provider-connections/${encodeURIComponent(connectionId)}/models`),
    listJobs: (sessionId = '') => request(`/studio-api/generation-jobs${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`),
    createGenerationJob: (input) => request('/studio-api/generation-jobs', { method: 'POST', body: JSON.stringify(input) }),
    getJob: (jobId) => request(`/studio-api/generation-jobs/${encodeURIComponent(jobId)}`),
    executeJob: (jobId) => request(`/studio-api/generation-jobs/${encodeURIComponent(jobId)}/execute`, { method: 'POST' }),
    cancelJob: (jobId) => request(`/studio-api/generation-jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' }),
    readAsset,
    streamJobEvents: (jobId, options = {}) => streamJobEvents({
      url: `${baseUrl}/studio-api/generation-jobs/${encodeURIComponent(jobId)}/events`,
      token: getToken(),
      ...options
    })
  };
}

export function parseSSEFrames(buffer) {
  const normalized = buffer.replaceAll('\r\n', '\n');
  const chunks = normalized.split('\n\n');
  const remainder = chunks.pop() || '';
  const events = chunks.map((chunk) => {
    const event = { id: '', type: 'message', data: null };
    const data = [];
    for (const line of chunk.split('\n')) {
      if (line.startsWith('id:')) event.id = line.slice(3).trim();
      if (line.startsWith('event:')) event.type = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    const raw = data.join('\n');
    if (raw) {
      try { event.data = JSON.parse(raw); } catch { event.data = raw; }
    }
    return event;
  });
  return { events, remainder };
}

export async function streamJobEvents({ url, token, after = 0, signal, onEvent }) {
  const headers = new Headers({ Accept: 'text/event-stream' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const target = after ? `${url}?after=${encodeURIComponent(after)}` : url;
  const response = await fetch(target, { headers, signal });
  if (!response.ok || !response.body) {
    throw new StudioApiError(`Event stream failed (${response.status})`, { code: 'EVENT_STREAM_FAILED', status: response.status });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const parsed = parseSSEFrames(buffer);
    buffer = parsed.remainder;
    for (const event of parsed.events) onEvent?.(event);
    if (done) break;
  }
}
