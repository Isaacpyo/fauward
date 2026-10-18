import type { FastifyInstance } from 'fastify';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { analyticsQueue, notificationQueue, outboxQueue, scheduledJobsQueue, webhookQueue } from '../../../queues/queues.js';
import { dlqNotificationQueue } from '../../notifications/notifications.worker.js';
import { dlqOutboxQueue } from '../../../queues/outbox.worker.js';
import { dlqWebhookQueue } from '../../../queues/webhook.worker.js';
import { webhooksService } from '../../webhooks/webhooks.service.js';

// platform.queues, platform.health and dead-lettered webhook deliveries (moved from /api/v1/platform in WP-1.1).

const COUNT_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const;

export async function registerConsoleOperationsRoutes(app: FastifyInstance) {
  app.get('/api/internal/queues', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.queues.read')] }, async (_request, reply) => {
    const queues = [
      ['notification', notificationQueue],
      ['webhook', webhookQueue],
      ['outbox', outboxQueue],
      ['analytics', analyticsQueue],
      ['scheduled-jobs', scheduledJobsQueue]
    ] as const;
    const [counts, dlqNotification, dlqWebhook, dlqOutbox] = await Promise.all([
      Promise.all(queues.map(([, queue]) => queue.getJobCounts(...COUNT_STATES))),
      dlqNotificationQueue.getJobCounts(...COUNT_STATES),
      dlqWebhookQueue.getJobCounts(...COUNT_STATES),
      dlqOutboxQueue.getJobCounts(...COUNT_STATES)
    ]);
    return reply.send({
      queues: queues.map(([name], index) => {
        const stats = counts[index];
        return { name, waiting: stats.waiting + stats.delayed, active: stats.active, completed: stats.completed, failed: stats.failed, lastProcessedAt: null };
      }),
      dlq: {
        notification: dlqNotification.waiting + dlqNotification.delayed + dlqNotification.active,
        webhook: dlqWebhook.waiting + dlqWebhook.delayed + dlqWebhook.active,
        outbox: dlqOutbox.waiting + dlqOutbox.delayed + dlqOutbox.active
      }
    });
  });

  app.get('/api/internal/health', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.health.read')] }, async (_request, reply) => {
    const startedDb = Date.now();
    await app.prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - startedDb;
    const startedRedis = Date.now();
    await app.redis.ping();
    const redisLatencyMs = Date.now() - startedRedis;
    return reply.send({ dbLatencyMs, redisLatencyMs, uptimeSeconds: Math.floor(process.uptime()) });
  });

  // Dead-lettered tenant webhook deliveries across tenants (was GET /api/v1/platform/webhooks/failures, tenant SUPER_ADMIN).
  app.get('/api/internal/integrations/webhooks/failures', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.integrations.read')] }, async (_request, reply) => {
    return reply.send({ failures: await webhooksService.platformFailures(app.prisma) });
  });
}
