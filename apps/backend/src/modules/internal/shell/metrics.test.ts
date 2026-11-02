import Fastify, { type FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

// GET /api/internal/metrics/overview (WP-3.1): MRR from mrrForSubscription over billing subscriptions, every other
// figure counted live and returned only to callers holding the permission that reads it.

const STAFF: Record<string, Permission[]> = {
  pu_root: [
    'revenue.analytics.read',
    'platform.tenants.read',
    'platform.queues.read',
    'platform.health.read',
    'revenue.invoices.read',
    'customer.support.read',
    'platform.incidents.read',
    'trust.jit.approve',
    'revenue.subscriptions.read',
    'trust.safety.read',
    'trust.compliance.dsar.read'
  ],
  pu_support: ['customer.support.read', 'platform.tenants.read']
};

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { headers: Record<string, unknown>; platform?: unknown }) => {
    const id = String(request.headers['x-test-user'] ?? 'pu_root');
    request.platform = { user: { id, email: `${id}@fauward.com`, name: null, status: 'ACTIVE', mfaEnabled: true }, session: { id: `ps_${id}`, mfaVerifiedAt: new Date() }, claims: { sub: id } };
  }
}));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async (_prisma: unknown, user: { id: string }) => ({ staff: null, roles: [], rolePermissions: new Set(STAFF[user.id]), jit: new Map(), permissions: STAFF[user.id] }))
}));
vi.mock('../../../queues/queues.js', () => ({}));
vi.mock('../../notifications/notifications.worker.js', () => ({}));
vi.mock('../../../queues/outbox.worker.js', () => ({}));
vi.mock('../../../queues/webhook.worker.js', () => ({}));

type Sub = { plan: string; billingCycle: string; status: string; tenant: { id: string; status: string; plan: string } };

const SUBSCRIPTIONS: Sub[] = [
  { plan: 'STARTER', billingCycle: 'MONTHLY', status: 'ACTIVE', tenant: { id: 't_starter', status: 'ACTIVE', plan: 'STARTER' } },
  { plan: 'PRO', billingCycle: 'ANNUAL', status: 'PAST_DUE', tenant: { id: 't_pro', status: 'ACTIVE', plan: 'PRO' } },
  { plan: 'ENTERPRISE', billingCycle: 'MONTHLY', status: 'ACTIVE', tenant: { id: 't_ent', status: 'ACTIVE', plan: 'ENTERPRISE' } },
  // Not billing: excluded by status, or a DEMO tenant.
  { plan: 'PRO', billingCycle: 'MONTHLY', status: 'TRIALING', tenant: { id: 't_trial', status: 'TRIALING', plan: 'PRO' } },
  { plan: 'PRO', billingCycle: 'MONTHLY', status: 'ACTIVE', tenant: { id: 't_demo', status: 'DEMO', plan: 'PRO' } }
];

function createPrisma() {
  const count = (value: number) => vi.fn(async () => value);
  return {
    subscription: {
      findMany: vi.fn(async ({ where }: { where: { status: { in: string[] }; tenant: { status: { not: string } } } }) =>
        SUBSCRIPTIONS.filter((sub) => where.status.in.includes(sub.status) && sub.tenant.status !== where.tenant.status.not)
      )
    },
    // A 10% discount on the PRO annual subscription; the ENTERPRISE tenant has one too, but its contract price wins.
    pricingOverride: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string } }) => (['t_pro', 't_ent'].includes(where.tenantId) ? [{ discountPercent: new Prisma.Decimal('10') }] : []))
    },
    customContract: {
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string } }) => (where.tenantId === 't_ent' ? { terms: { monthlyAmount: '1000.00', currency: 'GBP' } } : null))
    },
    currencyRate: { findUnique: vi.fn(async () => null) },
    tenant: {
      count: vi.fn(async ({ where }: { where: { status?: string; createdAt?: unknown } }) => (where.createdAt ? 4 : where.status === 'ACTIVE' ? 120 : where.status === 'TRIALING' ? 18 : where.status === 'SUSPENDED' ? 3 : 0))
    },
    shipment: { count: vi.fn(async ({ where }: { where: { createdAt: { gte: Date } } }) => (Date.now() - where.createdAt.gte.getTime() > 2 * 86_400_000 ? 9_400 : 310)) },
    payment: { count: count(2) },
    supportTicket: { count: count(11) },
    exceptionCase: { count: count(5) },
    refundApproval: { count: count(1) },
    jitAccessRequest: { count: count(2) },
    planChangeRequest: { count: count(3) },
    regionChangeRequest: { count: count(1) },
    tenantAppeal: { count: count(4) },
    dSARRequest: { count: count(6) }
  };
}

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function buildApp(prisma = createPrisma()) {
  const app = Fastify();
  apps.push(app);
  app.decorate('prisma', prisma as never);
  app.decorate('redis', { hgetall: vi.fn(async () => ({})) } as never);
  const { registerConsoleMetricsRoutes } = await import('./metrics.routes.js');
  await registerConsoleMetricsRoutes(app, { queues: () => [] });
  return { app, prisma };
}

describe('GET /api/internal/metrics/overview (WP-3.1)', () => {
  it('ACC-DASH-1 MRR over STARTER monthly, PRO annual (10% override) and ENTERPRISE (contract) equals the hand-computed value', async () => {
    const { app } = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/api/internal/metrics/overview' })).json() as Record<string, unknown>;
    // STARTER monthly 29.00 + PRO annual 780.00 / 12 = 65.00 less 10% = 58.50 + ENTERPRISE contract 1000.00 = 1087.50.
    // The trialing subscription and the DEMO tenant contribute nothing.
    expect(body.mrr).toMatchObject({ amount: '1087.50', currency: 'GBP', converted: 0, unconverted: 0, subscriptions: 3 });
    expect(body).toMatchObject({
      activeTenants: 120,
      trialingTenants: 18,
      suspendedTenants: 3,
      signups7d: 4,
      shipmentsToday: 310,
      shipments30d: 9_400,
      dlqDepth: 0,
      error5xxRate1h: { rate: null, requests: 0 },
      failedPayments30d: 2,
      openPlatformTickets: 11,
      openEscalations: 5,
      pendingApprovals: { refunds: 1, jit: 2, planChanges: 3, regionRequests: 1, appeals: 4, dsar: 6 }
    });
  });

  it('ACC-DASH-2 a caller without revenue.analytics.read gets no money fields, and only the counts they may read', async () => {
    const { app, prisma } = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/api/internal/metrics/overview', headers: { 'x-test-user': 'pu_support' } })).json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('mrr');
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    expect(body).toMatchObject({ activeTenants: 120, openPlatformTickets: 11, pendingApprovals: { regionRequests: 1 } });
    for (const hidden of ['dlqDepth', 'error5xxRate1h', 'failedPayments30d', 'openEscalations']) expect(body).not.toHaveProperty(hidden);
    expect(body.pendingApprovals).toEqual({ regionRequests: 1 });
  });
});
