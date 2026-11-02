import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// platform.integrations (WP-4.3) against real Postgres: the poll checks configured providers only, DOWN/DEGRADED/OK
// come from the cheap call and the 24 h NotificationLog failure rate, the detail is one object with history and recent
// errors, a manual check is audited, and webhook failures are reachable on console auth.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'integrations@fauward.test', name: 'Integrations', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_int', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));

// The worktree env carries a placeholder Stripe key; Stripe is unconfigured here (its SDK call is covered by stripe.adapter).
vi.mock('../../../services/vendors/stripe.adapter.js', () => ({ stripeAdapter: { vendor: 'stripe', isConfigured: () => false, missingEnv: () => ['STRIPE_SECRET_KEY'], ping: vi.fn() } }));

// Every provider env var, cleared so only what a test sets is "configured".
const PROVIDER_ENV = [
  'SENDGRID_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'PAGERDUTY_API_TOKEN',
  'LAUNCHDARKLY_API_TOKEN',
  'GITHUB_TOKEN',
  'GITHUB_REPOSITORY',
  'DOPPLER_API_TOKEN',
  'DOPPLER_PROJECT',
  'DOPPLER_CONFIG',
  'PERSONA_API_KEY',
  'COMPLYADVANTAGE_API_KEY',
  'DOCUSIGN_ACCESS_TOKEN',
  'DOCUSIGN_ACCOUNT_ID',
  'HUBSPOT_ACCESS_TOKEN'
];
const KEYS = ['sendgrid', 'github', 'hubspot', 'twilio'];

