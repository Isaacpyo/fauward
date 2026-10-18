import type { FastifyInstance, FastifyRequest } from 'fastify';
import { TenantPlan, TenantStatus } from '@prisma/client';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requireFreshPlatformMfa } from '../../middleware/require-fresh-platform-mfa.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { requirePlatformReason } from '../../middleware/require-platform-reason.js';
import { requireAnyPlatformPermission, requirePlatformPermission } from '../../middleware/require-platform-permission.js';
import { permissionsForPlatformRole } from '../../services/platform-permission.service.js';
import { writePlatformAuditLog, verifyPlatformAuditChain } from '../../services/platform-audit.service.js';
import { redactPlatformLogValue } from '../../services/platform-redaction.service.js';
import { resolveEffectiveTenantPlan } from '../../services/platform-plan-override.service.js';
import { platformUserHasConsolePermission } from '../../services/staff-iam.service.js';
import {
  WRITE_SCOPE_MIN_REASON,
  createExchangeCode,
  impersonationActiveKey,
  impersonationDurationMinutes,
  impersonationPortalUrl,
  parseImpersonationScopes
} from '../../services/impersonation.service.js';
import { analyticsQueue, notificationQueue, outboxQueue, scheduledJobsQueue, webhookQueue } from '../../queues/queues.js';
import { dlqNotificationQueue } from '../notifications/notifications.worker.js';
import { dlqOutboxQueue } from '../../queues/outbox.worker.js';
import { dlqWebhookQueue } from '../../queues/webhook.worker.js';
import { listRegionChangeRequests, updateRegionChangeRequestStatus } from '../regions/region-change-requests.store.js';

const supportedRegions = new Set(['africa', 'europe', 'northAmerica', 'global', 'uk_europe']);

function ipAddress(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return request.ip;
}

function userAgent(request: FastifyRequest) {
  return typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null;
}

