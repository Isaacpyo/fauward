export type QueueJob<T = unknown> = {
  id: string;
  name: string;
  data: T;
  createdAt: Date;
};

class InMemoryQueue<T = unknown> {
  private jobs: QueueJob<T>[] = [];

  constructor(private readonly queueName: string) {}

  async add(name: string, data: T) {
    const job: QueueJob<T> = {
      id: crypto.randomUUID(),
      name,
      data,
      createdAt: new Date()
    };
    this.jobs.push(job);
    return job;
  }

  drain(max = 50) {
    const slice = this.jobs.slice(0, max);
    this.jobs = this.jobs.slice(max);
    return slice;
  }

  stats() {
    return {
      name: this.queueName,
      waiting: this.jobs.length
    };
  }
}

export const notificationQueue = new InMemoryQueue<Record<string, unknown>>('notification');
export const webhookQueue = new InMemoryQueue<Record<string, unknown>>('webhook');
export const outboxQueue = new InMemoryQueue<Record<string, unknown>>('outbox');
