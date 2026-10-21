import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';
import { VendorError, vendorErrorHandler } from '../../../services/vendors/vendor-error.js';

// gtm.pipeline (WP-4.18) against real Postgres: deal CRUD is audited (and lands on a linked tenant's timeline), the
// forecast is Σ amount × probability by close month over open deals, HubSpot import only runs when configured and never
// overwrites a deal linked to a tenant, and a won deal linked to a tenant shows in the tenant's C360 deals.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));
const hubspot = vi.hoisted(() => ({ configured: false, listDeals: vi.fn() }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'ae@fauward.test', name: 'Account Exec', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_pipeline', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));
vi.mock('../../../services/vendors/hubspot.adapter.js', () => ({
  hubspotAdapter: {
    vendor: 'hubspot',
    envNames: ['HUBSPOT_ACCESS_TOKEN'],
    isConfigured: () => hubspot.configured,
    missingEnv: () => (hubspot.configured ? [] : ['HUBSPOT_ACCESS_TOKEN']),
    listDeals: hubspot.listDeals
  }
}));

describe.runIf(HAS_TEST_DB)('gtm.pipeline (WP-4.18, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  const post = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/internal/pipeline', payload });
  const patch = (id: string, payload: Record<string, unknown>) => app.inject({ method: 'PATCH', url: `/api/internal/pipeline/${id}`, payload });

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    app.setErrorHandler(vendorErrorHandler);
    const { registerConsolePipelineRoutes } = await import('./pipeline.routes.js');
    await registerConsolePipelineRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    permissions.current = ['gtm.pipeline.read', 'gtm.pipeline.write'];
    hubspot.configured = false;
    hubspot.listDeals.mockReset();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ACC-PIPE-1 create and edit are audited; stage defaults the probability; a linked deal lands on the tenant timeline', async () => {
    const tenant = await createTestTenant(prisma, { status: 'ACTIVE' });
    const owner = `owner-${uniqueSuffix()}@fauward.test`;
    expect((await post({ name: 'Bad', amount: '-5' })).statusCode).toBe(400);
    const demo = await createTestTenant(prisma, { status: 'DEMO' });
    expect((await post({ name: 'Demo deal', amount: '10.00', tenantId: demo.id })).json()).toMatchObject({ error: 'TENANT_NOT_FOUND' });

    const created = await post({ name: 'Acme annual', amount: '12000.50', stage: 'QUALIFIED', closeDate: '2026-12-15', ownerEmail: owner, tenantId: tenant.id });
    expect(created.statusCode).toBe(201);
    const deal = created.json();
    expect(deal).toMatchObject({ stage: 'QUALIFIED', amount: '12000.50', probability: 25, weighted: '3000.13', closeDate: '2026-12-15', tenant: { id: tenant.id }, source: 'CONSOLE' });

    expect((await patch(deal.id, { probability: 40 })).json()).toMatchObject({ stage: 'QUALIFIED', probability: 40 });
    expect((await patch(deal.id, { stage: 'NEGOTIATION' })).json()).toMatchObject({ probability: 75 });
    const won = (await patch(deal.id, { stage: 'WON' })).json();
    expect(won).toMatchObject({ stage: 'WON', probability: 100 });
    expect(won.wonAt).toBeTruthy();
    expect((await patch(deal.id, {})).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/internal/pipeline/00000000-0000-0000-0000-000000000000' })).statusCode).toBe(404);

    const audit = await prisma.platformAuditLog.findMany({ where: { targetTenantId: tenant.id, action: { startsWith: 'DEAL_' } }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((entry) => entry.action)).toEqual(['DEAL_CREATED', 'DEAL_UPDATED', 'DEAL_STAGE_CHANGED', 'DEAL_STAGE_CHANGED']);
    const activity = await prisma.platformActivity.findMany({ where: { tenantId: tenant.id, service: 'gtm.pipeline' }, select: { type: true } });
    expect(activity.map((entry) => entry.type)).toEqual(expect.arrayContaining(['deal.created', 'deal.updated', 'deal.stage_changed', 'deal.won']));

    const listed = (await app.inject({ method: 'GET', url: `/api/internal/pipeline?owner=${encodeURIComponent(owner)}` })).json();
    expect(listed.data.map((row: { id: string }) => row.id)).toEqual([deal.id]);
    expect(listed.stages.find((row: { stage: string }) => row.stage === 'WON')).toMatchObject({ count: 1, amount: '12000.50' });
    expect(listed.owners).toContain(owner);
    const byMonth = (await app.inject({ method: 'GET', url: `/api/internal/pipeline?owner=${encodeURIComponent(owner)}&closeMonth=2026-11` })).json();
    expect(byMonth.data).toEqual([]);

    permissions.current = ['gtm.pipeline.read'];
    expect((await post({ name: 'Read only', amount: '1.00' })).statusCode).toBe(403);
  });

  it('ACC-PIPE-2 the forecast is Σ amount × probability by close month over open deals (fixture)', async () => {
    // sales_deals is platform-wide, so the fixture is measured as the change against the forecast before it was added.
    const read = async () => (await app.inject({ method: 'GET', url: '/api/internal/pipeline/forecasting?months=3' })).json();
    const cents = (value: string) => Math.round(Number(value) * 100);
    const before = await read();
    const now = new Date();
    const month = (offset: number, day = 10) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day)).toISOString().slice(0, 10);
    await post({ name: 'A', amount: '1000.00', stage: 'PROPOSAL', closeDate: month(0) });
    await post({ name: 'B', amount: '333.33', stage: 'QUALIFIED', probability: 30, closeDate: month(0, 20) });
    await post({ name: 'C', amount: '2000.00', stage: 'NEGOTIATION', closeDate: month(1) });
    await post({ name: 'D', amount: '5000.00', stage: 'WON', closeDate: month(1) });
    await post({ name: 'E', amount: '900.00', stage: 'LOST', closeDate: month(1) });
    await post({ name: 'F', amount: '700.00', stage: 'PROSPECTING', closeDate: month(-1) });
    await post({ name: 'G', amount: '250.00', stage: 'PROSPECTING' });
    await post({ name: 'H', amount: '9999.00', stage: 'PROPOSAL', closeDate: month(5) });
    const after = await read();

    expect(after.months).toHaveLength(3);
    const delta = (index: number, key: 'pipeline' | 'weighted' | 'won') => cents(after.months[index][key]) - cents(before.months[index][key]);
    // Month 0: 1000 × 50% + 333.33 × 30% = 500 + 99.999 = 599.999. The month's sum is rounded once, so against a
    // baseline that already holds fractional cents (earlier runs on the shared slot) the change is 599.99 or 600.00.
    expect(after.months[0].deals - before.months[0].deals).toBe(2);
    expect(delta(0, 'pipeline')).toBe(133333);
    expect([59999, 60000]).toContain(delta(0, 'weighted'));
    // Month 1: 2000 × 75% = 1500; the won deal counts as won, the lost one not at all.
    expect(after.months[1].deals - before.months[1].deals).toBe(1);
    expect(delta(1, 'weighted')).toBe(150000);
    expect(delta(1, 'won')).toBe(500000);
    // Month 5 is outside the 3-month window.
    expect(delta(2, 'weighted')).toBe(0);
    expect([209999, 210000]).toContain(cents(after.totalWeighted) - cents(before.totalWeighted));
    expect(after.overdue.deals - before.overdue.deals).toBe(1);
    expect(cents(after.overdue.amount) - cents(before.overdue.amount)).toBe(70000);
    expect(after.unscheduled.deals - before.unscheduled.deals).toBe(1);
    expect(cents(after.unscheduled.amount) - cents(before.unscheduled.amount)).toBe(25000);
  });

  it('ACC-PIPE-3 HubSpot import: refused when unconfigured; when configured it creates, refreshes, and never overwrites a linked deal', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/internal/pipeline' })).json();
    expect(list.hubspot).toMatchObject({ vendor: 'hubspot', configured: false, missing: ['HUBSPOT_ACCESS_TOKEN'] });
    const refused = await app.inject({ method: 'POST', url: '/api/internal/pipeline/import/hubspot' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: 'HUBSPOT_NOT_CONFIGURED' });
    const { runHubspotImport } = await import('../../../services/pipeline.service.js');
    expect(await runHubspotImport(app)).toMatchObject({ skipped: true });
    expect(hubspot.listDeals).not.toHaveBeenCalled();

    const suffix = uniqueSuffix();
    const tenant = await createTestTenant(prisma, { status: 'ACTIVE' });
    const linked = await prisma.salesDeal.create({ data: { name: 'Linked in console', stage: 'NEGOTIATION', amount: '4000.00', probability: '75', hubspotDealId: `hs-linked-${suffix}`, tenantId: tenant.id, source: 'HUBSPOT' } });
    const stale = await prisma.salesDeal.create({ data: { name: 'Old name', stage: 'PROSPECTING', amount: '10.00', probability: '10', hubspotDealId: `hs-stale-${suffix}`, source: 'HUBSPOT' } });
    hubspot.configured = true;
    hubspot.listDeals.mockResolvedValue([
      { id: `hs-new-${suffix}`, name: 'Brand new', amount: '1500.5', stage: 'contractsent', probability: 0.9, closeDate: '2026-12-01T00:00:00.000Z', ownerId: '77' },
      { id: `hs-stale-${suffix}`, name: 'Fresh name', amount: '20', stage: 'closedwon', probability: null, closeDate: null, ownerId: null },
      { id: `hs-linked-${suffix}`, name: 'HubSpot rename', amount: '1', stage: 'closedlost', probability: 0, closeDate: null, ownerId: null }
    ]);
    const imported = await app.inject({ method: 'POST', url: '/api/internal/pipeline/import/hubspot' });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toEqual({ created: 1, updated: 1, skippedLinked: 1, total: 3 });

    expect(await prisma.salesDeal.findUniqueOrThrow({ where: { hubspotDealId: `hs-new-${suffix}` } })).toMatchObject({ name: 'Brand new', stage: 'NEGOTIATION', source: 'HUBSPOT' });
    const refreshed = await prisma.salesDeal.findUniqueOrThrow({ where: { id: stale.id } });
    expect(refreshed).toMatchObject({ name: 'Fresh name', stage: 'WON' });
    expect(refreshed.wonAt).toBeInstanceOf(Date);
    expect(await prisma.salesDeal.findUniqueOrThrow({ where: { id: linked.id } })).toMatchObject({ name: 'Linked in console', stage: 'NEGOTIATION' });
    expect(await prisma.platformAuditLog.count({ where: { action: 'HUBSPOT_DEALS_IMPORTED', actorId: permissions.userId } })).toBeGreaterThanOrEqual(1);

    hubspot.listDeals.mockRejectedValue(new VendorError('hubspot', 'boom', 500));
    const failed = await app.inject({ method: 'POST', url: '/api/internal/pipeline/import/hubspot' });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toMatchObject({ error: 'VENDOR_ERROR', vendor: 'hubspot', degraded: true });
  });

  it('ACC-PIPE-4 a won deal linked to a tenant shows in that tenant\'s C360 deals', async () => {
    const tenant = await createTestTenant(prisma, { status: 'ACTIVE' });
    const other = await createTestTenant(prisma, { status: 'ACTIVE' });
    const deal = (await post({ name: 'C360 deal', amount: '800.00', stage: 'NEGOTIATION', tenantId: tenant.id })).json();
    await post({ name: 'Other tenant deal', amount: '1.00', stage: 'WON', tenantId: other.id });
    await patch(deal.id, { stage: 'WON' });
    const c360 = (await app.inject({ method: 'GET', url: `/api/internal/customer360/${tenant.id}/deals` })).json();
    expect(c360.data).toHaveLength(1);
    expect(c360.data[0]).toMatchObject({ id: deal.id, stage: 'WON', amount: '800.00' });
    permissions.current = ['customer.360.read'];
    expect((await app.inject({ method: 'GET', url: `/api/internal/customer360/${tenant.id}/deals` })).statusCode).toBe(403);
  });
});
