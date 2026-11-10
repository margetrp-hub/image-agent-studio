export function authorizedLaunchParams(host = window) {
  const url = new URL(host.location.href);
  if (url.searchParams.get('ohlao_authorize') !== '1') return null;
  const state = url.searchParams.get('state') || '';
  const parentOrigin = url.searchParams.get('parent_origin') || '';
  try {
    const origin = new URL(parentOrigin);
    const secure = origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname));
    if (!secure || origin.origin !== parentOrigin || !/^[a-zA-Z0-9-]{20,80}$/.test(state)) throw new Error('INVALID_AUTHORIZATION');
  } catch { return { invalid: true }; }
  return { state, parentOrigin };
}

/** The existing server exchange still owns identity validation and session issuance. */
export function receiveAuthorizedLaunch(exchange, host = window) {
  const launch = authorizedLaunchParams(host);
  const source = host.parent && host.parent !== host ? host.parent : host.opener;
  if (!launch || launch.invalid || !source) return Promise.reject(new Error('INVALID_AUTHORIZATION'));
  const next = new URL(host.location.href);
  for (const key of ['ohlao_authorize', 'state', 'parent_origin']) next.searchParams.delete(key);
  host.history.replaceState(null, '', `${next.pathname}${next.search}${next.hash}`);
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let received = false;
    const notify = (message) => { try { source.postMessage({ ...message, state: launch.state }, launch.parentOrigin); } catch { /* The originating tab may have closed. */ } };
    const cleanup = () => {
      host.clearTimeout(timeout);
      host.removeEventListener('message', onMessage);
      host.removeEventListener('pagehide', onClose);
    };
    const finish = (error, session) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) controller.abort();
      notify({ type: 'ohlao:studio:result', ok: !error });
      if (error) reject(error); else resolve(session);
    };
    const onClose = () => finish(new Error('AUTHORIZATION_CANCELLED'));
    const onMessage = async (event) => {
      if (settled || event.source !== source || event.origin !== launch.parentOrigin || event.data?.state !== launch.state) return;
      if (event.data?.type === 'ohlao:studio:cancel') { finish(new Error('AUTHORIZATION_CANCELLED')); return; }
      if (received || event.data?.type !== 'ohlao:studio:authorize') return;
      if (typeof event.data.token !== 'string' || !event.data.token || event.data.token.length > 4096) return;
      received = true;
      try {
        const session = await exchange({ token: event.data.token, parentOrigin: launch.parentOrigin }, controller.signal);
        finish(null, session);
      } catch (error) { finish(error); }
    };
    const timeout = host.setTimeout(() => finish(new Error('AUTHORIZATION_TIMEOUT')), 25_000);
    host.addEventListener('message', onMessage);
    host.addEventListener('pagehide', onClose, { once: true });
    notify({ type: 'ohlao:studio:ready' });
  });
}
