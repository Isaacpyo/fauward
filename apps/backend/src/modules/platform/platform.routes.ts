import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { TenantPlan, TenantStatus } from '@prisma/client';
import { verifyPassword } from '../../shared/utils/hash.js';
import { verifyTotp } from '../../shared/utils/totp.js';
import { signAccessToken } from '../../shared/utils/jwt.js';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requireFreshPlatformMfa } from '../../middleware/require-fresh-platform-mfa.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { requirePlatformReason } from '../../middleware/require-platform-reason.js';
import { requireAnyPlatformPermission, requirePlatformPermission } from '../../middleware/require-platform-permission.js';
import {
  PLATFORM_REFRESH_COOKIE,
  clearPlatformCookies,
  hashPlatformToken,
  platformCookieOptions,
  setPlatformCsrfCookies,
  signPlatformAccessToken,
  signPlatformRefreshToken,
  verifyPlatformRefreshToken
} from '../../services/platform-session.service.js';
import { permissionsForPlatformRole } from '../../services/platform-permission.service.js';
import { writePlatformAuditLog, verifyPlatformAuditChain } from '../../services/platform-audit.service.js';
import { redactPlatformLogValue } from '../../services/platform-redaction.service.js';
import { getActiveTenantPlanOverride, resolveEffectiveTenantPlan } from '../../services/platform-plan-override.service.js';
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

