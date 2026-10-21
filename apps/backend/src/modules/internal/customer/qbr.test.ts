import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// customer.qbr (WP-4.9) against real Postgres: a fixture tenant's deck has real numbers in every section, a tenant
// without data gets labelled empty sections, the same quarter is one deck however often it is requested, and sharing
// lets the tenant's admins read it.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));
const tenantSession = vi.hoisted(() => ({ tenantId: 'unset', role: 'TENANT_ADMIN' }));
const queued = vi.hoisted(() => [] as Array<{ name: string; data: { deckId: string }; jobId: string }>);

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'qbr@fauward.test', name: 'CSM', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_qbr', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));
vi.mock('../../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: 'u_admin', email: 'admin@tenant.test', role: tenantSession.role, tenantId: tenantSession.tenantId };
    request.tenant = { id: tenantSession.tenantId };
  }
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));
vi.mock('../../../queues/queues.js', () => ({
  scheduledJobsQueue: {
    add: vi.fn(async (name: string, data: { deckId: string }, opts: { jobId: string }) => {
      queued.push({ name, data, jobId: opts.jobId });
      return { id: opts.jobId };
    })
  }
}));

// A finished quarter safely in the past.
const PERIOD = '2026-Q2';
const IN_PERIOD = new Date(Date.UTC(2026, 4, 15, 12));
const DAY = 86_400_000;

