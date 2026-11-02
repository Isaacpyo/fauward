import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// gtm.trials (WP-4.14) against real Postgres: a tenant admin asks for more time, staff approve it, Subscription.trialEnd
// moves, SubscriptionEvent TRIAL_EXTENDED is written and the tenant status the banner reads changes; one pending request
// per tenant; Stripe trial_end is mirrored when Stripe manages the subscription; role thresholds on the day count.

const DAY_MS = 24 * 60 * 60 * 1000;
const permissions = vi.hoisted(() => ({ current: [] as Permission[], roles: [] as string[], userId: 'unset' }));
const tenantSession = vi.hoisted(() => ({ tenantId: 'unset', userId: 'unset', role: 'TENANT_ADMIN' }));
const stripe = vi.hoisted(() => ({ configured: false, setTrialEnd: vi.fn() }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'sales@fauward.test', name: 'Sales Lead', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_trials', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: permissions.roles, rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));
vi.mock('../../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: tenantSession.userId, email: 'admin@tenant.test', role: tenantSession.role, tenantId: tenantSession.tenantId };
    request.tenant = { id: tenantSession.tenantId };
  }
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));
vi.mock('../../../services/vendors/stripe.adapter.js', () => ({
  stripeAdapter: {
    vendor: 'stripe',
    isConfigured: () => stripe.configured,
    missingEnv: () => (stripe.configured ? [] : ['STRIPE_SECRET_KEY']),
    setTrialEnd: stripe.setTrialEnd
  }
}));

