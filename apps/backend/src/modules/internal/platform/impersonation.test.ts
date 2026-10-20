import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const staffPermissions = new Set<string>();
const queueAdd = vi.hoisted(() => vi.fn(async (_name: string, _data: Record<string, unknown>) => ({ id: 'job' })));
const tenantPlan = { plan: 'PRO', notifyOnStaffAccess: true };
const inApp: Array<Record<string, unknown>> = [];
const auditCalls: Array<{ action: string; reason?: string | null; metadata?: unknown }> = [];

vi.mock('../../../queues/queues.js', () => ({ analyticsQueue: {}, notificationQueue: { add: queueAdd }, outboxQueue: {}, scheduledJobsQueue: {}, webhookQueue: {} }));
vi.mock('../../notifications/notifications.worker.js', () => ({ dlqNotificationQueue: {} }));
vi.mock('../../../queues/outbox.worker.js', () => ({ dlqOutboxQueue: {} }));
vi.mock('../../../queues/webhook.worker.js', () => ({ dlqWebhookQueue: {} }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: 'pu_staff', email: 'support@fauward.com', role: 'SUPER_ADMIN', mfaEnabled: true },
      session: { id: 'ps_1', mfaVerifiedAt: new Date() }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/platform-audit.service.js', () => ({
  writePlatformAuditLog: vi.fn(async (_db: unknown, input: { action: string; reason?: string | null; metadata?: unknown }) => {
    auditCalls.push(input);
  }),
  verifyPlatformAuditChain: vi.fn()
}));
vi.mock('../../../middleware/require-console-permission.js', () => ({
  requireConsolePermission: () => async () => undefined,
  requireAnyConsolePermission: () => async () => undefined,
  consoleUserHas: vi.fn(async (_request: unknown, permission: string) => staffPermissions.has(permission))
}));

type SessionRow = {
  id: string;
  platformUserId: string;
  targetTenantId: string;
  targetUserId: string | null;
  scopes: string[];
  reason: string;
  expiresAt: Date;
  revokedAt: Date | null;
  endedAt: Date | null;
  endedReason: string | null;
  exchangedAt: Date | null;
  createdAt: Date;
};

function createRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const live = (key: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  };
  return {
    store,
    set: vi.fn(async (key: string, value: string, _mode: 'EX', seconds: number) => {
      store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      return 'OK';
    }),
    get: vi.fn(async (key: string) => live(key)),
    getdel: vi.fn(async (key: string) => {
      const value = live(key);
      store.delete(key);
      return value;
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    publish: vi.fn(async () => 1)
  };
}

function createPrisma() {
  const sessions = new Map<string, SessionRow>();
  let seq = 0;
  return {
    sessions,
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'tenant_1' ? { id: 'tenant_1', name: 'Northwind', slug: 'northwind', plan: tenantPlan.plan, status: 'ACTIVE' } : null
      )
    },
    tenantSettings: { findUnique: vi.fn(async () => ({ notifyOnStaffAccess: tenantPlan.notifyOnStaffAccess })) },
    inAppNotification: { createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => inApp.push(...data)) },
    user: {
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string } }) =>
        where.tenantId === 'tenant_1' ? { id: 'user_admin', email: 'admin@northwind.test', role: 'TENANT_ADMIN', isActive: true } : null
      ),
      findMany: vi.fn(async () => [{ id: 'user_admin', email: 'admin@northwind.test' }])
    },
    tenantPlanOverride: { findFirst: vi.fn(async () => null) },
    auditLog: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string; metadata: { path: string[]; equals: string } } }) =>
        where.metadata.equals === 'imp_1'
          ? [{ id: 'audit_1', tenantId: where.tenantId, actorType: 'IMPERSONATOR', action: 'SHIPMENT_VIEWED', metadata: { impersonationSessionId: 'imp_1', platformUserId: 'pu_staff' }, timestamp: new Date() }]
          : []
      )
    },
    platformActivity: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: `act_${String(create.type)}`, ...create })) },
    platformImpersonationSession: {
      create: vi.fn(async ({ data }: { data: Omit<SessionRow, 'id' | 'revokedAt' | 'endedAt' | 'endedReason' | 'exchangedAt' | 'createdAt'> }) => {
        seq += 1;
        const row: SessionRow = { id: `imp_${seq}`, revokedAt: null, endedAt: null, endedReason: null, exchangedAt: null, createdAt: new Date(), ...data };
        sessions.set(row.id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = sessions.get(where.id);
        if (!row) return null;
        return {
          ...row,
          platformUser: { id: row.platformUserId, email: 'support@fauward.com' },
          targetTenant: { id: 'tenant_1', slug: 'northwind', name: 'Northwind', plan: 'PRO' }
        };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; exchangedAt?: null; revokedAt?: null; endedAt?: null }; data: Partial<SessionRow> }) => {
        const row = sessions.get(where.id);
        if (!row) return { count: 0 };
        if ('exchangedAt' in where && row.exchangedAt) return { count: 0 };
        if ('revokedAt' in where && row.revokedAt) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      })
    }
  };
}

