import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  StandaloneAuthError,
  createLoginFailureLimiter,
  createStandaloneAuthStore
} from './studio-service/standaloneAuth.js';
import { StandaloneBillingError } from './studio-service/standaloneBilling.js';

const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'studio-standalone-auth-'));
const databasePath = path.join(tempDir, 'auth.sqlite');
let currentTime = Date.UTC(2026, 6, 21, 0, 0, 0);
const now = () => currentTime;
const checks = [];

function check(name, callback) {
  callback();
  checks.push(name);
}

function expectAuthError(callback, code) {
  assert.throws(callback, (error) => {
    assert(error instanceof StandaloneAuthError);
    assert.equal(error.code, code);
    assert(!String(error.message).includes('Correct Horse'));
    return true;
  });
}

function expectBillingError(callback, code) {
  assert.throws(callback, (error) => {
    assert(error instanceof StandaloneBillingError);
    assert.equal(error.code, code);
    return true;
  });
}

async function expectAuthRejection(callback, code) {
  await assert.rejects(callback, (error) => {
    assert(error instanceof StandaloneAuthError);
    assert.equal(error.code, code);
    assert(!String(error.message).includes('Correct Horse'));
    return true;
  });
}

const limiter = createLoginFailureLimiter({ maxFailures: 2, windowMs: 1_000, now });
check('standalone limiter blocks after configured failures', () => {
  assert.deepEqual(limiter.check('address:user'), { allowed: true, remaining: 2, retryAfterMs: 0 });
  assert.equal(limiter.recordFailure('address:user').remaining, 1);
  const blocked = limiter.recordFailure('address:user');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 1_000);
  currentTime += 1_001;
  assert.equal(limiter.check('address:user').allowed, true);
});

const store = createStandaloneAuthStore({
  databasePath,
  now,
  passwordIterations: 100_000,
  sessionTtlMs: 5_000,
  loginMaxFailures: 2,
  loginFailureWindowMs: 1_000,
  billingDefaults: { creditsEnabled: true }
});

const policyStore = createStandaloneAuthStore({
  databasePath: ':memory:',
  passwordIterations: 100_000
});
const policyUser = policyStore.register({
  email: 'policy@yhoo.lol',
  username: 'PolicyUser',
  password: 'Policy Password 123'
});

check('credits are controlled by the persisted admin policy', () => {
  assert.equal(policyStore.getBillingSettings().creditsEnabled, false);
  assert.equal(policyUser.credits.balance, 0);
  assert.equal(policyStore.calculateJobCost({ mode: 'image', route: 'generations' }).amount, 0);
  policyStore.updateBillingSettings({ creditsEnabled: true }, 'admin-policy-test');
  assert.equal(policyStore.getBillingSettings().creditsEnabled, true);
  assert.equal(policyStore.calculateJobCost({ mode: 'image', route: 'generations' }).amount, 10);
});

const password = 'Correct Horse Battery Staple';
const admin = store.createUser({
  email: 'admin@yhoo.lol',
  username: 'Admin',
  password,
  role: 'admin'
});
const member = store.register({
  email: 'member@yhoo.lol',
  username: 'Member',
  password: 'Member Password 123'
});

check('users are created without credential fields', () => {
  assert.equal(admin.role, 'admin');
  assert.equal(member.role, 'user');
  assert.equal(member.credits.balance, 200);
  assert.equal(member.credits.lifetimeEarned, 200);
  assert.equal(admin.active, true);
  assert.deepEqual(Object.keys(admin).sort(), [
    'active', 'createdAt', 'disabledAt', 'email', 'id', 'role', 'updatedAt', 'username'
  ]);
  expectAuthError(() => store.register({
    email: 'ADMIN@yhoo.lol',
    username: 'Other',
    password: 'Another Password'
  }), 'USER_EXISTS');
});

