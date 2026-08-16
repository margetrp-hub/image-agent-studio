import { createHash, randomBytes, randomUUID } from 'node:crypto';

const MAX_CREDITS = 1_000_000_000;

export class StandaloneBillingError extends Error {
  constructor(code, message, { status = 400, details } = {}) {
    super(message);
    this.name = 'StandaloneBillingError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const DEFAULT_BILLING_SETTINGS = Object.freeze({
  creditsEnabled: false,
  registrationEnabled: true,
  registrationBonusCredits: 200,
  imageGenerationCost: 10,
  imageEditCost: 15,
  videoGenerationCost: 50,
  rechargeEnabled: true,
  creditCodeEnabled: true,
  providerBindingEnabled: true,
  rechargeShopUrl: 'https://catfk.com/shop/ohlao'
});

export function createStandaloneBillingStore({
  database,
  now = Date.now,
  defaults = {}
} = {}) {
  if (!database || typeof database.exec !== 'function') {
    throw new TypeError('database is required.');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function.');

  const configuredDefaults = normalizeSettings({ ...DEFAULT_BILLING_SETTINGS, ...defaults });

  database.exec(`
    CREATE TABLE IF NOT EXISTS studio_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS credit_accounts (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      lifetime_earned INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
      lifetime_spent INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
      kind TEXT NOT NULL,
      reference_id TEXT UNIQUE,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS credit_transactions_user_idx
      ON credit_transactions(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS credit_codes (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      code_mask TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      note TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      expires_at INTEGER,
      redeemed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      redeemed_at INTEGER,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS credit_codes_status_idx
      ON credit_codes(active, redeemed_at, expires_at);
  `);

  for (const [key, value] of Object.entries(configuredDefaults)) {
    database.prepare(`
      INSERT INTO studio_settings (key, value, updated_at, updated_by)
      VALUES (?, ?, ?, NULL)
      ON CONFLICT(key) DO NOTHING
    `).run(key, serializeSetting(value), now());
  }

  function getSettings() {
    const rows = database.prepare('SELECT key, value FROM studio_settings').all();
    const settings = { ...configuredDefaults };
    for (const row of rows) {
      if (!(row.key in settings)) continue;
      settings[row.key] = parseSetting(row.value, settings[row.key]);
    }
    return normalizeSettings(settings);
  }

  function updateSettings(patch = {}, actorUserId = null) {
    const current = getSettings();
    const next = normalizeSettings({ ...current, ...patch });
    const timestamp = now();
    database.exec('BEGIN IMMEDIATE');
    try {
      for (const key of Object.keys(DEFAULT_BILLING_SETTINGS)) {
        if (!(key in patch)) continue;
        database.prepare(`
          UPDATE studio_settings
          SET value = ?, updated_at = ?, updated_by = ?
          WHERE key = ?
        `).run(serializeSetting(next[key]), timestamp, actorUserId || null, key);
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    return next;
  }

  function ensureAccount(userId) {
    const id = normalizeUserId(userId);
    database.prepare(`
      INSERT INTO credit_accounts (user_id, balance, lifetime_earned, lifetime_spent, updated_at)
      VALUES (?, 0, 0, 0, ?)
      ON CONFLICT(user_id) DO NOTHING
    `).run(id, now());
    return id;
  }

  function grantRegistrationBonus(userId) {
    const id = ensureAccount(userId);
    const settings = getSettings();
    const amount = settings.creditsEnabled ? settings.registrationBonusCredits : 0;
    if (amount <= 0) return getSummary(id);
    return applyDelta({
      userId: id,
      delta: amount,
      kind: 'registration_bonus',
      referenceId: `registration:${id}`,
      metadata: { amount, source: 'registration' }
    });
  }

  function getSummary(userId) {
    const id = ensureAccount(userId);
    const row = database.prepare('SELECT * FROM credit_accounts WHERE user_id = ?').get(id);
    return {
      balance: Number(row.balance),
      lifetimeEarned: Number(row.lifetime_earned),
      lifetimeSpent: Number(row.lifetime_spent),
      updatedAt: new Date(Number(row.updated_at)).toISOString()
    };
  }

  function listTransactions(userId, limit = 50) {
    const id = ensureAccount(userId);
    const boundedLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    return database.prepare(`
      SELECT id, delta, balance_after, kind, reference_id, metadata_json, created_at
      FROM credit_transactions
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(id, boundedLimit).map((row) => ({
      id: row.id,
      delta: Number(row.delta),
      balanceAfter: Number(row.balance_after),
      kind: row.kind,
      referenceId: unscopedReference(id, row.reference_id),
      metadata: parseMetadata(row.metadata_json),
      createdAt: new Date(Number(row.created_at)).toISOString()
    }));
  }

  function reserveCredits({ userId, amount, referenceId, metadata = {} } = {}) {
    const id = normalizeUserId(userId);
    const normalizedAmount = normalizeAmount(amount, 'amount');
    const reference = normalizeReference(referenceId);
    if (normalizedAmount === 0) return { charged: 0, ...getSummary(id), referenceId: reference };
    const existing = database.prepare(`
      SELECT delta, balance_after FROM credit_transactions
      WHERE user_id = ? AND reference_id IN (?, ?)
      ORDER BY created_at DESC
      LIMIT 1
    `).get(id, scopedReference(id, reference), reference);
    if (existing) {
      return {
        charged: Math.max(0, -Number(existing.delta)),
        ...getSummary(id),
        referenceId: reference,
        duplicate: true
      };
    }
    const summary = getSummary(id);
    if (summary.balance < normalizedAmount) {
      throw new StandaloneBillingError('INSUFFICIENT_CREDITS', 'Not enough credits for this generation.', {
        status: 402,
        details: { required: normalizedAmount, available: summary.balance }
      });
    }
    return applyDelta({
      userId: id,
      delta: -normalizedAmount,
      kind: 'generation_charge',
      referenceId: reference,
      metadata: { ...metadata, amount: normalizedAmount }
    });
  }

  function refundCredits({ userId, amount, referenceId, metadata = {} } = {}) {
    const id = normalizeUserId(userId);
    const normalizedAmount = normalizeAmount(amount, 'amount');
    if (normalizedAmount === 0) return getSummary(id);
    const reference = normalizeReference(referenceId);
    const existing = database.prepare(`
      SELECT id FROM credit_transactions
      WHERE user_id = ? AND reference_id IN (?, ?)
      LIMIT 1
    `).get(id, scopedReference(id, reference), reference);
    if (existing) return getSummary(id);
    return applyDelta({
      userId: id,
      delta: normalizedAmount,
      kind: 'generation_refund',
      referenceId: reference,
      metadata: { ...metadata, amount: normalizedAmount }
    });
  }

  function adjustCredits({ userId, amount, reason, referenceId } = {}) {
    const id = normalizeUserId(userId);
    const delta = normalizeSignedAmount(amount);
    const note = String(reason || '').trim().slice(0, 240);
    if (!note) throw new StandaloneBillingError('CREDIT_REASON_REQUIRED', 'A credit adjustment reason is required.');
    return applyDelta({
      userId: id,
      delta,
      kind: 'admin_adjustment',
      referenceId: referenceId ? normalizeReference(referenceId) : `admin:${randomUUID()}`,
      metadata: { reason: note }
    });
  }

  function createCreditCode({ amount, code, expiresAt, note, actorUserId } = {}) {
    const normalizedAmount = normalizePositiveAmount(amount, 'amount');
    const normalizedCode = normalizeCreditCode(code || generateCreditCode());
    const timestamp = now();
    const expiry = normalizeExpiry(expiresAt);
    const id = randomUUID();
    try {
      database.prepare(`
        INSERT INTO credit_codes
          (id, code_hash, code_mask, amount, note, active, expires_at, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        id,
        hashCreditCode(normalizedCode),
        maskCreditCode(normalizedCode),
        normalizedAmount,
        String(note || '').trim().slice(0, 240),
        expiry,
        actorUserId || null,
        timestamp
      );
    } catch (error) {
      if (String(error?.message || '').includes('UNIQUE constraint failed')) {
        throw new StandaloneBillingError('CREDIT_CODE_EXISTS', 'That CDK already exists.', { status: 409 });
      }
      throw error;
    }
    return {
      id,
      code: normalizedCode,
      codeMask: maskCreditCode(normalizedCode),
      amount: normalizedAmount,
      note: String(note || '').trim().slice(0, 240),
      active: true,
      expiresAt: expiry ? new Date(expiry).toISOString() : null,
      redeemedAt: null,
      redeemedBy: null,
      createdAt: new Date(timestamp).toISOString()
    };
  }

  function listCreditCodes(limit = 200) {
    const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 200));
    return database.prepare(`
      SELECT id, code_mask, amount, note, active, expires_at, redeemed_by, redeemed_at, created_at
      FROM credit_codes
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(boundedLimit).map((row) => ({
      id: row.id,
      codeMask: row.code_mask,
      amount: Number(row.amount),
      note: row.note,
      active: Boolean(row.active),
      redeemed: Boolean(row.redeemed_at),
      redeemedBy: row.redeemed_by,
      redeemedAt: row.redeemed_at ? new Date(Number(row.redeemed_at)).toISOString() : null,
      expiresAt: row.expires_at ? new Date(Number(row.expires_at)).toISOString() : null,
      createdAt: new Date(Number(row.created_at)).toISOString()
    }));
  }

  function disableCreditCode(codeId) {
    const id = String(codeId || '').trim();
    if (!id) throw new StandaloneBillingError('CREDIT_CODE_REQUIRED', 'A CDK id is required.');
    const result = database.prepare('UPDATE credit_codes SET active = 0 WHERE id = ? AND redeemed_at IS NULL').run(id);
    if (!Number(result.changes)) {
      throw new StandaloneBillingError('CREDIT_CODE_NOT_FOUND', 'CDK not found or already redeemed.', { status: 404 });
    }
    return listCreditCodes(500).find((item) => item.id === id) || null;
  }

  function redeemCreditCode({ userId, code } = {}) {
    const settings = getSettings();
    if (!settings.creditsEnabled || !settings.rechargeEnabled || !settings.creditCodeEnabled) {
      throw new StandaloneBillingError('RECHARGE_DISABLED', 'Credit recharge is currently disabled.', { status: 403 });
    }
    const id = ensureAccount(userId);
    const normalizedCode = normalizeCreditCode(code);
    const timestamp = now();
    database.exec('BEGIN IMMEDIATE');
    try {
      const row = database.prepare('SELECT * FROM credit_codes WHERE code_hash = ?').get(hashCreditCode(normalizedCode));
      if (!row) throw new StandaloneBillingError('CREDIT_CODE_INVALID', 'Invalid CDK.');
      if (!Boolean(row.active) || row.redeemed_at) {
        throw new StandaloneBillingError('CREDIT_CODE_USED', 'This CDK has already been used or disabled.', { status: 409 });
      }
      if (row.expires_at && Number(row.expires_at) <= timestamp) {
        throw new StandaloneBillingError('CREDIT_CODE_EXPIRED', 'This CDK has expired.', { status: 410 });
      }
      const account = database.prepare('SELECT * FROM credit_accounts WHERE user_id = ?').get(id);
      const amount = Number(row.amount);
      const nextBalance = Number(account.balance) + amount;
      database.prepare(`
        UPDATE credit_accounts
        SET balance = ?, lifetime_earned = ?, updated_at = ?
        WHERE user_id = ?
      `).run(nextBalance, Number(account.lifetime_earned) + amount, timestamp, id);
      database.prepare(`
        INSERT INTO credit_transactions
          (id, user_id, delta, balance_after, kind, reference_id, metadata_json, created_at)
        VALUES (?, ?, ?, ?, 'credit_code_redeem', ?, ?, ?)
      `).run(
        randomUUID(),
        id,
        amount,
        nextBalance,
        scopedReference(id, `credit-code:${row.id}`),
        JSON.stringify({ amount, codeId: row.id, source: 'credit_code' }),
        timestamp
      );
      database.prepare('UPDATE credit_codes SET active = 0, redeemed_by = ?, redeemed_at = ? WHERE id = ?').run(id, timestamp, row.id);
      database.exec('COMMIT');
      return { amount, codeId: row.id, ...getSummary(id) };
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  function calculateJobCost({ mode, route, count = 1 } = {}) {
    const settings = getSettings();
    if (!settings.creditsEnabled) return { amount: 0, settings };
    const normalizedMode = mode === 'video' ? 'video' : 'image';
    const unit = normalizedMode === 'video'
      ? settings.videoGenerationCost
      : route === 'edits' ? settings.imageEditCost : settings.imageGenerationCost;
    const quantity = normalizedMode === 'video' ? 1 : Math.max(1, Math.min(4, Number(count) || 1));
    return { amount: unit * quantity, unit, quantity, settings };
  }

  function stats() {
    const settings = getSettings();
    const users = database.prepare('SELECT COUNT(*) AS count FROM users').get();
    const activeUsers = database.prepare('SELECT COUNT(*) AS count FROM users WHERE active = 1').get();
    const credits = database.prepare('SELECT COALESCE(SUM(balance), 0) AS balance, COALESCE(SUM(lifetime_spent), 0) AS spent FROM credit_accounts').get();
    const transactions = database.prepare('SELECT COUNT(*) AS count FROM credit_transactions').get();
    return {
      users: Number(users.count),
      activeUsers: Number(activeUsers.count),
      balance: Number(credits.balance),
      spent: Number(credits.spent),
      transactions: Number(transactions.count),
      settings
    };
  }

  function applyDelta({ userId, delta, kind, referenceId, metadata }) {
    const id = ensureAccount(userId);
    const reference = normalizeReference(referenceId);
    const storedReference = scopedReference(id, reference);
    const existing = database.prepare(`
      SELECT balance_after, delta FROM credit_transactions
      WHERE user_id = ? AND reference_id IN (?, ?)
      ORDER BY created_at DESC
      LIMIT 1
    `).get(id, storedReference, reference);
    if (existing) {
      return { charged: Math.max(0, -Number(existing.delta)), ...getSummary(id), referenceId: reference, duplicate: true };
    }
    const timestamp = now();
    database.exec('BEGIN IMMEDIATE');
    try {
      const account = database.prepare('SELECT * FROM credit_accounts WHERE user_id = ?').get(id);
      const currentBalance = Number(account.balance);
      const nextBalance = currentBalance + delta;
      if (nextBalance < 0) {
        throw new StandaloneBillingError('INSUFFICIENT_CREDITS', 'Not enough credits for this generation.', {
          status: 402,
          details: { required: Math.abs(delta), available: currentBalance }
        });
      }
      const lifetime = lifetimeDeltas(kind, delta);
      const earned = Number(account.lifetime_earned) + lifetime.earned;
      const spent = Math.max(0, Number(account.lifetime_spent) + lifetime.spent);
      database.prepare(`
        UPDATE credit_accounts
        SET balance = ?, lifetime_earned = ?, lifetime_spent = ?, updated_at = ?
        WHERE user_id = ?
      `).run(nextBalance, earned, spent, timestamp, id);
      database.prepare(`
        INSERT INTO credit_transactions
          (id, user_id, delta, balance_after, kind, reference_id, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), id, delta, nextBalance, kind, storedReference, JSON.stringify(metadata || {}), timestamp);
      database.exec('COMMIT');
      return { charged: Math.max(0, -delta), delta, ...getSummary(id), referenceId: reference };
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  return Object.freeze({
    getSettings,
    updateSettings,
    ensureAccount,
    grantRegistrationBonus,
    getSummary,
    listTransactions,
    reserveCredits,
    refundCredits,
    adjustCredits,
    createCreditCode,
    listCreditCodes,
    disableCreditCode,
    redeemCreditCode,
    calculateJobCost,
    stats
  });
}

function normalizeSettings(value) {
  return {
    creditsEnabled: Boolean(value.creditsEnabled),
    registrationEnabled: Boolean(value.registrationEnabled),
    registrationBonusCredits: normalizeNonNegative(value.registrationBonusCredits, 'registrationBonusCredits'),
    imageGenerationCost: normalizeNonNegative(value.imageGenerationCost, 'imageGenerationCost'),
    imageEditCost: normalizeNonNegative(value.imageEditCost, 'imageEditCost'),
    videoGenerationCost: normalizeNonNegative(value.videoGenerationCost, 'videoGenerationCost'),
    rechargeEnabled: Boolean(value.rechargeEnabled),
    creditCodeEnabled: Boolean(value.creditCodeEnabled),
    providerBindingEnabled: Boolean(value.providerBindingEnabled),
    rechargeShopUrl: normalizeShopUrl(value.rechargeShopUrl)
  };
}

function normalizeNonNegative(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > MAX_CREDITS) {
    throw new StandaloneBillingError('INVALID_BILLING_SETTING', `${fieldName} must be an integer between 0 and ${MAX_CREDITS}.`);
  }
  return number;
}

function normalizeAmount(value, fieldName) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_CREDITS) {
    throw new StandaloneBillingError('INVALID_CREDIT_AMOUNT', `${fieldName} must be a non-negative integer.`);
  }
  return amount;
}

