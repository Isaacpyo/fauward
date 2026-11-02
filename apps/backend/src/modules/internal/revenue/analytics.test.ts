import Fastify, { type FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

// revenue.analytics (WP-3.2) over a hand-computed SubscriptionEvent fixture (GBP; STARTER 29.00, PRO 79.00 monthly).

const STAFF: Record<string, Permission[]> = { pu_finance: ['revenue.analytics.read'], pu_cs: ['customer.360.read'] };

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { headers: Record<string, unknown>; platform?: unknown }) => {
    const id = String(request.headers['x-test-user'] ?? 'pu_finance');
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

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const dec = (value: string) => new Prisma.Decimal(value);

type Event = { tenantId: string; type: string; fromPlan?: string | null; toPlan?: string | null; toStatus?: string | null; mrrBefore?: Prisma.Decimal | null; mrrAfter?: Prisma.Decimal | null; source: string; occurredAt: Date };

const EVENTS: Event[] = [
  // D: created before event tracking; the 0051 backfill wrote CREATED/TRIALING and the subscription is ACTIVE today.
  { tenantId: 't_d', type: 'CREATED', toPlan: 'STARTER', toStatus: 'TRIALING', source: 'BACKFILL', occurredAt: d('2026-05-15') },
  // A: trial in June, converts in July (new 29), upgrades in August (expansion +50).
  { tenantId: 't_a', type: 'CREATED', toPlan: 'STARTER', toStatus: 'TRIALING', source: 'TENANT', occurredAt: d('2026-06-03') },
  { tenantId: 't_a', type: 'STATUS_CHANGED', toPlan: 'STARTER', toStatus: 'ACTIVE', source: 'STRIPE_WEBHOOK', occurredAt: d('2026-07-03') },
  { tenantId: 't_a', type: 'PLAN_CHANGED', fromPlan: 'STARTER', toPlan: 'PRO', mrrBefore: dec('29.00'), mrrAfter: dec('79.00'), source: 'STRIPE_WEBHOOK', occurredAt: d('2026-08-10') },
  // B: converts in June (new 79), cancels in August (churn −79), comes back in September (reactivation +79).
  { tenantId: 't_b', type: 'CREATED', toPlan: 'PRO', toStatus: 'TRIALING', source: 'TENANT', occurredAt: d('2026-06-10') },
  { tenantId: 't_b', type: 'STATUS_CHANGED', toPlan: 'PRO', toStatus: 'ACTIVE', source: 'STRIPE_WEBHOOK', occurredAt: d('2026-06-24') },
  { tenantId: 't_b', type: 'CANCELLED', toPlan: 'PRO', toStatus: 'CANCELLED', source: 'STRIPE_WEBHOOK', occurredAt: d('2026-08-20') },
  { tenantId: 't_b', type: 'REACTIVATED', toPlan: 'PRO', toStatus: 'ACTIVE', source: 'CONSOLE', occurredAt: d('2026-09-05') },
  // C: signs up paying in July (new 79), downgrades in September (contraction −50).
  { tenantId: 't_c', type: 'CREATED', toPlan: 'PRO', toStatus: 'ACTIVE', source: 'TENANT', occurredAt: d('2026-07-01') },
  { tenantId: 't_c', type: 'PLAN_CHANGED', fromPlan: 'PRO', toPlan: 'STARTER', mrrBefore: dec('79.00'), mrrAfter: dec('29.00'), source: 'CONSOLE', occurredAt: d('2026-09-12') }
];

const TENANTS = [
  { id: 't_a', createdAt: d('2026-06-03'), status: 'ACTIVE', plan: 'PRO' },
  { id: 't_b', createdAt: d('2026-06-10'), status: 'ACTIVE', plan: 'PRO' },
  { id: 't_c', createdAt: d('2026-07-01'), status: 'ACTIVE', plan: 'STARTER' },
  { id: 't_d', createdAt: d('2026-05-15'), status: 'ACTIVE', plan: 'STARTER' },
  { id: 't_demo', createdAt: d('2026-06-01'), status: 'DEMO', plan: 'PRO' }
];
const SUBSCRIPTIONS = [
  { tenantId: 't_a', plan: 'PRO', billingCycle: 'MONTHLY', status: 'ACTIVE' },
  { tenantId: 't_b', plan: 'PRO', billingCycle: 'MONTHLY', status: 'ACTIVE' },
  { tenantId: 't_c', plan: 'STARTER', billingCycle: 'MONTHLY', status: 'ACTIVE' },
  { tenantId: 't_d', plan: 'STARTER', billingCycle: 'MONTHLY', status: 'ACTIVE' },
  { tenantId: 't_demo', plan: 'PRO', billingCycle: 'MONTHLY', status: 'ACTIVE' }
];

function prisma() {
  return {
    subscriptionEvent: { findMany: vi.fn(async () => EVENTS.map((event) => ({ fromPlan: null, toPlan: null, toStatus: null, mrrBefore: null, mrrAfter: null, currency: 'GBP', ...event }))) },
    tenant: { findMany: vi.fn(async ({ where }: { where: { status: { not: string } } }) => TENANTS.filter((tenant) => tenant.status !== where.status.not)) },
    subscription: {
      findMany: vi.fn(async ({ where }: { where?: { status: { in: string[] }; tenant: { status: { not: string } } } }) =>
        SUBSCRIPTIONS.map((row) => ({ ...row, tenant: TENANTS.find((tenant) => tenant.id === row.tenantId)! })).filter(
          (row) => !where || (where.status.in.includes(row.status) && row.tenant.status !== where.tenant.status.not)
        )
      )
    },
    pricingOverride: { findMany: vi.fn(async () => []) },
    customContract: { findFirst: vi.fn(async () => null) },
    currencyRate: { findUnique: vi.fn(async () => null) }
  };
}

const apps: FastifyInstance[] = [];
let app: FastifyInstance;
beforeEach(async () => {
  app = Fastify();
  apps.push(app);
  app.decorate('prisma', prisma() as never);
  app.decorate('redis', {} as never);
  const { registerConsoleRevenueAnalyticsRoutes } = await import('./analytics.routes.js');
  await registerConsoleRevenueAnalyticsRoutes(app);
});
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(apps.splice(0).map((instance) => instance.close()));
});

