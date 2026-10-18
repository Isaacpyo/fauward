import type { FastifyInstance } from 'fastify';
import { planService } from '../modules/tenants/plan.service.js';
import { writePlatformAuditLog } from './platform-audit.service.js';
import { publishActivity, recordActivity } from './platform-activity.service.js';
import { invalidateTenantEntitlements } from './tenant-entitlements.service.js';

// Native per-tenant feature overrides (WP-1.4, D9). Used by /tenants/:id/feature-overrides and /flags/:key/overrides.

export type FeatureOverrideActor = { platformUserId: string; email: string; label: string; ipAddress?: string | null; userAgent?: string | null };

export class FeatureOverrideError extends Error {
  constructor(
    readonly code: 'TENANT_NOT_FOUND' | 'UNKNOWN_FEATURE' | 'INVALID_EXPIRY' | 'OVERRIDE_NOT_FOUND' | 'ALREADY_REVOKED',
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

function announceChange(app: FastifyInstance, tenantId: string) {
  invalidateTenantEntitlements(app.redis, tenantId).catch((err: unknown) => app.log.error({ err, tenantId }, 'Failed to invalidate entitlements'));
  app.redis
    .publish(`tenant:${tenantId}:entitlements-changed`, JSON.stringify({ tenantId }))
    .catch((err: unknown) => app.log.error({ err, tenantId }, 'Failed to publish entitlements change'));
}

/** Creates an override; any active override for the same feature is revoked in the same transaction (one wins). */
export async function createFeatureOverride(
  app: FastifyInstance,
  input: { tenantId: string; featureKey: string; enabled: boolean; reason: string; expiresAt?: Date | null; actor: FeatureOverrideActor }
) {
  if (!planService.featureKeys().includes(input.featureKey)) {
    throw new FeatureOverrideError('UNKNOWN_FEATURE', 400, `Unknown feature key "${input.featureKey}". Known keys: ${planService.featureKeys().join(', ')}`);
  }
  if (input.expiresAt && input.expiresAt <= new Date()) throw new FeatureOverrideError('INVALID_EXPIRY', 400, 'expiresAt must be in the future');

  const result = await app.prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true, name: true } });
    if (!tenant) throw new FeatureOverrideError('TENANT_NOT_FOUND', 404, 'Tenant not found');
    const now = new Date();
    await tx.tenantFeatureOverride.updateMany({
      where: { tenantId: tenant.id, featureKey: input.featureKey, revokedAt: null },
      data: { revokedAt: now, revokedByPlatformUserId: input.actor.platformUserId }
    });
    const override = await tx.tenantFeatureOverride.create({
      data: {
        tenantId: tenant.id,
        featureKey: input.featureKey,
        enabled: input.enabled,
        reason: input.reason,
        expiresAt: input.expiresAt ?? null,
        createdByPlatformUserId: input.actor.platformUserId
      }
    });
    await writePlatformAuditLog(tx, {
      actorType: 'PLATFORM_USER',
      actorId: input.actor.platformUserId,
      actorEmail: input.actor.email,
      action: 'TENANT_FEATURE_OVERRIDE',
      targetTenantId: tenant.id,
      reason: input.reason,
      metadata: { overrideId: override.id, featureKey: input.featureKey, enabled: input.enabled, expiresAt: input.expiresAt?.toISOString() ?? null },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null
    });
    const activity = await recordActivity(tx, {
      service: 'platform.flags',
      type: 'tenant.feature_overridden',
      tenantId: tenant.id,
      actorType: 'STAFF',
      actorId: input.actor.platformUserId,
      actorLabel: input.actor.label,
      subjectType: 'tenant_feature_override',
      subjectId: override.id,
      summary: `${tenant.name}: ${input.featureKey} ${input.enabled ? 'enabled' : 'disabled'}${input.expiresAt ? ` until ${input.expiresAt.toISOString().slice(0, 10)}` : ''}`,
      severity: 'ATTENTION',
      consoleLink: `/platform/tenants/${tenant.id}`,
      dedupeKey: `tenant.feature_overridden:${override.id}`
    });
    return { override, activity };
  });
  publishActivity(app.redis, result.activity, app.log);
  announceChange(app, input.tenantId);
  return result.override;
}

export async function revokeFeatureOverride(app: FastifyInstance, input: { tenantId: string; overrideId: string; reason: string; actor: FeatureOverrideActor; featureKey?: string }) {
  const result = await app.prisma.$transaction(async (tx) => {
    const override = await tx.tenantFeatureOverride.findFirst({
      where: { id: input.overrideId, tenantId: input.tenantId, ...(input.featureKey ? { featureKey: input.featureKey } : {}) },
      include: { tenant: { select: { name: true } } }
    });
    if (!override) throw new FeatureOverrideError('OVERRIDE_NOT_FOUND', 404, 'Feature override not found');
    if (override.revokedAt) throw new FeatureOverrideError('ALREADY_REVOKED', 409, 'Feature override is already revoked');
    const revoked = await tx.tenantFeatureOverride.update({
      where: { id: override.id },
      data: { revokedAt: new Date(), revokedByPlatformUserId: input.actor.platformUserId }
    });
    await writePlatformAuditLog(tx, {
      actorType: 'PLATFORM_USER',
      actorId: input.actor.platformUserId,
      actorEmail: input.actor.email,
      action: 'TENANT_FEATURE_OVERRIDE_REVOKED',
      targetTenantId: input.tenantId,
      reason: input.reason,
      metadata: { overrideId: override.id, featureKey: override.featureKey },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null
    });
    const activity = await recordActivity(tx, {
      service: 'platform.flags',
      type: 'tenant.feature_override_revoked',
      tenantId: input.tenantId,
      actorType: 'STAFF',
      actorId: input.actor.platformUserId,
      actorLabel: input.actor.label,
      subjectType: 'tenant_feature_override',
      subjectId: override.id,
      summary: `${override.tenant.name}: ${override.featureKey} override revoked`,
      severity: 'ATTENTION',
      consoleLink: `/platform/tenants/${input.tenantId}`,
      dedupeKey: `tenant.feature_override_revoked:${override.id}`
    });
    return { revoked, activity };
  });
  publishActivity(app.redis, result.activity, app.log);
  announceChange(app, input.tenantId);
  return result.revoked;
}

export function consoleOverrideActor(request: { platform?: { user: { id: string; email: string; name: string | null } }; ip: string; headers: Record<string, unknown> }): FeatureOverrideActor {
  const user = request.platform!.user;
  const forwarded = request.headers['x-forwarded-for'];
  return {
    platformUserId: user.id,
    email: user.email,
    label: user.name ?? user.email,
    ipAddress: typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.ip,
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null
  };
}