describe.runIf(HAS_TEST_DB)('gtm.trials (WP-4.14, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  async function trialTenant(options: { daysLeft?: number; stripeSubscriptionId?: string } = {}) {
    const tenant = await createTestTenant(prisma, { status: 'TRIALING' });
    const trialEnd = new Date(Date.now() + (options.daysLeft ?? 3) * DAY_MS);
    await prisma.subscription.create({ data: { tenantId: tenant.id, plan: 'STARTER', status: 'TRIALING', trialEnd, stripeSubscriptionId: options.stripeSubscriptionId ?? null } });
    const admin = await prisma.user.create({ data: { tenantId: tenant.id, email: `admin-${uniqueSuffix()}@tenant.test`, passwordHash: 'x', role: 'TENANT_ADMIN', isActive: true } });
    tenantSession.tenantId = tenant.id;
    tenantSession.userId = admin.id;
    tenantSession.role = 'TENANT_ADMIN';
    return { tenant, trialEnd, admin };
  }

  const ask = (days: number, reason = 'We need two more weeks to onboard the warehouse team.') =>
    app.inject({ method: 'POST', url: '/api/v1/tenants/me/trial-extension-request', payload: { days, reason } });

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleTrialRoutes } = await import('./trials.routes.js');
    const { registerTenantTrialExtensionRoutes } = await import('../../tenants/trial-extension.routes.js');
    await registerConsoleTrialRoutes(app);
    await registerTenantTrialExtensionRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    permissions.current = ['gtm.trials.read', 'gtm.trials.extend'];
    permissions.roles = ['SALES_MANAGER'];
    stripe.configured = false;
    stripe.setTrialEnd.mockReset();
    stripe.setTrialEnd.mockImplementation(async () => ({ id: 'sub_x', status: 'trialing' }));
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ACC-TRL-1 request → approve moves trialEnd, writes TRIAL_EXTENDED and the tenant status the banner reads', async () => {
    const { tenant, trialEnd } = await trialTenant({ daysLeft: 3 });
    const before = (await app.inject({ method: 'GET', url: '/api/v1/tenants/me/trial-extension-request' })).json();
    expect(before).toMatchObject({ trialing: true, daysRemaining: 3, canRequest: true, latestRequest: null });

    const asked = await ask(14);
    expect(asked.statusCode).toBe(201);
    expect(asked.json()).toMatchObject({ canRequest: false, latestRequest: { status: 'PENDING', requestedDays: 14 } });

    const pending = (await app.inject({ method: 'GET', url: '/api/internal/trials/extensions' })).json();
    const row = pending.data.find((item: { tenant: { id: string } }) => item.tenant.id === tenant.id);
    expect(row).toMatchObject({ requestedDays: 14, status: 'PENDING', currentDaysLeft: 3 });

    const noReason = await app.inject({ method: 'POST', url: `/api/internal/trials/extensions/${row.id}/decision`, payload: { decision: 'APPROVE' } });
    expect(noReason.json()).toMatchObject({ error: 'REASON_REQUIRED' });
    const decided = await app.inject({ method: 'POST', url: `/api/internal/trials/extensions/${row.id}/decision`, payload: { decision: 'APPROVE', reason: 'Warehouse onboarding is booked for next week.' } });
    expect(decided.statusCode).toBe(200);
    expect(decided.json()).toMatchObject({ request: { status: 'APPROVED', stripeSync: 'NOT_CONFIGURED' }, stripeSync: 'NOT_CONFIGURED' });

    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    expect(subscription.trialEnd!.getTime()).toBe(trialEnd.getTime() + 14 * DAY_MS);
    expect(await prisma.subscriptionEvent.count({ where: { tenantId: tenant.id, type: 'TRIAL_EXTENDED', source: 'CONSOLE' } })).toBe(1);
    expect(await prisma.platformAuditLog.count({ where: { action: 'TRIAL_EXTENSION_APPROVED', targetTenantId: tenant.id } })).toBe(1);
    expect(await prisma.inAppNotification.count({ where: { tenantId: tenant.id, type: 'trial.extension_approved' } })).toBe(1);

    const after = (await app.inject({ method: 'GET', url: '/api/v1/tenants/me/trial-extension-request' })).json();
    expect(after).toMatchObject({ trialing: true, daysRemaining: 17, canRequest: true, latestRequest: { status: 'APPROVED', newTrialEnd: subscription.trialEnd!.toISOString() } });
    expect((await app.inject({ method: 'POST', url: `/api/internal/trials/extensions/${row.id}/decision`, payload: { decision: 'DENY', reason: 'Second decision must fail.' } })).statusCode).toBe(409);

    const detail = (await app.inject({ method: 'GET', url: `/api/internal/trials/${tenant.id}` })).json();
    expect(detail).toMatchObject({ tenant: { id: tenant.id }, daysLeft: 17, pendingRequest: null, activation: null });
    expect(detail.requests).toHaveLength(1);
    expect(detail.events).toHaveLength(1);
  });

  it('ACC-TRL-2 one pending request per tenant; a denial tells the tenant why and allows a new request', async () => {
    const { tenant } = await trialTenant();
    expect((await ask(15)).statusCode).toBe(400);
    expect((await ask(7)).statusCode).toBe(201);
    const second = await ask(5);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: 'ALREADY_PENDING' });
    expect(await prisma.trialExtensionRequest.count({ where: { tenantId: tenant.id, status: 'PENDING' } })).toBe(1);

    const row = await prisma.trialExtensionRequest.findFirstOrThrow({ where: { tenantId: tenant.id, status: 'PENDING' } });
    const denied = await app.inject({ method: 'POST', url: `/api/internal/trials/extensions/${row.id}/decision`, payload: { decision: 'DENY', reason: 'No activation in the trial so far.' } });
    expect(denied.json()).toMatchObject({ request: { status: 'DENIED', decisionReason: 'No activation in the trial so far.' }, stripeSync: null });
    expect(await prisma.inAppNotification.count({ where: { tenantId: tenant.id, type: 'trial.extension_denied' } })).toBe(1);
    const status = (await app.inject({ method: 'GET', url: '/api/v1/tenants/me/trial-extension-request' })).json();
    expect(status).toMatchObject({ canRequest: true, latestRequest: { status: 'DENIED', decisionReason: 'No activation in the trial so far.' } });
    expect((await ask(3)).statusCode).toBe(201);

    tenantSession.role = 'TENANT_USER';
    expect((await ask(3)).statusCode).toBe(403);

    // Two admins asking at the same moment: the unique pending key lets exactly one through.
    await trialTenant();
    const raced = await Promise.all([ask(3), ask(4), ask(5)]);
    expect(raced.map((response) => response.statusCode).sort()).toEqual([201, 409, 409]);
  });

  it('ACC-TRL-3 Stripe configured: approval sets the subscription trial_end; a Stripe failure keeps the extension and records FAILED', async () => {
    stripe.configured = true;
    const stripeSubscriptionId = `sub_${uniqueSuffix()}`;
    const { tenant, trialEnd } = await trialTenant({ daysLeft: 2, stripeSubscriptionId });
    await ask(5);
    const row = await prisma.trialExtensionRequest.findFirstOrThrow({ where: { tenantId: tenant.id, status: 'PENDING' } });
    const decided = await app.inject({ method: 'POST', url: `/api/internal/trials/extensions/${row.id}/decision`, payload: { decision: 'APPROVE', reason: 'Proof of concept still running.' } });
    expect(decided.json()).toMatchObject({ stripeSync: 'MIRRORED' });
    const expected = new Date(trialEnd.getTime() + 5 * DAY_MS);
    expect(stripe.setTrialEnd).toHaveBeenCalledWith(stripeSubscriptionId, expected, `trial-extension:${row.id}`);

    stripe.setTrialEnd.mockImplementation(async () => {
      throw new Error('stripe answered 500');
    });
    const extended = await app.inject({ method: 'POST', url: `/api/internal/trials/${tenant.id}/extend`, payload: { days: 3, reason: 'Goodwill after the outage.' } });
    expect(extended.statusCode).toBe(200);
    expect(extended.json()).toMatchObject({ request: { source: 'CONSOLE', status: 'APPROVED', stripeSync: 'FAILED' }, stripeSync: 'FAILED' });
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    expect(subscription.trialEnd!.getTime()).toBe(expected.getTime() + 3 * DAY_MS);
  });

  it('ACC-TRL-4 day thresholds by role, not-trialing tenants refused, lists exclude DEMO tenants and honour the 7-day window', async () => {
    const { tenant } = await trialTenant({ daysLeft: 5 });
    permissions.roles = ['SALES_REP'];
    const rep = await app.inject({ method: 'POST', url: `/api/internal/trials/${tenant.id}/extend`, payload: { days: 10, reason: 'Rep cannot extend this far.' } });
    expect(rep.json()).toMatchObject({ error: 'SALES_MANAGER_REQUIRED' });
    expect((await app.inject({ method: 'POST', url: `/api/internal/trials/${tenant.id}/extend`, payload: { days: 7, reason: 'Rep may extend a week.' } })).statusCode).toBe(200);
    permissions.roles = ['SALES_MANAGER'];
    expect((await app.inject({ method: 'POST', url: `/api/internal/trials/${tenant.id}/extend`, payload: { days: 45, reason: 'Manager cannot extend this far.' } })).json()).toMatchObject({ error: 'SALES_DIRECTOR_REQUIRED' });
    permissions.roles = ['SALES_DIRECTOR'];
    expect((await app.inject({ method: 'POST', url: `/api/internal/trials/${tenant.id}/extend`, payload: { days: 91, reason: 'Over the console maximum.' } })).statusCode).toBe(400);

    const active = await createTestTenant(prisma, { status: 'ACTIVE' });
    await prisma.subscription.create({ data: { tenantId: active.id, plan: 'PRO', status: 'ACTIVE' } });
    expect((await app.inject({ method: 'POST', url: `/api/internal/trials/${active.id}/extend`, payload: { days: 3, reason: 'Not a trial at all.' } })).json()).toMatchObject({ error: 'NOT_TRIALING' });

    const demo = await createTestTenant(prisma, { status: 'DEMO' });
    await prisma.subscription.create({ data: { tenantId: demo.id, plan: 'STARTER', status: 'TRIALING', trialEnd: new Date(Date.now() + 2 * DAY_MS) } });
    const far = await trialTenant({ daysLeft: 20 });
    const trials = (await app.inject({ method: 'GET', url: '/api/internal/trials' })).json();
    const ids = trials.data.map((row: { tenant: { id: string } }) => row.tenant.id);
    expect(ids).toContain(tenant.id);
    expect(ids).toContain(far.tenant.id);
    expect(ids).not.toContain(demo.id);
    const expiring = (await app.inject({ method: 'GET', url: '/api/internal/trials/expiring' })).json();
    const expiringIds = expiring.data.map((row: { tenant: { id: string } }) => row.tenant.id);
    expect(expiringIds).not.toContain(far.tenant.id);
    expect(expiringIds).not.toContain(demo.id);
    expect(expiring.windowDays).toBe(7);

    permissions.current = ['gtm.trials.read'];
    expect((await app.inject({ method: 'POST', url: `/api/internal/trials/${tenant.id}/extend`, payload: { days: 1, reason: 'Read-only staff cannot extend.' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/internal/trials/does-not-exist' })).statusCode).toBe(404);
  });
});
