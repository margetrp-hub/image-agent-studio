import path from 'node:path';

export function createServiceConfig({ scriptsDir, env = process.env, startedAt = Date.now() } = {}) {
  const serviceScriptsDir = scriptsDir || process.cwd();
  const dataDir = path.resolve(env.STUDIO_DATA_DIR || path.join(serviceScriptsDir, '..', '.image-sub2api-studio-data'));
  const libraryDir = path.resolve(env.STUDIO_LIBRARY_DIR || path.join(serviceScriptsDir, '..', 'data'));
  const libraryAssetDir = path.resolve(env.STUDIO_LIBRARY_ASSET_DIR || path.join(libraryDir, 'image-library'));
  const legacyLibraryAssetDir = path.resolve(path.join(libraryDir, 'images'));
  const jobTimeoutMs = Number(env.STUDIO_JOB_TIMEOUT_MS || 45 * 60 * 1000);

  return {
    PORT: Number(env.PORT || env.STUDIO_HISTORY_PORT || 8787),
    HOST: env.HOST || env.STUDIO_HISTORY_HOST || '127.0.0.1',
    DATA_DIR: dataDir,
    LIBRARY_DIR: libraryDir,
    LIBRARY_ASSET_DIR: libraryAssetDir,
    LEGACY_LIBRARY_ASSET_DIR: legacyLibraryAssetDir,
    LIBRARY_ASSET_DIRS: [...new Set([libraryAssetDir, legacyLibraryAssetDir])],
    AUTH_MODE: String(env.STUDIO_AUTH_MODE || 'gateway').toLowerCase(),
    AI_GATEWAY_BASE_URL: String(env.AI_GATEWAY_BASE_URL || env.SUB2API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, ''),
    HISTORY_LIMIT: Number(env.STUDIO_HISTORY_LIMIT || 200),
    SESSION_NODE_LIMIT: Number(env.STUDIO_SESSION_NODE_LIMIT || 80),
    SESSION_URL_LIMIT: Number(env.STUDIO_SESSION_URL_LIMIT || 24),
    SESSION_QUEUE_LIMIT: Number(env.STUDIO_SESSION_QUEUE_LIMIT || 12),
    SESSION_MESSAGE_LIMIT: Number(env.STUDIO_SESSION_MESSAGE_LIMIT || 24),
    SESSION_ASSET_PREFIX: 'session-',
    JOB_LIMIT: Number(env.STUDIO_JOB_LIMIT || 120),
    JOB_TIMEOUT_MS: jobTimeoutMs,
    GATEWAY_FETCH_TIMEOUT_MS: Number(env.STUDIO_GATEWAY_FETCH_TIMEOUT_MS || Math.max(10 * 60 * 1000, jobTimeoutMs - 30 * 1000)),
    JOB_CONCURRENCY: Math.max(1, Math.min(6, Number(env.STUDIO_JOB_CONCURRENCY || 1))),
    JOB_ACTIVE_STATUSES: new Set(['queued', 'dispatching', 'gateway', 'upstream', 'image', 'saving']),
    SERVICE_STARTED_AT: startedAt,
    SERVICE_VERSION: env.npm_package_version || env.STUDIO_VERSION || '1.0.0',
    MAX_BODY_BYTES: Number(env.STUDIO_MAX_BODY_BYTES || 96 * 1024 * 1024),
    MAX_IMAGE_BYTES: Number(env.STUDIO_MAX_IMAGE_BYTES || 32 * 1024 * 1024),
    ALLOWED_ORIGINS: String(env.STUDIO_ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5205,http://localhost:5205,http://127.0.0.1:5174,http://localhost:5174')
      .split(',')
      .map((item) => item.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  };
}
