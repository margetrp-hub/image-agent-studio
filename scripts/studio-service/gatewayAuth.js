import { createHash } from 'node:crypto';

const failure = (code, status) => Object.assign(new Error(code), { status });

// The configured gateway owns identity and billing. No Studio user/session is created.
export function createGatewayAuth({ baseUrl, type = 'sub2api', credentialMode = 'account', fetchImpl = fetch, timeoutMs = 12000 }) {
  if (!['sub2api', 'newapi'].includes(type)) throw new TypeError('Unsupported STUDIO_GATEWAY_TYPE');
  if (!['api-key', 'account'].includes(credentialMode)) throw new TypeError('Unsupported STUDIO_GATEWAY_AUTH');
  const base = String(baseUrl || '').trim().replace(/\/+$/, '').replace(/\/(?:api\/v1|v1)$/, '');
  if (base) {
    const url = new URL(base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new TypeError('Invalid AI_GATEWAY_BASE_URL');
    }
  }

  async function request(pathname, token, userId = '', method = 'GET') {
    if (!base) throw failure('GATEWAY_AUTH_NOT_CONFIGURED', 503);
    if (!token || token.length > 4096) throw failure('AUTH_REQUIRED', 401);
    if (userId && !/^[1-9]\d*$/.test(String(userId))) throw failure('GATEWAY_USER_ID_INVALID', 401);
    let response;
    try {
      response = await fetchImpl(`${base}${pathname}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(type === 'newapi' && userId ? { 'New-Api-User': String(userId) } : {}) }
      });
    } catch {
      throw failure('GATEWAY_AUTH_UNAVAILABLE', 503);
    }
    if (!response.ok) {
      const status = [401, 403, 404, 429].includes(response.status) ? response.status : 503;
      throw failure(status === 401 || status === 403 ? 'GATEWAY_AUTH_INVALID' : 'GATEWAY_AUTH_UNAVAILABLE', status);
    }
    let payload;
    try { payload = await response.json(); } catch { throw failure('GATEWAY_RESPONSE_INVALID', 502); }
    if (payload?.success === false || (payload?.code !== undefined && payload.code !== 0)) {
      throw failure('GATEWAY_AUTH_INVALID', 401);
    }
    return payload?.success === true || payload?.code === 0 ? payload.data : payload;
  }

  async function profile(token, userId = '') {
    if (credentialMode === 'api-key') {
      const models = await request('/v1/models', token);
      if (!Array.isArray(models?.data) && !Array.isArray(models)) throw failure('GATEWAY_RESPONSE_INVALID', 502);
      const key = createHash('sha256').update(`${type}:${base}\0${token}`).digest('hex');
      return { id: `gateway-key:${key}`, username: 'API Key 工作区' };
    }
    let user;
    if (type === 'newapi') {
      user = await request('/api/user/self', token, userId);
      if (userId && String(user?.id) !== String(userId)) throw failure('GATEWAY_USER_MISMATCH', 401);
    } else {
      try { user = await request('/api/v1/auth/me', token); } catch (error) {
        if (error.status !== 404) throw error;
        user = await request('/api/v1/user/profile', token);
      }
    }
    const id = user?.id || user?.user?.id;
    if (!id) throw failure('GATEWAY_USER_ID_MISSING', 401);
    // Return only the fields used by the workbench, never account secrets.
    return { id, username: user.username || user.user?.username || '', email: user.email || '', balance: user.balance };
  }

  function storageIdentity(user) {
    // Preserve existing Sub2API history paths. Other gateway identities are namespaced.
    return type === 'newapi' && credentialMode === 'account' ? `newapi:${base}:${user.id}` : String(user.id);
  }

  async function keys(token, userId) {
    if (credentialMode === 'api-key') return [{ id: 1, name: '当前 API Key', status: 'active', key: token }];
    const payload = await request(type === 'newapi' ? '/api/token/?p=0&page_size=50' : '/api/v1/keys?page=1&page_size=50', token, userId);
    const items = Array.isArray(payload) ? payload : payload?.items || payload?.list || payload?.keys || [];
    return items.map((item) => ({
      id: item.id, name: item.name, status: item.status,
      key: type === 'sub2api' && !String(item.key || '').includes('*') ? item.key || item.plain || '' : ''
    }));
  }

  async function key(token, userId, id) {
    if (!/^[1-9]\d*$/.test(String(id))) throw failure('GATEWAY_KEY_ID_INVALID', 400);
    const item = (await keys(token, userId)).find((entry) => String(entry.id) === String(id));
    if (!item) throw failure('GATEWAY_KEY_NOT_FOUND', 404);
    if (item.key) return item;
    const payload = await request(type === 'newapi' ? `/api/token/${id}/key` : `/api/v1/keys/${id}`, token, userId, type === 'newapi' ? 'POST' : 'GET');
    const secret = payload?.key || payload?.plain;
    if (!secret || String(secret).includes('*')) throw failure('GATEWAY_KEY_UNAVAILABLE', 422);
    return { ...item, key: secret };
  }

  return {
    profile, storageIdentity, keys, key,
    config: { type, credentialMode, configured: Boolean(base), siteUrl: base, gatewayBaseUrl: base ? `${base}/v1` : '' }
  };
}
