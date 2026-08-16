import { createHash, pbkdf2, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStandaloneBillingStore } from './standaloneBilling.js';
import { createStandaloneProviderConnectionStore } from './standaloneProviderConnections.js';

const PASSWORD_ALGORITHM = 'pbkdf2-sha256';
const PASSWORD_KEY_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;
const DEFAULT_PASSWORD_ITERATIONS = 600_000;
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class StandaloneAuthError extends Error {
  constructor(code, message, { status = 400, retryAfterMs } = {}) {
    super(message);
    this.name = 'StandaloneAuthError';
    this.code = code;
    this.status = status;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

export function createLoginFailureLimiter({
  maxFailures = 5,
  windowMs = 15 * 60 * 1000,
  maxKeys = 10_000,
  now = Date.now
} = {}) {
  if (!Number.isInteger(maxFailures) || maxFailures < 1) {
    throw new TypeError('maxFailures must be a positive integer.');
  }
  if (!Number.isFinite(windowMs) || windowMs < 1) {
    throw new TypeError('windowMs must be a positive number.');
  }
  if (!Number.isInteger(maxKeys) || maxKeys < 1) {
    throw new TypeError('maxKeys must be a positive integer.');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function.');

  const failuresByKey = new Map();

  function hashedKey(value) {
    const key = String(value || '').trim();
    if (!key) throw new StandaloneAuthError('INVALID_RATE_LIMIT_KEY', 'A login rate-limit key is required.');
    return createHash('sha256').update(key).digest('hex');
  }

  function activeFailures(key, currentTime) {
    const cutoff = currentTime - windowMs;
    const failures = (failuresByKey.get(key) || []).filter((timestamp) => timestamp > cutoff);
    if (failures.length) failuresByKey.set(key, failures);
    else failuresByKey.delete(key);
    return failures;
  }

  function resultFor(failures, currentTime) {
    const allowed = failures.length < maxFailures;
    return {
      allowed,
      remaining: Math.max(0, maxFailures - failures.length),
      retryAfterMs: allowed ? 0 : Math.max(1, failures[0] + windowMs - currentTime)
    };
  }

  function ensureCapacity(key) {
    if (failuresByKey.has(key)) return;
    const currentTime = now();
    for (const existingKey of failuresByKey.keys()) activeFailures(existingKey, currentTime);
    while (failuresByKey.size >= maxKeys) {
      const oldestKey = failuresByKey.keys().next().value;
      if (oldestKey === undefined) break;
      failuresByKey.delete(oldestKey);
    }
  }

  return Object.freeze({
    check(value) {
      const currentTime = now();
      return resultFor(activeFailures(hashedKey(value), currentTime), currentTime);
    },

    recordFailure(value) {
      const currentTime = now();
      const key = hashedKey(value);
      ensureCapacity(key);
      const failures = activeFailures(key, currentTime);
      failures.push(currentTime);
      failuresByKey.set(key, failures);
      return resultFor(failures, currentTime);
    },

    reset(value) {
      return failuresByKey.delete(hashedKey(value));
    },

    clearExpired() {
      const currentTime = now();
      for (const key of failuresByKey.keys()) activeFailures(key, currentTime);
    }
  });
}

export function createStandaloneAuthStore(options) {
  return new StandaloneAuthStore(options);
}

export class StandaloneAuthStore {
  constructor({
    databasePath,
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
    passwordIterations = DEFAULT_PASSWORD_ITERATIONS,
    minimumPasswordLength = 8,
    now = Date.now,
    loginLimiter,
    loginMaxFailures = 5,
    loginFailureWindowMs = 15 * 60 * 1000,
    billingDefaults = {},
    providerMasterKey = '',
    allowPrivateProviderUrls = false,
    providerFetchImpl = globalThis.fetch
  } = {}) {
    if (!databasePath || typeof databasePath !== 'string') {
      throw new TypeError('databasePath is required. Use ":memory:" for an in-memory store.');
    }
    if (!Number.isFinite(sessionTtlMs) || sessionTtlMs < 1) {
      throw new TypeError('sessionTtlMs must be a positive number.');
    }
    if (!Number.isInteger(passwordIterations) || passwordIterations < 100_000) {
      throw new TypeError('passwordIterations must be an integer of at least 100000.');
    }
    if (!Number.isInteger(minimumPasswordLength) || minimumPasswordLength < 1) {
      throw new TypeError('minimumPasswordLength must be a positive integer.');
    }
    if (typeof now !== 'function') throw new TypeError('now must be a function.');

    this.databasePath = databasePath === ':memory:' ? databasePath : path.resolve(databasePath);
    if (this.databasePath !== ':memory:') {
      const databaseDir = path.dirname(this.databasePath);
      mkdirSync(databaseDir, { recursive: true, mode: 0o700 });
      chmodIfPossible(databaseDir, 0o700);
    }

    this.database = new DatabaseSync(this.databasePath);
    this.sessionTtlMs = sessionTtlMs;
    this.passwordIterations = passwordIterations;
    this.minimumPasswordLength = minimumPasswordLength;
    this.now = now;
    this.loginLimiter = loginLimiter || createLoginFailureLimiter({
      maxFailures: loginMaxFailures,
      windowMs: loginFailureWindowMs,
      now
    });

    const dummySalt = randomBytes(PASSWORD_SALT_BYTES);
    this.dummyPasswordHash = pbkdf2Sync(randomBytes(32), dummySalt, passwordIterations, PASSWORD_KEY_BYTES, 'sha256');
    this.dummyPasswordSalt = dummySalt;
    this.initializeSchema();
    this.billing = createStandaloneBillingStore({ database: this.database, now, defaults: billingDefaults });
    this.providerConnections = createStandaloneProviderConnectionStore({
      database: this.database,
      masterKey: providerMasterKey,
      allowPrivateUrls: allowPrivateProviderUrls,
      fetchImpl: providerFetchImpl,
      now
    });
    this.secureDatabaseFiles();
  }

  initializeSchema() {
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_algorithm TEXT NOT NULL,
        password_hash BLOB NOT NULL,
        password_salt BLOB NOT NULL,
        password_iterations INTEGER NOT NULL,
        role TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        disabled_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS legacy_identity_map (
        source TEXT NOT NULL,
        legacy_identity TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (source, legacy_identity)
      );

      CREATE INDEX IF NOT EXISTS legacy_identity_user_id_idx ON legacy_identity_map(user_id);

      CREATE TABLE IF NOT EXISTS provider_links (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL COLLATE NOCASE,
        provider_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (provider, provider_user_id)
      );

      CREATE INDEX IF NOT EXISTS provider_links_user_id_idx ON provider_links(user_id);
      PRAGMA user_version = 1;
    `);
  }

  register({ email, username, password } = {}) {
    const user = this.createUser({ email, username, password, role: 'user' });
    this.billing.grantRegistrationBonus(user.id);
    return this.getUserWithBilling(user.id);
  }

  createUser({ email, username, password, role = 'user' } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = normalizeUsername(username);
    const normalizedRole = normalizeRole(role);
    const normalizedPassword = validateNewPassword(password, this.minimumPasswordLength);
    const salt = randomBytes(PASSWORD_SALT_BYTES);
    const passwordHash = pbkdf2Sync(
      normalizedPassword,
      salt,
      this.passwordIterations,
      PASSWORD_KEY_BYTES,
      'sha256'
    );
    const userId = randomUUID();
    const currentTime = this.now();

    try {
      this.database.prepare(`
        INSERT INTO users (
          id, email, username, password_algorithm, password_hash, password_salt,
          password_iterations, role, active, created_at, updated_at, disabled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)
      `).run(
        userId,
        normalizedEmail,
        normalizedUsername,
        PASSWORD_ALGORITHM,
        passwordHash,
        salt,
        this.passwordIterations,
        normalizedRole,
        currentTime,
        currentTime
      );
    } catch (error) {
      if (String(error?.message || '').includes('UNIQUE constraint failed')) {
        throw new StandaloneAuthError('USER_EXISTS', 'A user with that email or username already exists.', { status: 409 });
      }
      throw error;
    }

    this.billing.ensureAccount(userId);

    return this.getUserById(userId);
  }

  getUserWithBilling(userId) {
    const user = this.getUserById(userId);
    if (!user) return null;
    return { ...user, credits: this.billing.getSummary(user.id) };
  }

  getCreditSummary(userId) {
    return this.billing.getSummary(userId);
  }

  listCreditTransactions(userId, limit) {
    return this.billing.listTransactions(userId, limit);
  }

  getBillingSettings() {
    return this.billing.getSettings();
  }

  updateBillingSettings(patch, actorUserId) {
    return this.billing.updateSettings(patch, actorUserId);
  }

  getBillingStats() {
    return this.billing.stats();
  }

  calculateJobCost(input) {
    return this.billing.calculateJobCost(input);
  }

  reserveCredits(input) {
    return this.billing.reserveCredits(input);
  }

  refundCredits(input) {
    return this.billing.refundCredits(input);
  }

  adjustCredits(input) {
    return this.billing.adjustCredits(input);
  }

  createCreditCode(input) {
    return this.billing.createCreditCode(input);
  }

  listCreditCodes(limit) {
    return this.billing.listCreditCodes(limit);
  }

  disableCreditCode(codeId) {
    return this.billing.disableCreditCode(codeId);
  }

  redeemCreditCode(input) {
    return this.billing.redeemCreditCode(input);
  }

  listProviderConnections(userId) {
    return this.providerConnections.list(userId);
  }

  getProviderConnection(userId, connectionId) {
    return this.providerConnections.get(userId, connectionId);
  }

  getProviderConnectionRuntime(userId, connectionId) {
    return this.providerConnections.runtime(userId, connectionId);
  }

  bindProviderConnection(input) {
    return this.providerConnections.bind(input);
  }

  removeProviderConnection(userId, connectionId) {
    return this.providerConnections.remove(userId, connectionId);
  }

  testProviderConnection(userId, connectionId) {
    return this.providerConnections.test(userId, connectionId);
  }

  async login({ identifier, email, username, password, rateLimitKey } = {}) {
    const loginIdentifier = normalizeLoginIdentifier(identifier || email || username);
    const limiterKey = rateLimitKey || loginIdentifier;
    const limit = this.loginLimiter.check(limiterKey);
    if (!limit.allowed) {
      throw new StandaloneAuthError('LOGIN_RATE_LIMITED', 'Too many failed login attempts.', {
        status: 429,
        retryAfterMs: limit.retryAfterMs
      });
    }

    const suppliedPassword = typeof password === 'string' && password.length <= 4096 ? password : '';
    const row = this.findCredentialRow(loginIdentifier);
    const salt = row ? Buffer.from(row.password_salt) : this.dummyPasswordSalt;
    const expectedHash = row ? Buffer.from(row.password_hash) : this.dummyPasswordHash;
    const iterations = row ? Number(row.password_iterations) : this.passwordIterations;
    const actualHash = await derivePassword(suppliedPassword, salt, iterations, expectedHash.length);
    const passwordMatches = expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);

    if (!row || row.password_algorithm !== PASSWORD_ALGORITHM || !passwordMatches) {
      this.loginLimiter.recordFailure(limiterKey);
      throw new StandaloneAuthError('INVALID_CREDENTIALS', 'Invalid login credentials.', { status: 401 });
    }
    if (!Boolean(row.active)) {
      this.loginLimiter.recordFailure(limiterKey);
      throw new StandaloneAuthError('ACCOUNT_DISABLED', 'This account is disabled.', { status: 403 });
    }

    this.loginLimiter.reset(limiterKey);
    this.deleteExpiredSessions();

    const token = randomBytes(32).toString('base64url');
    const sessionId = randomUUID();
    const createdAt = this.now();
    const expiresAt = createdAt + this.sessionTtlMs;
    this.database.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, row.id, hashToken(token), createdAt, expiresAt);

    return {
      token,
      tokenType: 'Bearer',
      expiresAt: toIso(expiresAt),
      user: this.getUserWithBilling(row.id)
    };
  }

  verifySession(token) {
    const tokenHash = tokenHashForLookup(token);
    const row = this.database.prepare(`
      SELECT
        s.id AS session_id,
        s.created_at AS session_created_at,
        s.expires_at AS session_expires_at,
        u.*
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `).get(tokenHash);

    if (!row) throw new StandaloneAuthError('INVALID_SESSION', 'The session is invalid.', { status: 401 });
    if (Number(row.session_expires_at) <= this.now()) {
      this.database.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
      throw new StandaloneAuthError('SESSION_EXPIRED', 'The session has expired.', { status: 401 });
    }
    if (!Boolean(row.active)) {
      this.database.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
      throw new StandaloneAuthError('ACCOUNT_DISABLED', 'This account is disabled.', { status: 403 });
    }

    return {
      user: this.getUserWithBilling(row.id),
      session: {
        id: row.session_id,
        userId: row.id,
        createdAt: toIso(row.session_created_at),
        expiresAt: toIso(row.session_expires_at)
      }
    };
  }

  logout(token) {
    const result = this.database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHashForLookup(token));
    return { loggedOut: Number(result.changes) > 0 };
  }

  listUsers({ includeDisabled = true } = {}) {
    const sql = includeDisabled
      ? 'SELECT * FROM users ORDER BY created_at ASC, id ASC'
      : 'SELECT * FROM users WHERE active = 1 ORDER BY created_at ASC, id ASC';
    return this.database.prepare(sql).all().map(toPublicUser);
  }

  listUsersWithBilling(options) {
    return this.listUsers(options).map((user) => ({
      ...user,
      credits: this.billing.getSummary(user.id)
    }));
  }

  disableUser(userId) {
    const id = normalizeOpaqueId(userId, 'userId');
    const currentTime = this.now();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = this.database.prepare(`
        UPDATE users
        SET active = 0, disabled_at = COALESCE(disabled_at, ?), updated_at = ?
        WHERE id = ?
      `).run(currentTime, currentTime, id);
      if (Number(result.changes) === 0) {
        throw new StandaloneAuthError('USER_NOT_FOUND', 'User not found.', { status: 404 });
      }
      this.database.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.getUserById(id);
  }

  checkLoginAllowed(key) {
    return this.loginLimiter.check(key);
  }

  recordLoginFailure(key) {
    return this.loginLimiter.recordFailure(key);
  }

  clearLoginFailures(key) {
    return this.loginLimiter.reset(key);
  }

  mapLegacyIdentity({ userId, legacyIdentity, source = 'sub2api' } = {}) {
    const id = normalizeOpaqueId(userId, 'userId');
    const identity = normalizeOpaqueId(legacyIdentity, 'legacyIdentity');
    const normalizedSource = normalizeProvider(source, 'source');
    this.requireUser(id);

    const existing = this.database.prepare(`
      SELECT user_id FROM legacy_identity_map WHERE source = ? AND legacy_identity = ?
    `).get(normalizedSource, identity);
    if (existing && existing.user_id !== id) {
      throw new StandaloneAuthError('IDENTITY_ALREADY_LINKED', 'That legacy identity is already linked.', { status: 409 });
    }
    if (!existing) {
      this.database.prepare(`
        INSERT INTO legacy_identity_map (source, legacy_identity, user_id, created_at)
        VALUES (?, ?, ?, ?)
      `).run(normalizedSource, identity, id, this.now());
    }
    return { source: normalizedSource, legacyIdentity: identity, userId: id };
  }

  resolveLegacyIdentity({ legacyIdentity, source = 'sub2api' } = {}) {
    const identity = normalizeOpaqueId(legacyIdentity, 'legacyIdentity');
    const normalizedSource = normalizeProvider(source, 'source');
    const row = this.database.prepare(`
      SELECT u.*
      FROM legacy_identity_map m
      JOIN users u ON u.id = m.user_id
      WHERE m.source = ? AND m.legacy_identity = ?
    `).get(normalizedSource, identity);
    return row ? toPublicUser(row) : null;
  }

  linkProvider({ userId, provider, providerUserId } = {}) {
    const id = normalizeOpaqueId(userId, 'userId');
    const normalizedProvider = normalizeProvider(provider, 'provider');
    const externalId = normalizeOpaqueId(providerUserId, 'providerUserId');
    this.requireUser(id);

    const existing = this.database.prepare(`
      SELECT id, user_id FROM provider_links WHERE provider = ? AND provider_user_id = ?
    `).get(normalizedProvider, externalId);
    if (existing && existing.user_id !== id) {
      throw new StandaloneAuthError('PROVIDER_IDENTITY_ALREADY_LINKED', 'That provider identity is already linked.', { status: 409 });
    }
    const linkId = existing?.id || randomUUID();
    if (!existing) {
      this.database.prepare(`
        INSERT INTO provider_links (id, user_id, provider, provider_user_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(linkId, id, normalizedProvider, externalId, this.now());
    }
    return { id: linkId, userId: id, provider: normalizedProvider, providerUserId: externalId };
  }

  resolveProviderLink({ provider, providerUserId } = {}) {
    const normalizedProvider = normalizeProvider(provider, 'provider');
    const externalId = normalizeOpaqueId(providerUserId, 'providerUserId');
    const row = this.database.prepare(`
      SELECT u.*
      FROM provider_links p
      JOIN users u ON u.id = p.user_id
      WHERE p.provider = ? AND p.provider_user_id = ?
    `).get(normalizedProvider, externalId);
    return row ? toPublicUser(row) : null;
  }

  deleteExpiredSessions() {
    const result = this.database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(this.now());
    return Number(result.changes);
  }

  close() {
    this.database.close();
  }

  secureDatabaseFiles() {
    if (this.databasePath === ':memory:') return;
    for (const filePath of [this.databasePath, `${this.databasePath}-wal`, `${this.databasePath}-shm`]) {
      if (existsSync(filePath)) chmodIfPossible(filePath, 0o600);
    }
  }

  getUserById(userId) {
    const row = this.database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return row ? toPublicUser(row) : null;
  }

  findCredentialRow(identifier) {
    return identifier.includes('@')
      ? this.database.prepare('SELECT * FROM users WHERE email = ?').get(identifier)
      : this.database.prepare('SELECT * FROM users WHERE username = ?').get(identifier);
  }

  requireUser(userId) {
    const row = this.database.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!row) throw new StandaloneAuthError('USER_NOT_FOUND', 'User not found.', { status: 404 });
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function tokenHashForLookup(token) {
  if (typeof token !== 'string' || !token || token.length > 512) {
    throw new StandaloneAuthError('INVALID_SESSION', 'The session is invalid.', { status: 401 });
  }
  return hashToken(token);
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new StandaloneAuthError('INVALID_EMAIL', 'A valid email address is required.');
  }
  return email;
}

function normalizeUsername(value) {
  const username = String(value || '').replace(/\s+/g, ' ').trim();
  if (!username || username.length > 80 || username.includes('@')) {
    throw new StandaloneAuthError('INVALID_USERNAME', 'A username of up to 80 characters is required.');
  }
  return username;
}

function normalizeLoginIdentifier(value) {
  const identifier = String(value || '').trim();
  if (!identifier || identifier.length > 254) {
    throw new StandaloneAuthError('INVALID_CREDENTIALS', 'Invalid login credentials.', { status: 401 });
  }
  return identifier;
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (!['admin', 'user'].includes(role)) {
    throw new StandaloneAuthError('INVALID_ROLE', 'A valid role is required.');
  }
  return role;
}

function normalizeProvider(value, fieldName) {
  const provider = String(value || '').trim().toLowerCase();
  if (!provider || provider.length > 80) {
    throw new StandaloneAuthError('INVALID_IDENTITY', `${fieldName} is required.`);
  }
  return provider;
}

function normalizeOpaqueId(value, fieldName) {
  const id = String(value || '').trim();
  if (!id || id.length > 255) {
    throw new StandaloneAuthError('INVALID_IDENTITY', `${fieldName} is required.`);
  }
  return id;
}

function validateNewPassword(value, minimumLength) {
  if (typeof value !== 'string' || value.length < minimumLength || value.length > 4096) {
    throw new StandaloneAuthError(
      'INVALID_PASSWORD',
      `Password must be between ${minimumLength} and 4096 characters.`
    );
  }
  return value;
}

function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    active: Boolean(row.active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    disabledAt: row.disabled_at === null ? null : toIso(row.disabled_at)
  };
}

function toIso(value) {
  return new Date(Number(value)).toISOString();
}

function derivePassword(password, salt, iterations, keyLength) {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, keyLength, 'sha256', (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function chmodIfPossible(filePath, mode) {
  try {
    chmodSync(filePath, mode);
  } catch (error) {
    if (process.platform !== 'win32') throw error;
  }
}
