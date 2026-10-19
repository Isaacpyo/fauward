import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

// L13 (WP-2.15): Fauward locks a tenant user during a security incident → the user's API calls, sign-ins and refreshes
// fail with USER_LOCKED and their refresh tokens are gone → unlock restores access; tenant admins are told both times.

let permissions: Permission[] = ['platform.tenants.write'];
const notifyTenantAdmins = vi.hoisted(() => vi.fn(async (_app: unknown, _input: Record<string, unknown>) => ({ inApp: 1, emailsQueued: 1 })));
vi.mock('../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_sec', email: 'sec@fauward.com', name: 'Sec Ops', role: null, mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../middleware/require-console-permission.js', () => {
  type ReplyLike = { status: (code: number) => { send: (body: unknown) => unknown } };
  return {
    requireConsolePermission: (permission: Permission) => async (_request: unknown, reply: ReplyLike) => (permissions.includes(permission) ? undefined : reply.status(403).send({ error: 'Forbidden' })),
    requireAnyConsolePermission: () => async () => undefined,
    consoleUserHas: async () => true
  };
});
vi.mock('./platform-audit.service.js', () => ({ writePlatformAuditLog: vi.fn(async () => ({ id: 'aud' })) }));
vi.mock('./platform-notifier.service.js', () => ({ notifyTenantAdmins }));

type UserRow = { id: string; tenantId: string; email: string; role: string; isActive: boolean; passwordHash: string | null; lastLogin: Date | null; invitedBy: string | null; lockedAt: Date | null; lockedReason: string | null; lockedByPlatformUserId: string | null };

async function createStore() {
  const { hashPassword } = await import('../shared/utils/hash.js');
  const users: UserRow[] = [
    { id: 'u_ops', tenantId: 'tenant_a', email: 'ops@northwind.test', role: 'TENANT_STAFF', isActive: true, passwordHash: await hashPassword('correct horse battery'), lastLogin: null, invitedBy: 'u_admin', lockedAt: null, lockedReason: null, lockedByPlatformUserId: null }
  ];
  const refreshTokens: Array<{ token: string; userId: string; expiresAt: Date }> = [];
  const activity: Array<Record<string, unknown>> = [];
  const find = (where: Record<string, unknown>) => users.find((user) => Object.entries(where).every(([key, value]) => user[key as keyof UserRow] === value)) ?? null;
  return {
    users,
    refreshTokens,
    activity,
    user: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => find(where)),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => find({ id: where.id })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => Object.assign(find({ id: where.id })!, data)),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<UserRow> }) => {
        const row = find(where);
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      })
    },
    tenant: { findUnique: vi.fn(async () => ({ id: 'tenant_a', slug: 'northwind', plan: 'PRO', status: 'ACTIVE', closedAt: null })) },
    refreshToken: {
      create: vi.fn(async ({ data }: { data: { token: string; userId: string; expiresAt: Date } }) => refreshTokens.push(data)),
      findUnique: vi.fn(async ({ where }: { where: { token: string } }) => refreshTokens.find((row) => row.token === where.token) ?? null),
      deleteMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const before = refreshTokens.length;
        refreshTokens.splice(0, refreshTokens.length, ...refreshTokens.filter((row) => row.userId !== where.userId));
        return { count: before - refreshTokens.length };
      })
    },
    platformActivity: {
      upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Record<string, unknown> }) => {
        if (!activity.some((row) => row.dedupeKey === where.dedupeKey)) activity.push(create);
        return { id: `act_${activity.length}`, ...create };
      })
    }
  };
}

let store: Awaited<ReturnType<typeof createStore>>;
const openApps: FastifyInstance[] = [];

async function buildConsoleApp() {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', store as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { registerConsoleTenantRoutes } = await import('../modules/internal/platform/tenants.routes.js');
  await registerConsoleTenantRoutes(app);
  return app;
}

