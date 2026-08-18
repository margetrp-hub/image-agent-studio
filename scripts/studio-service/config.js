import path from 'node:path';

export function createServiceConfig({ scriptsDir, env = process.env, startedAt = Date.now() } = {}) {
  const serviceScriptsDir = scriptsDir || process.cwd();
  const dataDir = path.resolve(env.STUDIO_DATA_DIR || path.join(serviceScriptsDir, '..', '.image-sub2api-studio-data'));
  const libraryDir = path.resolve(env.STUDIO_LIBRARY_DIR || path.join(serviceScriptsDir, '..', 'data'));
  const libraryAssetDir = path.resolve(env.STUDIO_LIBRARY_ASSET_DIR || path.join(libraryDir, 'image-library'));
  const legacyLibraryAssetDir = path.resolve(path.join(libraryDir, 'images'));
  const jobTimeoutMs = Number(env.STUDIO_JOB_TIMEOUT_MS || 45 * 60 * 1000);
  const authDatabasePath = path.resolve(env.STUDIO_AUTH_DB_PATH || path.join(dataDir, 'auth.sqlite'));
  const authMode = String(env.STUDIO_AUTH_MODE || 'gateway').trim().toLowerCase();
  if (!['gateway', 'local', 'standalone'].includes(authMode)) {
    throw new TypeError(`Unsupported STUDIO_AUTH_MODE: ${authMode || '<empty>'}`);
  }
  const authRegistrationMode = String(env.STUDIO_AUTH_REGISTRATION_MODE || 'open').trim().toLowerCase();
  if (!['open', 'disabled'].includes(authRegistrationMode)) {
    throw new TypeError(`Unsupported STUDIO_AUTH_REGISTRATION_MODE: ${authRegistrationMode || '<empty>'}`);
  }
  const providerBaseUrl = String(env.STUDIO_PROVIDER_BASE_URL || '').trim().replace(/\/+$/, '');
  const embedGatewayBaseUrl = String(env.STUDIO_EMBED_GATEWAY_BASE_URL || '').trim().replace(/\/+$/, '');
  const embedOrigins = String(env.STUDIO_EMBED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const creditsEnabled = String(env.STUDIO_CREDITS_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  const userProviderOnly = String(env.STUDIO_USER_PROVIDER_ONLY ?? 'true').trim().toLowerCase() === 'true';
  const allowPrivateProviderUrls = String(env.STUDIO_ALLOW_PRIVATE_PROVIDER_URLS ?? 'false').trim().toLowerCase() === 'true';

  return {
    PORT: Number(env.PORT || env.STUDIO_HISTORY_PORT || 8787),
    HOST: env.HOST || env.STUDIO_HISTORY_HOST || '127.0.0.1',
    DATA_DIR: dataDir,
    LIBRARY_DIR: libraryDir,
    LIBRARY_ASSET_DIR: libraryAssetDir,
    LEGACY_LIBRARY_ASSET_DIR: legacyLibraryAssetDir,
    LIBRARY_ASSET_DIRS: [...new Set([libraryAssetDir, legacyLibraryAssetDir])],
    AUTH_MODE: authMode,
    AUTH_REGISTRATION_MODE: authRegistrationMode,
    AUTH_DATABASE_PATH: authDatabasePath,
    AUTH_SESSION_TTL_MS: Number(env.STUDIO_AUTH_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000),
    AUTH_PASSWORD_MIN_LENGTH: Number(env.STUDIO_AUTH_PASSWORD_MIN_LENGTH || 8),
    AUTH_PASSWORD_ITERATIONS: Number(env.STUDIO_AUTH_PASSWORD_ITERATIONS || 600_000),
    AUTH_LOGIN_MAX_FAILURES: Number(env.STUDIO_AUTH_LOGIN_MAX_FAILURES || 5),
    AUTH_LOGIN_FAILURE_WINDOW_MS: Number(env.STUDIO_AUTH_LOGIN_FAILURE_WINDOW_MS || 15 * 60 * 1000),
    AUTH_GLOBAL_LOGIN_MAX_ATTEMPTS: Number(env.STUDIO_AUTH_GLOBAL_LOGIN_MAX_ATTEMPTS || 120),
    AUTH_LOGIN_MAX_CONCURRENCY: Number(env.STUDIO_AUTH_LOGIN_MAX_CONCURRENCY || 4),
    AUTH_LOGIN_MAX_BODY_BYTES: Number(env.STUDIO_AUTH_LOGIN_MAX_BODY_BYTES || 16 * 1024),
    CREDITS_ENABLED: creditsEnabled,
    USER_PROVIDER_ONLY: userProviderOnly,
    STUDIO_MASTER_KEY: String(env.STUDIO_MASTER_KEY || '').trim(),
    ALLOW_PRIVATE_PROVIDER_URLS: allowPrivateProviderUrls,
    AI_GATEWAY_BASE_URL: String(env.AI_GATEWAY_BASE_URL || env.SUB2API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, ''),
    STUDIO_EMBED_GATEWAY_BASE_URL: embedGatewayBaseUrl,
    STUDIO_EMBED_ORIGINS: embedOrigins,
    PROVIDER_BASE_URL: providerBaseUrl,
    PROVIDER_API_KEY: String(env.STUDIO_PROVIDER_API_KEY || ''),
    PROVIDER_TYPE: String(env.STUDIO_PROVIDER_TYPE || 'openai-compatible').trim().toLowerCase(),
    PROVIDER_CHAT_MODEL: String(env.STUDIO_PROVIDER_CHAT_MODEL || '').trim(),
    HISTORY_LIMIT: Number(env.STUDIO_HISTORY_LIMIT || 200),
    SESSION_NODE_LIMIT: Number(env.STUDIO_SESSION_NODE_LIMIT || 80),
    SESSION_URL_LIMIT: Number(env.STUDIO_SESSION_URL_LIMIT || 24),
    SESSION_QUEUE_LIMIT: Math.max(0, Math.floor(Number(env.STUDIO_SESSION_QUEUE_LIMIT ?? 0) || 0)),
    SESSION_MESSAGE_LIMIT: Number(env.STUDIO_SESSION_MESSAGE_LIMIT || 24),
    SESSION_ASSET_PREFIX: 'session-',
    JOB_LIMIT: Math.max(0, Math.floor(Number(env.STUDIO_JOB_LIMIT ?? 0) || 0)),
    JOB_TIMEOUT_MS: jobTimeoutMs,
    GATEWAY_FETCH_TIMEOUT_MS: Number(env.STUDIO_GATEWAY_FETCH_TIMEOUT_MS || Math.max(10 * 60 * 1000, jobTimeoutMs - 30 * 1000)),
    JOB_CONCURRENCY: Math.max(0, Math.floor(Number(env.STUDIO_JOB_CONCURRENCY ?? 0) || 0)),
    JOB_ACTIVE_STATUSES: new Set(['queued', 'dispatching', 'gateway', 'upstream', 'image', 'video', 'saving']),
    VIDEO_POLL_INTERVAL_MS: Math.max(100, Number(env.STUDIO_VIDEO_POLL_INTERVAL_MS || 4000)),
    VIDEO_POLL_MAX_TRANSIENT_FAILURES: Math.max(1, Number(env.STUDIO_VIDEO_POLL_MAX_TRANSIENT_FAILURES || 450)),
    SERVICE_STARTED_AT: startedAt,
    SERVICE_VERSION: env.STUDIO_VERSION || env.npm_package_version || '1.0.0',
    MAX_BODY_BYTES: Number(env.STUDIO_MAX_BODY_BYTES || 96 * 1024 * 1024),
    MAX_IMAGE_BYTES: Number(env.STUDIO_MAX_IMAGE_BYTES || 32 * 1024 * 1024),
    MAX_VIDEO_BYTES: Number(env.STUDIO_MAX_VIDEO_BYTES || 256 * 1024 * 1024),
    ALLOWED_ORIGINS: String(env.STUDIO_ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5205,http://localhost:5205,http://127.0.0.1:5174,http://localhost:5174')
      .split(',')
      .map((item) => item.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  };
}