const openApps: FastifyInstance[] = [];

async function buildConsoleApp(prisma = createPrisma(), redis = createRedis()) {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', prisma as never);
  app.decorate('redis', redis as never);
  const { registerConsoleImpersonationRoutes } = await import('./impersonation.routes.js');
  const { registerImpersonationExchangeRoutes } = await import('../../auth/impersonation-exchange.routes.js');
  await registerConsoleImpersonationRoutes(app);
  await registerImpersonationExchangeRoutes(app);
  return { app, prisma, redis };
}

function start(app: FastifyInstance, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/internal/impersonation/sessions', payload: { tenantId: 'tenant_1', ...payload } });
}

beforeEach(() => {
  staffPermissions.clear();
  auditCalls.length = 0;
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('impersonation start (S6, S18)', () => {
  it('ACC-IMP-2 defaults to read; write without platform.impersonation.mutate is 403', async () => {
    const { app, prisma } = await buildConsoleApp();
    const read = await start(app, { reason: 'Investigating a failed label print' });
    expect(read.statusCode).toBe(200);
    expect([...prisma.sessions.values()][0].scopes).toEqual(['read']);

    const write = await start(app, { reason: 'Fixing a broken rate card on behalf of tenant', scopes: ['write'] });
    expect(write.statusCode).toBe(403);
    expect(write.json()).toMatchObject({ permission: 'platform.impersonation.mutate' });
  });

  it('ACC-L18-1 starting a session tells the tenant admins in-app and by email; only Enterprise can turn the email off', async () => {
    inApp.length = 0;
    queueAdd.mockClear();
    const { app } = await buildConsoleApp();
    expect((await start(app, { reason: 'Investigating a failed label print' })).statusCode).toBe(200);
    expect(inApp).toEqual([expect.objectContaining({ userId: 'user_admin', type: 'staff_access.started', title: 'Fauward staff opened your workspace (read-only)', link: '/settings?tab=staff-access' })]);
    expect(queueAdd.mock.calls.map(([, job]) => job.template)).toEqual(['staff_access_started']);

    tenantPlan.notifyOnStaffAccess = false;
    queueAdd.mockClear();
    await start(app, { reason: 'Investigating a failed label print again' });
    expect(queueAdd.mock.calls.map(([, job]) => job.template)).toEqual(['staff_access_started']);
    tenantPlan.plan = 'ENTERPRISE';
    queueAdd.mockClear();
    await start(app, { reason: 'Investigating a failed label print once more' });
    expect(queueAdd).not.toHaveBeenCalled();
    expect(inApp).toHaveLength(3);
    tenantPlan.plan = 'PRO';
    tenantPlan.notifyOnStaffAccess = true;
  });

  it('ACC-IMP-2 write with the permission and a 20-character reason is 200 and capped at 15 minutes', async () => {
    staffPermissions.add('platform.impersonation.mutate');
    const { app, prisma } = await buildConsoleApp();
    const short = await start(app, { reason: 'Fix rate card', scopes: ['write'] });
    expect(short.statusCode).toBe(400);
    expect(short.json()).toMatchObject({ error: 'REASON_REQUIRED' });

    const before = Date.now();
    const write = await start(app, { reason: 'Fixing a broken rate card on behalf of tenant', scopes: ['write'], expiresInMinutes: 30 });
    expect(write.statusCode).toBe(200);
    const session = [...prisma.sessions.values()].at(-1)!;
    expect(session.scopes).toEqual(['read', 'write']);
    const minutes = (session.expiresAt.getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(14.9);
    expect(minutes).toBeLessThanOrEqual(15.01);
  });

  it('ACC-IMP-3 the start response has no token; the exchange code works once, then fails', async () => {
    const { app } = await buildConsoleApp();
    const response = await start(app, { reason: 'Investigating a failed label print' });
    const body = response.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('token');
    expect(JSON.stringify(body)).not.toMatch(/eyJ[\w-]+\.[\w-]+\./);
    expect(body.portalUrl).toMatch(/\/auth\/impersonate#code=/);
    expect(body.portalUrl).not.toContain('token=');

    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/impersonation/exchange', payload: { code: body.exchangeCode } });
    expect(first.statusCode).toBe(200);
    const claims = jwt.decode((first.json() as { token: string }).token) as Record<string, unknown>;
    expect(claims).toMatchObject({ mode: 'IMPERSONATION', scopes: ['read'], tenantId: 'tenant_1', impersonator: 'pu_staff' });

    const second = await app.inject({ method: 'POST', url: '/api/v1/auth/impersonation/exchange', payload: { code: body.exchangeCode } });
    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({ error: 'EXCHANGE_CODE_INVALID' });
  });

  it('ACC-IMP-3 an exchange code fails after 60 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { app } = await buildConsoleApp();
    const body = (await start(app, { reason: 'Investigating a failed label print' })).json() as { exchangeCode: string };
    vi.setSystemTime(Date.now() + 61_000);
    const late = await app.inject({ method: 'POST', url: '/api/v1/auth/impersonation/exchange', payload: { code: body.exchangeCode } });
    expect(late.statusCode).toBe(401);
  });

  it('ending a session records END with the reason and sets endedAt', async () => {
    const { app, prisma, redis } = await buildConsoleApp();
    const body = (await start(app, { reason: 'Investigating a failed label print' })).json() as { impersonationSessionId: string };
    const end = await app.inject({ method: 'DELETE', url: `/api/internal/impersonation/sessions/${body.impersonationSessionId}`, payload: { reason: 'Investigation finished' } });
    expect(end.statusCode).toBe(204);
    const row = prisma.sessions.get(body.impersonationSessionId)!;
    expect(row.endedReason).toBe('REVOKED');
    expect(row.endedAt).toBeInstanceOf(Date);
    expect(redis.del).toHaveBeenCalledWith(`platform:impersonation:${body.impersonationSessionId}`);
    expect(auditCalls.map((call) => [call.action, call.reason])).toEqual([
      ['TENANT_IMPERSONATION_START', 'Investigating a failed label print'],
      ['TENANT_IMPERSONATION_END', 'Investigation finished']
    ]);
  });
});

describe('Impersonation Center (WP-1.10)', () => {
  it('ACC-IMP-9 session detail lists the tenant audit rows written in-session (actorType IMPERSONATOR)', async () => {
    const { app, prisma } = await buildConsoleApp();
    const body = (await start(app, { reason: 'Investigating a failed label print' })).json() as { impersonationSessionId: string };
    const detail = await app.inject({ method: 'GET', url: `/api/internal/impersonation/sessions/${body.impersonationSessionId}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ session: { id: 'imp_1', targetTenantId: 'tenant_1' }, auditRows: [{ actorType: 'IMPERSONATOR', metadata: { impersonationSessionId: 'imp_1' } }] });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant_1', metadata: { path: ['impersonationSessionId'], equals: 'imp_1' } } }));
  });

  it("ending another staff member's session needs platform.impersonation.mutate", async () => {
    const { app, prisma } = await buildConsoleApp();
    const body = (await start(app, { reason: 'Investigating a failed label print' })).json() as { impersonationSessionId: string };
    prisma.sessions.get(body.impersonationSessionId)!.platformUserId = 'pu_someone_else';
    const denied = await app.inject({ method: 'DELETE', url: `/api/internal/impersonation/sessions/${body.impersonationSessionId}`, payload: { reason: 'Shift change handover' } });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ permission: 'platform.impersonation.mutate' });
    staffPermissions.add('platform.impersonation.mutate');
    expect((await app.inject({ method: 'DELETE', url: `/api/internal/impersonation/sessions/${body.impersonationSessionId}`, payload: { reason: 'Shift change handover' } })).statusCode).toBe(204);
  });
});

describe('impersonation token enforcement (authenticate.ts)', () => {
  async function buildTenantApp(scopes: string[], overrides: Partial<SessionRow> = {}) {
    const { config } = await import('../../../config/index.js');
    const { authenticate } = await import('../../../shared/middleware/authenticate.js');
    const { requestActorStorage, currentRequestActor } = await import('../../../context/request-actor.context.js');
    const { signAccessToken } = await import('../../../shared/utils/jwt.js');
    const app = Fastify();
    openApps.push(app);
    await app.register(fastifyJwt, { secret: config.jwt.accessSecret });
    const session: SessionRow = {
      id: 'imp_1', platformUserId: 'pu_staff', targetTenantId: 'tenant_1', targetUserId: 'user_admin', scopes, reason: 'r', expiresAt: new Date(Date.now() + 600_000),
      revokedAt: null, endedAt: null, endedReason: null, exchangedAt: new Date(), createdAt: new Date(), ...overrides
    };
    app.decorate('redis', { get: vi.fn(async () => '1') } as never);
    app.decorate('prisma', {
      platformImpersonationSession: { findUnique: vi.fn(async () => session) },
      user: { findFirst: vi.fn(async () => ({ isActive: true })) },
      tenant: { findUnique: vi.fn(async () => ({ status: 'ACTIVE' })) }
    } as never);
    app.addHook('onRequest', (_request, _reply, done) => {
      requestActorStorage.run({}, done);
    });
    const handler = async () => ({ ok: true, actor: currentRequestActor() ?? null });
    app.get('/api/v1/shipments', { preHandler: [authenticate] }, handler);
    app.post('/api/v1/shipments', { preHandler: [authenticate] }, handler);
    app.post('/api/v1/tenants/me/impersonation/exit', { preHandler: [authenticate] }, handler);
    const token = signAccessToken({
      sub: 'user_admin', email: 'admin@northwind.test', role: 'TENANT_ADMIN', tenantId: 'tenant_1', tenantSlug: 'northwind', plan: 'PRO', mfaVerified: true,
      impersonator: 'pu_staff', impersonationSessionId: 'imp_1', scopes, mode: 'IMPERSONATION'
    });
    return { app, headers: { authorization: `Bearer ${token}` } };
  }

  it('ACC-IMP-1 a read-scoped token gets 403 IMPERSONATION_READ_ONLY on POST and 200 on GET', async () => {
    const { app, headers } = await buildTenantApp(['read']);
    const post = await app.inject({ method: 'POST', url: '/api/v1/shipments', headers, payload: {} });
    expect(post.statusCode).toBe(403);
    expect(post.json()).toMatchObject({ error: 'IMPERSONATION_READ_ONLY' });
    const get = await app.inject({ method: 'GET', url: '/api/v1/shipments', headers });
    expect(get.statusCode).toBe(200);
    // Ending the session is always allowed.
    const exit = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/impersonation/exit', headers, payload: {} });
    expect(exit.statusCode).toBe(200);
  });

  it('a write-scoped token may mutate', async () => {
    const { app, headers } = await buildTenantApp(['read', 'write']);
    const post = await app.inject({ method: 'POST', url: '/api/v1/shipments', headers, payload: {} });
    expect(post.statusCode).toBe(200);
  });

  it('ACC-IMP-8 a revoked (ended) session is rejected with IMPERSONATION_EXPIRED even while the Redis key still exists', async () => {
    const { app, headers } = await buildTenantApp(['read'], { revokedAt: new Date() });
    const get = await app.inject({ method: 'GET', url: '/api/v1/shipments', headers });
    expect(get.statusCode).toBe(401);
    expect(get.json()).toMatchObject({ code: 'IMPERSONATION_EXPIRED' });
  });

  it('ACC-IMP-4 the request actor carries the impersonation session for audit stamping', async () => {
    const { app, headers } = await buildTenantApp(['read']);
    const get = await app.inject({ method: 'GET', url: '/api/v1/shipments', headers });
    expect(get.json()).toMatchObject({ actor: { impersonation: { sessionId: 'imp_1', platformUserId: 'pu_staff' } } });
  });
});

describe('tenant audit attribution (D8)', () => {
  it('ACC-IMP-4 AuditLog data written during impersonation gets actorType IMPERSONATOR and the session id', async () => {
    const { stampImpersonatedAuditData } = await import('../../../services/impersonation-audit.js');
    const stamped = stampImpersonatedAuditData(
      { tenantId: 'tenant_1', actorId: 'user_admin', actorType: 'USER', action: 'SHIPMENT_STATUS_CHANGED', metadata: { from: 'PENDING' } },
      { impersonation: { sessionId: 'imp_1', platformUserId: 'pu_staff' } }
    );
    expect(stamped).toMatchObject({
      actorType: 'IMPERSONATOR',
      metadata: { from: 'PENDING', impersonationSessionId: 'imp_1', platformUserId: 'pu_staff' }
    });
    const untouched = { tenantId: 'tenant_1', actorType: 'USER', action: 'X' };
    expect(stampImpersonatedAuditData(untouched, {})).toBe(untouched);
  });
});

describe('platform.impersonation-expiry-sweep', () => {
  it('closes expired sessions with endedReason EXPIRED', async () => {
    const { sweepExpiredImpersonationSessions } = await import('../../../jobs/impersonation-expiry-sweep.js');
    const updateMany = vi.fn(async () => ({ count: 3 }));
    const now = new Date('2026-10-18T12:00:00.000Z');
    const count = await sweepExpiredImpersonationSessions({ platformImpersonationSession: { updateMany } } as never, now);
    expect(count).toBe(3);
    expect(updateMany).toHaveBeenCalledWith({ where: { endedAt: null, revokedAt: null, expiresAt: { lte: now } }, data: { endedAt: now, endedReason: 'EXPIRED' } });
  });
});