function reasonFrom(request: FastifyRequest) {
  const reason = (request.body as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' ? reason.trim() : null;
}

function authPre(permission?: Parameters<typeof requirePlatformPermission>[0]) {
  const handlers = [authenticatePlatformSession];
  if (permission) handlers.push(requirePlatformPermission(permission));
  return handlers;
}

function dangerousPre(permission: Parameters<typeof requirePlatformPermission>[0]) {
  return [authenticatePlatformSession, requirePlatformCsrf, requirePlatformPermission(permission), requireFreshPlatformMfa, requirePlatformReason];
}

export async function registerPlatformRoutes(app: FastifyInstance) {
  app.get('/api/v1/platform/tenants', { preHandler: authPre('tenant:read') }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; search?: string; plan?: string; status?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const where = {
      name: query.search ? { contains: query.search, mode: 'insensitive' as const } : undefined,
      plan: query.plan ? (query.plan as TenantPlan) : undefined,
      status: query.status ? (query.status as TenantStatus) : undefined
    };

    const [tenants, total] = await Promise.all([
      app.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { shipments: { where: { createdAt: { gte: new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) } }, select: { id: true } }, subscription: true }
      }),
      app.prisma.tenant.count({ where })
    ]);

    reply.send({
      data: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        billingPlan: tenant.subscription?.plan ?? tenant.plan,
        status: tenant.status,
        shipmentCountThisMonth: tenant.shipments.length,
        mrrContribution: tenant.status === 'DEMO' ? 0 : Number(tenant.subscription?.plan === 'ENTERPRISE' ? 500 : tenant.plan === 'PRO' ? 79 : 29)
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  });

  app.get('/api/v1/platform/tenants/:id', { preHandler: authPre('tenant:read') }, async (request, reply) => {
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
    const plan = await resolveEffectiveTenantPlan(app.prisma, tenant);
    reply.send({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: plan.effectivePlan,
      billingPlan: plan.billingPlan,
      activePlanOverride: plan.override,
      status: tenant.status,
      branding: { logoUrl: tenant.logoUrl, primaryColor: tenant.primaryColor, accentColor: tenant.accentColor, brandName: tenant.brandName },
      settings: redactPlatformLogValue(tenant.settings),
      usage: tenant.usageRecords,
      subscription: redactPlatformLogValue(tenant.subscription),
      staffCount: tenant.users.length,
      recentShipments: tenant.shipments
    });
  });

  app.patch('/api/v1/platform/tenants/:id/plan-override', { preHandler: dangerousPre('tenant:plan_override') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = request.body as { plan?: TenantPlan; reason?: string; expiresAt?: string | null };
    if (!payload.plan || !['STARTER', 'PRO', 'ENTERPRISE'].includes(payload.plan)) return reply.status(400).send({ error: 'plan must be STARTER, PRO, or ENTERPRISE' });
    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
    const previous = await resolveEffectiveTenantPlan(app.prisma, tenant);
    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) return reply.status(400).send({ error: 'expiresAt must be a valid ISO date' });

    const override = await app.prisma.$transaction(async (tx) => {
      await tx.tenantPlanOverride.updateMany({ where: { tenantId: tenant.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return tx.tenantPlanOverride.create({
        data: {
          tenantId: tenant.id,
          plan: payload.plan!,
          reason: payload.reason!.trim(),
          expiresAt,
          createdByPlatformUserId: request.platform!.user.id
        }
      });
    });
    await writePlatformAuditLog(app.prisma, {
      actorType: 'PLATFORM_USER',
      actorId: request.platform!.user.id,
      actorEmail: request.platform!.user.email,
      action: 'TENANT_PLAN_OVERRIDE',
      targetTenantId: tenant.id,
      reason: payload.reason,
      metadata: { previousEffectivePlan: previous.effectivePlan, newEffectivePlan: payload.plan, billingPlan: tenant.plan, reason: payload.reason, expiry: expiresAt?.toISOString() ?? null, actorId: request.platform!.user.id },
      ipAddress: ipAddress(request),
      userAgent: userAgent(request)
    });
    await app.redis.publish(`tenant:${tenant.id}:plan-changed`, JSON.stringify({ tenantId: tenant.id, plan: payload.plan, overrideId: override.id }));
    await app.redis.del(`tenant:${tenant.id}:cache`);
    reply.send({ override });
  });

  app.post('/api/v1/platform/tenants/:id/suspend', { preHandler: dangerousPre('tenant:suspend') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
    const reason = reasonFrom(request) ?? 'Platform suspension';
    const updated = await app.prisma.tenant.update({ where: { id }, data: { status: 'SUSPENDED', suspensionReason: reason, suspendedAt: new Date() } });
    await writePlatformAuditLog(app.prisma, {
      actorType: 'PLATFORM_USER',
      actorId: request.platform!.user.id,
      actorEmail: request.platform!.user.email,
      action: 'TENANT_SUSPENSION',
      targetTenantId: id,
      reason,
      metadata: { previousStatus: tenant.status, nextStatus: 'SUSPENDED' },
      ipAddress: ipAddress(request),
      userAgent: userAgent(request)
    });
    reply.send(updated);
  });

  app.post('/api/v1/platform/tenants/:id/unsuspend', { preHandler: dangerousPre('tenant:unsuspend') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
    const updated = await app.prisma.tenant.update({ where: { id }, data: { status: 'ACTIVE', suspensionReason: null, suspendedAt: null } });
    await writePlatformAuditLog(app.prisma, {
      actorType: 'PLATFORM_USER',
      actorId: request.platform!.user.id,
      actorEmail: request.platform!.user.email,
      action: 'TENANT_UNSUSPEND',
      targetTenantId: id,
      reason: reasonFrom(request),
      metadata: { previousStatus: tenant.status, nextStatus: 'ACTIVE' },
      ipAddress: ipAddress(request),
      userAgent: userAgent(request)
    });
    reply.send(updated);
  });

  app.post('/api/v1/platform/tenants/:id/impersonation-sessions', { preHandler: dangerousPre('tenant:impersonate') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = request.body as { reason?: string; targetUserId?: string; scopes?: unknown; expiresInMinutes?: unknown };
    const reason = payload.reason!.trim();
    const scopeRequest = parseImpersonationScopes(payload.scopes);
    if (!scopeRequest.ok) return reply.status(400).send({ error: 'INVALID_SCOPE', message: scopeRequest.error });
    // Write access needs its own permission and a longer reason, and is capped at 15 minutes (S6, D8).
    if (scopeRequest.write) {
      if (!(await platformUserHasConsolePermission(app.prisma, request.platform!.user, 'platform.impersonation.mutate'))) {
        return reply.status(403).send({ error: 'Forbidden', permission: 'platform.impersonation.mutate', message: 'Write impersonation requires platform.impersonation.mutate.' });
      }
      if (reason.length < WRITE_SCOPE_MIN_REASON) {
        return reply.status(400).send({ error: 'REASON_REQUIRED', message: `Write impersonation needs a reason of at least ${WRITE_SCOPE_MIN_REASON} characters.` });
      }
    }

    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const targetUser = payload.targetUserId
      ? await app.prisma.user.findFirst({ where: { id: payload.targetUserId, tenantId: tenant.id, isActive: true } })
      : await app.prisma.user.findFirst({ where: { tenantId: tenant.id, role: 'TENANT_ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!targetUser) return reply.status(404).send({ error: 'No active target tenant user found for impersonation' });

    const minutes = impersonationDurationMinutes(payload.expiresInMinutes, scopeRequest.write);
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
    const session = await app.prisma.platformImpersonationSession.create({
      data: { platformUserId: request.platform!.user.id, targetTenantId: tenant.id, targetUserId: targetUser.id, scopes: scopeRequest.scopes, reason, expiresAt }
    });

    await app.redis.set(impersonationActiveKey(session.id), '1', 'EX', minutes * 60);
    const exchangeCode = await createExchangeCode(app.redis, session.id);
    await writePlatformAuditLog(app.prisma, {
      actorType: 'PLATFORM_USER',
      actorId: request.platform!.user.id,
      actorEmail: request.platform!.user.email,
      action: 'TENANT_IMPERSONATION_START',
      targetTenantId: tenant.id,
      targetUserId: targetUser.id,
      impersonationSessionId: session.id,
      reason,
      metadata: { scopes: scopeRequest.scopes, expiresAt: expiresAt.toISOString() },
      ipAddress: ipAddress(request),
      userAgent: userAgent(request)
    });
    // The token is only issued to the tenant portal through the one-time exchange code (S18).
    reply.send({
      exchangeCode,
      portalUrl: impersonationPortalUrl(tenant.slug, exchangeCode),
      impersonationSessionId: session.id,
      expiresAt: expiresAt.toISOString(),
      targetUser: { id: targetUser.id, email: targetUser.email, role: targetUser.role },
      session,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }
    });
  });

  app.delete('/api/v1/platform/impersonation-sessions/:id', { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requirePlatformPermission('tenant:impersonate')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const reason = reasonFrom(request) || 'Ended by staff';
    const now = new Date();
    const session = await app.prisma.platformImpersonationSession.updateMany({
      where: { id, revokedAt: null, endedAt: null },
      data: { revokedAt: now, endedAt: now, endedReason: 'REVOKED' }
    });
    await app.redis.del(impersonationActiveKey(id));
    await writePlatformAuditLog(app.prisma, {
      actorType: 'PLATFORM_USER',
      actorId: request.platform!.user.id,
      actorEmail: request.platform!.user.email,
      action: 'TENANT_IMPERSONATION_END',
      impersonationSessionId: id,
      reason,
      metadata: { revoked: session.count > 0, endedReason: 'REVOKED' },
      ipAddress: ipAddress(request),
      userAgent: userAgent(request)
    });
    reply.status(204).send();
  });

  app.get('/api/v1/platform/impersonation-sessions/active', { preHandler: authPre('tenant:impersonate') }, async (_request, reply) => {
    const sessions = await app.prisma.platformImpersonationSession.findMany({
      where: { revokedAt: null, endedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { targetTenant: { select: { id: true, name: true, slug: true } } }
    });
    reply.send({ sessions });
  });

  app.get('/api/v1/platform/metrics', { preHandler: authPre('revenue:view') }, async (_request, reply) => {
    const [activeTenantCount, shipmentsToday, subscriptions] = await Promise.all([
      app.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      app.prisma.shipment.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      app.prisma.subscription.findMany({ where: { tenant: { status: { not: 'DEMO' } } } })
    ]);
    const totalMRR = subscriptions.reduce((sum, sub) => sum + (sub.plan === 'ENTERPRISE' ? 500 : sub.plan === 'PRO' ? 79 : sub.plan === 'STARTER' ? 29 : 0), 0);
    reply.send({ totalMRR, activeTenantCount, shipmentsToday });
  });

  app.get('/api/v1/platform/queues', { preHandler: authPre('queue:view') }, async (_request, reply) => {
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
        { name: 'notification', waiting: notificationStats.waiting + notificationStats.delayed, active: notificationStats.active, completed: notificationStats.completed, failed: notificationStats.failed, lastProcessedAt: null },
        { name: 'webhook', waiting: webhookStats.waiting + webhookStats.delayed, active: webhookStats.active, completed: webhookStats.completed, failed: webhookStats.failed, lastProcessedAt: null },
        { name: 'outbox', waiting: outboxStats.waiting + outboxStats.delayed, active: outboxStats.active, completed: outboxStats.completed, failed: outboxStats.failed, lastProcessedAt: null },
        { name: 'analytics', waiting: analyticsStats.waiting + analyticsStats.delayed, active: analyticsStats.active, completed: analyticsStats.completed, failed: analyticsStats.failed, lastProcessedAt: null },
        { name: 'scheduled-jobs', waiting: scheduledStats.waiting + scheduledStats.delayed, active: scheduledStats.active, completed: scheduledStats.completed, failed: scheduledStats.failed, lastProcessedAt: null }
      ],
      dlq: {
        notification: dlqNotificationStats.waiting + dlqNotificationStats.delayed + dlqNotificationStats.active,
        webhook: dlqWebhookStats.waiting + dlqWebhookStats.delayed + dlqWebhookStats.active,
        outbox: dlqOutboxStats.waiting + dlqOutboxStats.delayed + dlqOutboxStats.active
      }
    });
  });

  app.get('/api/v1/platform/health', { preHandler: authPre('system:health') }, async (_request, reply) => {
    const startedDb = Date.now();
    await app.prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - startedDb;
    const startedRedis = Date.now();
    await app.redis.ping();
    const redisLatencyMs = Date.now() - startedRedis;
    reply.send({ dbLatencyMs, redisLatencyMs, uptimeSeconds: Math.floor(process.uptime()) });
  });

  app.get('/api/v1/platform/region-change-requests', { preHandler: authPre('region:read') }, async (_request, reply) => {
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

  app.patch(
    '/api/v1/platform/region-change-requests/:id',
    { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireAnyPlatformPermission(['region:approve', 'region:reject']), requireFreshPlatformMfa, requirePlatformReason] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { status, reason } = request.body as { status?: 'APPROVED' | 'REJECTED'; reason?: string };
      if (!status || !['APPROVED', 'REJECTED'].includes(status)) return reply.status(400).send({ error: 'status must be APPROVED or REJECTED' });
      const existing = listRegionChangeRequests().find((item) => item.id === id);
      if (!existing) return reply.status(404).send({ error: 'Region change request not found' });
      if (!supportedRegions.has(existing.requestedRegion)) return reply.status(400).send({ error: 'Unsupported requested region' });
      if (status === 'APPROVED' && !permissionsForPlatformRole(request.platform!.user.role).includes('region:approve')) return reply.status(403).send({ error: 'Forbidden' });
      if (status === 'REJECTED' && !permissionsForPlatformRole(request.platform!.user.role).includes('region:reject')) return reply.status(403).send({ error: 'Forbidden' });

      const regionRequest = updateRegionChangeRequestStatus(id, status, request.platform!.user.email, request.platform!.user.id, reason);
      await writePlatformAuditLog(app.prisma, {
        actorType: 'PLATFORM_USER',
        actorId: request.platform!.user.id,
        actorEmail: request.platform!.user.email,
        action: status === 'APPROVED' ? 'REGION_CHANGE_APPROVED' : 'REGION_CHANGE_REJECTED',
        targetTenantId: existing.tenantId,
        reason,
        metadata: { currentRegion: existing.currentRegion, requestedRegion: existing.requestedRegion },
        ipAddress: ipAddress(request),
        userAgent: userAgent(request)
      });
      reply.send({ request: regionRequest });
    }
  );

  app.get('/api/v1/platform/logs', { preHandler: authPre('logs:view') }, async (request, reply) => {
    const query = request.query as { sensitive?: string; reason?: string };
    const sensitive = query.sensitive === 'true';
    if (sensitive) {
      await requirePlatformPermission('logs:view_sensitive')(request, reply);
      const mfa = await requireFreshPlatformMfa(request, reply);
      if (mfa !== undefined) return;
      if (!query.reason || query.reason.trim().length < 8) return reply.status(400).send({ error: 'REASON_REQUIRED' });
      await writePlatformAuditLog(app.prisma, {
        actorType: 'PLATFORM_USER',
        actorId: request.platform!.user.id,
        actorEmail: request.platform!.user.email,
        action: 'SENSITIVE_LOG_VIEW',
        reason: query.reason,
        metadata: {},
        ipAddress: ipAddress(request),
        userAgent: userAgent(request)
      });
    }
    const logs = await app.prisma.notificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    reply.send({ logs: sensitive ? logs : redactPlatformLogValue(logs), redacted: !sensitive });
  });

  app.get('/api/v1/platform/audit', { preHandler: authPre('audit:view') }, async (request, reply) => {
    const query = request.query as { verify?: string };
    const logs = await app.prisma.platformAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    reply.send({ logs, chain: query.verify === 'true' ? await verifyPlatformAuditChain(app.prisma) : undefined });
  });

  app.get('/api/v1/platform/relay', { preHandler: authPre('relay:view') }, async (_request, reply) => {
    reply.send({ status: 'ok' });
  });
}
