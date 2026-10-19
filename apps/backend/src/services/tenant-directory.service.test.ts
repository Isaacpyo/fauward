import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { listTenants, tenantListQuery, tenantListWhere } from './tenant-directory.service.js';
import { mrrForSubscription, sumMrr } from './revenue/mrr.service.js';

const NOW = new Date('2026-10-18T12:00:00.000Z');

function tenantRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Tenant ${id}`,
    slug: id,
    customDomain: null,
    plan: 'STARTER',
    status: 'ACTIVE',
    region: 'uk_europe',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    closedAt: null,
    subscription: { plan: 'STARTER', billingCycle: 'MONTHLY', status: 'ACTIVE' },
    _count: { shipments: 7 },
    ...overrides
  };
}

function directoryDb(rows: ReturnType<typeof tenantRow>[], extra: Record<string, unknown> = {}) {
  return {
    tenant: { findMany: vi.fn(async ({ take }: { take: number }) => rows.slice(0, take)), count: vi.fn(async () => rows.length) },
    tenantPlanOverride: { findMany: vi.fn(async () => [{ tenantId: 't_a', plan: 'PRO' }]) },
    tenantHealthScore: { findMany: vi.fn(async () => [{ tenantId: 't_b', score: 64, computedAt: NOW }]) },
    user: { groupBy: vi.fn(async () => [{ tenantId: 't_a', _count: { _all: 4 } }]) },
    tenantAiUsage: { groupBy: vi.fn(async () => [{ tenantId: 't_a', _sum: { costUsd: 4.205 } }]) },
    pricingOverride: { findMany: vi.fn(async () => []) },
    customContract: { findFirst: vi.fn(async () => null) },
    currencyRate: { findUnique: vi.fn(async () => null) },
    ...extra
  };
}

describe('tenant directory (platform.tenants, WP-1.2)', () => {
  it('ACC-TEN-1 search matches name, slug and custom domain; DEMO tenants are excluded unless asked for', () => {
    const where = tenantListWhere(tenantListQuery.parse({ search: 'northwind.co' }), NOW);
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { OR: [{ name: { contains: 'northwind.co', mode: 'insensitive' } }, { slug: { contains: 'northwind.co', mode: 'insensitive' } }, { customDomain: { contains: 'northwind.co', mode: 'insensitive' } }] },
        { status: { not: 'DEMO' } }
      ])
    );
    expect(tenantListWhere(tenantListQuery.parse({ status: 'DEMO' }), NOW).AND).toContainEqual({ status: 'DEMO' });
  });

  it('ACC-TEN-1 cursor pagination: limit + 1 rows → nextCursor is the last returned id; the next page starts after it', async () => {
    const rows = [tenantRow('t_a'), tenantRow('t_b'), tenantRow('t_c')];
    const db = directoryDb(rows);
    const page = await listTenants(db as never, tenantListQuery.parse({ limit: '2' }), NOW);
    expect(page.data.map((row) => row.id)).toEqual(['t_a', 't_b']);
    expect(page).toMatchObject({ total: 3, nextCursor: 't_b' });
    await listTenants(db as never, tenantListQuery.parse({ limit: '2', cursor: 't_b' }), NOW);
    expect(db.tenant.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: { id: 't_b' }, skip: 1, take: 3 }));
  });

  it('rows carry effective plan, staff count, health score or null, shipments this month, AI spend this month (ACC-L16) and MRR from the plan catalogue', async () => {
    const page = await listTenants(directoryDb([tenantRow('t_a'), tenantRow('t_b', { subscription: { plan: 'PRO', billingCycle: 'ANNUAL', status: 'ACTIVE' }, plan: 'PRO' })]) as never, tenantListQuery.parse({}), NOW);
    expect(page.data[0]).toMatchObject({ id: 't_a', plan: 'STARTER', effectivePlan: 'PRO', staffCount: 4, healthScore: null, shipmentsThisMonth: 7, mrrContribution: { amount: '29.00', currency: 'GBP', source: 'plan' } });
    // PRO annual = 780 / 12
    expect(page.data[0].aiSpendThisMonthUsd).toBe('4.21');
    expect(page.data[1]).toMatchObject({ id: 't_b', staffCount: 0, aiSpendThisMonthUsd: '0.00', healthScore: 64, mrrContribution: { amount: '65.00', currency: 'GBP' } });
  });

  it('ACC-TEN-2 invalid plan/status filters are rejected and plan values use enum casing', () => {
    expect(tenantListQuery.safeParse({ plan: 'pro' }).success).toBe(false);
    expect(tenantListQuery.safeParse({ plan: 'GOLD' }).success).toBe(false);
    expect(tenantListQuery.safeParse({ status: 'active' }).success).toBe(false);
    expect(tenantListQuery.safeParse({ createdFrom: 'not-a-date' }).success).toBe(false);
    expect(tenantListQuery.safeParse({ unknownFilter: 'x' }).success).toBe(false);
    expect(tenantListQuery.safeParse({ plan: 'PRO', status: 'SUSPENDED', effectivePlan: 'ENTERPRISE' }).success).toBe(true);
  });

  it('the effectivePlan filter matches an active override for that plan, or the billing plan with no active override', () => {
    const where = tenantListWhere(tenantListQuery.parse({ effectivePlan: 'PRO' }), NOW);
    const active = { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] };
    expect(where.AND).toContainEqual({ OR: [{ planOverrides: { some: { ...active, plan: 'PRO' } } }, { plan: 'PRO', planOverrides: { none: active } }] });
  });
});

describe('mrrForSubscription (WP-1.2, reused by WP-3.1)', () => {
  const db = (extra: Record<string, unknown> = {}) => ({
    pricingOverride: { findMany: vi.fn(async () => []) },
    customContract: { findFirst: vi.fn(async () => null) },
    currencyRate: { findUnique: vi.fn(async () => null) },
    ...extra
  });

  it('is 0 for DEMO and CANCELLED tenants and for plans without a list price (ENTERPRISE without a contract)', async () => {
    expect(await mrrForSubscription(db() as never, { id: 't', status: 'DEMO', plan: 'PRO' }, null)).toMatchObject({ amount: '0.00' });
    expect(await mrrForSubscription(db() as never, { id: 't', status: 'CANCELLED', plan: 'PRO' }, null)).toMatchObject({ amount: '0.00' });
    expect(await mrrForSubscription(db() as never, { id: 't', status: 'ACTIVE', plan: 'ENTERPRISE' }, null)).toMatchObject({ amount: '0.00', source: 'none' });
  });

  it('subtracts active discount percentages and is replaced by an active contract amount', async () => {
    const discounted = await mrrForSubscription(db({ pricingOverride: { findMany: vi.fn(async () => [{ discountPercent: new Prisma.Decimal('10') }]) } }) as never, { id: 't', status: 'ACTIVE', plan: 'PRO' }, { plan: 'PRO', billingCycle: 'MONTHLY', status: 'ACTIVE' });
    expect(discounted).toEqual({ amount: '71.10', currency: 'GBP', source: 'plan' });
    const contract = await mrrForSubscription(db({ customContract: { findFirst: vi.fn(async () => ({ terms: { monthlyAmount: '1200.00', currency: 'GBP' } })) } }) as never, { id: 't', status: 'ACTIVE', plan: 'ENTERPRISE' }, null);
    expect(contract).toEqual({ amount: '1200.00', currency: 'GBP', source: 'contract' });
  });

  it('converts to the base currency with CurrencyRate, and says so when no rate exists', async () => {
    const usd = { customContract: { findFirst: vi.fn(async () => ({ terms: { monthlyAmount: '100', currency: 'USD' } })) } };
    const converted = await mrrForSubscription(db({ ...usd, currencyRate: { findUnique: vi.fn(async ({ where }: { where: { fromCurrency_toCurrency: { fromCurrency: string } } }) => (where.fromCurrency_toCurrency.fromCurrency === 'USD' ? { rate: new Prisma.Decimal('0.8') } : null)) } }) as never, { id: 't', status: 'ACTIVE', plan: 'ENTERPRISE' }, null);
    expect(converted).toEqual({ amount: '80.00', currency: 'GBP', source: 'contract' });
    const unconverted = await mrrForSubscription(db(usd) as never, { id: 't', status: 'ACTIVE', plan: 'ENTERPRISE' }, null);
    expect(unconverted).toMatchObject({ amount: '100.00', currency: 'USD', note: expect.stringContaining('No USD→GBP rate') });
    expect(sumMrr([converted, unconverted])).toEqual({ amount: '80.00', currency: 'GBP', unconverted: 1 });
  });
});

describe('getTenantDetail (WP-1.2)', () => {
  it('ACC-TEN-3 shows an active override as the effective plan and ignores an expired one', async () => {
    const { getTenantDetail } = await import('./tenant-directory.service.js');
    const overrides = [
      { id: 'tpo_old', tenantId: 't_1', plan: 'ENTERPRISE', reason: 'Old pilot', revokedAt: null, expiresAt: new Date('2026-10-01T00:00:00Z'), createdAt: new Date('2026-09-01T00:00:00Z') },
      { id: 'tpo_now', tenantId: 't_1', plan: 'PRO', reason: 'Launch partner', revokedAt: null, expiresAt: null, createdAt: new Date('2026-08-01T00:00:00Z') }
    ];
    const tenant = { ...tenantRow('t_1'), maxStaff: 3, maxShipmentsPm: 300, maxOrganisations: 10, limitsOverriddenAt: null, kycStatus: 'PENDING', customDomainStatus: 'NONE', suspendedAt: null, suspensionReason: null, closedReason: null, purgeAfter: null, internalNotes: null, defaultCurrency: 'GBP', timezone: 'Europe/London', logoUrl: null, primaryColor: '#000', accentColor: '#fff', brandName: null, subscription: null };
    const db = {
      ...directoryDb([]),
      tenant: { findUnique: vi.fn(async () => tenant) },
      tenantPlanOverride: {
        findFirst: vi.fn(async ({ where }: { where: { OR: Array<{ expiresAt: null | { gt: Date } }> } }) => {
          const now = (where.OR[1].expiresAt as { gt: Date }).gt;
          return overrides.filter((row) => !row.expiresAt || row.expiresAt > now).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
        })
      },
      tenantFeatureOverride: { findMany: vi.fn(async () => []) },
      suspensionRecord: { findMany: vi.fn(async () => [{ id: 'susp_1', status: 'ACTIVE' }, { id: 'susp_0', status: 'LIFTED' }]) },
      usageRecord: { findMany: vi.fn(async () => [{ month: '2026-10', shipments: 12, apiCalls: 3, smsSent: 0, emailsSent: 4 }]) },
      user: { count: vi.fn(async () => 5), findMany: vi.fn(async () => [{ id: 'u_1', email: 'owner@t.test', firstName: 'Ada', lastName: null, lastLogin: new Date('2026-10-17T08:00:00Z') }]), aggregate: vi.fn(async () => ({ _max: { lastLogin: new Date('2026-10-18T07:00:00Z') } })) },
      platformImpersonationSession: { findMany: vi.fn(async () => []) },
      tenantHealthScore: { findFirst: vi.fn(async () => null) },
      regionChangeRequest: { findFirst: vi.fn(async () => null) }
    };
    const detail = await getTenantDetail(db as never, 't_1', NOW);
    expect(detail?.plan).toMatchObject({ billingPlan: 'STARTER', effectivePlan: 'PRO', planOverride: { id: 'tpo_now', plan: 'PRO' } });
    expect(detail?.entitlements.features.apiAccess).toMatchObject({ enabled: true, source: 'plan' });
    expect(detail?.suspensions.active).toEqual([{ id: 'susp_1', status: 'ACTIVE' }]);
    expect(detail?.usage).toHaveLength(7);
    expect(detail?.usage[0]).toEqual({ month: '2026-10', shipments: 12, apiCalls: 3, smsSent: 0, emailsSent: 4 });
    expect(detail?.staff).toEqual({ count: 5, admins: [{ id: 'u_1', email: 'owner@t.test', name: 'Ada', lastLoginAt: '2026-10-17T08:00:00.000Z' }], lastLoginAt: '2026-10-18T07:00:00.000Z' });
    expect(detail?.healthScore).toBeNull();
  });
});
