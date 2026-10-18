import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TenantPlan } from '@prisma/client';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireAnyConsolePermission, requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { writePlatformAuditLog } from '../../../services/platform-audit.service.js';
import { resolveEffectiveTenantPlan } from '../../../services/platform-plan-override.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { platformAuditActor, reasonOf } from '../request-meta.js';
import { SUSPENSION_CATEGORIES, SuspensionError, liftSuspension, staffSuspensionActor, suspendTenant } from '../../../services/tenant-suspension.service.js';
import { FeatureOverrideError, consoleOverrideActor, createFeatureOverride, revokeFeatureOverride } from '../../../services/feature-override.service.js';
import { invalidateTenantEntitlements, resolveTenantEntitlements } from '../../../services/tenant-entitlements.service.js';
import { planService } from '../../tenants/plan.service.js';
import { getTenantDetail, listTenants, tenantListQuery } from '../../../services/tenant-directory.service.js';
import { TenantCloseError, closeTenant } from '../../../services/tenant-close.service.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
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
const featureOverrideBody = z.object({
  featureKey: z.string().min(1),
  enabled: z.boolean(),
  reason: z.string().min(8),
  expiresAt: z.string().datetime().nullable().optional()
});
const limitValue = z.number().int().min(-1).max(1000000);
const limitsBody = z
  .object({
    maxStaff: limitValue.optional(),
    maxShipmentsPm: limitValue.optional(),
    maxOrganisations: limitValue.optional(),
    resetToPlan: z.boolean().optional(),
    reason: z.string().min(8)
  })
  .refine(
    (body) => body.resetToPlan === true || body.maxStaff !== undefined || body.maxShipmentsPm !== undefined || body.maxOrganisations !== undefined,
    'Set at least one limit, or resetToPlan: true'
  );
const notesBody = z.object({ internalNotes: z.string().max(20000) });
const closeBody = z.object({ reason: z.string().min(8), confirmSlug: z.string().min(1) });
const unsuspendBody = z.object({ suspensionId: z.string().min(1).optional(), all: z.boolean().optional(), reason: z.string().min(8) });