check('credit reservations and refunds are idempotent and user-scoped', () => {
  const reserved = store.reserveCredits({
    userId: member.id,
    amount: 50,
    referenceId: 'generation-1',
    metadata: { route: 'generations' }
  });
  assert.equal(reserved.balance, 150);
  assert.equal(reserved.charged, 50);

  const duplicateReservation = store.reserveCredits({
    userId: member.id,
    amount: 50,
    referenceId: 'generation-1'
  });
  assert.equal(duplicateReservation.duplicate, true);
  assert.equal(duplicateReservation.balance, 150);

  const otherMember = store.register({
    email: 'other-member@yhoo.lol',
    username: 'OtherMember',
    password: 'Other Member Password 123'
  });
  const sameReferenceOtherUser = store.reserveCredits({
    userId: otherMember.id,
    amount: 50,
    referenceId: 'generation-1'
  });
  assert.equal(sameReferenceOtherUser.balance, 150);

  const refunded = store.refundCredits({
    userId: member.id,
    amount: 50,
    referenceId: 'generation-refund-1'
  });
  assert.equal(refunded.balance, 200);
  assert.equal(refunded.lifetimeSpent, 0);
  const duplicateRefund = store.refundCredits({
    userId: member.id,
    amount: 50,
    referenceId: 'generation-refund-1'
  });
  assert.equal(duplicateRefund.balance, 200);
  expectBillingError(() => store.reserveCredits({
    userId: member.id,
    amount: 201,
    referenceId: 'generation-too-large'
  }), 'INSUFFICIENT_CREDITS');
});

const login = await store.login({
  identifier: 'ADMIN@YHOO.LOL',
  password,
  rateLimitKey: '127.0.0.1:admin@yhoo.lol'
});

check('login creates a verifiable expiring session', () => {
  assert.equal(login.tokenType, 'Bearer');
  assert.match(login.token, /^[A-Za-z0-9_-]{43}$/);
  const verified = store.verifySession(login.token);
  assert.equal(verified.user.id, admin.id);
  assert.equal(verified.session.userId, admin.id);
  assert.equal(Object.hasOwn(verified.session, 'token'), false);
  assert.equal(JSON.stringify(verified).includes(login.token), false);
});

