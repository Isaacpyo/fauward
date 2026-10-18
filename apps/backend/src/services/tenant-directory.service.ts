import { z } from 'zod';
import { Prisma, TenantPlan, TenantStatus, type PrismaClient } from '@prisma/client';
import { mrrForSubscription } from './revenue/mrr.service.js';
import { resolveTenantEntitlements } from './tenant-entitlements.service.js';

// Console tenant directory (platform.tenants, WP-1.2): list with search/filters/cursor and the detail aggregate. All
// queries name the tenant explicitly (console requests run in system context, architecture §7).

const STAFF_ROLES_EXCLUDED = ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] as const;

const dateParam = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'must be an ISO date');

export const tenantListQuery = z
  .object({
    search: z.string().trim().max(200).optional(),
    plan: z.nativeEnum(TenantPlan).optional(),
    effectivePlan: z.nativeEnum(TenantPlan).optional(),
    status: z.nativeEnum(TenantStatus).optional(),
    region: z.string().trim().min(1).max(50).optional(),
    createdFrom: dateParam.optional(),
    createdTo: dateParam.optional(),
    sort: z.enum(['createdAt', 'name']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).optional()
  })
  .strict();
export type TenantListQuery = z.infer<typeof tenantListQuery>;

function activeOverrideWhere(now: Date): Prisma.TenantPlanOverrideWhereInput {
  return { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

function monthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function tenantListWhere(query: TenantListQuery, now = new Date()): Prisma.TenantWhereInput {
  const and: Prisma.TenantWhereInput[] = [];
  if (query.search) {
    and.push({
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { customDomain: { contains: query.search, mode: 'insensitive' } }
      ]
    });
  }
  if (query.plan) and.push({ plan: query.plan });
  if (query.effectivePlan) {
    const active = activeOverrideWhere(now);
    and.push({
      OR: [
        { planOverrides: { some: { ...active, plan: query.effectivePlan } } },
        { plan: query.effectivePlan, planOverrides: { none: active } }
      ]
    });
  }
  // Demo workspaces are hidden unless asked for.
  and.push({ status: query.status ?? { not: 'DEMO' } });
  if (query.region) and.push({ region: query.region });
  if (query.createdFrom || query.createdTo) {
    and.push({ createdAt: { ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}), ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}) } });
  }
  return { AND: and };
}

type DirectoryDb = Pick<PrismaClient, 'tenant' | 'tenantPlanOverride' | 'tenantHealthScore' | 'user' | 'pricingOverride' | 'customContract' | 'currencyRate'>;

export async function listTenants(db: DirectoryDb, query: TenantListQuery, now = new Date()) {
  const where = tenantListWhere(query, now);
  const orderBy: Prisma.TenantOrderByWithRelationInput[] = [{ [query.sort]: query.order }, { id: query.order }];
  const [rows, total] = await Promise.all([
    db.tenant.findMany({
      where,
      orderBy,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        subscription: { select: { plan: true, billingCycle: true, status: true } },
        _count: { select: { shipments: { where: { createdAt: { gte: monthStart(now) } } } } }
      }
    }),
    db.tenant.count({ where })
  ]);
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const ids = page.map((tenant) => tenant.id);

  const [overrides, scores, staffCounts] = await Promise.all([
    db.tenantPlanOverride.findMany({ where: { tenantId: { in: ids }, ...activeOverrideWhere(now) }, orderBy: { createdAt: 'desc' }, select: { tenantId: true, plan: true } }),
    db.tenantHealthScore.findMany({ where: { tenantId: { in: ids } }, orderBy: { computedAt: 'desc' }, select: { tenantId: true, score: true, computedAt: true } }),
    db.user.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids }, isActive: true, role: { notIn: [...STAFF_ROLES_EXCLUDED] } }, _count: { _all: true } })
  ]);
  const overrideByTenant = new Map<string, string>();
  for (const row of overrides) if (!overrideByTenant.has(row.tenantId)) overrideByTenant.set(row.tenantId, row.plan);
  const scoreByTenant = new Map<string, number>();
  for (const row of scores) if (!scoreByTenant.has(row.tenantId)) scoreByTenant.set(row.tenantId, row.score);
  const staffByTenant = new Map(staffCounts.map((row) => [row.tenantId, row._count._all]));

  const data = await Promise.all(
    page.map(async (tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
      plan: tenant.plan,
      effectivePlan: overrideByTenant.get(tenant.id) ?? tenant.plan,
      status: tenant.status,
      region: tenant.region,
      createdAt: tenant.createdAt.toISOString(),
      closedAt: tenant.closedAt?.toISOString() ?? null,
      mrrContribution: await mrrForSubscription(db, tenant, tenant.subscription, { now }),
      shipmentsThisMonth: tenant._count.shipments,
      staffCount: staffByTenant.get(tenant.id) ?? 0,
      healthScore: scoreByTenant.get(tenant.id) ?? null
    }))
  );
  return { data, total, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
}

