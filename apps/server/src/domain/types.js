/**
 * @typedef {'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'} QueueStatus
 */

/**
 * @typedef {Object} ImageJob
 * @property {string} id
 * @property {QueueStatus} status
 * @property {string} prompt
 * @property {string} [provider]
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} [startedAt]
 * @property {string} [finishedAt]
 * @property {string} [error]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @typedef {Object} CreateImageJobInput
 * @property {string} prompt
 * @property {string} [provider]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @typedef {Object} StorageAdapter
 * @property {() => Promise<ImageJob[]>} listJobs
 * @property {(id: string) => Promise<ImageJob | null>} getJob
 * @property {(job: ImageJob) => Promise<ImageJob>} putJob
 */

export {};

