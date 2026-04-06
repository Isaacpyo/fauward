import type { FastifyInstance } from 'fastify';

import { notificationQueue } from '../../queues/queues.js';

let timer: NodeJS.Timeout | null = null;

export function startNotificationWorker(app: FastifyInstance) {
  if (timer) return;

  timer = setInterval(async () => {
    const jobs = notificationQueue.drain(100);
    for (const job of jobs) {
      const tenantId = String(job.data.tenantId ?? '');
      const userId = typeof job.data.userId === 'string' ? job.data.userId : undefined;
      const channel = String(job.data.channel ?? 'EMAIL');
      const event = String(job.data.event ?? job.name);

      if (!tenantId) continue;

      await app.prisma.notificationLog.create({
        data: {
          tenantId,
          userId,
          channel: channel === 'SMS' ? 'SMS' : 'EMAIL',
          event,
          status: 'SENT',
          sentAt: new Date()
        }
      });
    }
  }, 1_000);
}

export function stopNotificationWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