type DetailDb = PrismaClient;

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Everything the tenant detail page shows (catalogue → platform.tenants GET /tenants/:id). Null when unknown. */
export async function getTenantDetail(db: DetailDb, tenantId: string, now = new Date()) {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } });
  if (!tenant) return null;

  const months = Array.from({ length: 7 }, (_, index) => monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))));
  const [entitlements, featureOverrides, suspensions, usage, staffCount, admins, lastLogin, impersonations, mrr, health] = await Promise.all([
    resolveTenantEntitlements(db, tenant, now),
    db.tenantFeatureOverride.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.suspensionRecord.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.usageRecord.findMany({ where: { tenantId, month: { in: months } }, orderBy: { month: 'desc' } }),
    db.user.count({ where: { tenantId, isActive: true, role: { notIn: [...STAFF_ROLES_EXCLUDED] } } }),
    db.user.findMany({
      where: { tenantId, role: 'TENANT_ADMIN', isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true, lastLogin: true },
      orderBy: { createdAt: 'asc' },
      take: 20
    }),
    db.user.aggregate({ where: { tenantId }, _max: { lastLogin: true } }),
    db.platformImpersonationSession.findMany({
      where: { targetTenantId: tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { platformUser: { select: { id: true, email: true, name: true } } }
    }),
    mrrForSubscription(db, tenant, tenant.subscription, { now }),
    db.tenantHealthScore.findFirst({ where: { tenantId }, orderBy: { computedAt: 'desc' }, select: { score: true, trend: true, computedAt: true } })
  ]);

  const pendingRow = await db.regionChangeRequest.findFirst({ where: { tenantId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
  const pendingRegionRequest = pendingRow
    ? { id: pendingRow.id, requestedRegion: pendingRow.requestedRegion, requestedBy: pendingRow.requestedByUserId, createdAt: pendingRow.createdAt.toISOString() }
    : null;
  const usageByMonth = new Map(usage.map((row) => [row.month, row]));

  return {
    identity: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
      customDomainStatus: tenant.customDomainStatus,
      region: tenant.region,
      status: tenant.status,
      kycStatus: tenant.kycStatus,
      createdAt: tenant.createdAt.toISOString(),
      suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
      suspensionReason: tenant.suspensionReason,
      closedAt: tenant.closedAt?.toISOString() ?? null,
      closedReason: tenant.closedReason,
      purgeAfter: tenant.purgeAfter?.toISOString() ?? null,
      internalNotes: tenant.internalNotes,
      defaultCurrency: tenant.defaultCurrency,
      timezone: tenant.timezone
    },
    branding: { logoUrl: tenant.logoUrl, primaryColor: tenant.primaryColor, accentColor: tenant.accentColor, brandName: tenant.brandName },
    plan: { billingPlan: tenant.plan, effectivePlan: entitlements.effectivePlan, planOverride: entitlements.planOverride },
    entitlements: { features: entitlements.features, limits: entitlements.limits, limitsSource: entitlements.limitsSource },
    limitColumns: { maxStaff: tenant.maxStaff, maxShipmentsPm: tenant.maxShipmentsPm, maxOrganisations: tenant.maxOrganisations, limitsOverriddenAt: tenant.limitsOverriddenAt?.toISOString() ?? null },
    featureOverrides,
    suspensions: { active: suspensions.filter((record) => record.status === 'ACTIVE'), history: suspensions },
    region: { current: tenant.region, pendingRequest: pendingRegionRequest },
    usage: months.map((month) => {
      const row = usageByMonth.get(month);
      return { month, shipments: row?.shipments ?? 0, apiCalls: row?.apiCalls ?? 0, smsSent: row?.smsSent ?? 0, emailsSent: row?.emailsSent ?? 0 };
    }),
    staff: {
      count: staffCount,
      admins: admins.map((admin) => ({ id: admin.id, email: admin.email, name: [admin.firstName, admin.lastName].filter(Boolean).join(' ') || null, lastLoginAt: admin.lastLogin?.toISOString() ?? null })),
      lastLoginAt: lastLogin._max.lastLogin?.toISOString() ?? null
    },
    subscription: tenant.subscription
      ? {
          plan: tenant.subscription.plan,
          billingCycle: tenant.subscription.billingCycle,
          status: tenant.subscription.status,
          currentPeriodEnd: tenant.subscription.currentPeriodEnd?.toISOString() ?? null,
          trialEnd: tenant.subscription.trialEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: tenant.subscription.cancelAtPeriodEnd,
          stripeLinked: Boolean(tenant.subscription.stripeSubscriptionId)
        }
      : null,
    mrrContribution: mrr,
    healthScore: health ? { score: health.score, trend: health.trend, computedAt: health.computedAt.toISOString() } : null,
    impersonationSessions: impersonations.map((session) => ({
      id: session.id,
      staff: session.platformUser,
      scopes: session.scopes,
      reason: session.reason,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? session.revokedAt?.toISOString() ?? null,
      endedReason: session.endedReason
    }))
  };
}
