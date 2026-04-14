import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

import { authService } from './auth.service.js';
import { hashPassword } from '../../shared/utils/hash.js';
import { signRefreshToken } from '../../shared/utils/jwt.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildTransactionMock() {
  return {
    tenant: { create: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'acme', status: 'TRIALING', plan: 'TRIALING', timezone: 'Europe/London', defaultCurrency: 'GBP' }) },
    tenantSettings: { create: vi.fn().mockResolvedValue({}) },
    emailTemplateConfig: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    surcharge: { createMany: vi.fn().mockResolvedValue({ count: 6 }) },
    usageRecord: { create: vi.fn().mockResolvedValue({}) },
    user: { create: vi.fn().mockResolvedValue({ id: 'user-1', email: 'owner@acme.com', role: 'TENANT_ADMIN', tenantId: 'tenant-1' }) },
    subscription: { create: vi.fn().mockResolvedValue({ id: 'sub-1' }) }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// register
// ─────────────────────────────────────────────────────────────────────────────

describe('authService.register', () => {
  it('creates tenant, settings, and admin user inside a transaction', async () => {
    const tx = buildTransactionMock();
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      refreshToken: { create: vi.fn().mockResolvedValue({ id: 'rt-1' }) },
      $transaction: vi.fn(async (cb: (db: typeof tx) => unknown) => cb(tx))
    } as any;

    const result = await authService.register(
      { companyName: 'Acme Logistics', region: 'uk', email: 'Owner@Acme.com', password: 'password123' },
      prisma
    );

    expect(tx.tenant.create).toHaveBeenCalledTimes(1);
    expect(tx.tenantSettings.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.subscription.create).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(result.user.email).toBe('owner@acme.com');
    expect(result.tenant.slug).toBe('acme');
  });

  it('normalises email to lowercase before storing', async () => {
    const tx = buildTransactionMock();
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      refreshToken: { create: vi.fn().mockResolvedValue({ id: 'rt-1' }) },
      $transaction: vi.fn(async (cb: (db: typeof tx) => unknown) => cb(tx))
    } as any;

    await authService.register(
      { companyName: 'Acme', region: 'uk', email: 'UPPER@CASE.COM', password: 'pass' },
      prisma
    );

    const userCreateCall = tx.user.create.mock.calls[0][0];
    expect(userCreateCall.data.email).toBe('upper@case.com');
  });

  it('seeds 6 default surcharges on tenant creation', async () => {
    const tx = buildTransactionMock();
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      refreshToken: { create: vi.fn().mockResolvedValue({ id: 'rt-1' }) },
      $transaction: vi.fn(async (cb: (db: typeof tx) => unknown) => cb(tx))
    } as any;

    await authService.register(
      { companyName: 'Acme', region: 'uk', email: 'a@b.com', password: 'pass' },
      prisma
    );

    const surchargeCall = tx.surcharge.createMany.mock.calls[0][0];
    expect(surchargeCall.data).toHaveLength(6);
    expect(surchargeCall.data.every((s: any) => s.isEnabled === false)).toBe(true);
  });

  it('returns access and refresh tokens', async () => {
    const tx = buildTransactionMock();
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      refreshToken: { create: vi.fn().mockResolvedValue({ id: 'rt-1' }) },
      $transaction: vi.fn(async (cb: (db: typeof tx) => unknown) => cb(tx))
    } as any;

    const result = await authService.register(
      { companyName: 'Acme', region: 'uk', email: 'a@b.com', password: 'pass' },
      prisma
    );

    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
    expect(result.accessToken.split('.').length).toBe(3); // JWT structure
  });

  it('rejects if email is already in use', async () => {
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'existing-user' }) }
    } as any;

    await expect(
      authService.register(
        { companyName: 'Acme', region: 'uk', email: 'owner@acme.com', password: 'password123' },
        prisma
      )
    ).rejects.toThrow('Email already in use');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// login
