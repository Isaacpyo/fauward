import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: vi.fn(async (req: any) => {
    req.user = req.user ?? { sub: 'user-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1' };
  })
}));
vi.mock('../../shared/middleware/requireRole.js', () => ({
  requireRole: vi.fn(() => async () => {})
}));

import { registerUsersRoutes } from './users.routes.js';
import { hashPassword } from '../../shared/utils/hash.js';

// ─────────────────────────────────────────────────────────────────────────────
// App builder helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildApp(roleOverride = 'TENANT_ADMIN', userOverride?: any) {
  const app = Fastify();
  const defaultUser = { id: 'user-1', email: 'admin@acme.com', tenantId: 'tenant-1', role: roleOverride, isActive: true, firstName: 'Alice', lastName: 'Smith', phone: null, passwordHash: null, mfaEnabled: false, createdAt: new Date(), lastLogin: null };
  // Build a tx mock that has all required sub-methods
  const txMock = {
    user: {
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'user-new', email: data.email ?? 'new@acme.com', ...data })),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...defaultUser, ...data }))
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    notificationLog: { create: vi.fn().mockResolvedValue({}) }
  };
  const prisma = {
    user: {
      findFirst: userOverride === null
        ? vi.fn().mockResolvedValue(null)
        : vi.fn().mockResolvedValue(userOverride ?? defaultUser),
      findMany: vi.fn().mockResolvedValue([defaultUser]),
      create: txMock.user.create,
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...defaultUser, ...data }))
    },
    auditLog: txMock.auditLog,
    notificationLog: txMock.notificationLog,
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === 'function') return cb(txMock);
      return Promise.all(cb);
    })
  };

  (app as any).decorate('prisma', prisma);
  (app as any).decorate('authenticate', async (req: any) => {
    req.user = { sub: 'user-1', role: roleOverride, tenantId: 'tenant-1' };
  });
  app.addHook('onRequest', (req, _reply, done) => {
    (req as any).tenant = { id: 'tenant-1', slug: 'acme', plan: 'PRO' };
    done();
  });

  return { app, prisma };
}

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  while (apps.length) {
    const ctx = apps.pop();
    if (ctx) await ctx.app.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/users/me
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/users/me', () => {
  it('returns the profile of the authenticated user', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerUsersRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe('admin@acme.com');
    expect(body.role).toBe('TENANT_ADMIN');
    expect(ctx.prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'user-1', tenantId: 'tenant-1' }) })
    );
  });

  it('returns 404 when the user is not found', async () => {
    const ctx = buildApp('TENANT_ADMIN', null);
    apps.push(ctx);
    await registerUsersRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/users/me — password change
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/users/me — password change', () => {
  it('changes password when currentPassword is correct', async () => {
    const passwordHash = await hashPassword('OldPassword123!');
    const userWithHash = { id: 'user-1', email: 'admin@acme.com', tenantId: 'tenant-1', role: 'TENANT_ADMIN', isActive: true, firstName: 'Alice', lastName: null, phone: null, passwordHash, mfaEnabled: false };

    const ctx = buildApp('TENANT_ADMIN', userWithHash);
    apps.push(ctx);
    await registerUsersRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'OldPassword123!', newPassword: 'NewSecure456!' })
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.user.update).toHaveBeenCalledTimes(1);
    const updateData = ctx.prisma.user.update.mock.calls[0][0].data;
    expect(typeof updateData.passwordHash).toBe('string');
    expect(updateData.passwordHash).not.toBe(passwordHash); // new hash differs
  });

  it('rejects password change when currentPassword is wrong', async () => {
    const passwordHash = await hashPassword('OldPassword123!');
    const userWithHash = { id: 'user-1', email: 'admin@acme.com', tenantId: 'tenant-1', role: 'TENANT_ADMIN', isActive: true, firstName: null, lastName: null, phone: null, passwordHash, mfaEnabled: false };

    const ctx = buildApp('TENANT_ADMIN', userWithHash);
    apps.push(ctx);
    await registerUsersRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'WrongPassword!', newPassword: 'NewSecure456!' })
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/incorrect/i);
    expect(ctx.prisma.user.update).not.toHaveBeenCalled();
  });

  it('requires currentPassword when newPassword is provided', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerUsersRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: 'NewSecure456!' }) // no currentPassword
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/currentPassword/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/users — staff list
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/users', () => {
  it('returns all users for the tenant when called by TENANT_ADMIN', async () => {
    const ctx = buildApp('TENANT_ADMIN');
    apps.push(ctx);
    await registerUsersRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().users).toHaveLength(1);
    expect(ctx.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' } })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/users/invite
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/users/invite', () => {
  it('creates user and logs staff_invite notification', async () => {
    const ctx = buildApp('TENANT_ADMIN');
    apps.push(ctx);
    // ensure no existing user conflict
    ctx.prisma.user.findFirst = vi.fn().mockResolvedValue(null);
    await registerUsersRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newstaff@acme.com', role: 'TENANT_STAFF', firstName: 'Bob', lastName: 'Jones' })
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().email).toBe('newstaff@acme.com');
    // notification logged inside transaction
    expect(ctx.prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'staff_invite', channel: 'EMAIL' }) })
    );
    // audit logged
    expect(ctx.prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'USER_INVITE' }) })
    );
  });

  it('rejects invite of SUPER_ADMIN role with 400', async () => {
    const ctx = buildApp('TENANT_ADMIN');
    apps.push(ctx);
    ctx.prisma.user.findFirst = vi.fn().mockResolvedValue(null);
    await registerUsersRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'attacker@acme.com', role: 'SUPER_ADMIN' })
    });

    expect(res.statusCode).toBe(400);
    expect(ctx.prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate email with 409', async () => {
    const ctx = buildApp('TENANT_ADMIN');
    apps.push(ctx);
    // findFirst returns existing user (duplicate)
    ctx.prisma.user.findFirst = vi.fn().mockResolvedValue({ id: 'existing-user' });
    await registerUsersRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@acme.com', role: 'TENANT_STAFF' })
    });

    expect(res.statusCode).toBe(409);
    expect(ctx.prisma.user.create).not.toHaveBeenCalled();
  });
});
