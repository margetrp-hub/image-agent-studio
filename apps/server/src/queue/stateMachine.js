const ALLOWED_TRANSITIONS = Object.freeze({
  queued: new Set(['running', 'canceled']),
  running: new Set(['succeeded', 'failed', 'canceled']),
  succeeded: new Set([]),
  failed: new Set([]),
  canceled: new Set([]),
});

export function canTransitionQueueStatus(fromStatus, toStatus) {
  return ALLOWED_TRANSITIONS[fromStatus]?.has(toStatus) || false;
}

export function transitionQueueJob(job, toStatus, options = {}) {
  if (!canTransitionQueueStatus(job.status, toStatus)) {
    throw new Error(`cannot transition queue job from ${job.status} to ${toStatus}`);
  }

  const timestamp = options.now || new Date().toISOString();
  const nextJob = {
    ...job,
    status: toStatus,
    updatedAt: timestamp,
  };

  if (toStatus === 'running' && !nextJob.startedAt) {
    nextJob.startedAt = timestamp;
  }

  if (toStatus === 'succeeded' || toStatus === 'failed' || toStatus === 'canceled') {
    nextJob.finishedAt = timestamp;
  }

  if (toStatus === 'failed' && options.error) {
    nextJob.error = String(options.error);
  }

  return nextJob;
}

