import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient, TenantPlan } from '@prisma/client';
import type Redis from 'ioredis';
import { planService } from '../modules/tenants/plan.service.js';

// Entitlements (architecture §9.5, WP-1.4): what a tenant may use right now = the effective plan (active, unexpired
// TenantPlanOverride ?? billing plan) with TenantFeatureOverride rows applied. requireFeature, requirePlan, the
// impersonation token and GET /tenants/me/entitlements all read this; nothing reads tenant.plan for gating.

export const ENTITLEMENTS_CACHE_SECONDS = 300;
export const entitlementsCacheKey = (tenantId: string) => `tenant:${tenantId}:entitlements`;

export type FeatureEntitlement = { enabled: boolean; source: 'plan' | 'override'; overrideId?: string; expiresAt?: string | null };

export type TenantEntitlements = {
  tenantId: string;
  billingPlan: string;
  effectivePlan: string;
  planOverride: { id: string; plan: string; reason: string; expiresAt: string | null } | null;
  features: Record<string, FeatureEntitlement>;
  limits: { maxStaff: number; maxShipmentsPm: number; maxOrganisations: number; apiRateLimit: number };
  computedAt: string;
  /** When the next override expires (or null): the cache never outlives it. */
  changesAt: string | null;
};

export type EntitlementTenant = { id: string; plan: TenantPlan | string; maxStaff: number; maxShipmentsPm: number; maxOrganisations: number };
type EntitlementDb = Pick<PrismaClient, 'tenantPlanOverride' | 'tenantFeatureOverride'>;

function earliest(dates: Array<Date | null | undefined>) {
  const times = dates.filter((date): date is Date => Boolean(date)).map((date) => date.getTime());
  return times.length > 0 ? new Date(Math.min(...times)) : null;
}

function activePlanOverride(db: Pick<PrismaClient, 'tenantPlanOverride'>, tenantId: string, now: Date) {
  return db.tenantPlanOverride.findFirst({
    where: { tenantId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: 'desc' }
  });
}

/** Active, unexpired plan override ?? billing plan — the same rule resolveTenantEntitlements uses. */
export async function effectivePlanFor(db: Pick<PrismaClient, 'tenantPlanOverride'>, tenant: { id: string; plan: TenantPlan | string }, now = new Date()) {
  return (await activePlanOverride(db, tenant.id, now))?.plan ?? String(tenant.plan);
}

/** Computes entitlements from the database (no cache). */
export async function resolveTenantEntitlements(db: EntitlementDb, tenant: EntitlementTenant, now = new Date()): Promise<TenantEntitlements> {
  const [planOverride, featureOverrides] = await Promise.all([
    activePlanOverride(db, tenant.id, now),
    db.tenantFeatureOverride.findMany({
      where: { tenantId: tenant.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  const billingPlan = String(tenant.plan);
  const effectivePlan = planOverride?.plan ?? billingPlan;
  const planFeatures = planService.getFeatures(effectivePlan);
  const features: Record<string, FeatureEntitlement> = {};
  for (const key of planService.featureKeys()) {
    features[key] = { enabled: planFeatures[key] === true, source: 'plan' };
  }
  // Rows are newest first: the first active row per key wins.
  for (const override of featureOverrides) {
    if (features[override.featureKey]?.source === 'override') continue;
    features[override.featureKey] = { enabled: override.enabled, source: 'override', overrideId: override.id, expiresAt: override.expiresAt?.toISOString() ?? null };
  }

  const changesAt = earliest([planOverride?.expiresAt, ...featureOverrides.map((row) => row.expiresAt)]);
  return {
    tenantId: tenant.id,
    billingPlan,
    effectivePlan,
    planOverride: planOverride ? { id: planOverride.id, plan: planOverride.plan, reason: planOverride.reason, expiresAt: planOverride.expiresAt?.toISOString() ?? null } : null,
    features,
    limits: {
      maxStaff: tenant.maxStaff,
      maxShipmentsPm: tenant.maxShipmentsPm,
      maxOrganisations: tenant.maxOrganisations,
      apiRateLimit: planService.getLimit(effectivePlan, 'apiRateLimit')
    },
    computedAt: now.toISOString(),
    changesAt: changesAt?.toISOString() ?? null
  };
}

type CacheDeps = { prisma: EntitlementDb; redis?: Pick<Redis, 'get' | 'set'> | null; log?: Pick<FastifyBaseLogger, 'warn'> };

/**
 * Cached entitlements (Redis, ≤ 5 min and never past the next override expiry). Producers invalidate with
 * invalidateTenantEntitlements; the plan-changed subscriber does the same for every instance. A Redis failure falls back
 * to the database instead of failing the request.
 */
export async function getTenantEntitlements(deps: CacheDeps, tenant: EntitlementTenant, now = new Date()): Promise<TenantEntitlements> {
  const key = entitlementsCacheKey(tenant.id);
  if (deps.redis) {
    try {
      const cached = await deps.redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached) as TenantEntitlements;
        if (!parsed.changesAt || new Date(parsed.changesAt) > now) return parsed;
      }
    } catch (err) {
      deps.log?.warn({ err, tenantId: tenant.id }, 'Entitlements cache read failed; using the database');
    }
  }
  const fresh = await resolveTenantEntitlements(deps.prisma, tenant, now);
  if (deps.redis) {
    const untilChange = fresh.changesAt ? Math.floor((new Date(fresh.changesAt).getTime() - now.getTime()) / 1000) : ENTITLEMENTS_CACHE_SECONDS;
    const ttl = Math.max(1, Math.min(ENTITLEMENTS_CACHE_SECONDS, untilChange));
    await deps.redis.set(key, JSON.stringify(fresh), 'EX', ttl).catch((err: unknown) => deps.log?.warn({ err, tenantId: tenant.id }, 'Entitlements cache write failed'));
  }
  return fresh;
}

export async function invalidateTenantEntitlements(redis: Pick<Redis, 'del'> | undefined | null, tenantId: string) {
  if (!redis) return;
  await redis.del(entitlementsCacheKey(tenantId));
}

export function isFeatureEnabled(entitlements: Pick<TenantEntitlements, 'features'>, feature: string) {
  return entitlements.features[feature]?.enabled === true;
}