check('sqlite stores only the SHA-256 session token', () => {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  const tableNames = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
  `).all().map((row) => row.name);
  for (const tableName of ['users', 'sessions', 'password_reset_tokens', 'legacy_identity_map', 'provider_links']) {
    assert(tableNames.includes(tableName));
  }
  const sessionRow = db.prepare('SELECT token_hash FROM sessions WHERE user_id = ?').get(admin.id);
  assert.equal(sessionRow.token_hash, createHash('sha256').update(login.token).digest('hex'));
  assert.notEqual(sessionRow.token_hash, login.token);
  const credentialRow = db.prepare(`
    SELECT password_algorithm, password_hash, password_salt, password_iterations FROM users WHERE id = ?
  `).get(admin.id);
  assert.equal(credentialRow.password_algorithm, 'pbkdf2-sha256');
  assert.equal(credentialRow.password_hash.byteLength, 32);
  assert.equal(credentialRow.password_salt.byteLength, 16);
  assert.equal(credentialRow.password_iterations, 100_000);
  db.close();
});

check('credentials and tokens do not appear raw in the database', () => {
  const databaseBytes = fs.readFileSync(databasePath);
  assert.equal(databaseBytes.includes(Buffer.from(password)), false);
  assert.equal(databaseBytes.includes(Buffer.from(login.token)), false);
});

await (async () => {
  const adminSession = await store.login({ identifier: 'Admin', password });
  const reset = store.createPasswordResetToken({ userId: admin.id, actorUserId: admin.id });
  assert.match(reset.token, /^[A-Za-z0-9_-]{32}$/);
  const resetRow = new DatabaseSync(databasePath, { readOnly: true }).prepare(
    'SELECT token_hash, used_at FROM password_reset_tokens WHERE user_id = ?'
  ).get(admin.id);
  assert.equal(resetRow.token_hash, createHash('sha256').update(reset.token).digest('hex'));
  assert.equal(resetRow.used_at, null);
  assert.equal(fs.readFileSync(databasePath).includes(Buffer.from(reset.token)), false);
  const changed = store.resetPassword({
    identifier: 'ADMIN@YHOO.LOL',
    token: reset.token,
    password: 'New Admin Password 123'
  });
  assert.equal(changed.id, admin.id);
  expectAuthError(() => store.verifySession(adminSession.token), 'INVALID_SESSION');
  await expectAuthRejection(
    () => store.login({ identifier: 'admin@yhoo.lol', password, rateLimitKey: 'admin-reset-old' }),
    'INVALID_CREDENTIALS'
  );
  const newSession = await store.login({ identifier: 'admin@yhoo.lol', password: 'New Admin Password 123' });
  assert.equal(store.verifySession(newSession.token).user.id, admin.id);
  expectAuthError(() => store.resetPassword({
    identifier: 'admin@yhoo.lol',
    token: reset.token,
    password: 'Another Admin Password 123'
  }), 'RESET_TOKEN_INVALID');
  checks.push('admin reset codes are hashed, single-use, expiring, and revoke old sessions');
})();

check('legacy identities and providers resolve to local users', () => {
  assert.deepEqual(
    store.mapLegacyIdentity({ userId: admin.id, legacyIdentity: 'sub2api-user-47' }),
    { source: 'sub2api', legacyIdentity: 'sub2api-user-47', userId: admin.id }
  );
  assert.equal(store.resolveLegacyIdentity({ legacyIdentity: 'sub2api-user-47' }).id, admin.id);
  const link = store.linkProvider({ userId: member.id, provider: 'grok2api', providerUserId: 'external-250' });
  assert.equal(link.provider, 'grok2api');
  assert.equal(store.resolveProviderLink({ provider: 'GROK2API', providerUserId: 'external-250' }).id, member.id);
});

await (async () => {
  const input = { identifier: 'member@yhoo.lol', password: 'wrong password', rateLimitKey: 'rate-test' };
  await expectAuthRejection(() => store.login(input), 'INVALID_CREDENTIALS');
  await expectAuthRejection(() => store.login(input), 'INVALID_CREDENTIALS');
  await expectAuthRejection(() => store.login(input), 'LOGIN_RATE_LIMITED');
  assert.equal(store.checkLoginAllowed('rate-test').allowed, false);
  store.clearLoginFailures('rate-test');
  assert.equal(store.checkLoginAllowed('rate-test').allowed, true);
  checks.push('failed logins are rate limited without exposing credentials');
})();

await (async () => {
  const session = await store.login({ identifier: 'Member', password: 'Member Password 123' });
  assert.equal(store.logout(session.token).loggedOut, true);
  assert.equal(store.logout(session.token).loggedOut, false);
  expectAuthError(() => store.verifySession(session.token), 'INVALID_SESSION');
  checks.push('logout invalidates a session');
})();

await (async () => {
  const session = await store.login({ identifier: 'Member', password: 'Member Password 123' });
  currentTime += 5_001;
  expectAuthError(() => store.verifySession(session.token), 'SESSION_EXPIRED');
  checks.push('expired sessions cannot be verified');
})();

await (async () => {
  const session = await store.login({ identifier: 'Member', password: 'Member Password 123' });
  const disabled = store.disableUser(member.id);
  assert.equal(disabled.active, false);
  expectAuthError(() => store.verifySession(session.token), 'INVALID_SESSION');
  await expectAuthRejection(
    () => store.login({ identifier: 'Member', password: 'Member Password 123', rateLimitKey: 'disabled-member' }),
    'ACCOUNT_DISABLED'
  );
  assert.equal(store.listUsers().length, 3);
  const activeUsers = store.listUsers({ includeDisabled: false });
  assert.equal(activeUsers.length, 2);
  assert(activeUsers.some((user) => user.id === admin.id));
  assert(activeUsers.every((user) => user.id !== member.id));
  checks.push('disabling a user revokes sessions and prevents login');
})();

const validationStore = createStandaloneAuthStore({ databasePath: ':memory:', passwordIterations: 100_000 });
check('role and identity validation is enforced in the store', () => {
  const unicodeUser = validationStore.createUser({
    email: 'unicode@yhoo.lol',
    username: '\u7528\u6237',
    password: 'Unicode Password 123',
    role: 'user'
  });
  assert.equal(unicodeUser.username, '\u7528\u6237');
  expectAuthError(() => validationStore.createUser({
    email: 'owner@yhoo.lol',
    username: 'Owner',
    password: 'Owner Password 123',
    role: 'owner'
  }), 'INVALID_ROLE');
  expectAuthError(() => validationStore.createUser({
    email: 'not-an-email',
    username: 'Invalid Email',
    password: 'Invalid Email Password',
    role: 'user'
  }), 'INVALID_EMAIL');
});
validationStore.close();

store.close();

console.log(JSON.stringify({
  ok: true,
  checks,
  databasePath,
  tables: ['users', 'sessions', 'password_reset_tokens', 'legacy_identity_map', 'provider_links']
}, null, 2));
