import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';

import { analyticsQueue, bullmqConnection, notificationQueue, outboxQueue, webhookQueue } from './queues.js';

let timer: NodeJS.Timeout | null = null;
export const dlqOutboxQueue = new Queue<Record<string, unknown>>('dlq:outboxQueue', {
  connection: bullmqConnection
});

export function startOutboxWorker(app: FastifyInstance) {
  if (timer) return;

  timer = setInterval(async () => {
    const events = await app.prisma.outboxEvent.findMany({
      where: { published: false },
      orderBy: { createdAt: 'asc' },
      take: 100
    });

    for (const event of events) {
      try {
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

        app.log.error(
          {
            outboxEventId: event.id,
            eventType: event.eventType,
            error
          },
          'Outbox event publish failed'
        );
      }
    }
  }, 1_000);
}

export async function stopOutboxWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await dlqOutboxQueue.close();
}
