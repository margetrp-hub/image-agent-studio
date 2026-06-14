import { assertImageJob, createImageJob } from '../domain/schema.js';
import { transitionQueueJob } from '../queue/stateMachine.js';

export class HistoryRepository {
  constructor(storage) {
    this.storage = storage;
  }

  async listJobs() {
    return this.storage.listJobs();
  }

  async getJob(id) {
    return this.storage.getJob(id);
  }

  async createJob(input) {
    const job = createImageJob(input);
    return this.storage.putJob(assertImageJob(job));
  }

  async transitionJob(id, status, options = {}) {
    const current = await this.storage.getJob(id);

    if (!current) {
      return null;
    }

    const next = transitionQueueJob(current, status, options);
    return this.storage.putJob(assertImageJob(next));
  }
}