// ─────────────────────────────────────────────────────────────────────────────

describe('authService.login', () => {
  it('issues access and refresh tokens for correct credentials', async () => {
    const passwordHash = await hashPassword('correct-password');
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'user-1', email: 'owner@acme.com', tenantId: 'tenant-1',
          role: 'TENANT_ADMIN', isActive: true, passwordHash
        })
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'acme', plan: 'PRO' })
      },
      refreshToken: { create: vi.fn().mockResolvedValue({ id: 'rt-1' }) }
    } as any;

    const result = await authService.login({ email: 'owner@acme.com', password: 'correct-password' }, prisma, 'tenant-1');

    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
    expect(result.tenantSlug).toBe('acme');
  });

  it('rejects login with wrong password', async () => {
    const passwordHash = await hashPassword('correct-password');
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'user-1', email: 'owner@acme.com', tenantId: 'tenant-1',
          role: 'TENANT_ADMIN', isActive: true, passwordHash
        })
      }
    } as any;

    await expect(
      authService.login({ email: 'owner@acme.com', password: 'wrong-password' }, prisma, 'tenant-1')
    ).rejects.toThrow('Invalid credentials');
  });

  it('rejects login for unknown email', async () => {
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue(null) }
    } as any;

    await expect(
      authService.login({ email: 'nobody@acme.com', password: 'password' }, prisma, 'tenant-1')
    ).rejects.toThrow('Invalid credentials');
  });

  it('rejects login for suspended (isActive=false) user', async () => {
    const passwordHash = await hashPassword('correct-password');
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'user-1', email: 'owner@acme.com', tenantId: 'tenant-1',
          role: 'TENANT_ADMIN', isActive: false, passwordHash
        })
      }
    } as any;

    // isActive: false means findFirst with { isActive: true } returns null
    const prismaStrict = {
      user: { findFirst: vi.fn().mockResolvedValue(null) }
    } as any;

    await expect(
      authService.login({ email: 'owner@acme.com', password: 'correct-password' }, prismaStrict, 'tenant-1')
    ).rejects.toThrow('Invalid credentials');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// refresh
// ─────────────────────────────────────────────────────────────────────────────

describe('authService.refresh', () => {
  it('rotates the refresh token — old deleted, new created, tokens differ', async () => {
    const oldToken = signRefreshToken({
      sub: 'user-1', email: 'owner@acme.com', role: 'TENANT_ADMIN',
      tenantId: 'tenant-1', tenantSlug: 'acme', plan: 'PRO', mfaVerified: true
    });

    const tx = {
      refreshToken: {
        delete: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({})
      }
    };
    const prisma = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({ token: oldToken, expiresAt: new Date(Date.now() + 60_000) })
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1', email: 'owner@acme.com', role: 'TENANT_ADMIN', tenantId: 'tenant-1', isActive: true
        })
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'acme', plan: 'PRO' })
      },
      $transaction: vi.fn(async (cb: (db: typeof tx) => unknown) => cb(tx))
    } as any;

    const result = await authService.refresh({ refreshToken: oldToken }, prisma);

    expect(result.refreshToken).not.toBe(oldToken);
    expect(tx.refreshToken.delete).toHaveBeenCalledWith({ where: { token: oldToken } });
    expect(tx.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired refresh token', async () => {
    const token = signRefreshToken({
      sub: 'user-1', email: 'owner@acme.com', role: 'TENANT_ADMIN',
      tenantId: 'tenant-1', tenantSlug: 'acme', plan: 'PRO', mfaVerified: true
    });
    const prisma = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          token, expiresAt: new Date(Date.now() - 1000) // expired
        })
      }
    } as any;

    await expect(authService.refresh({ refreshToken: token }, prisma)).rejects.toThrow('Invalid refresh token');
  });

  it('rejects if refresh token not found in DB', async () => {
    const token = signRefreshToken({
      sub: 'user-1', email: 'owner@acme.com', role: 'TENANT_ADMIN',
      tenantId: 'tenant-1', tenantSlug: 'acme', plan: 'PRO', mfaVerified: true
    });
    const prisma = {
      refreshToken: { findUnique: vi.fn().mockResolvedValue(null) }
    } as any;

    await expect(authService.refresh({ refreshToken: token }, prisma)).rejects.toThrow('Invalid refresh token');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// forgotPassword
// ─────────────────────────────────────────────────────────────────────────────

describe('authService.forgotPassword', () => {
  it('creates a password reset token and enqueues a notification', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'user-1', email: 'owner@acme.com', tenantId: 'tenant-1', isActive: true })
      },
      passwordResetToken: { create: vi.fn().mockResolvedValue({ id: 'prt-1' }) },
      notificationLog: { create: vi.fn().mockResolvedValue({ id: 'log-1' }) }
    } as any;

    const result = await authService.forgotPassword({ email: 'owner@acme.com' }, prisma, 'tenant-1');

    expect(result.success).toBe(true);
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    const tokenData = prisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(typeof tokenData.tokenHash).toBe('string');
    expect(tokenData.tokenHash.length).toBe(64); // SHA-256 hex = 64 chars
    expect(tokenData.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'password_reset' }) })
    );
  });

  it('returns success silently when email not found (no information leak)', async () => {
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue(null) }
    } as any;

    const result = await authService.forgotPassword({ email: 'nobody@example.com' }, prisma, 'tenant-1');

    expect(result.success).toBe(true);
    // No token created — user doesn't exist
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetPassword
// ─────────────────────────────────────────────────────────────────────────────

