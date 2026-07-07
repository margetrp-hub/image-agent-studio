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
assert.equal(config.AI_GATEWAY_BASE_URL, 'https://legacy-gateway.example/v1');
assert.equal(config.JOB_CONCURRENCY, 6);
assert.equal(config.SERVICE_STARTED_AT, 12345);
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
    STUDIO_JOB_CONCURRENCY: '0'
  }
});

assert.equal(explicit.AI_GATEWAY_BASE_URL, 'https://new-gateway.example/v1');
assert.equal(explicit.DATA_DIR, path.resolve('D:/studio-data'));
assert.equal(explicit.LIBRARY_DIR, path.resolve('D:/studio-library'));
assert.equal(explicit.JOB_CONCURRENCY, 1);

console.log('Service config contract passed.');
