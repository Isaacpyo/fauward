import { EventEmitter } from 'node:events';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

let mfaVerifiedAt = new Date();
vi.mock('../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_1', email: 'revops@fauward.com', name: 'RevOps', role: 'PLATFORM_FINANCE', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt } };
  }
}));
vi.mock('../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../middleware/require-console-permission.js', () => ({
  requireConsolePermission: () => async () => undefined,
  requireAnyConsolePermission: () => async () => undefined,
  consoleUserHas: async () => true
}));
vi.mock('./platform-audit.service.js', () => ({ writePlatformAuditLog: vi.fn(async () => ({})) }));

const { resolveTenantEntitlements, getTenantEntitlements, entitlementsCacheKey } = await import('./tenant-entitlements.service.js');
const { requireFeature } = await import('../shared/middleware/featureGuard.js');
const { startTenantCacheSubscriber, tenantIdFromChannel } = await import('./tenant-cache.subscriber.js');

type Row = Record<string, unknown> & { id: string; createdAt: Date };

function createRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    store,
    get: vi.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry || entry.expiresAt <= Date.now()) return null;
      return entry.value;
    }),
    set: vi.fn(async (key: string, value: string, _mode: 'EX', seconds: number) => {
      store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      return 'OK';
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    publish: vi.fn(async () => 1)
  };
}

function createDb(plan: string) {
  let seq = 0;
  const tenant = { id: 't_1', name: 'Northwind', plan, status: 'ACTIVE', maxStaff: 3, maxShipmentsPm: 300, maxOrganisations: 10 };
  const planOverrides: Row[] = [];
  const featureOverrides: Row[] = [];
  const active = (rows: Row[], where: { tenantId: string; featureKey?: string }) =>
    rows
      .filter((row) => row.tenantId === where.tenantId && !row.revokedAt && (!row.expiresAt || (row.expiresAt as Date) > new Date()) && (!where.featureKey || row.featureKey === where.featureKey))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const db = {
    tenant: { findUnique: vi.fn(async () => tenant) },
    tenantPlanOverride: {
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string } }) => active(planOverrides, where)[0] ?? null),
      updateMany: vi.fn(async ({ where }: { where: { tenantId: string } }) => {
        active(planOverrides, where).forEach((row) => Object.assign(row, { revokedAt: new Date() }));
        return { count: 1 };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: `tpo_${(seq += 1)}`, createdAt: new Date(Date.now() + seq), revokedAt: null, ...data };
        planOverrides.push(row);
        return row;
      })
    },
    tenantFeatureOverride: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string } }) => active(featureOverrides, where))
    },
    platformActivity: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'act', ...create })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(db))
  };
  return { db, tenant, planOverrides, featureOverrides };
}

const openApps: FastifyInstance[] = [];

/** A tenant-facing API instance: the real requireFeature guard on a PRO-only feature (apiAccess). */
async function tenantInstance(db: ReturnType<typeof createDb>['db'], redis: ReturnType<typeof createRedis>) {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', db as never);
  app.decorate('redis', redis as never);
  app.addHook('onRequest', async (request) => {
    request.tenant = (await db.tenant.findUnique()) as never;
  });
  app.get('/api/v1/tenant/api-keys', { preHandler: [requireFeature('apiAccess')] }, async () => ({ ok: true }));
  app.get('/api/v1/webhooks', { preHandler: [requireFeature('webhooks')] }, async () => ({ ok: true }));
  return app;
}

/** The console instance with the real plan-override route. */
async function consoleInstance(db: ReturnType<typeof createDb>['db'], redis: ReturnType<typeof createRedis>) {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', db as never);
  app.decorate('redis', redis as never);
  const { registerConsoleTenantRoutes } = await import('../modules/internal/platform/tenants.routes.js');
  await registerConsoleTenantRoutes(app);
  return app;
}