describe.runIf(HAS_TEST_DB)('platform.integrations (WP-4.3, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  const saved: Record<string, string | undefined> = {};
  const logEvent = `test.integration.${uniqueSuffix()}`;

  beforeAll(async () => {
    for (const name of PROVIDER_ENV) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    permissions.current = ['platform.integrations.read', 'platform.integrations.write'];
    // Integration status rows are global; start these providers from nothing.
    await prisma.integrationProviderStatus.deleteMany({ where: { provider: { in: KEYS } } });
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleIntegrationRoutes } = await import('./integrations.routes.js');
    const { registerConsoleOperationsRoutes } = await import('./operations.routes.js');
    await registerConsoleIntegrationRoutes(app);
    await registerConsoleOperationsRoutes(app);
    await app.ready();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const name of PROVIDER_ENV) delete process.env[name];
    permissions.current = ['platform.integrations.read', 'platform.integrations.write'];
  });

  afterAll(async () => {
    await prisma?.notificationLog.deleteMany({ where: { event: logEvent } });
    await app?.close();
    await prisma?.$disconnect();
    for (const name of PROVIDER_ENV) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  function stubVendors(answers: Record<string, number>) {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string) => {
        const url = String(input);
        calls.push(url);
        const host = Object.keys(answers).find((key) => url.includes(key));
        return new Response('{}', { status: host ? answers[host] : 599 });
      })
    );
    return calls;
  }

  it('ACC-INT-1 the poll writes a status for configured providers only', async () => {
    process.env.SENDGRID_API_KEY = 'SG.test';
    process.env.GITHUB_TOKEN = 'gh-test';
    process.env.GITHUB_REPOSITORY = 'fauward/fauward';
    const calls = stubVendors({ 'api.sendgrid.com': 200, 'api.github.com': 503 });
    const { pollIntegrations } = await import('../../../services/integration-health.service.js');

    const result = await pollIntegrations(app);

    expect(result).toMatchObject({ configured: 2, results: { sendgrid: 'OK', github: 'DOWN' } });
    expect(calls.some((url) => url.endsWith('/v3/scopes'))).toBe(true);
    expect(calls.some((url) => url.includes('/repos/fauward/fauward'))).toBe(true);
    expect(await prisma.integrationProviderStatus.findUnique({ where: { provider: 'sendgrid' } })).toMatchObject({ status: 'OK' });
    expect(await prisma.integrationProviderStatus.findUnique({ where: { provider: 'github' } })).toMatchObject({ status: 'DOWN' });
    expect(await prisma.integrationProviderStatus.findUnique({ where: { provider: 'hubspot' } })).toBeNull();
    expect(await prisma.platformActivity.findFirst({ where: { service: 'platform.integrations', subjectId: 'github', type: 'integration.status_changed' }, orderBy: { occurredAt: 'desc' } })).toMatchObject({ severity: 'CRITICAL' });

    const list = (await app.inject({ method: 'GET', url: '/api/internal/integrations' })).json();
    const byKey = new Map(list.data.map((row: { provider: string }) => [row.provider, row]));
    expect(byKey.get('hubspot')).toMatchObject({ status: 'NOT_CONFIGURED', configured: false, missingEnv: ['HUBSPOT_ACCESS_TOKEN'], polled: false });
    expect(byKey.get('sendgrid')).toMatchObject({ status: 'OK', configured: true, polled: true });
    expect(byKey.get('github')).toMatchObject({ status: 'DOWN', lastError: { message: 'github answered 503' } });
    expect(list.data.every((row: { status: string }) => row.status !== 'UNKNOWN')).toBe(true);
  });

  it('ACC-INT-1 a provider whose sends fail ≥ 20% in 24 h is DEGRADED even when its API answers', async () => {
    process.env.SENDGRID_API_KEY = 'SG.test';
    stubVendors({ 'api.sendgrid.com': 200 });
    await prisma.notificationLog.createMany({ data: Array.from({ length: 5 }, () => ({ channel: 'EMAIL' as const, event: logEvent, provider: 'SENDGRID', status: 'FAILED', error: 'bounced' })) });
    const { pollIntegrations } = await import('../../../services/integration-health.service.js');
    const result = await pollIntegrations(app);
    expect(result.results.sendgrid).toBe('DEGRADED');
    const detail = (await app.inject({ method: 'GET', url: '/api/internal/integrations/sendgrid' })).json();
    expect(detail.errorRate24h).toBeGreaterThanOrEqual(0.2);
    expect(detail.errorRateSource).toBe('NotificationLog (EMAIL)');
    await prisma.notificationLog.deleteMany({ where: { event: logEvent } });
  });

  it('ACC-INT-2 provider detail is a single object with history and recent errors', async () => {
    const detail = await app.inject({ method: 'GET', url: '/api/internal/integrations/github' });
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(Array.isArray(body)).toBe(false);
    expect(body).toMatchObject({ provider: 'github', name: 'GitHub', check: 'GET /repos/{repository}', envNames: ['GITHUB_TOKEN', 'GITHUB_REPOSITORY'] });
    expect(body.history.length).toBeGreaterThanOrEqual(1);
    expect(body.recentErrors[0]).toMatchObject({ status: 'DOWN', error: 'github answered 503' });
    expect((await app.inject({ method: 'GET', url: '/api/internal/integrations/not-a-provider' })).statusCode).toBe(404);
  });

  it('a manual check needs integrations.write, refuses unconfigured providers and is audited', async () => {
    process.env.SENDGRID_API_KEY = 'SG.test';
    stubVendors({ 'api.sendgrid.com': 200 });
    permissions.current = ['platform.integrations.read'];
    expect((await app.inject({ method: 'POST', url: '/api/internal/integrations/sendgrid/check' })).statusCode).toBe(403);
    permissions.current = ['platform.integrations.read', 'platform.integrations.write'];
    const notConfigured = await app.inject({ method: 'POST', url: '/api/internal/integrations/hubspot/check' });
    expect(notConfigured.statusCode).toBe(409);
    const checked = await app.inject({ method: 'POST', url: '/api/internal/integrations/sendgrid/check' });
    expect(checked.statusCode).toBe(200);
    expect(checked.json()).toMatchObject({ provider: 'sendgrid', status: 'OK' });
    expect(await prisma.platformAuditLog.findFirst({ where: { action: 'INTEGRATION_CHECKED', actorId: permissions.userId }, orderBy: { createdAt: 'desc' } })).toMatchObject({ actorType: 'PLATFORM_USER' });
  });

  it('ACC-INT-5 webhook failures are reachable on console auth, paginated, state only', async () => {
    const tenant = await createTestTenant(prisma);
    const endpoint = await prisma.webhookEndpoint.create({ data: { tenantId: tenant.id, url: `https://hooks.example.test/${uniqueSuffix()}`, secret: 'whsec_test', events: ['shipment.created'] } });
    for (let index = 0; index < 3; index += 1) {
      await prisma.webhookDelivery.create({ data: { tenantId: tenant.id, endpointId: endpoint.id, eventType: 'shipment.created', payload: { secret: 'payload-stays-in-tenant-log' }, status: 'FAILED', attemptCount: 5, deadLetteredAt: new Date(Date.now() - index * 1000) } });
    }
    const first = await app.inject({ method: 'GET', url: '/api/internal/integrations/webhooks/failures?limit=2' });
    expect(first.statusCode).toBe(200);
    expect(first.json().failures).toHaveLength(2);
    expect(first.json().nextCursor).toBeTruthy();
    expect(first.body).not.toContain('payload-stays-in-tenant-log');
    const second = await app.inject({ method: 'GET', url: `/api/internal/integrations/webhooks/failures?limit=2&cursor=${first.json().nextCursor}` });
    expect(second.json().failures.length).toBeGreaterThanOrEqual(1);
    permissions.current = [];
    expect((await app.inject({ method: 'GET', url: '/api/internal/integrations/webhooks/failures' })).statusCode).toBe(403);
  });

  it('the credentials view lists only integration credentials from the secret inventory', async () => {
    // Inventory rows are global and trust.secrets tests run the inventory in parallel; seed one integration row directly.
    await prisma.secretCredential.upsert({
      where: { envName: 'HUBSPOT_ACCESS_TOKEN' },
      create: { name: 'HubSpot access token', envName: 'HUBSPOT_ACCESS_TOKEN', source: 'ENV', configured: false, rotateEveryDays: 180 },
      update: {}
    });
    await prisma.secretCredential.upsert({
      where: { envName: 'JWT_ACCESS_SECRET' },
      create: { name: 'Tenant access-token signing key', envName: 'JWT_ACCESS_SECRET', source: 'ENV', configured: false, rotateEveryDays: 180 },
      update: {}
    });
    const body = (await app.inject({ method: 'GET', url: '/api/internal/integrations/credentials' })).json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((row: { integration: string | null }) => row.integration)).toBe(true);
    expect(body.data.find((row: { envName: string }) => row.envName === 'HUBSPOT_ACCESS_TOKEN')).toMatchObject({ integration: 'hubspot' });
    expect(body.data.some((row: { envName: string }) => row.envName === 'JWT_ACCESS_SECRET')).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/"value"/);
  });
});
