import type { FastifyInstance } from 'fastify';

import { notificationQueue, outboxQueue, webhookQueue } from './queues.js';

let timer: NodeJS.Timeout | null = null;

export function startOutboxWorker(app: FastifyInstance) {
  if (timer) return;

  timer = setInterval(async () => {
    const events = await app.prisma.outboxEvent.findMany({
      where: { published: false },
      orderBy: { createdAt: 'asc' },
      take: 100
    });

    for (const event of events) {
      if (event.eventType.startsWith('shipment.') || event.eventType.includes('invoice') || event.eventType.includes('ticket')) {
        await notificationQueue.add(event.eventType, event.payload as Record<string, unknown>);
      }
      if (event.eventType.startsWith('webhook.') || event.eventType.includes('status.changed')) {
        await webhookQueue.add(event.eventType, event.payload as Record<string, unknown>);
      }

      await outboxQueue.add(event.eventType, event.payload as Record<string, unknown>);
      await app.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { published: true, publishedAt: new Date() }
      });
    }
  }, 1_000);
}

export function stopOutboxWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
