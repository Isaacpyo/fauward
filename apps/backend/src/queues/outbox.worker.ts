import type { FastifyInstance } from 'fastify';
import type { OutboxEvent } from '@prisma/client';
import { Queue } from 'bullmq';

import { analyticsQueue, bullmqConnection, notificationQueue, outboxQueue, webhookQueue } from './queues.js';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';
import { activityForOutboxEvent } from '../services/outbox-activity-map.js';
import { publishActivity, recordActivity } from '../services/platform-activity.service.js';

let timer: NodeJS.Timeout | null = null;
let running = false;
export const dlqOutboxQueue = new Queue<Record<string, unknown>>('dlq-outboxQueue', {
  connection: bullmqConnection
});

type OutboxApp = Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>;

/**
 * Console activity projection (D7, WP-2.1). Runs before the event is marked published, so a crash in between re-runs
 * it; the outbox-id dedupe key makes the second run return the existing row.
 */
export async function projectOutboxEventToActivity(app: OutboxApp, event: OutboxEvent) {
  const input = activityForOutboxEvent(event);
  if (!input) return null;
  const activity = await recordActivity(app.prisma, input);
  publishActivity(app.redis, activity, app.log);
  return activity;
}

async function publishEvent(app: OutboxApp, event: OutboxEvent) {
  await projectOutboxEventToActivity(app, event);

  if (event.eventType.startsWith('shipment.') || event.eventType.includes('invoice') || event.eventType.includes('ticket')) {
    await notificationQueue.add(event.eventType, event.payload as Record<string, unknown>);
  }
  if (event.eventType.startsWith('webhook.') || event.eventType.includes('status.changed')) {
    await webhookQueue.add(event.eventType, event.payload as Record<string, unknown>);
  }
  if (event.eventType.includes('shipment.status.updated') || event.eventType.includes('shipment.delivered')) {
    await analyticsQueue.add(event.eventType, event.payload as Record<string, unknown>);
  }

  await outboxQueue.add(event.eventType, event.payload as Record<string, unknown>);
  await app.prisma.outboxEvent.update({
    where: { id: event.id },
    data: { published: true, publishedAt: new Date() }
  });
}

/** One polling pass. Exported for tests; the interval never overlaps passes. */
export async function runOutboxPass(app: OutboxApp) {
  const events = await app.prisma.outboxEvent.findMany({
    where: { published: false },
    orderBy: { createdAt: 'asc' },
    take: 100
  });

  for (const event of events) {
    try {
      await publishEvent(app, event);
    } catch (error) {
      const lockKey = `dlq:outbox:event:${event.id}`;
      const shouldEmitToDlq = await app.redis.set(lockKey, '1', 'EX', 24 * 60 * 60, 'NX');
      if (shouldEmitToDlq === 'OK') {
        await dlqOutboxQueue.add('outbox.publish.failed', {
          outboxEventId: event.id,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload,
          error: error instanceof Error ? error.message : 'Outbox publish failed',
          failedAt: new Date().toISOString()
        });
      }

      app.log.error({ outboxEventId: event.id, eventType: event.eventType, error }, 'Outbox event publish failed');
    }
  }
}

export function startOutboxWorker(app: FastifyInstance) {
  if (timer) return;

  timer = setInterval(() => {
    if (running) return;
    running = true;
    runWithTenantContext(systemContext(), () => runOutboxPass(app))
      .catch((err: unknown) => app.log.error({ err }, 'Outbox polling pass failed'))
      .finally(() => {
        running = false;
      });
  }, 5_000);
}

export async function stopOutboxWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await dlqOutboxQueue.close();
}