describe.runIf(HAS_TEST_DB)('customer.qbr (WP-4.9, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    permissions.current = ['customer.qbr.read', 'customer.qbr.write'];
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleQbrRoutes } = await import('./qbr.routes.js');
    const { registerTenantQbrRoutes } = await import('../../tenants/qbr.routes.js');
    await registerConsoleQbrRoutes(app);
    await registerTenantQbrRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    queued.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function generate(tenantId: string) {
    const { generateDeck } = await import('../../../services/qbr.service.js');
    const response = await app.inject({ method: 'POST', url: `/api/internal/qbr/tenants/${tenantId}/generate`, payload: { period: PERIOD } });
    expect(response.statusCode).toBe(202);
    const job = queued.at(-1);
    if (job) await generateDeck(app, job.data.deckId);
    return response.json() as { deckId: string; queued: boolean };
  }

  async function fixtureTenant() {
    const tenant = await createTestTenant(prisma, { plan: 'PRO' });
    const suffix = uniqueSuffix();
    await prisma.usageRecord.createMany({ data: ['2026-04', '2026-05', '2026-06'].map((month) => ({ tenantId: tenant.id, month, shipments: 40, apiCalls: 100, emailsSent: 20, smsSent: 5 })) });
    const address = { line1: '1 Test St', city: 'London', country: 'GB' };
    await prisma.shipment.create({ data: { tenantId: tenant.id, trackingNumber: `QBR-${suffix}-1`, originAddress: address, destinationAddress: address, status: 'DELIVERED', createdAt: IN_PERIOD, estimatedDelivery: new Date(IN_PERIOD.getTime() + 2 * DAY), actualDelivery: new Date(IN_PERIOD.getTime() + DAY) } });
    await prisma.shipment.create({ data: { tenantId: tenant.id, trackingNumber: `QBR-${suffix}-2`, originAddress: address, destinationAddress: address, status: 'DELIVERED', createdAt: IN_PERIOD, estimatedDelivery: new Date(IN_PERIOD.getTime() + DAY), actualDelivery: new Date(IN_PERIOD.getTime() + 3 * DAY) } });
    await prisma.shipment.create({ data: { tenantId: tenant.id, trackingNumber: `QBR-${suffix}-3`, originAddress: address, destinationAddress: address, status: 'FAILED_DELIVERY', createdAt: IN_PERIOD } });
    await prisma.exceptionCase.create({ data: { tenantId: tenant.id, type: 'ADDRESS_ISSUE', severity: 'MEDIUM', status: 'OPEN', createdAt: IN_PERIOD } });
    await prisma.supportTicket.create({ data: { tenantId: tenant.id, ticketNumber: `QBR-T-${suffix}`, subject: 'Where is my parcel', category: 'TRACKING_ISSUE', audience: 'END_CUSTOMER', status: 'RESOLVED', createdAt: IN_PERIOD } });
    await prisma.invoice.create({ data: { tenantId: tenant.id, kind: 'PLATFORM', invoiceNumber: `FW-QBR-${suffix}`, lineItems: [], subtotal: '79.00', total: '79.00', currency: 'GBP', status: 'SENT', createdAt: IN_PERIOD } });
    await prisma.tenantHealthScore.createMany({ data: [{ tenantId: tenant.id, score: 72, factors: {}, computedAt: new Date(Date.UTC(2026, 3, 2)) }, { tenantId: tenant.id, score: 64, factors: {}, computedAt: new Date(Date.UTC(2026, 5, 28)) }] });
    await prisma.tenantAiUsage.create({ data: { tenantId: tenant.id, month: '2026-05', model: 'flash', feature: 'exception-diagnosis', requestCount: 12, tokenCount: 3000, costUsd: 0.42 } });
    return tenant;
  }

  it('ACC-QBR-1 a fixture tenant deck has real numbers in every section', async () => {
    const tenant = await fixtureTenant();
    const { deckId } = await generate(tenant.id);
    const deck = (await app.inject({ method: 'GET', url: `/api/internal/qbr/decks/${deckId}` })).json();
    expect(deck).toMatchObject({ status: 'DRAFT', period: PERIOD, hasHtml: true });
    const byKey = Object.fromEntries(deck.sections.map((item: { key: string }) => [item.key, item]));
    const value = (key: string, label: string) => byKey[key].items.find((row: { label: string }) => row.label === label)?.value;
    expect(value('usage', 'Shipments counted for billing')).toBe('120');
    expect(value('shipments', 'Shipments created')).toBe('3');
    expect(value('shipments', 'Delivered on time (against the estimate)')).toBe('1 of 2 (50%)');
    expect(value('exceptions', 'Exceptions raised')).toBe('1 (0 resolved)');
    expect(value('support', 'Tickets from your customers')).toBe('1');
    expect(value('billing', 'Billed (GBP)')).toBe('79.00 GBP, 79.00 outstanding');
    expect(value('health', 'Health score at the end')).toContain('64');
    expect(value('ai', 'AI spend')).toBe('0.42 USD');
    for (const key of ['usage', 'shipments', 'exceptions', 'support', 'billing', 'health', 'ai']) expect(byKey[key].empty, key).toBe(false);
    const download = await app.inject({ method: 'GET', url: `/api/internal/qbr/decks/${deckId}/download` });
    expect(download.headers['content-type']).toContain('text/html');
    expect(download.body).toContain('Quarterly business review 2026-Q2');
  });

  it('ACC-QBR-2 a tenant without data gets every section labelled "No data for this period"', async () => {
    const tenant = await createTestTenant(prisma);
    const { deckId } = await generate(tenant.id);
    const deck = (await app.inject({ method: 'GET', url: `/api/internal/qbr/decks/${deckId}` })).json();
    const empty = deck.sections.filter((item: { empty: boolean }) => item.empty);
    expect(empty.map((item: { key: string }) => item.key)).toEqual(expect.arrayContaining(['usage', 'shipments', 'exceptions', 'support', 'health', 'ai']));
    for (const item of empty) expect(item.emptyText).toBe('No data for this period');
    const download = await app.inject({ method: 'GET', url: `/api/internal/qbr/decks/${deckId}/download` });
    expect(download.body).toContain('No data for this period');
  });

  it('ACC-QBR-3 requesting the same quarter again reuses the one deck; a deck already generating is not queued twice', async () => {
    const tenant = await createTestTenant(prisma);
    const first = await app.inject({ method: 'POST', url: `/api/internal/qbr/tenants/${tenant.id}/generate`, payload: { period: PERIOD } });
    const second = await app.inject({ method: 'POST', url: `/api/internal/qbr/tenants/${tenant.id}/generate`, payload: { period: PERIOD } });
    expect(first.json()).toMatchObject({ queued: true, status: 'GENERATING' });
    expect(second.json()).toMatchObject({ deckId: first.json().deckId, queued: false });
    expect(queued).toHaveLength(1);
    const { generateDeck } = await import('../../../services/qbr.service.js');
    await generateDeck(app, first.json().deckId);
    const again = await app.inject({ method: 'POST', url: `/api/internal/qbr/tenants/${tenant.id}/generate`, payload: { period: PERIOD } });
    expect(again.json()).toMatchObject({ deckId: first.json().deckId, queued: true });
    expect(await prisma.qBRDeck.count({ where: { tenantId: tenant.id, periodKey: PERIOD } })).toBe(1);
    expect(queued[0].jobId).not.toBe(queued[1].jobId);
    const unfinished = await app.inject({ method: 'POST', url: `/api/internal/qbr/tenants/${tenant.id}/generate`, payload: { period: '2099-Q1' } });
    expect(unfinished.json()).toMatchObject({ error: 'PERIOD_NOT_FINISHED' });
  });

  it('ACC-QBR-4 sharing lets the tenant admins view the deck; before that it is not visible', async () => {
    const tenant = await fixtureTenant();
    await prisma.user.create({ data: { tenantId: tenant.id, email: `admin-${uniqueSuffix()}@tenant.test`, passwordHash: 'x', role: 'TENANT_ADMIN', isActive: true } });
    tenantSession.tenantId = tenant.id;
    const { deckId } = await generate(tenant.id);
    expect((await app.inject({ method: 'GET', url: `/api/v1/tenants/me/qbr/${deckId}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/internal/qbr/decks/${deckId}/share` })).json()).toMatchObject({ error: 'NOT_READY' });
    await app.inject({ method: 'PATCH', url: `/api/internal/qbr/decks/${deckId}`, payload: { notes: 'Great quarter for on-time delivery.', status: 'READY' } });
    const shared = await app.inject({ method: 'POST', url: `/api/internal/qbr/decks/${deckId}/share` });
    expect(shared.json()).toMatchObject({ deck: { status: 'SHARED' }, notified: { inApp: 1 } });
    const tenantView = await app.inject({ method: 'GET', url: `/api/v1/tenants/me/qbr/${deckId}` });
    expect(tenantView.statusCode).toBe(200);
    expect(tenantView.json()).toMatchObject({ period: PERIOD, notes: 'Great quarter for on-time delivery.' });
    expect(tenantView.json().sections.length).toBe(8);
    tenantSession.role = 'TENANT_STAFF';
    expect((await app.inject({ method: 'GET', url: `/api/v1/tenants/me/qbr/${deckId}` })).statusCode).toBe(403);
    tenantSession.role = 'TENANT_ADMIN';
    tenantSession.tenantId = 'another-tenant';
    expect((await app.inject({ method: 'GET', url: `/api/v1/tenants/me/qbr/${deckId}` })).statusCode).toBe(404);
    expect(await prisma.platformAuditLog.count({ where: { action: 'QBR_DECK_SHARED', targetTenantId: tenant.id } })).toBe(1);
  }, 60_000);
});
