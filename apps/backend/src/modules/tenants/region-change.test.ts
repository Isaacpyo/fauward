import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { afterEach, describe, expect, it, vi } from 'vitest';

// L5 region change (WP-2.6): tenant request → console decision → Tenant.region applied → tenant told. The store is
// shared by two app instances to show a request survives a restart (it used to live in process memory).

type Row = Record<string, unknown> & { id: string };
const queueAdd = vi.hoisted(() => vi.fn(async (_name: string, _data: Record<string, unknown>) => ({ id: 'job' })));
const tenantUser = vi.hoisted(() => ({ role: 'TENANT_ADMIN' }));

vi.mock('../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd }, scheduledJobsQueue: { add: queueAdd }, analyticsQueue: {}, outboxQueue: {}, webhookQueue: {}, bullmqConnection: {} }));
vi.mock('../notifications/notifications.worker.js', () => ({ dlqNotificationQueue: {} }));
vi.mock('../../queues/outbox.worker.js', () => ({ dlqOutboxQueue: {} }));
vi.mock('../../queues/webhook.worker.js', () => ({ dlqWebhookQueue: {} }));
vi.mock('../../services/platform-audit.service.js', () => ({ writePlatformAuditLog: vi.fn(async () => undefined), verifyPlatformAuditChain: vi.fn() }));
vi.mock('../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(['platform.tenants.read', 'platform.tenants.write']), jit: new Map(), permissions: [] }))
}));
vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_ops', email: 'ops@fauward.com', name: 'Olu Ops', role: 'PLATFORM_SUPPORT', status: 'ACTIVE', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: 'u_admin', role: tenantUser.role, tenantId: 'tenant_a', email: 'admin@northwind.test' };
    request.tenant = { id: 'tenant_a', name: 'Northwind', slug: 'northwind', region: 'uk_europe' };
  }
}));

function matches(row: Row, where: Record<string, unknown> = {}) {
  return Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && 'in' in condition) return (condition as { in: unknown[] }).in.includes(row[key]);
    return row[key] === condition;
  });
}

function createStore() {
  const tenants: Row[] = [{ id: 'tenant_a', name: 'Northwind', slug: 'northwind', region: 'uk_europe', status: 'ACTIVE' }];
  const requests: Row[] = [];
  const activity: Row[] = [];
  const inApp: Row[] = [];
  const staffNotifications: Row[] = [];
  let seq = 0;
  const prisma: Record<string, unknown> = {
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => tenants.find((row) => row.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => Object.assign(tenants.find((row) => row.id === where.id)!, data))
    },
    regionChangeRequest: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { decisionReason: null, decidedByPlatformUserId: null, decidedAt: null, appliedAt: null, status: 'PENDING', createdAt: new Date(Date.now() + (seq += 1)), ...data, id: `rcr_${seq}` };
        requests.push(row);
        return { ...row };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => Object.assign(requests.find((row) => row.id === where.id)!, data)),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        const hits = requests.filter((row) => matches(row, where));
        hits.forEach((row) => Object.assign(row, data));
        return { count: hits.length };
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => [...requests].reverse().find((row) => matches(row, where)) ?? null),
      findFirstOrThrow: vi.fn(async ({ where }: { where: Record<string, unknown> }) => ({ ...requests.find((row) => matches(row, where))! })),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = requests.find((item) => item.id === where.id);
        return row ? { ...row, tenant: { ...tenants.find((tenant) => tenant.id === row.tenantId)! } } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => requests.filter((row) => matches(row, where)).map((row) => ({ ...row, tenant: tenants.find((tenant) => tenant.id === row.tenantId) })))
    },
    platformActivity: {
      upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Row }) => {
        const existing = activity.find((row) => row.dedupeKey === where.dedupeKey);
        if (existing) return existing;
        const row = { ...create, id: `act_${activity.length + 1}` };
        activity.push(row);
        return row;
      })
    },
    user: { findMany: vi.fn(async () => [{ id: 'u_admin', email: 'admin@northwind.test' }]) },
    inAppNotification: { createMany: vi.fn(async ({ data }: { data: Row[] }) => inApp.push(...data)) },
    staffUser: { findMany: vi.fn(async () => [{ platformUserId: 'pu_ops' }]) },
    staffNotification: { createMany: vi.fn(async ({ data }: { data: Row[] }) => staffNotifications.push(...data)) },
    platformUser: { findMany: vi.fn(async () => []) }
  };
  prisma.$transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma));
  return { prisma, tenants, requests, activity, inApp, staffNotifications };
}

const apps: FastifyInstance[] = [];

