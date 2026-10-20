import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WP-2.0: the tenant BillingTab read invented prices, renewal dates and seat counts; this endpoint is its source now.

vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: 'u_1', role: 'TENANT_ADMIN', tenantId: 'tenant_a' };
    request.tenant = { id: 'tenant_a', slug: 'northwind' };
  }
}));

const tenantRow = { id: 'tenant_a', plan: 'PRO', status: 'ACTIVE', maxStaff: 3, maxShipmentsPm: 300, maxOrganisations: 10, limitsOverriddenAt: null };
const prisma = {
  tenant: { findFirst: vi.fn() },
  subscription: { findFirst: vi.fn() },
  usageRecord: { findUnique: vi.fn() },
  user: { count: vi.fn() },
  tenantPlanOverride: { findFirst: vi.fn(async () => null) },
  tenantFeatureOverride: { findMany: vi.fn(async () => []) }
};

let app: FastifyInstance;

beforeEach(async () => {
  prisma.tenant.findFirst.mockReset().mockResolvedValue(tenantRow);
  prisma.subscription.findFirst.mockReset().mockResolvedValue({
    status: 'ACTIVE',
    billingCycle: 'ANNUAL',
    currentPeriodEnd: new Date('2027-01-31T00:00:00.000Z'),
    trialEnd: null,
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: null
  });
  prisma.usageRecord.findUnique.mockReset().mockResolvedValue({ shipments: 412, apiCalls: 1200 });
  prisma.user.count.mockReset().mockResolvedValue(6);
  app = Fastify();
  app.decorate('prisma', prisma as never);
  const { registerTenantPlatformInvoiceRoutes } = await import('./platform-invoices.routes.js');
  await registerTenantPlatformInvoiceRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/v1/tenants/me/billing/summary (WP-2.0)', () => {
  it('returns the list price for the billed plan and cycle, the real renewal date and usage against effective limits', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/tenants/me/billing/summary' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.billingPlan).toBe('PRO');
    expect(body.price).toEqual({ amount: '780.00', currency: 'GBP', cycle: 'ANNUAL' });
    expect(body.subscription).toMatchObject({ status: 'ACTIVE', currentPeriodEnd: '2027-01-31T00:00:00.000Z', managedByStripe: false });
    // PRO plan limits (C42): staff limits come from the plan, not the untouched column defaults.
    expect(body.usage.shipments).toEqual({ used: 412, limit: 2000 });
    expect(body.usage.staff).toEqual({ used: 6, limit: 15 });
    expect(prisma.user.count.mock.calls[0][0].where).toMatchObject({ tenantId: 'tenant_a', isActive: true });
    expect(prisma.subscription.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 'tenant_a' });
  });

  it('has no price for ENTERPRISE and no renewal date without a subscription (null, never guessed)', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ ...tenantRow, plan: 'ENTERPRISE' });
    prisma.subscription.findFirst.mockResolvedValue(null);
    const body = (await app.inject({ method: 'GET', url: '/api/v1/tenants/me/billing/summary' })).json();
    expect(body.price).toBeNull();
    expect(body.subscription).toBeNull();
  });
});
