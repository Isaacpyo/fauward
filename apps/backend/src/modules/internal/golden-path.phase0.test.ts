import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { authenticator } from 'otplib';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../../shared/utils/hash.js';

// Phase 0 golden path chained through the real route handlers and guards (cookies, CSRF, MFA, permissions,
// exchange code, read-only enforcement, audit). The database and Redis are in-memory doubles: the VM slot schema
// could not be created in the unattended run (see console-run/PROGRESS.md), so this is not the Postgres-backed run.

const audit: Array<{ action: string; reason?: string | null; impersonationSessionId?: string | null }> = [];

vi.mock('../../queues/queues.js', () => ({ analyticsQueue: {}, notificationQueue: {}, outboxQueue: {}, scheduledJobsQueue: {}, webhookQueue: {} }));
vi.mock('../notifications/notifications.worker.js', () => ({ dlqNotificationQueue: {} }));
vi.mock('../../queues/outbox.worker.js', () => ({ dlqOutboxQueue: {} }));
vi.mock('../../queues/webhook.worker.js', () => ({ dlqWebhookQueue: {} }));
vi.mock('../../services/platform-audit.service.js', () => ({
  writePlatformAuditLog: vi.fn(async (_db: unknown, input: { action: string; reason?: string | null; impersonationSessionId?: string | null }) => {
    audit.push(input);
  }),
  verifyPlatformAuditChain: vi.fn()
}));
vi.mock('../../services/staff-iam.service.js', () => {
  const permissions = ['platform.impersonation.start', 'platform.tenants.read', 'platform.tenants.write'];
  return {
    staffPermissionContextForPlatformUser: vi.fn(async () => ({ staff: { id: 'staff_1', status: 'ACTIVE' }, roles: ['ROOT'], permissions })),
    consolePermissionContext: vi.fn(async () => ({ staff: { id: 'staff_1', status: 'ACTIVE' }, roles: ['ROOT'], rolePermissions: new Set(permissions), jit: new Map(), permissions }))
  };
});

const PASSWORD = 'correct-horse-battery-staple';

function createWorld(passwordHash: string) {
  const users = new Map<string, Record<string, unknown>>([
    ['pu_1', { id: 'pu_1', email: 'ops@fauward.com', name: 'Ops', passwordHash, role: 'SUPER_ADMIN', status: 'ACTIVE', mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingSecretEncrypted: null, mfaEnrolledAt: null, lastLoginAt: null }]
  ]);
  const sessions = new Map<string, Record<string, unknown>>();
  const impersonations = new Map<string, Record<string, unknown>>();
  const kv = new Map<string, { value: string; expiresAt: number }>();
  const tenantRow: Record<string, unknown> = { id: 'tenant_1', name: 'Northwind', slug: 'northwind', plan: 'PRO', status: 'ACTIVE', region: 'africa' };
  const regionRequests: Array<Record<string, unknown>> = [];
  let seq = 0;
  const id = (prefix: string) => `${prefix}_${(seq += 1)}`;
  const live = (key: string) => {
    const entry = kv.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry.value;
  };

  const prisma = {
    platformUser: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => (where.id ? users.get(where.id) : [...users.values()].find((user) => user.email === where.email)) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(users.get(where.id)!, data))
    },
    platformSession: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id('session'), revokedAt: null, ...data };
        sessions.set(row.id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => sessions.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(sessions.get(where.id)!, data)),
      updateMany: vi.fn(async () => ({ count: 0 }))
    },
    staffUser: {
      findUnique: vi.fn(async () => ({ id: 'staff_1', status: 'ACTIVE' })),
      updateMany: vi.fn(async () => ({ count: 1 }))
    },
    staffSession: { create: vi.fn(async () => ({})) },
    staffLoginAttempt: { create: vi.fn(async () => ({})) },
    jitAccessRequest: { findMany: vi.fn(async () => []) },
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'tenant_1' ? { ...tenantRow } : null)),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(tenantRow, data))
    },
    regionChangeRequest: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = regionRequests.find((item) => item.id === where.id);
        return row ? { ...row, tenant: { ...tenantRow } } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
        const row = regionRequests.find((item) => item.id === where.id && item.status === where.status);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      findFirstOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...regionRequests.find((item) => item.id === where.id)! }))
    },
    user: {
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string } }) => (where.tenantId === 'tenant_1' ? { id: 'user_admin', email: 'admin@northwind.test', role: 'TENANT_ADMIN', isActive: true } : null)),
      findMany: vi.fn(async () => [])
    },
    tenantPlanOverride: { findFirst: vi.fn(async () => null) },
    platformActivity: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: `act_${String(create.type)}`, ...create })) },
    platformImpersonationSession: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id('imp'), revokedAt: null, endedAt: null, endedReason: null, exchangedAt: null, createdAt: new Date(), ...data };
        impersonations.set(row.id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = impersonations.get(where.id);
        return row ? { ...row, platformUser: { id: 'pu_1', email: 'ops@fauward.com' }, targetTenant: { id: 'tenant_1', slug: 'northwind', name: 'Northwind', plan: 'PRO' } } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; exchangedAt?: null; revokedAt?: null }; data: Record<string, unknown> }) => {
        const row = impersonations.get(where.id);
        if (!row || ('exchangedAt' in where && row.exchangedAt) || ('revokedAt' in where && row.revokedAt)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      })
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>> | ((tx: unknown) => Promise<unknown>)): Promise<unknown> =>
      typeof operations === 'function' ? operations(prisma) : Promise.all(operations)
    )
  };
  const redis = {
    set: vi.fn(async (key: string, value: string, _mode: 'EX', seconds: number) => {
      kv.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      return 'OK';
    }),
    get: vi.fn(async (key: string) => live(key)),
    getdel: vi.fn(async (key: string) => {
      const value = live(key);
      kv.delete(key);
      return value;
    }),
    del: vi.fn(async (key: string) => (kv.delete(key) ? 1 : 0)),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    publish: vi.fn(async () => 1)
  };
  return { prisma, redis, users, impersonations, tenantRow, regionRequests };
}