/** The real tenant middleware for a JWT of u_ops; returns the rejection it sent, if any. */
async function apiCall() {
  const { authenticate } = await import('../shared/middleware/authenticate.js');
  const sent: { status?: number; body?: unknown } = {};
  const reply = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    send(body: unknown) {
      sent.body = body;
      return this;
    }
  };
  const request = {
    method: 'GET',
    url: '/api/v1/shipments',
    headers: {},
    jwtVerify: vi.fn(async () => undefined),
    user: { sub: 'u_ops', tenantId: 'tenant_a', role: 'TENANT_STAFF', email: 'ops@northwind.test', mfaVerified: false },
    tenant: { id: 'tenant_a', status: 'ACTIVE' },
    server: { prisma: store }
  };
  await authenticate(request as unknown as FastifyRequest, reply as unknown as FastifyReply);
  return sent;
}

beforeEach(async () => {
  permissions = ['platform.tenants.write'];
  store = await createStore();
  notifyTenantAdmins.mockClear();
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('L13 tenant user lock (WP-2.15)', () => {
  it('ACC-L13-1 a locked user gets 401 USER_LOCKED on API calls, sign-in and refresh; unlock restores access', async () => {
    const { authService } = await import('../modules/auth/auth.service.js');
    // First sign-in of an invited user: lastLogin is stamped and user.joined recorded once.
    const session = await authService.login({ email: 'ops@northwind.test', password: 'correct horse battery' }, store as never, 'tenant_a');
    expect(store.users[0].lastLogin).toBeInstanceOf(Date);
    expect(store.activity).toEqual([expect.objectContaining({ type: 'user.joined', tenantId: 'tenant_a', subjectId: 'u_ops' })]);
    expect(await apiCall()).toEqual({});

    const app = await buildConsoleApp();
    const locked = await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_a/users/u_ops/lock', payload: { reason: 'Credentials found in a phishing kit' } });
    expect(locked.statusCode).toBe(200);
    expect(locked.json()).toMatchObject({ user: { id: 'u_ops', lockedReason: 'Credentials found in a phishing kit' } });
    expect(store.refreshTokens).toEqual([]);
    expect(await apiCall()).toMatchObject({ status: 401, body: { error: 'USER_LOCKED' } });
    await expect(authService.login({ email: 'ops@northwind.test', password: 'correct horse battery' }, store as never, 'tenant_a')).rejects.toThrow('USER_LOCKED');
    store.refreshTokens.push({ token: session.refreshToken, userId: 'u_ops', expiresAt: new Date(Date.now() + 60_000) });
    await expect(authService.refresh({ refreshToken: session.refreshToken }, store as never)).rejects.toThrow('USER_LOCKED');
    // A wrong password still says only "Invalid credentials".
    await expect(authService.login({ email: 'ops@northwind.test', password: 'wrong password!' }, store as never, 'tenant_a')).rejects.toThrow('Invalid credentials');

    expect((await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_a/users/u_ops/lock', payload: { reason: 'Credentials found in a phishing kit' } })).statusCode).toBe(409);
    const unlocked = await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_a/users/u_ops/unlock', payload: { reason: 'Password reset and MFA enrolled' } });
    expect(unlocked.statusCode).toBe(200);
    expect(await apiCall()).toEqual({});
    await expect(authService.login({ email: 'ops@northwind.test', password: 'correct horse battery' }, store as never, 'tenant_a')).resolves.toMatchObject({ tenantId: 'tenant_a' });

    expect(store.activity.map((row) => row.type)).toEqual(['user.joined', 'user.locked_by_fauward', 'user.unlocked_by_fauward']);
    expect(notifyTenantAdmins.mock.calls.map(([, input]) => [input.event, (input.email as { template: string }).template])).toEqual([
      ['user.locked_by_fauward', 'user_locked_by_fauward'],
      ['user.unlocked_by_fauward', 'user_unlocked_by_fauward']
    ]);
  });

  it('lock is dangerous and tenant-scoped', async () => {
    const app = await buildConsoleApp();
    expect((await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_a/users/u_ops/lock', payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_b/users/u_ops/lock', payload: { reason: 'Wrong tenant entirely' } })).statusCode).toBe(404);
    permissions = ['platform.tenants.read'];
    expect((await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_a/users/u_ops/lock', payload: { reason: 'Credentials found in a phishing kit' } })).statusCode).toBe(403);
    expect(store.users[0].lockedAt).toBeNull();
  });
});
