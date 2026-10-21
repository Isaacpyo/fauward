import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis } from '../../../test-support/test-db.js';

// gtm.demos (WP-4.15) against real Postgres: a created demo is a DEMO tenant with seeded data whose admin can sign in
// with the returned password; the share link opens a read-only session (real tenant `authenticate`) that ends when the
// link is replaced or the demo ends; teardown and the expiry job refuse non-DEMO tenants; demos stay out of the
// tenant directory, the onboarding funnel and MRR.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'sales@fauward.test', name: 'Sales Lead', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_demos', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));

type Created = { demo: { id: string; tenant: { id: string; slug: string }; status: string; shareLinkActive: boolean; seedSummary: { shipments: number; organisations: number } }; credentials: { email: string; password: string }; shareUrl: string };

describe.runIf(HAS_TEST_DB)('gtm.demos (WP-4.15, real Postgres)', () => {
  let prisma: PrismaClient;
  let consoleApp: FastifyInstance;
  let portal: FastifyInstance;

  const create = async (prospectName = 'Northwind Couriers', template = 'courier') => {
    const response = await consoleApp.inject({ method: 'POST', url: '/api/internal/demos', payload: { template, prospectName, expiresInDays: 7 } });
    expect(response.statusCode).toBe(201);
    return response.json() as Created;
  };
  const tokenOf = (url: string) => url.split('/demo/')[1];
  const exchange = (token: string) => portal.inject({ method: 'POST', url: '/api/v1/auth/demo/exchange', payload: { token } });
  const asDemo = (method: 'GET' | 'POST', url: string, bearer: string) => portal.inject({ method, url, headers: { authorization: `Bearer ${bearer}` }, ...(method === 'POST' ? { payload: {} } : {}) });

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    consoleApp = Fastify();
    consoleApp.decorate('prisma', prisma);
    consoleApp.decorate('redis', inertRedis() as never);
    const { registerConsoleDemoRoutes } = await import('./demos.routes.js');
    await registerConsoleDemoRoutes(consoleApp);
    await consoleApp.ready();

    const { config } = await import('../../../config/index.js');
    const { authenticate } = await import('../../../shared/middleware/authenticate.js');
    const { registerDemoExchangeRoutes } = await import('../../auth/demo-exchange.routes.js');
    portal = Fastify();
    await portal.register(fastifyJwt, { secret: config.jwt.accessSecret });
    portal.decorate('prisma', prisma);
    portal.decorate('redis', inertRedis() as never);
    await registerDemoExchangeRoutes(portal);
    portal.get('/api/v1/shipments', { preHandler: [authenticate] }, async (request) => ({ count: await prisma.shipment.count({ where: { tenantId: request.user!.tenantId } }) }));
    portal.post('/api/v1/shipments', { preHandler: [authenticate] }, async () => ({ created: true }));
    await portal.ready();
  });

  beforeEach(() => {
    permissions.current = ['gtm.demos.read', 'gtm.demos.write'];
  });

  afterAll(async () => {
    await consoleApp?.close();
    await portal?.close();
    await prisma?.$disconnect();
  });

  it('ACC-DEMO-1 a created demo is a seeded DEMO tenant whose admin signs in with the returned password', async () => {
    const created = await create();
    expect(created.demo).toMatchObject({ status: 'ACTIVE', shareLinkActive: true, seedSummary: { shipments: 40, organisations: 5 } });
    expect(created.credentials.password.length).toBeGreaterThanOrEqual(16);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: created.demo.tenant.id } });
    expect(tenant).toMatchObject({ status: 'DEMO', plan: 'PRO' });
    expect(await prisma.shipment.count({ where: { tenantId: tenant.id } })).toBe(40);
    expect(await prisma.trackingSnapshot.count({ where: { tenantId: tenant.id } })).toBe(40);
    const row = await prisma.demoEnvironment.findUniqueOrThrow({ where: { id: created.demo.id } });
    expect(row.shareTokenHash).not.toContain(tokenOf(created.shareUrl));

    const { authService } = await import('../../auth/auth.service.js');
    const login = await authService.login({ email: created.credentials.email, password: created.credentials.password }, prisma, tenant.id);
    expect(login.tenantId).toBe(tenant.id);
    await expect(authService.login({ email: created.credentials.email, password: 'wrong-password' }, prisma, tenant.id)).rejects.toThrow();

    const detail = (await consoleApp.inject({ method: 'GET', url: `/api/internal/demos/${created.demo.id}` })).json();
    expect(detail).not.toHaveProperty('credentials');
    expect(JSON.stringify(detail)).not.toContain(created.credentials.password);
    expect((await consoleApp.inject({ method: 'POST', url: '/api/internal/demos', payload: { template: 'nope', prospectName: 'Acme' } })).json()).toMatchObject({ error: 'UNKNOWN_TEMPLATE' });
    expect((await consoleApp.inject({ method: 'POST', url: '/api/internal/demos', payload: { template: 'courier', prospectName: 'Acme', expiresInDays: 31 } })).statusCode).toBe(400);
  });

  it('ACC-DEMO-2 the share link opens a read-only session that ends when the link is replaced or the demo expires', async () => {
    const created = await create('Acme Freight', 'freight-forwarder');
    const opened = await exchange(tokenOf(created.shareUrl));
    expect(opened.statusCode).toBe(200);
    const session = opened.json() as { token: string; readOnly: boolean; tenant: { id: string } };
    expect(session).toMatchObject({ readOnly: true, tenant: { id: created.demo.tenant.id } });

    expect((await asDemo('GET', '/api/v1/shipments', session.token)).json()).toEqual({ count: 30 });
    const write = await asDemo('POST', '/api/v1/shipments', session.token);
    expect(write.statusCode).toBe(403);
    expect(write.json()).toMatchObject({ error: 'DEMO_READ_ONLY' });
    expect((await asDemo('GET', '/api/v1/tenants/me/demo', session.token)).json()).toMatchObject({ demo: true, status: 'ACTIVE', readOnly: true });

    const rotated = (await consoleApp.inject({ method: 'POST', url: `/api/internal/demos/${created.demo.id}/share-link` })).json() as { shareUrl: string };
    expect(rotated.shareUrl).not.toBe(created.shareUrl);
    expect((await asDemo('GET', '/api/v1/shipments', session.token)).json()).toMatchObject({ code: 'DEMO_SESSION_ENDED' });
    expect((await exchange(tokenOf(created.shareUrl))).statusCode).toBe(401);
    const fresh = (await exchange(tokenOf(rotated.shareUrl))).json() as { token: string };
    expect((await asDemo('GET', '/api/v1/shipments', fresh.token)).statusCode).toBe(200);

    const extended = (await consoleApp.inject({ method: 'POST', url: `/api/internal/demos/${created.demo.id}/extend`, payload: { days: 3 } })).json() as { expiresAt: string };
    expect(new Date(extended.expiresAt).getTime()).toBeGreaterThan(Date.now() + 9 * 86_400_000);
    expect((await consoleApp.inject({ method: 'POST', url: `/api/internal/demos/${created.demo.id}/extend`, payload: { days: 30 } })).json()).toMatchObject({ error: 'TOO_LONG' });

    await prisma.demoEnvironment.update({ where: { id: created.demo.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await exchange(tokenOf(rotated.shareUrl))).statusCode).toBe(401);
    expect((await asDemo('GET', '/api/v1/shipments', fresh.token)).statusCode).toBe(401);
    const { expireDemos } = await import('../../../services/demos.service.js');
    expect((await expireDemos(consoleApp)).expired).toBeGreaterThanOrEqual(1);
    const row = await prisma.demoEnvironment.findUniqueOrThrow({ where: { id: created.demo.id } });
    expect(row).toMatchObject({ status: 'EXPIRED', shareTokenHash: null });
    expect(await prisma.tenant.findUniqueOrThrow({ where: { id: created.demo.tenant.id } })).toMatchObject({ status: 'DEMO' });
  });

  it('ACC-DEMO-3 teardown needs a reason, refuses non-DEMO tenants, and closes the demo workspace', async () => {
    const real = await createTestTenant(prisma, { status: 'ACTIVE' });
    const user = await prisma.user.create({ data: { tenantId: real.id, email: `owner-${real.slug}@tenant.test`, passwordHash: 'x', role: 'TENANT_ADMIN', isActive: true } });
    const wrong = await prisma.demoEnvironment.create({ data: { tenantId: real.id, template: 'courier', expiresAt: new Date(Date.now() - 1000), status: 'ACTIVE', createdBy: permissions.userId } });
    const refused = await consoleApp.inject({ method: 'DELETE', url: `/api/internal/demos/${wrong.id}`, payload: { reason: 'Prospect signed a contract' } });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: 'NOT_A_DEMO' });
    const { expireDemos } = await import('../../../services/demos.service.js');
    await expireDemos(consoleApp);
    expect(await prisma.tenant.findUniqueOrThrow({ where: { id: real.id } })).toMatchObject({ status: 'ACTIVE', closedAt: null });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ isActive: true });
    expect(await prisma.demoEnvironment.findUniqueOrThrow({ where: { id: wrong.id } })).toMatchObject({ status: 'ACTIVE' });

    const created = await create('Globex Logistics', 'logistics-3pl');
    expect((await consoleApp.inject({ method: 'DELETE', url: `/api/internal/demos/${created.demo.id}` })).json()).toMatchObject({ error: 'REASON_REQUIRED' });
    const ended = await consoleApp.inject({ method: 'DELETE', url: `/api/internal/demos/${created.demo.id}`, payload: { reason: 'Prospect chose another vendor' } });
    expect(ended.statusCode).toBe(200);
    expect(ended.json()).toMatchObject({ demo: { status: 'TORN_DOWN', shareLinkActive: false, tenant: { status: 'DEMO', closed: true } }, usersDeactivated: 1 });
    const { authService } = await import('../../auth/auth.service.js');
    await expect(authService.login({ email: created.credentials.email, password: created.credentials.password }, prisma, created.demo.tenant.id)).rejects.toThrow();
    expect((await exchange(tokenOf(created.shareUrl))).statusCode).toBe(401);
    expect(await prisma.platformAuditLog.count({ where: { action: 'DEMO_TORN_DOWN', targetTenantId: created.demo.tenant.id } })).toBe(1);
    expect((await consoleApp.inject({ method: 'DELETE', url: `/api/internal/demos/${created.demo.id}`, payload: { reason: 'Second teardown attempt' } })).statusCode).toBe(409);

    permissions.current = ['gtm.demos.read'];
    expect((await consoleApp.inject({ method: 'POST', url: '/api/internal/demos', payload: { template: 'courier', prospectName: 'Read only' } })).statusCode).toBe(403);
  });

  it('ACC-DEMO-4 demo tenants stay out of the tenant directory, the onboarding funnel and MRR', async () => {
    const created = await create('Initech Parcels');
    const tenantId = created.demo.tenant.id;
    const { tenantListWhere } = await import('../../../services/tenant-directory.service.js');
    const { stuckTenants } = await import('../../../services/onboarding.service.js');
    const { mrrForSubscription } = await import('../../../services/revenue/mrr.service.js');
    expect(await prisma.tenant.count({ where: { AND: [tenantListWhere({ sort: 'createdAt', limit: 50, order: 'desc' }), { id: tenantId }] } })).toBe(0);
    const stuck = await stuckTenants(consoleApp, { stuckDays: 0 }, new Date(Date.now() + 60_000));
    expect(stuck.map((row: { id: string }) => row.id)).not.toContain(tenantId);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const mrr = await mrrForSubscription(prisma, tenant, { status: 'ACTIVE', plan: 'PRO', billingCycle: 'MONTHLY' });
    expect(mrr.amount).toBe('0.00');
    const templates = (await consoleApp.inject({ method: 'GET', url: '/api/internal/demos/templates' })).json();
    expect(templates.data.map((row: { id: string }) => row.id)).toEqual(['courier', 'freight-forwarder', 'logistics-3pl']);
    expect(templates.limits).toMatchObject({ maxDays: 30 });
  });
});
