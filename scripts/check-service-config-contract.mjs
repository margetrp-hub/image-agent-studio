import assert from 'node:assert/strict';
import path from 'node:path';
import { createServiceConfig } from './studio-service/config.js';

const scriptsDir = path.resolve('scripts');
const config = createServiceConfig({
  scriptsDir,
  startedAt: 12345,
  env: {
    SUB2API_BASE_URL: 'https://legacy-gateway.example/v1/',
    STUDIO_JOB_CONCURRENCY: '99',
    STUDIO_ALLOWED_ORIGINS: 'http://localhost:5205/, https://studio.example.com/'
  }
});

assert.equal(config.PORT, 8787);
assert.equal(config.HOST, '127.0.0.1');
assert.equal(config.DATA_DIR, path.resolve(scriptsDir, '..', '.image-sub2api-studio-data'));
assert.equal(config.LIBRARY_DIR, path.resolve(scriptsDir, '..', 'data'));
assert.equal(config.AUTH_DATABASE_PATH, path.resolve(scriptsDir, '..', '.image-sub2api-studio-data', 'auth.sqlite'));
assert.equal(config.AUTH_REGISTRATION_MODE, 'open');
assert.equal(config.AUTH_LOGIN_MAX_BODY_BYTES, 16 * 1024);
assert.equal(config.AI_GATEWAY_BASE_URL, 'https://legacy-gateway.example/v1');
assert.equal(config.JOB_CONCURRENCY, 6);
assert.equal(config.SERVICE_STARTED_AT, 12345);
const deployedVersion = createServiceConfig({
  scriptsDir,
  env: { STUDIO_VERSION: '1.0.2', npm_package_version: '1.0.0' }
});
assert.equal(deployedVersion.SERVICE_VERSION, '1.0.2');
assert.deepEqual(config.ALLOWED_ORIGINS, ['http://localhost:5205', 'https://studio.example.com']);
assert.ok(config.JOB_ACTIVE_STATUSES.has('queued'));
assert.ok(config.JOB_ACTIVE_STATUSES.has('saving'));

const explicit = createServiceConfig({
  scriptsDir,
  env: {
    AI_GATEWAY_BASE_URL: 'https://new-gateway.example/v1/',
    SUB2API_BASE_URL: 'https://legacy-gateway.example/v1/',
    STUDIO_DATA_DIR: 'D:/studio-data',
    STUDIO_LIBRARY_DIR: 'D:/studio-library',
    STUDIO_AUTH_DB_PATH: 'D:/studio-auth/auth.sqlite',
    STUDIO_AUTH_REGISTRATION_MODE: 'disabled',
    STUDIO_AUTH_LOGIN_MAX_CONCURRENCY: '2',
    STUDIO_PROVIDER_BASE_URL: 'https://provider.example/v1/',
    STUDIO_PROVIDER_API_KEY: 'server-secret',
    STUDIO_PROVIDER_CHAT_MODEL: 'chat-model',
    STUDIO_JOB_CONCURRENCY: '0'
  }
});

assert.equal(explicit.AI_GATEWAY_BASE_URL, 'https://new-gateway.example/v1');
assert.equal(explicit.DATA_DIR, path.resolve('D:/studio-data'));
assert.equal(explicit.LIBRARY_DIR, path.resolve('D:/studio-library'));
assert.equal(explicit.AUTH_DATABASE_PATH, path.resolve('D:/studio-auth/auth.sqlite'));
assert.equal(explicit.AUTH_REGISTRATION_MODE, 'disabled');
assert.equal(explicit.AUTH_LOGIN_MAX_CONCURRENCY, 2);
assert.equal(explicit.PROVIDER_BASE_URL, 'https://provider.example/v1');
assert.equal(explicit.PROVIDER_API_KEY, 'server-secret');
assert.equal(explicit.PROVIDER_CHAT_MODEL, 'chat-model');
assert.equal(explicit.JOB_CONCURRENCY, 1);

assert.throws(() => createServiceConfig({ scriptsDir, env: { STUDIO_AUTH_MODE: 'typo' } }), /Unsupported STUDIO_AUTH_MODE/);
assert.throws(() => createServiceConfig({ scriptsDir, env: { STUDIO_AUTH_REGISTRATION_MODE: 'invite-only' } }), /Unsupported STUDIO_AUTH_REGISTRATION_MODE/);

console.log('Service config contract passed.');
