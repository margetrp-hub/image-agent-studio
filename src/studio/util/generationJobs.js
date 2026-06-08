const ACTIVE_SERVER_JOB_STATUSES = new Set(['queued', 'dispatching', 'upstream', 'saving']);
const FINAL_SERVER_JOB_STATUSES = new Set(['succeeded', 'failed', 'unknown', 'canceled']);
const QUEUE_STATUSES = new Set(['queued', 'running', 'failed', 'canceled', 'unknown', 'done']);

export function normalizeQueueStatus(status, fallback = 'queued') {
  const value = String(status || '').trim();
  return QUEUE_STATUSES.has(value) ? value : fallback;
}

export function isActiveServerJobStatus(status) {
  return ACTIVE_SERVER_JOB_STATUSES.has(String(status || ''));
}

export function isFinalServerJobStatus(status) {
  return FINAL_SERVER_JOB_STATUSES.has(String(status || ''));
}

export function queueStatusFromServerJob(job) {
  const status = String(job?.status || job?.stage || '').trim();
  if (status === 'succeeded') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'canceled') return 'canceled';
  if (status === 'unknown') return 'unknown';
  if (status === 'queued' || status === 'dispatching') return 'queued';
  return 'running';
}

export function isVisibleServerJob(job) {
  return isActiveServerJobStatus(job?.status)
    || ['failed', 'unknown', 'canceled'].includes(String(job?.status || ''));
}

export function isRestorableQueueItem(item) {
  const status = normalizeQueueStatus(item?.status, '');
  return Boolean(
    item?.serverJobId
    && (item.remote || status === 'running' || status === 'queued')
    && !['failed', 'canceled', 'unknown', 'done'].includes(status)
  );
}

export function normalizeServerJobError(job) {
  const error = job?.error && typeof job.error === 'object' ? job.error : {};
  const requestIds = Array.isArray(job?.requestIds) ? job.requestIds.filter(Boolean) : [];
  const requestId = error.requestId || requestIds[0] || '';
  const message = error.message || (job?.status === 'unknown'
    ? 'GENERATION_JOB_UNKNOWN'
    : job?.status === 'canceled'
      ? 'JOB_CANCELED'
      : '');
  if (!message && !error.code && !error.status && !requestId) return null;
  return {
    code: String(error.code || job?.status || '').slice(0, 120),
    status: error.status || null,
    requestId: String(requestId).slice(0, 160),
    message: String(message).slice(0, 1200)
  };
}
