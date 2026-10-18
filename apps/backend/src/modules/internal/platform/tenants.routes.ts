import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TenantPlan, TenantStatus } from '@prisma/client';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { writePlatformAuditLog } from '../../../services/platform-audit.service.js';
import { redactPlatformLogValue } from '../../../services/platform-redaction.service.js';
import { resolveEffectiveTenantPlan } from '../../../services/platform-plan-override.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { platformAuditActor, reasonOf } from '../request-meta.js';
import { SUSPENSION_CATEGORIES, SuspensionError, liftSuspension, staffSuspensionActor, suspendTenant } from '../../../services/tenant-suspension.service.js';
import { listRegionChangeRequests, updateRegionChangeRequestStatus } from '../../regions/region-change-requests.store.js';

// platform.tenants (moved from /api/v1/platform in WP-1.1; list/detail rebuilt in WP-1.2, suspension in WP-1.3).

const SUPPORTED_REGIONS = new Set(['africa', 'europe', 'northAmerica', 'global', 'uk_europe']);
const OVERRIDE_PLANS = new Set<TenantPlan>(['STARTER', 'PRO', 'ENTERPRISE']);
const readPre = [authenticatePlatformSession, requireConsolePermission('platform.tenants.read')];

const suspendBody = z.object({
  category: z.enum(SUSPENSION_CATEGORIES),
  reason: z.string().min(8),
  publicReason: z.string().trim().max(500).optional()
});
const unsuspendBody = z.object({ suspensionId: z.string().min(1).optional(), all: z.boolean().optional(), reason: z.string().min(8) });

