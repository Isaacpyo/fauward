import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis } from '../../../test-support/test-db.js';

// platform.flags (WP-4.1) against real Postgres: native overrides are the source of truth, LaunchDarkly only mirrors
// them per tenant (context kind `tenant`), a mirror failure keeps the override, releases fall back to build info.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'flags@fauward.test', name: 'Flag Owner', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_flags', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));

const LD_ENV = ['LAUNCHDARKLY_API_TOKEN', 'GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'APP_VERSION', 'GIT_COMMIT'];

describe.runIf(HAS_TEST_DB)('platform.flags (WP-4.1, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const name of LD_ENV) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    permissions.current = ['platform.flags.read', 'platform.flags.write'];
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { vendorErrorHandler } = await import('../../../services/vendors/vendor-error.js');
    app.setErrorHandler(vendorErrorHandler);
    const { registerConsoleFlagRoutes } = await import('./flags.routes.js');
    await registerConsoleFlagRoutes(app);
    await app.ready();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LAUNCHDARKLY_API_TOKEN;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    for (const name of LD_ENV) if (saved[name] !== undefined) process.env[name] = saved[name];
  });

  it('ACC-FLG-1 enabling a feature for tenant A passes A’s entitlement check; tenant B is unaffected', async () => {
    const { resolveTenantEntitlements } = await import('../../../services/tenant-entitlements.service.js');
    const a = await createTestTenant(prisma, { plan: 'STARTER' });
    const b = await createTestTenant(prisma, { plan: 'STARTER' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await app.inject({ method: 'POST', url: '/api/internal/flags/apiAccess/overrides', payload: { tenantId: a.id, enabled: true, reason: 'Pilot for one tenant' } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ override: { tenantId: a.id, featureKey: 'apiAccess', enabled: true }, mirror: { status: 'NOT_CONFIGURED' } });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await resolveTenantEntitlements(prisma, a)).features.apiAccess).toMatchObject({ enabled: true, source: 'override' });
    expect((await resolveTenantEntitlements(prisma, b)).features.apiAccess).toMatchObject({ enabled: false, source: 'plan' });
    const audit = await prisma.platformAuditLog.findFirst({ where: { action: 'TENANT_FEATURE_OVERRIDE', targetTenantId: a.id } });
    expect(audit?.reason).toBe('Pilot for one tenant');
    expect(await prisma.platformActivity.count({ where: { tenantId: a.id, type: 'tenant.feature_overridden' } })).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/api/internal/flags' })).json();
    expect(list.launchDarkly).toMatchObject({ configured: false, missing: ['LAUNCHDARKLY_API_TOKEN'] });
    const apiAccess = list.data.find((flag: { key: string }) => flag.key === 'apiAccess');
    expect(apiAccess).toMatchObject({ kind: 'plan-feature', plans: ['PRO', 'ENTERPRISE'] });
    expect(apiAccess.enabledOverrides).toBeGreaterThanOrEqual(1);

    const detail = (await app.inject({ method: 'GET', url: '/api/internal/flags/apiAccess' })).json();
    const row = detail.overrides.find((item: { tenant: { id: string } }) => item.tenant.id === a.id);
    expect(row).toMatchObject({ enabled: true, active: true, reason: 'Pilot for one tenant', createdBy: { id: permissions.userId }, mirror: null });

    const auditPage = (await app.inject({ method: 'GET', url: '/api/internal/flags/apiAccess/audit' })).json();
    expect(auditPage.data.some((item: { tenant: { id: string } | null }) => item.tenant?.id === a.id)).toBe(true);
  });

  it('ACC-FLG-2 with LaunchDarkly configured the adapter targets context kind tenant; turnFlagOn is never sent', async () => {
    process.env.LAUNCHDARKLY_API_TOKEN = 'ld-test';
    const tenant = await createTestTenant(prisma);
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: URL | string, init: RequestInit) => {
        if (init.method === 'PATCH') bodies.push(String(init.body));
        return new Response(JSON.stringify(init.method === 'PATCH' ? {} : { key: 'webhooks', variations: [{ _id: 'on', value: true }, { _id: 'off', value: false }] }), { status: 200 });
      })
    );
    const created = await app.inject({ method: 'POST', url: '/api/internal/flags/webhooks/overrides', payload: { tenantId: tenant.id, enabled: true, reason: 'Integration pilot' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().mirror).toMatchObject({ status: 'MIRRORED' });
    const overrideId = created.json().override.id as string;
    const revoked = await app.inject({ method: 'DELETE', url: `/api/internal/flags/webhooks/overrides/${overrideId}`, payload: { reason: 'Pilot finished' } });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().mirror).toMatchObject({ status: 'MIRRORED' });
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body).not.toContain('turnFlagOn');
      expect(body).not.toContain('turnFlagOff');
      for (const instruction of JSON.parse(body).instructions as Array<{ contextKind: string; values: string[] }>) {
        expect(instruction.contextKind).toBe('tenant');
        expect(instruction.values).toEqual([tenant.id]);
      }
    }
    expect(JSON.parse(bodies[0]).instructions.map((item: { kind: string }) => item.kind)).toEqual(['removeTargets', 'addTargets']);
    expect(await prisma.featureFlagOverrideAudit.count({ where: { vendorRef: overrideId } })).toBe(2);
  });

  it('ACC-FLG-3 a LaunchDarkly failure keeps the override and reports mirror status FAILED', async () => {
    process.env.LAUNCHDARKLY_API_TOKEN = 'ld-test';
    const tenant = await createTestTenant(prisma);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"internal"}', { status: 503 })));
    const created = await app.inject({ method: 'POST', url: '/api/internal/flags/sso/overrides', payload: { tenantId: tenant.id, enabled: true, reason: 'Enterprise pilot' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().mirror).toMatchObject({ status: 'FAILED', vendor: 'launchdarkly' });
    expect(await prisma.tenantFeatureOverride.count({ where: { tenantId: tenant.id, featureKey: 'sso', revokedAt: null } })).toBe(1);
    const detail = (await app.inject({ method: 'GET', url: '/api/internal/flags/sso' })).json();
    expect(detail.overrides.find((row: { tenant: { id: string } }) => row.tenant.id === tenant.id).mirror).toMatchObject({ status: 'FAILED' });
  });

  it('ACC-FLG-4 releases without GitHub show the backend version and say GitHub is not configured', async () => {
    process.env.APP_VERSION = '2026.10.20';
    process.env.GIT_COMMIT = 'abc1234';
    const response = await app.inject({ method: 'GET', url: '/api/internal/releases' });
    expect(response.json()).toMatchObject({ source: 'local', backend: { version: '2026.10.20', commit: 'abc1234' }, releases: [], github: { configured: false, missing: ['GITHUB_TOKEN', 'GITHUB_REPOSITORY'] } });
    delete process.env.APP_VERSION;
    delete process.env.GIT_COMMIT;
  });

  it('overrides are dangerous and validated: no reason → 400, no enabled → 400, unknown flag → 404, read-only → 403', async () => {
    const tenant = await createTestTenant(prisma);
    const noReason = await app.inject({ method: 'POST', url: '/api/internal/flags/apiAccess/overrides', payload: { tenantId: tenant.id, enabled: true } });
    expect(noReason.json()).toMatchObject({ error: 'REASON_REQUIRED' });
    const noEnabled = await app.inject({ method: 'POST', url: '/api/internal/flags/apiAccess/overrides', payload: { tenantId: tenant.id, value: true, reason: 'Pilot for one tenant' } });
    expect(noEnabled.json()).toMatchObject({ error: 'ENABLED_REQUIRED' });
    const unknown = await app.inject({ method: 'GET', url: '/api/internal/flags/notAFlag' });
    expect(unknown.statusCode).toBe(404);
    permissions.current = ['platform.flags.read'];
    const forbidden = await app.inject({ method: 'POST', url: '/api/internal/flags/apiAccess/overrides', payload: { tenantId: tenant.id, enabled: true, reason: 'Pilot for one tenant' } });
    expect(forbidden.statusCode).toBe(403);
    permissions.current = ['platform.flags.read', 'platform.flags.write'];
  });
});
