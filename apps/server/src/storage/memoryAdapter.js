import { assertImageJob } from '../domain/schema.js';

export function createMemoryStorageAdapter(seedJobs = []) {
  const jobsById = new Map();

  for (const job of seedJobs) {
    const checkedJob = assertImageJob(job);
    jobsById.set(checkedJob.id, { ...checkedJob });
  }

  return {
    async listJobs() {
      return [...jobsById.values()]
        .map((job) => ({ ...job }))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },

    async getJob(id) {
      const job = jobsById.get(id);
      return job ? { ...job } : null;
    },

    async putJob(job) {
      const checkedJob = assertImageJob(job);
      jobsById.set(checkedJob.id, { ...checkedJob });
      return { ...checkedJob };
    },
  };
}