export function sendFeatureOverrideError(reply: FastifyReply, error: unknown) {
  if (error instanceof FeatureOverrideError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export function sendSuspensionError(reply: FastifyReply, error: unknown) {
  if (error instanceof SuspensionError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

function activityDeps(app: FastifyInstance) {
  return { prisma: app.prisma, redis: app.redis, log: app.log };
}

export async function registerConsoleTenantRoutes(app: FastifyInstance) {
  app.get('/api/internal/tenants', { preHandler: readPre }, async (request, reply) => {
    const parsed = tenantListQuery.safeParse(request.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return reply.status(400).send({ error: 'INVALID_QUERY', message: `${issue?.path.join('.') || 'query'}: ${issue?.message}` });
    }
    return reply.send(await listTenants(app.prisma, parsed.data));
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
    const detail = await getTenantDetail(app.prisma, id);
    if (!detail) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    return reply.send(detail);
  });

  // Users of one tenant: the Users tab and the impersonation target picker (WP-1.10).
  app.get('/api/internal/tenants/:id/users', { preHandler: readPre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { search?: string; active?: string };
    const tenant = await app.prisma.tenant.findUnique({ where: { id }, select: { id: true } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    const users = await app.prisma.user.findMany({
      where: {
        tenantId: id,
        ...(query.active === 'true' ? { isActive: true } : {}),
        ...(query.search
          ? {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' } },
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, mfaEnabled: true, lastLogin: true, createdAt: true, invitedBy: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      take: 100
    });
    return reply.send({ data: users });
  });

  app.patch('/api/internal/tenants/:id/limits', { preHandler: dangerous('platform.tenants.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = limitsBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    const body = parsed.data;
    const tenant = await app.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    const before = { maxStaff: tenant.maxStaff, maxShipmentsPm: tenant.maxShipmentsPm, maxOrganisations: tenant.maxOrganisations, limitsOverriddenAt: tenant.limitsOverriddenAt?.toISOString() ?? null };
    const updated = await app.prisma.tenant.update({
      where: { id },
      data: body.resetToPlan
        ? { limitsOverriddenAt: null }
        : {
            maxStaff: body.maxStaff ?? tenant.maxStaff,
            maxShipmentsPm: body.maxShipmentsPm ?? tenant.maxShipmentsPm,
            maxOrganisations: body.maxOrganisations ?? tenant.maxOrganisations,
            limitsOverriddenAt: new Date()
          }
    });
    const after = { maxStaff: updated.maxStaff, maxShipmentsPm: updated.maxShipmentsPm, maxOrganisations: updated.maxOrganisations, limitsOverriddenAt: updated.limitsOverriddenAt?.toISOString() ?? null };
    await writePlatformAuditLog(app.prisma, {
      ...platformAuditActor(request),
      actorType: 'PLATFORM_USER',
      action: 'TENANT_LIMITS_UPDATED',
      targetTenantId: id,
      reason: body.reason.trim(),
      metadata: { before, after }
    });
    await recordAndPublishActivity(activityDeps(app), {
      service: 'platform.tenants',
      type: 'tenant.limits_updated',
      tenantId: id,
      ...staffActor(request),
      subjectType: 'tenant',
      subjectId: id,
      summary: body.resetToPlan
        ? `${tenant.name}: limits reset to the plan`
        : `${tenant.name}: staff ${after.maxStaff}, shipments/month ${after.maxShipmentsPm}, organisations ${after.maxOrganisations}`,
      severity: 'ATTENTION',
      consoleLink: `/platform/tenants/${id}`
    });
    await invalidateTenantEntitlements(app.redis, id);
    return reply.send({ limits: after });
  });

  app.patch(
    '/api/internal/tenants/:id/internal-notes',
    { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireAnyConsolePermission(['platform.tenants.write', 'customer.success.write'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = notesBody.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
      const tenant = await app.prisma.tenant.findUnique({ where: { id }, select: { id: true, name: true, internalNotes: true } });
      if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
      const updated = await app.prisma.tenant.update({ where: { id }, data: { internalNotes: parsed.data.internalNotes } });
      await writePlatformAuditLog(app.prisma, {
        ...platformAuditActor(request),
        actorType: 'PLATFORM_USER',
        action: 'TENANT_INTERNAL_NOTES_UPDATED',
        targetTenantId: id,
        reason: null,
        metadata: { previousLength: tenant.internalNotes?.length ?? 0, newLength: parsed.data.internalNotes.length }
      });
      await recordAndPublishActivity(activityDeps(app), {
        service: 'platform.tenants',
        type: 'staff.note',
        tenantId: id,
        ...staffActor(request),
        subjectType: 'tenant',
        subjectId: id,
        summary: `${tenant.name}: internal notes updated`,
        consoleLink: `/customer/360/${id}`
      });
      return reply.send({ internalNotes: updated.internalNotes });
    }
  );

  app.post('/api/internal/tenants/:id/close', { preHandler: dangerous('platform.tenants.close') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = closeBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    const user = request.platform!.user;
    try {
      const result = await closeTenant(app, {
        tenantId: id,
        reason: parsed.data.reason.trim(),
        confirmSlug: parsed.data.confirmSlug,
        actor: { type: 'STAFF', platformUserId: user.id, email: user.email, label: user.name ?? user.email, ipAddress: platformAuditActor(request).ipAddress, userAgent: platformAuditActor(request).userAgent }
      });
      return reply.send({
        tenant: { id: result.tenant.id, status: result.tenant.status, closedAt: result.tenant.closedAt, purgeAfter: result.tenant.purgeAfter },
        suspension: result.suspension,
        stripe: result.stripe
      });
    } catch (error) {
      if (error instanceof TenantCloseError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      return sendSuspensionError(reply, error);
    }
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
    await invalidateTenantEntitlements(app.redis, tenant.id);
    await app.redis.publish(`tenant:${tenant.id}:plan-changed`, JSON.stringify({ tenantId: tenant.id, plan: payload.plan, overrideId: override.id }));
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
    await invalidateTenantEntitlements(app.redis, id);
    await app.redis.publish(`tenant:${id}:plan-changed`, JSON.stringify({ tenantId: id, overrideId, revoked: true }));
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

  // Per-tenant feature overrides (WP-1.4): the native source of truth for flags (D9).
  app.get('/api/internal/tenants/:id/feature-overrides', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.flags.read')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await app.prisma.tenant.findUnique({ where: { id }, select: { id: true, plan: true, maxStaff: true, maxShipmentsPm: true, maxOrganisations: true } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    const [overrides, entitlements] = await Promise.all([
      app.prisma.tenantFeatureOverride.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      resolveTenantEntitlements(app.prisma, tenant)
    ]);
    return reply.send({ featureKeys: planService.featureKeys(), overrides, entitlements });
  });

  app.post('/api/internal/tenants/:id/feature-overrides', { preHandler: dangerous('platform.flags.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = featureOverrideBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    try {
      const override = await createFeatureOverride(app, {
        tenantId: id,
        featureKey: parsed.data.featureKey,
        enabled: parsed.data.enabled,
        reason: parsed.data.reason.trim(),
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        actor: consoleOverrideActor(request)
      });
      return reply.status(201).send({ override });
    } catch (error) {
      return sendFeatureOverrideError(reply, error);
    }
  });

  app.delete('/api/internal/tenants/:id/feature-overrides/:overrideId', { preHandler: dangerous('platform.flags.write') }, async (request, reply) => {
    const { id, overrideId } = request.params as { id: string; overrideId: string };
    try {
      const override = await revokeFeatureOverride(app, { tenantId: id, overrideId, reason: reasonOf(request) ?? '', actor: consoleOverrideActor(request) });
      return reply.send({ override });
    } catch (error) {
      return sendFeatureOverrideError(reply, error);
    }
  });
}
