import { Queue, type ConnectionOptions } from 'bullmq';
import { URL } from 'node:url';

import { config } from '../config/index.js';

type QueuePayload = Record<string, unknown>;

function buildBullmqConnection(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  const isTls = parsed.protocol === 'rediss:';
  const db = parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.replace('/', '')) : undefined;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    ...(Number.isFinite(db) ? { db } : {}),
    ...(isTls ? { tls: {} } : {})
  };
}

export const bullmqConnection = buildBullmqConnection(config.redisUrl);

export const notificationQueue = new Queue<QueuePayload>('notification', {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 }
  }
});

export const webhookQueue = new Queue<QueuePayload>('webhook', {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 }
  }
});

export const outboxQueue = new Queue<QueuePayload>('outbox', {
  connection: bullmqConnection
});

export const pdfQueue = new Queue<QueuePayload>('pdf', {
  connection: bullmqConnection
});

export const analyticsQueue = new Queue<QueuePayload>('analytics', {
  connection: bullmqConnection
});

export const scheduledJobsQueue = new Queue<QueuePayload>('scheduled-jobs', {
  connection: bullmqConnection
});
