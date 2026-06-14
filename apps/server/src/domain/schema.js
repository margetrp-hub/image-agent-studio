export const QUEUE_STATUSES = Object.freeze([
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
]);

export const IMAGE_JOB_SCHEMA_VERSION = 'v1';

export function nowIso() {
  return new Date().toISOString();
}

export function isQueueStatus(value) {
  return QUEUE_STATUSES.includes(value);
}

export function normalizeCreateImageJobInput(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('request body must be an object');
  }

  const prompt = normalizeRequiredString(input.prompt, 'prompt');
  const provider = normalizeOptionalString(input.provider, 'provider');
  const metadata = normalizeMetadata(input.metadata);

  return { prompt, provider, metadata };
}

export function createImageJob(input, options = {}) {
  const normalized = normalizeCreateImageJobInput(input);
  const timestamp = options.now || nowIso();

  return {
    id: options.id || createJobId(),
    status: 'queued',
    prompt: normalized.prompt,
    provider: normalized.provider,
    metadata: normalized.metadata,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function assertImageJob(job) {
  if (!job || typeof job !== 'object') {
    throw new TypeError('image job must be an object');
  }

  normalizeRequiredString(job.id, 'id');
  normalizeRequiredString(job.prompt, 'prompt');
  normalizeRequiredString(job.createdAt, 'createdAt');
  normalizeRequiredString(job.updatedAt, 'updatedAt');

  if (!isQueueStatus(job.status)) {
    throw new TypeError(`unsupported queue status: ${job.status}`);
  }

  return job;
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function normalizeOptionalString(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string when provided`);
  }

  return value.trim();
}

function normalizeMetadata(value) {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('metadata must be an object when provided');
  }

  return { ...value };
}

function createJobId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