afterEach(async () => {
  vi.useRealTimers();
  mfaVerifiedAt = new Date();
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('resolveTenantEntitlements (architecture §9.5)', () => {
  it('effective plan = active override ?? billing plan; features carry their source; limits follow the effective plan until staff set them', async () => {
    const { db, tenant, planOverrides, featureOverrides } = createDb('STARTER');
    planOverrides.push({ id: 'tpo_a', tenantId: 't_1', plan: 'PRO', reason: 'Pilot', createdAt: new Date(), revokedAt: null, expiresAt: null });
    featureOverrides.push({ id: 'tfo_a', tenantId: 't_1', featureKey: 'webhooks', enabled: false, createdAt: new Date(), revokedAt: null, expiresAt: null });
    const entitlements = await resolveTenantEntitlements(db as never, tenant);
    expect(entitlements).toMatchObject({ billingPlan: 'STARTER', effectivePlan: 'PRO', planOverride: { id: 'tpo_a', plan: 'PRO' }, limits: { maxStaff: 15, maxShipmentsPm: 2000, apiRateLimit: 500 }, limitsSource: 'plan' });
    const staffSet = await resolveTenantEntitlements(db as never, { ...tenant, limitsOverriddenAt: new Date() });
    expect(staffSet).toMatchObject({ limits: { maxStaff: 3, maxShipmentsPm: 300, apiRateLimit: 500 }, limitsSource: 'tenant' });
    expect(entitlements.features.apiAccess).toEqual({ enabled: true, source: 'plan' });
    expect(entitlements.features.webhooks).toEqual({ enabled: false, source: 'override', overrideId: 'tfo_a', expiresAt: null });
    expect(entitlements.features.sso).toEqual({ enabled: false, source: 'plan' });
  });

  it('the cache never outlives the next override expiry', async () => {
    const { db, tenant, planOverrides } = createDb('STARTER');
    const redis = createRedis();
    planOverrides.push({ id: 'tpo_a', tenantId: 't_1', plan: 'PRO', reason: 'Pilot', createdAt: new Date(), revokedAt: null, expiresAt: new Date(Date.now() + 90_000) });
    await getTenantEntitlements({ prisma: db as never, redis: redis as never }, tenant);
    const ttl = (redis.set.mock.calls[0] as unknown as [string, string, string, number])[3];
    expect(ttl).toBeGreaterThanOrEqual(89);
    expect(ttl).toBeLessThanOrEqual(90);
  });
});

describe('entitlements honour overrides (WP-1.4)', () => {
  it('ACC-ENT-1 override STARTER → PRO: a PRO-only route returns 200 on another instance without restart', async () => {
    const { db } = createDb('STARTER');
    const redis = createRedis();
    const tenantA = await tenantInstance(db, redis);
    const tenantB = await tenantInstance(db, redis);
    const consoleApp = await consoleInstance(db, redis);

    const before = await tenantA.inject({ method: 'GET', url: '/api/v1/tenant/api-keys' });
    expect(before.statusCode).toBe(403);
    expect(before.json()).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE' });
    expect(redis.store.has(entitlementsCacheKey('t_1'))).toBe(true);

    const startedAt = Date.now();
    const override = await consoleApp.inject({ method: 'POST', url: '/api/internal/tenants/t_1/plan-overrides', payload: { plan: 'PRO', reason: 'Pilot of the API for a launch partner' } });
    expect(override.statusCode).toBe(201);

    const after = await tenantB.inject({ method: 'GET', url: '/api/v1/tenant/api-keys' });
    expect(after.statusCode).toBe(200);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect((await tenantA.inject({ method: 'GET', url: '/api/v1/tenant/api-keys' })).statusCode).toBe(200);
  });

  it('ACC-ENT-2 once the override expires the route returns 403 FEATURE_NOT_AVAILABLE again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    mfaVerifiedAt = new Date();
    const { db } = createDb('STARTER');
    const redis = createRedis();
    const tenantApp = await tenantInstance(db, redis);
    const consoleApp = await consoleInstance(db, redis);
    const expiresAt = new Date('2026-10-18T13:00:00Z');
    await consoleApp.inject({ method: 'POST', url: '/api/internal/tenants/t_1/plan-overrides', payload: { plan: 'PRO', reason: 'Pilot of the API for a launch partner', expiresAt: expiresAt.toISOString() } });
    expect((await tenantApp.inject({ method: 'GET', url: '/api/v1/tenant/api-keys' })).statusCode).toBe(200);

    vi.setSystemTime(new Date('2026-10-18T13:00:01Z'));
    const expired = await tenantApp.inject({ method: 'GET', url: '/api/v1/tenant/api-keys' });
    expect(expired.statusCode).toBe(403);
    expect(expired.json()).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE' });
  });

  it('ACC-ENT-3 a feature override enabled:false on a PRO tenant blocks that feature only', async () => {
    const { db, featureOverrides } = createDb('PRO');
    featureOverrides.push({ id: 'tfo_1', tenantId: 't_1', featureKey: 'apiAccess', enabled: false, createdAt: new Date(), revokedAt: null, expiresAt: null });
    const app = await tenantInstance(db, createRedis());
    expect((await app.inject({ method: 'GET', url: '/api/v1/tenant/api-keys' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/v1/webhooks' })).statusCode).toBe(200);
  });
});

describe('tenant cache subscriber', () => {
  it('drops the cached entitlements for the tenant named in any plan/status/entitlements change', async () => {
    expect(tenantIdFromChannel('tenant:t_9:plan-changed')).toBe('t_9');
    expect(tenantIdFromChannel('other')).toBeNull();
    const subscriber = Object.assign(new EventEmitter(), { psubscribe: vi.fn(async () => 3), quit: vi.fn(async () => 'OK') });
    const redis = { ...createRedis(), duplicate: () => subscriber };
    const app = Fastify();
    openApps.push(app);
    app.decorate('redis', redis as never);
    await startTenantCacheSubscriber(app);
    expect(subscriber.psubscribe).toHaveBeenCalledWith('tenant:*:plan-changed', 'tenant:*:status-changed', 'tenant:*:entitlements-changed');
    subscriber.emit('pmessage', 'tenant:*:plan-changed', 'tenant:t_9:plan-changed', '{}');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(redis.del).toHaveBeenCalledWith(entitlementsCacheKey('t_9'));
  });
});
