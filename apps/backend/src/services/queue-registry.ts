import type { Queue } from 'bullmq';
import { agentQueue, analyticsQueue, notificationQueue, outboxQueue, pdfQueue, routeOptimizationQueue, scheduledJobsQueue, webhookQueue } from '../queues/queues.js';
import { dlqNotificationQueue } from '../modules/notifications/notifications.worker.js';
import { dlqOutboxQueue } from '../queues/outbox.worker.js';
import { dlqWebhookQueue } from '../queues/webhook.worker.js';
import { bullQueueBackend, type QueueEntry } from './queue-operations.service.js';

// The BullMQ queues the backend runs (platform.queues, WP-3.6), shared by the queue, health, metrics and badge routes.

export type QueueRegistry = () => QueueEntry[];

function bull(queue: Queue | undefined) {
  return queue ? bullQueueBackend(queue) : null;
}

/** Every BullMQ queue the backend runs, with its dead-letter queue where the worker has one. */
export const defaultQueueRegistry: QueueRegistry = () => {
  const entries: Array<QueueEntry | null> = [
    withBackend('notification', notificationQueue, { queue: dlqNotificationQueue, kind: 'job' }, 'email'),
    withBackend('webhook', webhookQueue, { queue: dlqWebhookQueue, kind: 'job' }, 'webhook.replay'),
    withBackend('outbox', outboxQueue, { queue: dlqOutboxQueue, kind: 'outbox' }),
    withBackend('analytics', analyticsQueue),
    withBackend('pdf', pdfQueue),
    withBackend('scheduled-jobs', scheduledJobsQueue),
    withBackend('route-optimization', routeOptimizationQueue),
    withBackend('fauward-agent-events', agentQueue)
  ];
  return entries.filter((entry): entry is QueueEntry => entry !== null);
};

function withBackend(name: string, queue: Queue | undefined, dlq?: { queue: Queue | undefined; kind: 'job' | 'outbox' }, defaultJobName?: string): QueueEntry | null {
  const backend = bull(queue);
  if (!backend) return null;
  const dlqBackend = dlq ? bull(dlq.queue) : null;
  return { name, backend, ...(dlqBackend && dlq ? { dlq: { backend: dlqBackend, kind: dlq.kind } } : {}), ...(defaultJobName ? { defaultJobName } : {}) };
}
