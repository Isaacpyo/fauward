import type { FastifyInstance } from 'fastify';
import { TenantPlan, TenantStatus } from '@prisma/client';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { signAccessToken } from '../../shared/utils/jwt.js';
import { dlqNotificationQueue } from '../notifications/notifications.worker.js';
import { analyticsQueue, notificationQueue, outboxQueue, scheduledJobsQueue, webhookQueue } from '../../queues/queues.js';
import { dlqOutboxQueue } from '../../queues/outbox.worker.js';
import { dlqWebhookQueue } from '../../queues/webhook.worker.js';
import { listRegionChangeRequests, updateRegionChangeRequestStatus } from '../regions/region-change-requests.store.js';

export async function registerSuperAdminRoutes(app: FastifyInstance) {
  const preHandlers = [authenticate, requireRole(['SUPER_ADMIN'])];

  app.get('/api/v1/admin/tenants', { preHandler: preHandlers }, async (request, reply) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      search?: string;
      plan?: string;
      status?: string;
    };

    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));

    const where = {
      name: query.search
        ? { contains: query.search, mode: 'insensitive' as const }
        : undefined,
      plan: query.plan ? (query.plan as TenantPlan) : undefined,
      status: query.status ? (query.status as TenantStatus) : undefined
    };

    const [tenants, total] = await Promise.all([
      app.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          shipments: {
            where: {
              createdAt: { gte: new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) }
            },
            select: { id: true }
          },
          subscription: true
        }
      }),
      app.prisma.tenant.count({ where })
    ]);

    reply.send({
      data: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        status: tenant.status,
        shipmentCountThisMonth: tenant.shipments.length,
        mrrContribution: Number(tenant.subscription?.plan === 'ENTERPRISE' ? 500 : tenant.plan === 'PRO' ? 79 : 29)
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  });

  app.get('/api/v1/admin/tenants/:id', { preHandler: preHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const tenant = await app.prisma.tenant.findUnique({
      where: { id },
      include: {
        settings: true,
        usageRecords: { orderBy: { updatedAt: 'desc' }, take: 6 },
        subscription: true,
        users: { take: 20, orderBy: { createdAt: 'desc' } },
        shipments: { take: 20, orderBy: { createdAt: 'desc' } }
      }
    });

    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    reply.send({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      status: tenant.status,
      branding: {
        logoUrl: tenant.logoUrl,
        primaryColor: tenant.primaryColor,
        accentColor: tenant.accentColor,
        brandName: tenant.brandName
      },
      settings: tenant.settings,
      usage: tenant.usageRecords,
      subscription: tenant.subscription,
      staffCount: tenant.users.length,
      recentShipments: tenant.shipments
    });
  });

  app.patch('/api/v1/admin/tenants/:id/plan', { preHandler: preHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = request.body as { plan?: TenantPlan; reason?: string };

    if (!payload.plan) return reply.status(400).send({ error: 'plan is required' });

    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const updated = await app.prisma.$transaction(async (tx) => {
      const next = await tx.tenant.update({
        where: { id: tenant.id },
        data: { plan: payload.plan }
      });

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: request.user?.sub,
          actorType: 'SUPER_ADMIN',
          action: 'TENANT_PLAN_OVERRIDE',
          resourceType: 'TENANT',
          resourceId: tenant.id,
          metadata: {
            previousPlan: tenant.plan,
            nextPlan: payload.plan,
            reason: payload.reason ?? null
          }
        }
      });

      return next;
    });

    reply.send(updated);
  });

  app.post('/api/v1/admin/tenants/:id/suspend', { preHandler: preHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = request.body as { reason?: string };

    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const updated = await app.prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: 'SUSPENDED' }
    });

    await app.prisma.notificationLog.create({
      data: {
        tenantId: tenant.id,
        channel: 'EMAIL',
        event: 'tenant_suspended',
        status: 'QUEUED',
        error: payload.reason
      }
    });

    reply.send(updated);
  });

  app.post('/api/v1/admin/tenants/:id/unsuspend', { preHandler: preHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const updated = await app.prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: 'ACTIVE' }
    });

    await app.prisma.notificationLog.create({
      data: {
        tenantId: tenant.id,
        channel: 'EMAIL',
        event: 'tenant_unsuspended',
        status: 'QUEUED'
      }
    });

    reply.send(updated);
  });

  app.post('/api/v1/admin/tenants/:id/impersonate', { preHandler: preHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const targetUser = await app.prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'TENANT_ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' }
    });

    if (!targetUser) return reply.status(404).send({ error: 'No tenant admin user found for impersonation' });

    const token = signAccessToken({
      sub: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      plan: tenant.plan,
      mfaVerified: true,
      impersonator: request.user?.sub
    });

    await app.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: request.user?.sub,
        actorType: 'SUPER_ADMIN',
        action: 'TENANT_IMPERSONATION_START',
        resourceType: 'TENANT',
        resourceId: tenant.id,
        metadata: {
          impersonatedUserId: targetUser.id
        }
      }
    });

    await app.redis.set(`impersonation:${token}`, '1', 'EX', 30 * 60);

    reply.send({ token, expiresInSeconds: 30 * 60 });
  });

  app.delete('/api/v1/admin/impersonate', { preHandler: preHandlers }, async (request, reply) => {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      await app.redis.del(`impersonation:${token}`);
    }
    reply.status(204).send();
  });

  app.get('/api/v1/admin/metrics', { preHandler: preHandlers }, async (_request, reply) => {
    const [activeTenantCount, shipmentsToday, dlqNotificationStats, dlqWebhookStats, dlqOutboxStats, subscriptions] = await Promise.all([
      app.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      app.prisma.shipment.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      dlqNotificationQueue.getJobCounts('waiting', 'active', 'delayed'),
      dlqWebhookQueue.getJobCounts('waiting', 'active', 'delayed'),
      dlqOutboxQueue.getJobCounts('waiting', 'active', 'delayed'),
      app.prisma.subscription.findMany()
    ]);

    const mrr = subscriptions.reduce((sum, sub) => {
      if (sub.plan === 'ENTERPRISE') return sum + 500;
      if (sub.plan === 'PRO') return sum + 79;
      if (sub.plan === 'STARTER') return sum + 29;
      return sum;
    }, 0);
    const dlqDepth =
      dlqNotificationStats.waiting +
      dlqNotificationStats.active +
      dlqNotificationStats.delayed +
      dlqWebhookStats.waiting +
      dlqWebhookStats.active +
      dlqWebhookStats.delayed +
      dlqOutboxStats.waiting +
      dlqOutboxStats.active +
      dlqOutboxStats.delayed;

    reply.send({
      totalMRR: mrr,
      activeTenantCount,
      shipmentsToday,
      dlqDepth
    });
  });

  app.get('/api/v1/admin/region-change-requests', { preHandler: preHandlers }, async (_request, reply) => {
    reply.send({
      requests: listRegionChangeRequests(),
      regions: [
        { key: 'africa', label: 'Africa', paymentProviders: ['Paystack', 'Flutterwave', 'Bank transfer', 'COD'] },
        { key: 'europe', label: 'Europe', paymentProviders: ['Stripe', 'Bank transfer'] },
        { key: 'northAmerica', label: 'North America', paymentProviders: ['Stripe', 'Bank transfer'] },
        { key: 'global', label: 'Global', paymentProviders: ['Stripe', 'Paystack', 'Flutterwave', 'Bank transfer'] }
      ]
    });
  });

  app.patch('/api/v1/admin/region-change-requests/:id', { preHandler: preHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status?: 'APPROVED' | 'REJECTED' };

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      return reply.status(400).send({ error: 'status must be APPROVED or REJECTED' });
    }

    const regionRequest = updateRegionChangeRequestStatus(id, status, request.user?.email ?? 'Super admin');
    if (!regionRequest) return reply.status(404).send({ error: 'Region change request not found' });

    reply.send({ request: regionRequest });
  });

  app.get('/api/v1/admin/queues', { preHandler: preHandlers }, async (_request, reply) => {
    const [notificationStats, webhookStats, outboxStats, analyticsStats, scheduledStats, dlqNotificationStats, dlqWebhookStats, dlqOutboxStats] = await Promise.all([
      notificationQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      webhookQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      outboxQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      analyticsQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      scheduledJobsQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      dlqNotificationQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      dlqWebhookQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      dlqOutboxQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
    ]);

    reply.send({
      queues: [
        {
          name: 'notification',
          waiting: notificationStats.waiting + notificationStats.delayed,
          active: notificationStats.active,
          completed: notificationStats.completed,
          failed: notificationStats.failed,
          lastProcessedAt: null
        },
        {
          name: 'webhook',
          waiting: webhookStats.waiting + webhookStats.delayed,
          active: webhookStats.active,
          completed: webhookStats.completed,
          failed: webhookStats.failed,
          lastProcessedAt: null
        },
        {
          name: 'outbox',
          waiting: outboxStats.waiting + outboxStats.delayed,
          active: outboxStats.active,
          completed: outboxStats.completed,
          failed: outboxStats.failed,
          lastProcessedAt: null
        },
        {
          name: 'analytics',
          waiting: analyticsStats.waiting + analyticsStats.delayed,
          active: analyticsStats.active,
          completed: analyticsStats.completed,
          failed: analyticsStats.failed,
          lastProcessedAt: null
        },
        {
          name: 'scheduled-jobs',
          waiting: scheduledStats.waiting + scheduledStats.delayed,
          active: scheduledStats.active,
          completed: scheduledStats.completed,
          failed: scheduledStats.failed,
          lastProcessedAt: null
        }
      ],
      dlq: {
        notification: dlqNotificationStats.waiting + dlqNotificationStats.delayed + dlqNotificationStats.active,
        webhook: dlqWebhookStats.waiting + dlqWebhookStats.delayed + dlqWebhookStats.active,
        outbox: dlqOutboxStats.waiting + dlqOutboxStats.delayed + dlqOutboxStats.active
      }
    });
  });

  app.get('/api/v1/admin/health', { preHandler: preHandlers }, async (_request, reply) => {
    const startedDb = Date.now();
    await app.prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - startedDb;

    const startedRedis = Date.now();
    await app.redis.ping();
    const redisLatencyMs = Date.now() - startedRedis;

    reply.send({
      dbLatencyMs,
      redisLatencyMs,
      uptimeSeconds: Math.floor(process.uptime())
    });
  });
}
