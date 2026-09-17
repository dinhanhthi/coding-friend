export class RenderQueue {
  constructor(onError) {
    this.jobs = [];
    this.onError = onError;
  }

  push(job) {
    this.jobs.push(job);
  }

  async drain() {
    const done = [];
    while (this.jobs.length > 0) {
      const job = this.jobs.shift();
      try {
        done.push(await job.run());
      } catch (error) {
        this.onError({ id: job.id });
        throw error;
      }
    }
    return done;
  }

  clear() {
    this.jobs = [];
  }

  get size() {
    return this.jobs.length;
  }
}
