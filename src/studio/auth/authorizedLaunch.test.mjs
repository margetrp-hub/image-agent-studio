import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizedLaunchParams, receiveAuthorizedLaunch } from './authorizedLaunch.js';

function fixture() {
  const state = '11111111-2222-4333-8444-555555555555';
  const parentOrigin = 'https://api.example.invalid';
  const listeners = new Map();
  const timers = new Map();
  const messages = [];
  let replaced = '';
  const opener = { postMessage: (data, origin) => messages.push({ data, origin }) };
  const host = {
    location: { href: `https://studio.example.invalid/studio/?ohlao_authorize=1&state=${state}&parent_origin=${encodeURIComponent(parentOrigin)}` },
    opener,
    history: { replaceState: (_, __, url) => { replaced = url; } },
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    setTimeout: (fn) => { timers.set(1, fn); return 1; },
    clearTimeout: (id) => timers.delete(id),
  };
  const send = (overrides = {}) => listeners.get('message')?.({ source: opener, origin: parentOrigin, data: { type: 'ohlao:studio:authorize', state, token: 'test-session' }, ...overrides });
  return { host, send, timers, messages, listeners, replaced: () => replaced };
}

test('requires exact opener/origin/nonce, exchanges once, and returns no credentials to parent', async () => {
  const f = fixture();
  let calls = 0;
  const task = receiveAuthorizedLaunch(async (launch) => { calls++; assert.deepEqual(launch, { token: 'test-session', parentOrigin: 'https://api.example.invalid' }); return { accessToken: 'studio-session' }; }, f.host);
  assert.equal(f.messages[0].data.type, 'ohlao:studio:ready');
  assert.equal(f.replaced(), '/studio/');
  await f.send({ origin: 'https://attacker.invalid' });
  await f.send({ source: {} });
  await f.send({ data: { type: 'ohlao:studio:authorize', state: 'wrong', token: 'test-session' } });
  assert.equal(calls, 0);
  await f.send(); await f.send();
  assert.deepEqual(await task, { accessToken: 'studio-session' });
  assert.equal(calls, 1);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.messages[1].data.ok, true);
  assert.equal(JSON.stringify(f.messages).includes('studio-session'), false);
});

test('failed exchange reports failure and a fresh attempt can succeed', async () => {
  const f = fixture();
  const task = receiveAuthorizedLaunch(async () => { throw new Error('EXPIRED'); }, f.host);
  const rejected = assert.rejects(task, /EXPIRED/);
  await f.send(); await rejected;
  assert.equal(f.messages.at(-1).data.ok, false);
  const retry = fixture();
  const result = receiveAuthorizedLaunch(async () => ({ accessToken: 'valid' }), retry.host);
  await retry.send(); assert.deepEqual(await result, { accessToken: 'valid' });
});

test('timeout aborts pending exchange and late completion cannot report success', async () => {
  const f = fixture(); let resolve; let signal;
  const task = receiveAuthorizedLaunch((_, s) => { signal = s; return new Promise(r => { resolve = r; }); }, f.host);
  const rejected = assert.rejects(task, /AUTHORIZATION_TIMEOUT/);
  const pending = f.send();
  f.timers.get(1)(); await rejected;
  assert.equal(signal.aborted, true);
  resolve({ accessToken: 'too-late' }); await pending;
  assert.equal(f.messages.filter(m => m.data.type === 'ohlao:studio:result').length, 1);
  assert.equal(f.messages.at(-1).data.ok, false);
});

test('invalid requests and pages without an opener never exchange a token', async () => {
  const f = fixture(); f.host.opener = null;
  await assert.rejects(receiveAuthorizedLaunch(() => assert.fail('must not exchange'), f.host), /INVALID_AUTHORIZATION/);
  f.host.location.href = 'https://studio.example.invalid/?ohlao_authorize=1&parent_origin=http://public.invalid&state=abc';
  assert.deepEqual(authorizedLaunchParams(f.host), { invalid: true });
});

test('embedded entry trusts only its parent, and parent cancellation aborts the exchange', async () => {
  const f = fixture();
  const parent = { postMessage: (data, origin) => f.messages.push({ data, origin }) };
  f.host.parent = parent;
  let calls = 0; let signal; let resolve;
  const task = receiveAuthorizedLaunch((_, nextSignal) => {
    calls++; signal = nextSignal;
    return new Promise(r => { resolve = r; });
  }, f.host);
  const rejected = assert.rejects(task, /AUTHORIZATION_CANCELLED/);
  await f.send(); // An opener must not authorize a framed page.
  assert.equal(calls, 0);
  const pending = f.send({ source: parent });
  assert.equal(calls, 1);
  await f.send({ source: parent, data: { type: 'ohlao:studio:cancel', state: '11111111-2222-4333-8444-555555555555' } });
  await rejected;
  assert.equal(signal.aborted, true);
  resolve({ accessToken: 'late' }); await pending;
  assert.equal(f.messages.filter(m => m.data.type === 'ohlao:studio:result').length, 1);
  assert.equal(f.messages.at(-1).data.ok, false);
  assert.equal(f.listeners.size, 0);
});