async function boot(store: ReturnType<typeof createStore>) {
  const app = Fastify();
  apps.push(app);
  await app.register(rateLimit, { global: false });
  app.decorate('prisma', store.prisma as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { authenticate } = await import('../../shared/middleware/authenticate.js');
  app.decorate('authenticate', authenticate as never);
  const { registerTenantRoutes } = await import('./tenant.routes.js');
  const { registerConsoleTenantRoutes } = await import('../internal/platform/tenants.routes.js');
  await registerTenantRoutes(app);
  await registerConsoleTenantRoutes(app);
  await app.ready();
  return app;
}

afterEach(async () => {
  tenantUser.role = 'TENANT_ADMIN';
  queueAdd.mockClear();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('region change (WP-2.6, L5)', () => {
  it('ACC-L5-1 a request survives a backend restart and approval changes tenant.region; the tenant is told', async () => {
    const store = createStore();
    const before = await boot(store);
    const options = await before.inject({ method: 'GET', url: '/api/v1/tenant/region-change-requests' });
    expect(options.json()).toMatchObject({ current: 'uk_europe', latest: null });
    expect(options.json().regions.map((region: { key: string }) => region.key)).toContain('africa');
    const created = await before.inject({ method: 'POST', url: '/api/v1/tenant/region-change-requests', payload: { requestedRegion: 'africa' } });
    expect(created.statusCode).toBe(201);
    const requestId = created.json().request.id as string;
    expect(store.staffNotifications).toEqual([expect.objectContaining({ platformUserId: 'pu_ops', event: 'region.requested' })]);
    await before.close();

    const after = await boot(store);
    const list = await after.inject({ method: 'GET', url: '/api/internal/tenants/region-requests?status=PENDING' });
    expect(list.json().requests).toEqual([expect.objectContaining({ id: requestId, currentRegion: 'uk_europe', requestedRegion: 'africa', tenant: expect.objectContaining({ name: 'Northwind' }) })]);
    const decided = await after.inject({ method: 'POST', url: `/api/internal/tenants/region-requests/${requestId}/decision`, payload: { status: 'APPROVED', reason: 'Operations moved to Lagos' } });
    expect(decided.statusCode).toBe(200);
    expect(decided.json().request).toMatchObject({ status: 'APPLIED', decidedByPlatformUserId: 'pu_ops' });
    expect(store.tenants[0].region).toBe('africa');
    expect(store.inApp).toEqual([expect.objectContaining({ userId: 'u_admin', type: 'region.decided', title: 'Your workspace now runs in Africa' })]);
    expect(queueAdd.mock.calls.some(([, job]) => job.template === 'region_change_decided')).toBe(true);
    expect(store.activity.map((row) => row.type)).toEqual(['region.requested', 'region.decided', 'region.applied']);
    const again = await after.inject({ method: 'POST', url: `/api/internal/tenants/region-requests/${requestId}/decision`, payload: { status: 'REJECTED', reason: 'Second click on the same request' } });
    expect(again.statusCode).toBe(409);
  });

  it('ACC-L5-1 a rejection keeps the region and shows the reason; a second request replaces a pending one', async () => {
    const store = createStore();
    const app = await boot(store);
    await app.inject({ method: 'POST', url: '/api/v1/tenant/region-change-requests', payload: { requestedRegion: 'africa' } });
    const replaced = await app.inject({ method: 'POST', url: '/api/v1/tenant/region-change-requests', payload: { requestedRegion: 'northAmerica' } });
    expect(store.requests).toHaveLength(1);
    expect(store.requests[0]).toMatchObject({ requestedRegion: 'northAmerica', status: 'PENDING' });
    const rejected = await app.inject({ method: 'POST', url: `/api/internal/tenants/region-requests/${replaced.json().request.id}/decision`, payload: { status: 'REJECTED', reason: 'No North America carriers configured yet' } });
    expect(rejected.json().request).toMatchObject({ status: 'REJECTED', decisionReason: 'No North America carriers configured yet' });
    expect(store.tenants[0].region).toBe('uk_europe');
    expect(store.inApp).toEqual([expect.objectContaining({ title: 'Region change not approved', body: 'No North America carriers configured yet' })]);
    const latest = await app.inject({ method: 'GET', url: '/api/v1/tenant/region-change-requests' });
    expect(latest.json().latest).toMatchObject({ status: 'REJECTED', decisionReason: 'No North America carriers configured yet' });
  });

  it('only listed regions, never the current one, and only tenant admins may request', async () => {
    const app = await boot(createStore());
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenant/region-change-requests', payload: { requestedRegion: 'mars' } })).json()).toMatchObject({ error: 'UNSUPPORTED_REGION' });
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenant/region-change-requests', payload: { requestedRegion: 'uk_europe' } })).json()).toMatchObject({ error: 'SAME_REGION' });
    tenantUser.role = 'TENANT_STAFF';
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenant/region-change-requests', payload: { requestedRegion: 'africa' } })).statusCode).toBe(403);
  });

  it('ACC-L5-2 the unauthenticated /dev region endpoint is gone', async () => {
    const app = await boot(createStore());
    expect(app.hasRoute({ method: 'POST', url: '/api/v1/tenant/region-change-requests/dev' })).toBe(false);
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenant/region-change-requests/dev', payload: { requestedRegion: 'africa', tenantId: 'tenant_a' } })).statusCode).toBe(404);
  });
});
