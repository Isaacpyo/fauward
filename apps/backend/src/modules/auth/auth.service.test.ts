import { describe, expect, it, vi } from 'vitest';

import { authService } from './auth.service.js';
import { hashPassword } from '../../shared/utils/hash.js';
import { signRefreshToken } from '../../shared/utils/jwt.js';

describe('authService', () => {
  it('register creates tenant and admin user', async () => {
    const tx = {
      tenant: { create: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'acme', status: 'TRIALING', plan: 'TRIALING' }) },
      tenantSettings: { create: vi.fn().mockResolvedValue({}) },
      emailTemplateConfig: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      surcharge: { createMany: vi.fn().mockResolvedValue({ count: 6 }) },
      usageRecord: { create: vi.fn().mockResolvedValue({}) },
      user: { create: vi.fn().mockResolvedValue({ id: 'user-1', email: 'owner@acme.com', role: 'TENANT_ADMIN', tenantId: 'tenant-1' }) },
      subscription: { create: vi.fn().mockResolvedValue({ id: 'sub-1' }) }
    };

    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      refreshToken: { create: vi.fn().mockResolvedValue({ id: 'rt-1' }) },
      $transaction: vi.fn(async (cb: (db: typeof tx) => unknown) => cb(tx))
    } as any;

    const result = await authService.register(
      {
        companyName: 'Acme Logistics',
        region: 'uk',
        email: 'Owner@Acme.com',
        password: 'password123'
      },
      prisma
    );

    expect(tx.tenant.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(result.user.email).toBe('owner@acme.com');
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate register email', async () => {
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'existing-user' }) }
    } as any;

    await expect(
      authService.register(
        {
          companyName: 'Acme Logistics',
          region: 'uk',
          email: 'owner@acme.com',
          password: 'password123'
        },
        prisma
      )
    ).rejects.toThrow('Email already in use');
  });

  it('rejects login with wrong password', async () => {
    const passwordHash = await hashPassword('correct-password');
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'owner@acme.com',
          tenantId: 'tenant-1',
          role: 'TENANT_ADMIN',
          isActive: true,
          passwordHash
        })
      }
    } as any;

    await expect(
      authService.login({ email: 'owner@acme.com', password: 'wrong-password' }, prisma, 'tenant-1')
    ).rejects.toThrow('Invalid credentials');
  });

  it('rotates refresh token on refresh', async () => {
    const oldRefreshToken = signRefreshToken({
      sub: 'user-1',
      email: 'owner@acme.com',
      role: 'TENANT_ADMIN',
      tenantId: 'tenant-1',
      tenantSlug: 'acme',
      plan: 'PRO',
      mfaVerified: true
    });

    const tx = {
      refreshToken: {
        delete: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({})
      }
    };

    const prisma = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          token: oldRefreshToken,
          expiresAt: new Date(Date.now() + 60_000)
        })
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'owner@acme.com',
          role: 'TENANT_ADMIN',
          tenantId: 'tenant-1',
          isActive: true
        })
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'tenant-1',
          slug: 'acme',
          plan: 'PRO'
        })
      },
      $transaction: vi.fn(async (cb: (db: typeof tx) => unknown) => cb(tx))
    } as any;

    const result = await authService.refresh({ refreshToken: oldRefreshToken }, prisma);

    expect(result.refreshToken).not.toBe(oldRefreshToken);
    expect(tx.refreshToken.delete).toHaveBeenCalledWith({ where: { token: oldRefreshToken } });
    expect(tx.refreshToken.create).toHaveBeenCalledTimes(1);
  });
});
