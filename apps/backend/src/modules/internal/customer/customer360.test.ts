import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

let permissions: Permission[] = [];
vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_csm', email: 'csm@fauward.com' }, session: { id: 'ps_1' } };
  }
}));
vi.mock('../../../middleware/require-console-permission.js', () => ({
  requireConsolePermission: (permission: Permission) => async (_request: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) =>
    permissions.includes(permission) ? undefined : reply.status(403).send({ error: 'Forbidden', permission })
}));

const tenant = {
  id: 't_1', name: 'Northwind', slug: 'northwind', customDomain: null, customDomainStatus: 'NONE', customDomainVerifiedAt: null, customDomainError: null, region: 'uk_europe', createdAt: new Date('2026-01-01T00:00:00Z'),
  status: 'ACTIVE', closedAt: null, plan: 'PRO', kycStatus: 'APPROVED', maxStaff: 3, maxShipmentsPm: 300, maxOrganisations: 10, limitsOverriddenAt: null, internalNotes: 'Key account',
  timezone: 'Europe/London', defaultCurrency: 'GBP', defaultLanguage: 'en', isRtl: false, smsEnabled: false, showPoweredBy: true, brandName: null, logoUrl: null, primaryColor: '#000', accentColor: '#fff', trackingHeadline: null
};

function prismaDouble() {
  return {
    tenant: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 't_1' ? tenant : null)) },
    subscription: { findUnique: vi.fn(async () => ({ plan: 'PRO', billingCycle: 'MONTHLY', status: 'ACTIVE', currentPeriodEnd: null })) },
    tenantPlanOverride: { findFirst: vi.fn(async () => null) },
    tenantFeatureOverride: { findMany: vi.fn(async () => []) },
    pricingOverride: { findMany: vi.fn(async () => []) },
    customContract: { findFirst: vi.fn(async () => null) },
    currencyRate: { findUnique: vi.fn(async () => null) },
    user: {
      aggregate: vi.fn(async () => ({ _max: { lastLogin: new Date('2026-10-18T07:30:00Z') } })),
      count: vi.fn(async () => 137),
      findMany: vi.fn(async () => [{ id: 'u_1', email: 'owner@northwind.test' }])
    },
    tenantHealthScore: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    suspensionRecord: { findMany: vi.fn(async () => []) },
    supportTicket: { count: vi.fn(async () => 412), findMany: vi.fn(async () => []), groupBy: vi.fn(async () => [{ status: 'OPEN', _count: { _all: 400 } }, { status: 'CLOSED', _count: { _all: 12 } }]) },
    tenantSettings: {
      findUnique: vi.fn(async () => ({ notificationEmail: 'ops@northwind.test', emailFromName: null, emailReplyTo: null, customEmailDomain: null, opsEmailRecipients: [], notifyOnStaffAccess: true, paymentGateway: 'STRIPE', paymentGatewayKey: 'sk_live_super_secret', currency: 'GBP', webhookUrl: 'https://hooks.northwind.test', webhookSecret: 'whsec_secret' }))
    },
    apiKey: { findMany: vi.fn(async () => [{ id: 'key_1', name: 'ERP', keyPrefix: 'fw_live_ab12', scopes: ['shipments:read'], isActive: true, isSandbox: false, createdAt: new Date(), lastUsedAt: null, expiresAt: null }]) },
    webhookEndpoint: { findMany: vi.fn(async () => [{ id: 'wh_1', url: 'https://erp.northwind.test/hooks', events: ['shipment.updated'], isActive: true, createdAt: new Date() }]) },
    webhookDelivery: { count: vi.fn(async () => 3) }
  };
}

const openApps: FastifyInstance[] = [];
async function buildApp(prisma = prismaDouble()) {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', prisma as never);
  const { registerCustomer360Routes } = await import('./customer360.routes.js');
  await registerCustomer360Routes(app);
  return { app, prisma };
}

afterEach(async () => {
  permissions = [];
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('Customer 360 per-tab endpoints (WP-1.8)', () => {
  it('ACC-C360-3 ACC-C360-4 the summary has the real MRR and last login, and no health score when none was computed', async () => {
    permissions = ['customer.360.read'];
    const { app } = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/internal/customer360/t_1/summary' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ mrr: { amount: '79.00', currency: 'GBP', source: 'plan' }, lastLoginAt: '2026-10-18T07:30:00.000Z', health: null, plan: { effectivePlan: 'PRO' } });
    expect(response.body.toLowerCase()).not.toContain('placeholder');
  });

  it('ACC-C360-5 counts come from count queries, not from the length of a capped list', async () => {
    permissions = ['customer.360.read', 'customer.support.read'];
    const { app } = await buildApp();
    const summary = (await app.inject({ method: 'GET', url: '/api/internal/customer360/t_1/summary' })).json() as { activeStaff: number; openTickets: number };
    expect(summary).toMatchObject({ activeStaff: 137, openTickets: 412 });
    const tickets = (await app.inject({ method: 'GET', url: '/api/internal/customer360/t_1/tickets' })).json() as { total: number; tickets: unknown[]; byStatus: Record<string, number> };
    expect(tickets.total).toBe(412);
    expect(tickets.tickets).toHaveLength(0);
    expect(tickets.byStatus).toEqual({ OPEN: 400, CLOSED: 12 });
  });

  it('ACC-C360-6 config is structured and never returns secrets', async () => {
    permissions = ['platform.tenants.read'];
    const { app } = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/internal/customer360/t_1/config' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      general: { timezone: 'Europe/London' },
      payments: { gateway: 'STRIPE', gatewayKeyConfigured: true },
      apiKeys: [{ keyPrefix: 'fw_live_ab12' }],
      webhooks: [{ url: 'https://erp.northwind.test/hooks', failuresLast30Days: 3 }],
      legacyWebhook: { secretConfigured: true }
    });
    expect(response.body).not.toMatch(/sk_live|whsec_|keyHash|"secret"/);
  });

  it('ACC-C360-2 each tab has its own permission: billing needs revenue.invoices.read even with customer.360.read', async () => {
    permissions = ['customer.360.read'];
    const { app } = await buildApp();
    const billing = await app.inject({ method: 'GET', url: '/api/internal/customer360/t_1/billing' });
    expect(billing.statusCode).toBe(403);
    expect(billing.json()).toEqual({ error: 'Forbidden', permission: 'revenue.invoices.read' });
    expect((await app.inject({ method: 'GET', url: '/api/internal/customer360/t_1/notes' })).json()).toEqual({ internalNotes: 'Key account', editPath: '/api/internal/tenants/t_1/internal-notes' });
  });

  it('unknown tenants are a 404 on every tab', async () => {
    permissions = ['customer.360.read'];
    const { app } = await buildApp();
    expect((await app.inject({ method: 'GET', url: '/api/internal/customer360/nope/people' })).statusCode).toBe(404);
  });
});