class CookieJar {
  private jar = new Map<string, string>();
  absorb(response: { cookies: Array<{ name: string; value: string }> }) {
    for (const c of response.cookies) {
      if (c.value === '') this.jar.delete(c.name);
      else this.jar.set(c.name, c.value);
    }
  }
  headers(mutating = false) {
    const headers: Record<string, string> = { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    if (mutating) headers['x-csrf-token'] = this.jar.get('fw_platform_csrf') ?? '';
    return headers;
  }
}

let passwordHash = '';
const openApps: FastifyInstance[] = [];

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  process.env.FIELD_ENCRYPTION_KEYS = JSON.stringify({ k1: randomBytes(32).toString('base64') });
  process.env.FIELD_ENCRYPTION_ACTIVE_KEY_ID = 'k1';
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('Phase 0 golden path (chained API calls)', () => {
  it('login → MFA enrol → read-only impersonation via exchange code → end → START/END audit with reasons; region approval after step-up', { timeout: 30_000 }, async () => {
    const world = createWorld(passwordHash);
    const { config } = await import('../../config/index.js');
    const { authenticate } = await import('../../shared/middleware/authenticate.js');
    const { registerConsoleAuthRoutes } = await import('./auth/console-auth.routes.js');
    const { registerConsoleTenantRoutes } = await import('./platform/tenants.routes.js');
    const { registerConsoleImpersonationRoutes } = await import('./platform/impersonation.routes.js');
    const { registerImpersonationExchangeRoutes } = await import('../auth/impersonation-exchange.routes.js');

    const app = Fastify();
    openApps.push(app);
    await app.register(cookie);
    await app.register(rateLimit, { global: false });
    await app.register(fastifyJwt, { secret: config.jwt.accessSecret });
    app.decorate('prisma', world.prisma as never);
    app.decorate('redis', world.redis as never);
    await registerConsoleAuthRoutes(app);
    await registerConsoleTenantRoutes(app);
    await registerConsoleImpersonationRoutes(app);
    await registerImpersonationExchangeRoutes(app);
    app.get('/api/v1/shipments', { preHandler: [authenticate] }, async () => ({ data: [] }));
    app.post('/api/v1/shipments', { preHandler: [authenticate] }, async () => ({ created: true }));

    const jar = new CookieJar();

    // 1. Login: the session starts MFA-pending.
    const login = await app.inject({ method: 'POST', url: '/api/internal/auth/login', payload: { email: 'ops@fauward.com', password: PASSWORD } });
    jar.absorb(login);
    expect(login.json()).toMatchObject({ mfa: 'ENROLL' });
    const blocked = await app.inject({ method: 'GET', url: '/api/internal/impersonation/sessions?status=active', headers: jar.headers() });
    expect(blocked.json()).toMatchObject({ error: 'MFA_PENDING' });

    // 2. Enrol MFA.
    const start = await app.inject({ method: 'POST', url: '/api/internal/auth/mfa/enroll/start', headers: jar.headers(true) });
    const secret = new URL((start.json() as { otpauth: string }).otpauth).searchParams.get('secret')!;
    const confirm = await app.inject({ method: 'POST', url: '/api/internal/auth/mfa/enroll/confirm', headers: jar.headers(true), payload: { code: authenticator.generate(secret) } });
    expect(confirm.statusCode).toBe(200);
    jar.absorb(confirm);

    // 3. Start a read-only impersonation: the console gets an exchange code, never a token.
    const impersonate = await app.inject({
      method: 'POST',
      url: '/api/internal/impersonation/sessions',
      headers: jar.headers(true),
      payload: { tenantId: 'tenant_1', reason: 'Investigating a failed label print' }
    });
    expect(impersonate.statusCode).toBe(200);
    const started = impersonate.json() as { exchangeCode: string; portalUrl: string; impersonationSessionId: string };
    expect(started).not.toHaveProperty('token');
    expect(started.portalUrl).toContain('#code=');

    // 4. The tenant portal redeems the code once.
    const exchange = await app.inject({ method: 'POST', url: '/api/v1/auth/impersonation/exchange', payload: { code: started.exchangeCode } });
    expect(exchange.statusCode).toBe(200);
    const tenantHeaders = { authorization: `Bearer ${(exchange.json() as { token: string }).token}` };
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/impersonation/exchange', payload: { code: started.exchangeCode } })).statusCode).toBe(401);

    // 5. Read works, write is refused.
    expect((await app.inject({ method: 'GET', url: '/api/v1/shipments', headers: tenantHeaders })).statusCode).toBe(200);
    const write = await app.inject({ method: 'POST', url: '/api/v1/shipments', headers: tenantHeaders, payload: {} });
    expect(write.json()).toMatchObject({ error: 'IMPERSONATION_READ_ONLY' });

    // 6. End the session; the tenant token stops working.
    const end = await app.inject({
      method: 'DELETE',
      url: `/api/internal/impersonation/sessions/${started.impersonationSessionId}`,
      headers: jar.headers(true),
      payload: { reason: 'Investigation finished' }
    });
    expect(end.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/v1/shipments', headers: tenantHeaders })).statusCode).toBe(401);

    // 7. Audit shows START and END with their reasons.
    const impersonationAudit = audit.filter((row) => row.impersonationSessionId === started.impersonationSessionId).map((row) => [row.action, row.reason]);
    expect(impersonationAudit).toEqual([
      ['TENANT_IMPERSONATION_START', 'Investigating a failed label print'],
      ['TENANT_IMPERSONATION_END', 'Investigation finished']
    ]);

    // 8. Eleven minutes later a region approval needs a step-up, then succeeds.
    const request = { id: 'rcr_1', tenantId: 'tenant_1', currentRegion: 'africa', requestedRegion: 'europe', requestedByUserId: 'user_admin', status: 'PENDING', decisionReason: null, decidedByPlatformUserId: null, decidedAt: null, appliedAt: null, createdAt: new Date() };
    world.regionRequests.push(request);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    const stale = await app.inject({ method: 'POST', url: `/api/internal/tenants/region-requests/${request.id}/decision`, headers: jar.headers(true), payload: { status: 'APPROVED', reason: 'Tenant moved operations to the EU' } });
    expect(stale.statusCode).toBe(403);
    expect(stale.json()).toMatchObject({ error: 'MFA_REQUIRED', stepUp: true });
    const verify = await app.inject({ method: 'POST', url: '/api/internal/auth/mfa/verify', headers: jar.headers(true), payload: { code: authenticator.generate(secret) } });
    expect(verify.statusCode).toBe(200);
    jar.absorb(verify);
    const approved = await app.inject({ method: 'POST', url: `/api/internal/tenants/region-requests/${request.id}/decision`, headers: jar.headers(true), payload: { status: 'APPROVED', reason: 'Tenant moved operations to the EU' } });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({ request: { status: 'APPLIED' } });
    expect(world.tenantRow.region).toBe('europe');
    expect(audit.map((row) => row.action)).toContain('REGION_CHANGE_APPROVED');
  });
});