export function sendSuspensionError(reply: FastifyReply, error: unknown) {
  if (error instanceof SuspensionError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

function activityDeps(app: FastifyInstance) {
  return { prisma: app.prisma, redis: app.redis, log: app.log };
}

export async function registerConsoleTenantRoutes(app: FastifyInstance) {
  app.get('/api/internal/tenants', { preHandler: readPre }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; search?: string; plan?: string; status?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const where = {
      name: query.search ? { contains: query.search, mode: 'insensitive' as const } : undefined,
      plan: query.plan ? (query.plan as TenantPlan) : undefined,
      status: query.status ? (query.status as TenantStatus) : undefined
    };
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [tenants, total] = await Promise.all([
      app.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { shipments: { where: { createdAt: { gte: monthStart } } } } }, subscription: true }
      }),
      app.prisma.tenant.count({ where })
    ]);
    return reply.send({
      data: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        billingPlan: tenant.subscription?.plan ?? tenant.plan,
        status: tenant.status,
        shipmentCountThisMonth: tenant._count.shipments
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  });

  app.get('/api/internal/tenants/region-requests', { preHandler: readPre }, async (_request, reply) => {
    return reply.send({
      requests: listRegionChangeRequests(),
      regions: [
        { key: 'africa', label: 'Africa', paymentProviders: ['Paystack', 'Flutterwave', 'Bank transfer', 'COD'] },
        { key: 'europe', label: 'Europe', paymentProviders: ['Stripe', 'Bank transfer'] },
        { key: 'northAmerica', label: 'North America', paymentProviders: ['Stripe', 'Bank transfer'] },
        { key: 'global', label: 'Global', paymentProviders: ['Stripe', 'Paystack', 'Flutterwave', 'Bank transfer'] }
      ]
    });
  });

  app.post('/api/internal/tenants/region-requests/:id/decision', { preHandler: dangerous('platform.tenants.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, reason } = request.body as { status?: 'APPROVED' | 'REJECTED'; reason: string };
    if (!status || !['APPROVED', 'REJECTED'].includes(status)) return reply.status(400).send({ error: 'INVALID_STATUS', message: 'status must be APPROVED or REJECTED' });
    const existing = listRegionChangeRequests().find((item) => item.id === id);
    if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Region change request not found' });
    if (!SUPPORTED_REGIONS.has(existing.requestedRegion)) return reply.status(400).send({ error: 'UNSUPPORTED_REGION', message: 'Unsupported requested region' });

    const regionRequest = updateRegionChangeRequestStatus(id, status, request.platform!.user.email, request.platform!.user.id, reason);
    await writePlatformAuditLog(app.prisma, {
      ...platformAuditActor(request),
      actorType: 'PLATFORM_USER',
      action: status === 'APPROVED' ? 'REGION_CHANGE_APPROVED' : 'REGION_CHANGE_REJECTED',
      targetTenantId: existing.tenantId,
      reason,
      metadata: { currentRegion: existing.currentRegion, requestedRegion: existing.requestedRegion }
    });
    await recordAndPublishActivity(activityDeps(app), {
      service: 'platform.tenants',
      type: status === 'APPROVED' ? 'region_request.approved' : 'region_request.rejected',
      tenantId: existing.tenantId,
      ...staffActor(request),
      subjectType: 'region_change_request',
      subjectId: id,
      summary: `${existing.tenantName}: ${existing.currentRegion} → ${existing.requestedRegion} ${status.toLowerCase()}`,
      consoleLink: '/platform/tenants/region-requests'
    });
    return reply.send({ request: regionRequest });
  });

  app.get('/api/internal/tenants/:id', { preHandler: readPre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await app.prisma.tenant.findUnique({
      where: { id },
      include: {
        settings: true,
        usageRecords: { orderBy: { updatedAt: 'desc' }, take: 6 },
        subscription: true,
        _count: { select: { users: true } }
      }
    });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    const plan = await resolveEffectiveTenantPlan(app.prisma, tenant);
    return reply.send({
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
      staffCount: tenant._count.users
    });
  });

  app.post('/api/internal/tenants/:id/plan-overrides', { preHandler: dangerous('revenue.subscriptions.override') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = request.body as { plan?: TenantPlan; reason: string; expiresAt?: string | null };
    if (!payload.plan || !OVERRIDE_PLANS.has(payload.plan)) return reply.status(400).send({ error: 'INVALID_PLAN', message: 'plan must be STARTER, PRO, or ENTERPRISE' });
    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) return reply.status(400).send({ error: 'INVALID_EXPIRY', message: 'expiresAt must be a future ISO date' });
    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    const previous = await resolveEffectiveTenantPlan(app.prisma, tenant);
    const reason = payload.reason.trim();

    const override = await app.prisma.$transaction(async (tx) => {
      await tx.tenantPlanOverride.updateMany({ where: { tenantId: tenant.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return tx.tenantPlanOverride.create({
        data: { tenantId: tenant.id, plan: payload.plan!, reason, expiresAt, createdByPlatformUserId: request.platform!.user.id }
      });
    });
    await writePlatformAuditLog(app.prisma, {
      ...platformAuditActor(request),
      actorType: 'PLATFORM_USER',
      action: 'TENANT_PLAN_OVERRIDE',
      targetTenantId: tenant.id,
      reason,
      metadata: { previousEffectivePlan: previous.effectivePlan, newEffectivePlan: payload.plan, billingPlan: tenant.plan, expiry: expiresAt?.toISOString() ?? null, overrideId: override.id }
    });
    await recordAndPublishActivity(activityDeps(app), {
      service: 'platform.tenants',
      type: 'tenant.plan_overridden',
      tenantId: tenant.id,
      ...staffActor(request),
      subjectType: 'tenant_plan_override',
      subjectId: override.id,
      summary: `${tenant.name}: effective plan ${previous.effectivePlan} → ${payload.plan}${expiresAt ? ` until ${expiresAt.toISOString().slice(0, 10)}` : ''}`,
      severity: 'ATTENTION',
      consoleLink: `/platform/tenants/${tenant.id}`
    });
    await app.redis.publish(`tenant:${tenant.id}:plan-changed`, JSON.stringify({ tenantId: tenant.id, plan: payload.plan, overrideId: override.id }));
    await app.redis.del(`tenant:${tenant.id}:cache`);
    return reply.status(201).send({ override });
  });

  app.delete('/api/internal/tenants/:id/plan-overrides/:overrideId', { preHandler: dangerous('revenue.subscriptions.override') }, async (request, reply) => {
    const { id, overrideId } = request.params as { id: string; overrideId: string };
    const override = await app.prisma.tenantPlanOverride.findFirst({ where: { id: overrideId, tenantId: id }, include: { tenant: { select: { name: true } } } });
    if (!override) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Plan override not found' });
    if (override.revokedAt) return reply.status(409).send({ error: 'ALREADY_REVOKED', message: 'Plan override is already revoked' });
    const revoked = await app.prisma.tenantPlanOverride.update({ where: { id: overrideId }, data: { revokedAt: new Date() } });
    const reason = reasonOf(request);
    await writePlatformAuditLog(app.prisma, {
      ...platformAuditActor(request),
      actorType: 'PLATFORM_USER',
      action: 'TENANT_PLAN_OVERRIDE_REVOKED',
      targetTenantId: id,
      reason,
      metadata: { overrideId, plan: override.plan }
    });
    await recordAndPublishActivity(activityDeps(app), {
      service: 'platform.tenants',
      type: 'tenant.plan_override_revoked',
      tenantId: id,
      ...staffActor(request),
      subjectType: 'tenant_plan_override',
      subjectId: overrideId,
      summary: `${override.tenant.name}: ${override.plan} override revoked`,
      severity: 'ATTENTION',
      consoleLink: `/platform/tenants/${id}`
    });
    await app.redis.publish(`tenant:${id}:plan-changed`, JSON.stringify({ tenantId: id, overrideId, revoked: true }));
    await app.redis.del(`tenant:${id}:cache`);
    return reply.send({ override: revoked });
  });

  app.post('/api/internal/tenants/:id/suspend', { preHandler: dangerous('platform.tenants.suspend') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = suspendBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    try {
      const result = await suspendTenant(app, {
        tenantId: id,
        source: 'PLATFORM',
        category: parsed.data.category,
        reason: parsed.data.reason.trim(),
        publicReason: parsed.data.publicReason,
        actor: staffSuspensionActor(request)
      });
      return reply.send({ suspension: result.record, tenant: { id: result.tenant.id, status: result.tenant.status, suspendedAt: result.tenant.suspendedAt, suspensionReason: result.tenant.suspensionReason } });
    } catch (error) {
      return sendSuspensionError(reply, error);
    }
  });

  app.post('/api/internal/tenants/:id/unsuspend', { preHandler: dangerous('platform.tenants.suspend') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = unsuspendBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    if (!parsed.data.suspensionId && parsed.data.all !== true) {
      return reply.status(400).send({ error: 'SUSPENSION_ID_REQUIRED', message: 'Choose which suspension to lift, or confirm lifting all of them with all: true.' });
    }
    try {
      const result = await liftSuspension(app, { tenantId: id, suspensionId: parsed.data.suspensionId ?? null, via: 'MANUAL', reason: parsed.data.reason.trim(), actor: staffSuspensionActor(request) });
      return reply.send({ lifted: result.lifted, remaining: result.remaining, tenant: { id: result.tenant.id, status: result.tenant.status, suspendedAt: result.tenant.suspendedAt, suspensionReason: result.tenant.suspensionReason } });
    } catch (error) {
      return sendSuspensionError(reply, error);
    }
  });
}