function normalizePositiveAmount(value, fieldName) {
  const amount = normalizeAmount(value, fieldName);
  if (amount < 1) throw new StandaloneBillingError('INVALID_CREDIT_AMOUNT', `${fieldName} must be greater than 0.`);
  return amount;
}

function normalizeSignedAmount(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_CREDITS) {
    throw new StandaloneBillingError('INVALID_CREDIT_AMOUNT', 'Credit adjustment must be a non-zero integer.');
  }
  return amount;
}

function normalizeUserId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 255) throw new StandaloneBillingError('INVALID_USER_ID', 'A user id is required.');
  return id;
}

function normalizeReference(value) {
  const reference = String(value || '').trim();
  if (!reference || reference.length > 255) throw new StandaloneBillingError('INVALID_CREDIT_REFERENCE', 'A credit reference is required.');
  return reference;
}

function normalizeCreditCode(value) {
  const code = String(value || '').replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{8,64}$/.test(code)) {
    throw new StandaloneBillingError('INVALID_CREDIT_CODE', 'CDK must contain 8 to 64 letters or numbers.');
  }
  return code;
}

function generateCreditCode() {
  return `OHLAO${randomBytes(10).toString('hex').toUpperCase()}`;
}

function hashCreditCode(code) {
  return createHash('sha256').update(normalizeCreditCode(code)).digest('hex');
}

