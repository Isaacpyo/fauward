import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { analyticsQueue, notificationQueue, outboxQueue, scheduledJobsQueue, webhookQueue } from '../../../queues/queues.js';
import { dlqNotificationQueue } from '../../notifications/notifications.worker.js';
import { dlqOutboxQueue } from '../../../queues/outbox.worker.js';
import { dlqWebhookQueue } from '../../../queues/webhook.worker.js';
import { webhooksService } from '../../webhooks/webhooks.service.js';
import { presentConsoleGateway } from '../../../services/tenant-payment-gateway.service.js';

const gatewayListQuery = z.object({
  status: z.enum(['UNVERIFIED', 'VERIFIED', 'FAILED', 'DISABLED']).optional(),
  provider: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional()
});

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

  // L11 (WP-2.12): tenant payment gateways across tenants — provider, mode, status, last error; never secrets.
  app.get('/api/internal/integrations/tenant-gateways', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.integrations.read')] }, async (request, reply) => {
    const parsed = gatewayListQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const rows = await app.prisma.tenantPaymentGateway.findMany({
      where: { ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.provider ? { provider: parsed.data.provider.toUpperCase() } : {}), ...(parsed.data.tenantId ? { tenantId: parsed.data.tenantId } : {}) },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 500
    });
    return reply.send({ data: rows.map((row) => ({ id: row.id, tenant: row.tenant, ...presentConsoleGateway(row) })) });
  });

  // Dead-lettered tenant webhook deliveries across tenants (was GET /api/v1/platform/webhooks/failures, tenant SUPER_ADMIN).
  app.get('/api/internal/integrations/webhooks/failures', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.integrations.read')] }, async (_request, reply) => {
    return reply.send({ failures: await webhooksService.platformFailures(app.prisma) });
  });
}