const get = async (url: string, user = 'pu_finance') => app.inject({ method: 'GET', url, headers: { 'x-test-user': user } });

describe('revenue.analytics (WP-3.2)', () => {
  it('ACC-REV-1 MRR movement for the fixture events equals the hand-computed table', async () => {
    const response = await get('/api/internal/revenue/analytics/mrr-movement?from=2026-05&to=2026-09');
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: Array<Record<string, unknown>> };
    expect(body.data).toEqual([
      { month: '2026-05', new: '29.00', expansion: '0.00', contraction: '0.00', churn: '0.00', reactivation: '0.00', net: '29.00', reconstructed: true },
      { month: '2026-06', new: '79.00', expansion: '0.00', contraction: '0.00', churn: '0.00', reactivation: '0.00', net: '79.00', reconstructed: false },
      { month: '2026-07', new: '108.00', expansion: '0.00', contraction: '0.00', churn: '0.00', reactivation: '0.00', net: '108.00', reconstructed: false },
      { month: '2026-08', new: '0.00', expansion: '50.00', contraction: '0.00', churn: '-79.00', reactivation: '0.00', net: '-29.00', reconstructed: false },
      { month: '2026-09', new: '0.00', expansion: '0.00', contraction: '-50.00', churn: '0.00', reactivation: '79.00', net: '29.00', reconstructed: false }
    ]);
    expect((await get('/api/internal/revenue/analytics/mrr-movement?from=2026-09&to=2026-05')).statusCode).toBe(400);
    expect((await get('/api/internal/revenue/analytics/mrr-movement', 'pu_cs')).statusCode).toBe(403);
  });

  it('ACC-REV-2 the signup-month cohort matrix (logo and revenue retention) matches the fixture', async () => {
    const body = (await get('/api/internal/revenue/analytics/cohorts?by=signup_month&from=2026-05&to=2026-09')).json() as {
      data: Array<{ cohort: string; signups: number; paying: number; startingMrr: string; months: Array<{ month: string; payingTenants: number; logoRetention: number | null; mrr: string; revenueRetention: number | null }> }>;
    };
    expect(body.data.map((row) => [row.cohort, row.signups, row.paying, row.startingMrr])).toEqual([
      ['2026-05', 1, 1, '29.00'],
      ['2026-06', 2, 2, '108.00'],
      ['2026-07', 1, 1, '79.00']
    ]);
    const june = body.data[1].months.map((month) => [month.month, month.payingTenants, month.logoRetention, month.mrr, month.revenueRetention]);
    expect(june).toEqual([
      ['2026-06', 1, 0.5, '79.00', 0.731],
      ['2026-07', 2, 1, '108.00', 1],
      ['2026-08', 1, 0.5, '79.00', 0.731],
      ['2026-09', 2, 1, '158.00', 1.463]
    ]);
    expect(body.data[2].months.at(-1)).toMatchObject({ month: '2026-09', mrr: '29.00', revenueRetention: 0.367, logoRetention: 1 });
    expect((await get('/api/internal/revenue/analytics/cohorts?by=plan')).statusCode).toBe(400);
  });

  it('by-plan returns current MRR and tenant count per plan and billing cycle (DEMO excluded)', async () => {
    const body = (await get('/api/internal/revenue/analytics/by-plan')).json() as { rows: Array<{ plan: string; billingCycle: string; tenants: number; mrr: string }>; total: string; currency: string };
    expect(body.rows).toEqual([
      { plan: 'PRO', billingCycle: 'MONTHLY', tenants: 2, mrr: '158.00', unconverted: 0 },
      { plan: 'STARTER', billingCycle: 'MONTHLY', tenants: 2, mrr: '58.00', unconverted: 0 }
    ]);
    expect(body).toMatchObject({ total: '216.00', currency: 'GBP' });
  });

  it('ACC-REV-3 the forecast is labelled "projection" and states its method and basis', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T09:00:00.000Z'));
    const body = (await get('/api/internal/revenue/analytics/forecast?months=3')).json() as {
      label: string;
      method: string;
      basis: { months: Array<{ month: string; net: string }>; averageNet: string; startingMrr: string };
      points: Array<{ month: string; mrr: string }>;
      currency: string;
    };
    expect(body.label).toBe('projection');
    expect(body.method).toMatch(/^Run-rate projection: current MRR plus/);
    // Trailing complete months Jul +108, Aug −29, Sep +29 → average +36.00 per month from 216.00.
    expect(body.basis).toEqual({ months: [{ month: '2026-07', net: '108.00' }, { month: '2026-08', net: '-29.00' }, { month: '2026-09', net: '29.00' }], averageNet: '36.00', startingMrr: '216.00' });
    expect(body.points).toEqual([
      { month: '2026-11', mrr: '252.00' },
      { month: '2026-12', mrr: '288.00' },
      { month: '2027-01', mrr: '324.00' }
    ]);
    expect(body.currency).toBe('GBP');
  });

  it('ACC-REV-4 every response says since when data exists and before when it is reconstructed', async () => {
    for (const path of ['mrr-movement', 'cohorts', 'by-plan', 'forecast']) {
      const body = (await get(`/api/internal/revenue/analytics/${path}`)).json() as { dataSince: string; reconstructedBefore: string };
      expect(body.dataSince, path).toBe('2026-05-15T12:00:00.000Z');
      expect(body.reconstructedBefore, path).toBe('2026-06-03T12:00:00.000Z');
    }
  });
});