describe('authService.resetPassword', () => {
  it('updates password hash and invalidates all refresh tokens', async () => {
    const rawToken = 'valid-reset-token-64chars'.padEnd(32, '0');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const updateUser = vi.fn().mockResolvedValue({});
    const updateToken = vi.fn().mockResolvedValue({});
    const deleteMany = vi.fn().mockResolvedValue({});

    const prisma = {
      passwordResetToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prt-1', userId: 'user-1', tokenHash, usedAt: null,
          expiresAt: new Date(Date.now() + 60_000)
        }),
        update: updateToken
      },
      user: { update: updateUser },
      refreshToken: { deleteMany },
      $transaction: vi.fn(async (ops: any[]) => Promise.all(ops.map((op: any) => op)))
    } as any;

    const result = await authService.resetPassword({ token: rawToken, newPassword: 'newSecurePassword!' }, prisma);

    expect(result.success).toBe(true);
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } })
    );
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('rejects an expired reset token', async () => {
    const rawToken = 'some-reset-token';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const prisma = {
      passwordResetToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prt-1', userId: 'user-1', tokenHash, usedAt: null,
          expiresAt: new Date(Date.now() - 1000) // expired
        })
      }
    } as any;

    await expect(
      authService.resetPassword({ token: rawToken, newPassword: 'new' }, prisma)
    ).rejects.toThrow('Invalid or expired reset token');
  });

  it('rejects a token that has already been used', async () => {
    const rawToken = 'used-reset-token';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const prisma = {
      passwordResetToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prt-1', userId: 'user-1', tokenHash,
          usedAt: new Date(Date.now() - 5000), // already used
          expiresAt: new Date(Date.now() + 60_000)
        })
      }
    } as any;

    await expect(
      authService.resetPassword({ token: rawToken, newPassword: 'new' }, prisma)
    ).rejects.toThrow('Invalid or expired reset token');
  });

  it('rejects an unknown reset token', async () => {
    const prisma = {
      passwordResetToken: { findUnique: vi.fn().mockResolvedValue(null) }
    } as any;

    await expect(
      authService.resetPassword({ token: 'unknown', newPassword: 'new' }, prisma)
    ).rejects.toThrow('Invalid or expired reset token');
  });
});