function maskCreditCode(code) {
  const normalized = normalizeCreditCode(code);
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${'*'.repeat(Math.max(4, normalized.length - 8))}`;
}

function normalizeExpiry(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const timestamp = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    throw new StandaloneBillingError('INVALID_CREDIT_CODE_EXPIRY', 'CDK expiry must be a future date.');
  }
  return Math.floor(timestamp);
}

function normalizeShopUrl(value) {
  const raw = String(value || DEFAULT_BILLING_SETTINGS.rechargeShopUrl).trim();
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported');
    return url.toString();
  } catch {
    throw new StandaloneBillingError('INVALID_RECHARGE_URL', 'Recharge shop URL must be an http(s) URL.');
  }
}

function scopedReference(userId, referenceId) {
  return `${userId}:${referenceId}`;
}

function unscopedReference(userId, referenceId) {
  const prefix = `${userId}:`;
  const value = String(referenceId || '');
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function lifetimeDeltas(kind, delta) {
  if (kind === 'generation_charge') return { earned: 0, spent: Math.max(0, -delta) };
  if (kind === 'generation_refund') return { earned: 0, spent: -Math.max(0, delta) };
  if (kind === 'registration_bonus' || kind === 'credit_code_redeem') return { earned: Math.max(0, delta), spent: 0 };
  if (kind === 'admin_adjustment' && delta > 0) return { earned: delta, spent: 0 };
  return { earned: 0, spent: 0 };
}

function serializeSetting(value) {
  return JSON.stringify(value);
}

function parseSetting(value, fallback) {
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function parseMetadata(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
