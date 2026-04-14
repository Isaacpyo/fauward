import { describe, expect, it, vi } from 'vitest';

import { authenticate } from './authenticate.js';

function makeReply() {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  return { status, send };
}

describe('authenticate', () => {
  it('blocks suspended tenants for non-super-admin users', async () => {
    const reply = makeReply();
    const request = {
      url: '/api/v1/shipments',
      jwtVerify: vi.fn().mockResolvedValue(undefined),
      user: { sub: 'user-1', tenantId: 'tenant-1', role: 'TENANT_ADMIN', mfaVerified: true },
      server: {
        prisma: {
          user: { findFirst: vi.fn().mockResolvedValue({ isActive: true }) },
          tenant: { findUnique: vi.fn().mockResolvedValue({ status: 'SUSPENDED' }) }
        }
      }
    } as any;

    await authenticate(request, reply as any);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Tenant suspended', code: 'TENANT_SUSPENDED' });
  });

  it('requires mfa for super-admin routes', async () => {
    const reply = makeReply();
    const request = {
      url: '/api/v1/admin/tenants',
      jwtVerify: vi.fn().mockResolvedValue(undefined),
      user: { sub: 'user-1', tenantId: 'system', role: 'SUPER_ADMIN', mfaVerified: false },
      server: {
        prisma: {
          user: { findFirst: vi.fn().mockResolvedValue({ isActive: true }) }
        }
      }
    } as any;

    await authenticate(request, reply as any);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: 'MFA required', code: 'MFA_REQUIRED' });
  });
});