function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  reply.setCookie('fw_platform_access', accessToken, { ...platformCookieOptions(), maxAge: 15 * 60 });
  reply.setCookie(PLATFORM_REFRESH_COOKIE, refreshToken, { ...platformCookieOptions(), maxAge: 7 * 24 * 60 * 60 });
  setPlatformCsrfCookies(reply);
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
  app.post('/api/v1/platform/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { email, password } = request.body as { email?: string; password?: string };
    const normalizedEmail = email?.toLowerCase().trim();

    if (!normalizedEmail || !password) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const user = await app.prisma.platformUser.findUnique({ where: { email: normalizedEmail } });
    const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordOk || user.status !== 'ACTIVE') {
      await writePlatformAuditLog(app.prisma, {
        actorType: 'SYSTEM',
        actorId: 'platform-auth',
        actorEmail: normalizedEmail,
        action: 'PLATFORM_LOGIN_FAILURE',
        metadata: { reason: user?.status === 'DISABLED' ? 'disabled_user' : 'invalid_credentials' },
        ipAddress: ipAddress(request),
        userAgent: userAgent(request)
      });
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const mfaVerifiedAt = user.mfaEnabled ? null : null;
    const session = await app.prisma.platformSession.create({
      data: {
        platformUserId: user.id,
        refreshTokenHash: 'pending',
        mfaVerifiedAt,
        ipAddress: ipAddress(request),
        userAgent: userAgent(request),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    const accessToken = signPlatformAccessToken({ platformUserId: user.id, role: user.role, sessionId: session.id, mfaVerifiedAt });
    const refreshToken = signPlatformRefreshToken({ platformUserId: user.id, sessionId: session.id });

    await app.prisma.$transaction([
      app.prisma.platformSession.update({
        where: { id: session.id },
        data: { refreshTokenHash: hashPlatformToken(refreshToken) }
      }),
      app.prisma.platformUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    ]);

    setAuthCookies(reply, accessToken, refreshToken);
    await writePlatformAuditLog(app.prisma, {
      actorType: 'PLATFORM_USER',
      actorId: user.id,
      actorEmail: user.email,
      action: 'PLATFORM_LOGIN_SUCCESS',
      metadata: { mfaRequired: user.mfaEnabled },
      ipAddress: ipAddress(request),
      userAgent: userAgent(request)
    });

    reply.send({
      mfaRequired: user.mfaEnabled,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions: permissionsForPlatformRole(user.role) }
    });
  });

  app.post('/api/v1/platform/auth/mfa/verify', { preHandler: [authenticatePlatformSession, requirePlatformCsrf] }, async (request, reply) => {
    const { code } = request.body as { code?: string };
    const platform = request.platform;
    if (!platform || !code) return reply.status(400).send({ error: 'code is required' });

    const user = await app.prisma.platformUser.findUnique({ where: { id: platform.user.id } });
    if (!user?.mfaEnabled || !user.mfaSecretEncrypted) {
      return reply.status(400).send({ error: 'MFA not enabled for account' });
    }

    const valid = verifyTotp(code, user.mfaSecretEncrypted);
    await writePlatformAuditLog(app.prisma, {
      actorType: 'PLATFORM_USER',
      actorId: user.id,
      actorEmail: user.email,
      action: valid ? 'PLATFORM_MFA_SUCCESS' : 'PLATFORM_MFA_FAILURE',
      metadata: {},
      ipAddress: ipAddress(request),
      userAgent: userAgent(request)
    });
    if (!valid) return reply.status(400).send({ error: 'Invalid MFA code' });

    const mfaVerifiedAt = new Date();
    const session = await app.prisma.platformSession.update({
      where: { id: platform.session.id },
      data: { mfaVerifiedAt }
    });
    const accessToken = signPlatformAccessToken({ platformUserId: user.id, role: user.role, sessionId: session.id, mfaVerifiedAt });
    reply.setCookie('fw_platform_access', accessToken, { ...platformCookieOptions(), maxAge: 15 * 60 });
    setPlatformCsrfCookies(reply);
    reply.send({ success: true, mfaVerifiedAt: mfaVerifiedAt.toISOString() });
  });

  app.post('/api/v1/platform/auth/logout', { preHandler: [authenticatePlatformSession, requirePlatformCsrf] }, async (request, reply) => {
    if (request.platform) {
      await app.prisma.platformSession.updateMany({
        where: { id: request.platform.session.id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      await writePlatformAuditLog(app.prisma, {
        actorType: 'PLATFORM_USER',
        actorId: request.platform.user.id,
        actorEmail: request.platform.user.email,
        action: 'PLATFORM_SESSION_REVOKED',
        metadata: { sessionId: request.platform.session.id },
        ipAddress: ipAddress(request),
        userAgent: userAgent(request)
      });
    }
    clearPlatformCookies(reply);
    reply.status(204).send();
  });

  app.post('/api/v1/platform/auth/refresh', { preHandler: [requirePlatformCsrf] }, async (request, reply) => {
    const refreshToken = request.cookies?.[PLATFORM_REFRESH_COOKIE];
    if (!refreshToken) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      const claims = verifyPlatformRefreshToken(refreshToken);
      const session = await app.prisma.platformSession.findUnique({ where: { id: claims.sessionId }, include: { platformUser: true } });
      if (
        !session ||
        session.platformUserId !== claims.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.refreshTokenHash !== hashPlatformToken(refreshToken) ||
        session.platformUser.status !== 'ACTIVE'
      ) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const nextRefreshToken = signPlatformRefreshToken({ platformUserId: session.platformUserId, sessionId: session.id });
      await app.prisma.platformSession.update({
        where: { id: session.id },
        data: { refreshTokenHash: hashPlatformToken(nextRefreshToken), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
      });
      const accessToken = signPlatformAccessToken({
        platformUserId: session.platformUserId,
        role: session.platformUser.role,
        sessionId: session.id,
        mfaVerifiedAt: session.mfaVerifiedAt
      });
      setAuthCookies(reply, accessToken, nextRefreshToken);
      reply.send({ success: true });
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  app.get('/api/v1/platform/auth/me', { preHandler: authPre() }, async (request, reply) => {
    const user = request.platform!.user;
    reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: permissionsForPlatformRole(user.role),
        mfaEnabled: user.mfaEnabled,
        mfaVerifiedAt: request.platform!.session.mfaVerifiedAt?.toISOString() ?? null
      }
    });
  });

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
        mrrContribution: Number(tenant.subscription?.plan === 'ENTERPRISE' ? 500 : tenant.plan === 'PRO' ? 79 : 29)
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
    reply.send({ override });
  });

  app.post('/api/v1/platform/tenants/:id/suspend', { preHandler: dangerousPre('tenant:suspend') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
    const updated = await app.prisma.tenant.update({ where: { id }, data: { status: 'SUSPENDED' } });
    await writePlatformAuditLog(app.prisma, {
      actorType: 'PLATFORM_USER',
      actorId: request.platform!.user.id,
      actorEmail: request.platform!.user.email,
      action: 'TENANT_SUSPENSION',
      targetTenantId: id,
      reason: reasonFrom(request),
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
    const updated = await app.prisma.tenant.update({ where: { id }, data: { status: 'ACTIVE' } });
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
    const payload = request.body as { reason?: string; targetUserId?: string; scopes?: string[]; expiresInMinutes?: number };
    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const targetUser = payload.targetUserId
      ? await app.prisma.user.findFirst({ where: { id: payload.targetUserId, tenantId: tenant.id, isActive: true } })
      : await app.prisma.user.findFirst({ where: { tenantId: tenant.id, role: 'TENANT_ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!targetUser) return reply.status(404).send({ error: 'No active target tenant user found for impersonation' });

    const expiresAt = new Date(Date.now() + Math.min(Math.max(payload.expiresInMinutes ?? 30, 5), 30) * 60 * 1000);
    const scopes = Array.isArray(payload.scopes) && payload.scopes.length > 0 ? payload.scopes : ['read'];
    const session = await app.prisma.platformImpersonationSession.create({
      data: { platformUserId: request.platform!.user.id, targetTenantId: tenant.id, targetUserId: targetUser.id, scopes, reason: payload.reason!.trim(), expiresAt }
    });

    const token = signAccessToken({
      sub: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      plan: (await getActiveTenantPlanOverride(app.prisma, tenant.id))?.plan ?? tenant.plan,
      mfaVerified: true,
      impersonator: request.platform!.user.id,
      actorType: 'PLATFORM_USER',
      actorId: request.platform!.user.id,
      targetTenantId: tenant.id,
      targetUserId: targetUser.id,
      impersonationSessionId: session.id,
      scopes,
      mode: 'IMPERSONATION'
    });
    await app.redis.set(`platform:impersonation:${session.id}`, '1', 'EX', Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    await writePlatformAuditLog(app.prisma, {
      actorType: 'PLATFORM_USER',
      actorId: request.platform!.user.id,
      actorEmail: request.platform!.user.email,
      action: 'TENANT_IMPERSONATION_START',
      targetTenantId: tenant.id,
      targetUserId: targetUser.id,
      impersonationSessionId: session.id,
      reason: payload.reason,
      metadata: { scopes, expiresAt: expiresAt.toISOString() },
      ipAddress: ipAddress(request),
      userAgent: userAgent(request)
    });
    reply.send({ token, session, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, expiresAt: expiresAt.toISOString() });
  });

  app.delete('/api/v1/platform/impersonation-sessions/:id', { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requirePlatformPermission('tenant:impersonate')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await app.prisma.platformImpersonationSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    await app.redis.del(`platform:impersonation:${id}`);
    await writePlatformAuditLog(app.prisma, {
      actorType: 'PLATFORM_USER',
      actorId: request.platform!.user.id,
      actorEmail: request.platform!.user.email,
      action: 'TENANT_IMPERSONATION_END',
      impersonationSessionId: id,
      metadata: { revoked: session.count > 0 },
      ipAddress: ipAddress(request),
      userAgent: userAgent(request)
    });
    reply.status(204).send();
  });

  app.get('/api/v1/platform/impersonation-sessions/active', { preHandler: authPre('tenant:impersonate') }, async (_request, reply) => {
    const sessions = await app.prisma.platformImpersonationSession.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
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
      app.prisma.subscription.findMany()
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
