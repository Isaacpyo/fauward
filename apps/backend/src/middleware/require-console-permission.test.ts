import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROLE_PERMISSIONS, Role } from '@fauward/internal-rbac';

// Real permission resolution (staff roles ∪ JIT, D2) behind real route guards; only the session cookie, CSRF and the
// database are doubles.

let mfaVerifiedAt = new Date();

vi.mock('./authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: 'pu_csm', email: 'csm@fauward.com', name: 'Casey', role: 'PLATFORM_READONLY', mfaEnabled: true, status: 'ACTIVE' },
      session: { id: 'ps_1', mfaVerifiedAt }
    };
  }
}));
vi.mock('./require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../services/platform-audit.service.js', () => ({ writePlatformAuditLog: vi.fn(async () => undefined) }));
const emptyQueue = vi.hoisted(() => ({ getJobCounts: async () => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }) }));
vi.mock('../queues/queues.js', () => ({ notificationQueue: emptyQueue, webhookQueue: emptyQueue, outboxQueue: emptyQueue, analyticsQueue: emptyQueue, scheduledJobsQueue: emptyQueue }));
vi.mock('../modules/notifications/notifications.worker.js', () => ({ dlqNotificationQueue: emptyQueue }));
vi.mock('../queues/outbox.worker.js', () => ({ dlqOutboxQueue: emptyQueue }));
vi.mock('../queues/webhook.worker.js', () => ({ dlqWebhookQueue: emptyQueue }));

type Grant = { id: string; requesterPlatformUserId: string; permission: string; status: string; revokedAt: Date | null; expiresAt: Date | null };

function createWorld(role: Role, grants: Grant[] = []) {
  const staff = { id: 'staff_csm', platformUserId: 'pu_csm', email: 'csm@fauward.com', roleAssignments: [{ role: { id: role, permissions: ROLE_PERMISSIONS[role] } }] };
  const tenant = { id: 'tenant_1', name: 'Northwind', slug: 'northwind', status: 'ACTIVE', plan: 'PRO' };
  return {
    staffUser: { findUnique: vi.fn(async () => staff) },
    jitAccessRequest: {
      findMany: vi.fn(async ({ where }: { where: { requesterPlatformUserId: string; expiresAt: { gt: Date } } }) =>
        grants.filter((grant) => grant.requesterPlatformUserId === where.requesterPlatformUserId && grant.status === 'APPROVED' && !grant.revokedAt && grant.expiresAt && grant.expiresAt > where.expiresAt.gt)
      )
    },
    tenant: {
      findUnique: vi.fn(async () => tenant),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(tenant, data))
    },
    platformActivity: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'act_1', ...create })) },
    $queryRaw: vi.fn(async () => [{ ok: 1 }])
  };
}

const openApps: FastifyInstance[] = [];

async function buildApp(prisma: ReturnType<typeof createWorld>) {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', prisma as never);
  app.decorate('redis', { ping: vi.fn(async () => 'PONG'), publish: vi.fn(async () => 1), del: vi.fn(async () => 1) } as never);
  const { registerConsoleOperationsRoutes } = await import('../modules/internal/platform/operations.routes.js');
  const { registerConsoleTenantRoutes } = await import('../modules/internal/platform/tenants.routes.js');
  const { registerConsoleAuthRoutes } = await import('../modules/internal/auth/console-auth.routes.js');
  await registerConsoleOperationsRoutes(app);
  await registerConsoleTenantRoutes(app);
  await registerConsoleAuthRoutes(app);
  return app;
}

afterEach(async () => {
  vi.useRealTimers();
  mfaVerifiedAt = new Date();
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('requireConsolePermission (D2)', () => {
  it('ACC-RBAC-1 a role without platform.health.read / platform.queues.read gets 403 naming the permission', async () => {
    // C35: FINANCE_ADMIN holds both read permissions in ROLE_PERMISSIONS, so a CSM proves the denial instead.
    expect(ROLE_PERMISSIONS[Role.CSM]).not.toContain('platform.health.read');
    const app = await buildApp(createWorld(Role.CSM));
    const health = await app.inject({ method: 'GET', url: '/api/internal/health' });
    expect(health.statusCode).toBe(403);
    expect(health.json()).toEqual({ error: 'Forbidden', permission: 'platform.health.read' });
    const queues = await app.inject({ method: 'GET', url: '/api/internal/queues' });
    expect(queues.json()).toEqual({ error: 'Forbidden', permission: 'platform.queues.read' });
  });

  it('ACC-RBAC-1 the same routes return 200 for a role that holds the permission', async () => {
    const app = await buildApp(createWorld(Role.SRE));
    expect((await app.inject({ method: 'GET', url: '/api/internal/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/internal/queues' })).statusCode).toBe(200);
  });

  it('ACC-RBAC-2 an approved JIT grant for platform.tenants.suspend works until expiresAt, is listed by /auth/me, then 403', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date('2026-10-18T12:00:00.000Z');
    vi.setSystemTime(now);
    mfaVerifiedAt = new Date(now);
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const prisma = createWorld(Role.CSM, [{ id: 'jit_1', requesterPlatformUserId: 'pu_csm', permission: 'platform.tenants.suspend', status: 'APPROVED', revokedAt: null, expiresAt }]);
    const app = await buildApp(prisma);

    const me = await app.inject({ method: 'GET', url: '/api/internal/auth/me' });
    expect(me.json()).toMatchObject({ jit: [{ permission: 'platform.tenants.suspend', expiresAt: expiresAt.toISOString() }] });
    expect((me.json() as { permissions: string[] }).permissions).toContain('platform.tenants.suspend');

    const suspend = await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_1/suspend', payload: { reason: 'Chargeback fraud confirmed by Stripe' } });
    expect(suspend.statusCode).toBe(200);

    vi.setSystemTime(new Date(expiresAt.getTime() + 60_000));
    mfaVerifiedAt = new Date();
    const expired = await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_1/suspend', payload: { reason: 'Chargeback fraud confirmed by Stripe' } });
    expect(expired.statusCode).toBe(403);
    expect(expired.json()).toEqual({ error: 'Forbidden', permission: 'platform.tenants.suspend' });
    const meAfter = await app.inject({ method: 'GET', url: '/api/internal/auth/me' });
    expect((meAfter.json() as { jit: unknown[] }).jit).toEqual([]);
  });

  it('computes the permission context once per request', async () => {
    const prisma = createWorld(Role.SRE);
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: '/api/internal/health' });
    expect(prisma.jitAccessRequest.findMany).toHaveBeenCalledTimes(1);
  });

  it('ACC-JIT-1 every staff role holds trust.jit.request', () => {
    for (const role of Object.values(Role)) expect(ROLE_PERMISSIONS[role], role).toContain('trust.jit.request');
  });
});
