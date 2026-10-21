import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// gtm.attribution (WP-4.16) against real Postgres: signup writes one FIRST_TOUCH row from the forwarded cookie (UTM,
// referrer, landing page) or "unknown" without it; the funnel and campaign/landing-page groupings match a fixture of
// tenants created in a fixed past month (so other suites' tenants never fall in range); DEMO tenants are left out.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'marketing@fauward.test', name: 'Marketing', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_attr', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));

const RANGE = 'from=2001-03-01&to=2001-03-31';

describe.runIf(HAS_TEST_DB)('gtm.attribution (WP-4.16, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  async function fixtureTenant(input: { status?: 'TRIALING' | 'ACTIVE' | 'DEMO'; subscription?: 'TRIALING' | 'ACTIVE'; score?: number; touch?: { source: string; medium?: string; campaign?: string; landingPage?: string } }) {
    const suffix = uniqueSuffix();
    const tenant = await prisma.tenant.create({ data: { name: `Attr ${suffix}`, slug: `attr-${suffix}`, plan: 'STARTER', status: input.status ?? 'TRIALING', createdAt: new Date('2001-03-15T12:00:00.000Z') } });
    if (input.subscription) await prisma.subscription.create({ data: { tenantId: tenant.id, plan: 'STARTER', status: input.subscription } });
    if (input.score !== undefined) await prisma.trialActivation.create({ data: { tenantId: tenant.id, score: input.score } });
    if (input.touch) {
      await prisma.marketingAttribution.create({ data: { tenantId: tenant.id, touchType: 'FIRST_TOUCH', periodStart: tenant.createdAt, periodEnd: tenant.createdAt, weight: '1', ...input.touch } });
    }
    return tenant;
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    permissions.current = ['gtm.attribution.read'];
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleAttributionRoutes } = await import('./attribution.routes.js');
    await registerConsoleAttributionRoutes(app);
    await app.ready();

    // Clear an earlier run's fixture so the counts below are exact.
    const old = await prisma.tenant.findMany({ where: { slug: { startsWith: 'attr-' }, createdAt: { gte: new Date('2001-03-01T00:00:00.000Z'), lte: new Date('2001-03-31T23:59:59.000Z') } }, select: { id: true } });
    const ids = old.map((row) => row.id);
    if (ids.length) {
      await prisma.marketingAttribution.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.trialActivation.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.subscription.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { createdAt: new Date('2000-01-01T00:00:00.000Z') } });
    }
    await fixtureTenant({ subscription: 'ACTIVE', status: 'ACTIVE', score: 80, touch: { source: 'google', medium: 'cpc', campaign: 'spring', landingPage: '/pricing' } });
    await fixtureTenant({ subscription: 'TRIALING', score: 60, touch: { source: 'google', medium: 'cpc', campaign: 'spring', landingPage: '/pricing' } });
    await fixtureTenant({ subscription: 'TRIALING', score: 10, touch: { source: 'newsletter', medium: 'email', campaign: 'launch', landingPage: '/features' } });
    await fixtureTenant({ subscription: 'ACTIVE', status: 'ACTIVE', touch: { source: 'direct', medium: 'none', landingPage: '/' } });
    await fixtureTenant({ subscription: 'TRIALING' });
    await fixtureTenant({ status: 'DEMO', subscription: 'ACTIVE', score: 90, touch: { source: 'google', medium: 'cpc', campaign: 'spring', landingPage: '/pricing' } });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ACC-ATT-1 signup stores the forwarded first touch; without the cookie the source is "unknown"', async () => {
    const { authService } = await import('../../auth/auth.service.js');
    const register = (attribution?: Record<string, string>) =>
      authService.register({ companyName: `Signup ${uniqueSuffix()}`, region: 'global', email: `owner-${uniqueSuffix()}@signup.test`, plan: 'starter', password: 'long-enough-password', ...(attribution ? { attribution } : {}) }, prisma);

    const tracked = await register({ utm_source: 'Google', utm_medium: 'CPC', utm_campaign: 'spring-sale', utm_term: 'courier software', referrer: 'https://www.google.com/', landingPage: '/pricing', firstSeen: '2026-10-01T09:00:00.000Z' });
    expect(await prisma.marketingAttribution.findMany({ where: { tenantId: tracked.tenant.id } })).toEqual([
      expect.objectContaining({ touchType: 'FIRST_TOUCH', source: 'google', medium: 'cpc', campaign: 'spring-sale', term: 'courier software', landingPage: '/pricing', referrer: 'https://www.google.com/', periodStart: new Date('2026-10-01T09:00:00.000Z') })
    ]);
    const referred = await register({ referrer: 'https://www.logisticsweekly.example/review', landingPage: '/' , firstSeen: '2026-10-02T09:00:00.000Z' });
    expect(await prisma.marketingAttribution.findFirst({ where: { tenantId: referred.tenant.id } })).toMatchObject({ source: 'logisticsweekly.example', medium: 'referral' });
    const direct = await register({ landingPage: '/', firstSeen: '2026-10-03T09:00:00.000Z' });
    expect(await prisma.marketingAttribution.findFirst({ where: { tenantId: direct.tenant.id } })).toMatchObject({ source: 'direct', medium: 'none' });
    const untracked = await register();
    expect(await prisma.marketingAttribution.findFirst({ where: { tenantId: untracked.tenant.id } })).toMatchObject({ source: 'unknown', campaign: null });

    const { registerSchema } = await import('../../auth/auth.schema.js');
    expect(registerSchema.safeParse({ companyName: 'Acme', region: 'global', email: 'a@b.co', password: 'long-enough', attribution: { utm_source: 'x'.repeat(201) } }).success).toBe(false);
  });

  it('ACC-ATT-2 the funnel counts signup → activated (score ≥ threshold or paying) → paid for the range', async () => {
    const funnel = (await app.inject({ method: 'GET', url: `/api/internal/attribution/funnel?${RANGE}` })).json();
    expect(funnel.stages).toEqual([
      { stage: 'signup', count: 5 },
      { stage: 'activated', count: 3 },
      { stage: 'paid', count: 2 }
    ]);
    expect(funnel.bySource).toEqual([
      { source: 'google', signups: 2, activated: 2, paid: 1 },
      { source: 'direct', signups: 1, activated: 1, paid: 1 },
      { source: 'newsletter', signups: 1, activated: 0, paid: 0 },
      { source: 'unknown', signups: 1, activated: 0, paid: 0 }
    ]);
    expect(funnel.activationThreshold).toBe(50);
    const summary = (await app.inject({ method: 'GET', url: `/api/internal/attribution/summary?${RANGE}` })).json();
    expect(summary).toMatchObject({ totals: { signups: 5, activated: 3, paid: 2 }, untracked: 1 });
    expect(summary.data[0]).toEqual({ source: 'google', medium: 'cpc', signups: 2, activated: 2, paid: 1 });
  });

  it('ACC-ATT-3 campaigns and landing pages group their signups', async () => {
    const campaigns = (await app.inject({ method: 'GET', url: `/api/internal/attribution/campaigns?${RANGE}` })).json();
    expect(campaigns.data).toEqual([
      { campaign: 'spring', signups: 2, activated: 2, paid: 1 },
      { campaign: 'launch', signups: 1, activated: 0, paid: 0 }
    ]);
    const pages = (await app.inject({ method: 'GET', url: `/api/internal/attribution/landing-pages?${RANGE}` })).json();
    expect(pages.data).toEqual([
      { landingPage: '/pricing', signups: 2, activated: 2, paid: 1 },
      { landingPage: '/', signups: 1, activated: 1, paid: 1 },
      { landingPage: '/features', signups: 1, activated: 0, paid: 0 }
    ]);
  });

  it('ACC-ATT-4 DEMO tenants are excluded; bad ranges and missing permission are refused', async () => {
    const summary = (await app.inject({ method: 'GET', url: `/api/internal/attribution/summary?${RANGE}` })).json();
    expect(summary.totals.signups).toBe(5);
    expect((await app.inject({ method: 'GET', url: '/api/internal/attribution/funnel?from=2001-04-01&to=2001-03-01' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/internal/attribution/funnel?from=yesterday' })).statusCode).toBe(400);
    permissions.current = [];
    expect((await app.inject({ method: 'GET', url: `/api/internal/attribution/summary?${RANGE}` })).statusCode).toBe(403);
    permissions.current = ['gtm.attribution.read'];
  });
});
