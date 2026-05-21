import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { authenticate, requiredApiScope } from './authenticate.js';

function makeReply() {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  return { status, send };
}

describe('authenticate', () => {
  it('maps custom-domain endpoints to exact domain scopes', () => {
    expect(requiredApiScope('GET', '/api/v1/tenant/domain/status')).toBe('domains:read');
    expect(requiredApiScope('PATCH', '/api/v1/tenant/domain')).toBe('domains:write');
    expect(requiredApiScope('DELETE', '/api/v1/tenant/domain')).toBe('domains:write');
  });

  it('rejects API keys with unrelated write scopes on custom-domain writes', async () => {
    const token = 'fw_test_domain_scope';
    const reply = {
      raw: { once: vi.fn() },
      status: vi.fn().mockReturnThis(),
      send: vi.fn()
    };
    const apiKey = {
      id: 'key-1',
      tenantId: 'tenant-1',
      keyPrefix: 'fw_test',
      scopes: ['shipments:write'],
      tenant: { id: 'tenant-1', slug: 'tenant-1', plan: 'PRO' }
    };
    const request = {
      method: 'PATCH',
      url: '/api/v1/tenant/domain',
      headers: { authorization: `Bearer ${token}` },
      server: {
        prisma: {
          apiKey: {
            findFirst: vi.fn().mockResolvedValue(apiKey)
          }
        }
      }
    } as any;

    await authenticate(request, reply as any);

    expect(request.server.prisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: {
        keyHash: createHash('sha256').update(token).digest('hex'),
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]
      },
      include: { tenant: true }
    });
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'INSUFFICIENT_SCOPE',
      required: 'domains:write',
      provided: ['shipments:write']
    });
  });

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
    expect(reply.send).toHaveBeenCalledWith({
      error: 'TENANT_SUSPENDED',
      message: 'This tenant is currently suspended. Contact support.'
    });
  });

  it('rejects authenticated users resolving a different tenant context', async () => {
    const reply = makeReply();
    const request = {
      url: '/api/v1/t/tenant-b/shipments',
      jwtVerify: vi.fn().mockResolvedValue(undefined),
      tenant: { id: 'tenant-b', status: 'ACTIVE' },
      user: { sub: 'user-1', tenantId: 'tenant-a', role: 'TENANT_ADMIN', mfaVerified: true },
      server: {
        prisma: {
          user: { findFirst: vi.fn() },
          tenant: { findUnique: vi.fn() }
        }
      }
    } as any;

    await authenticate(request, reply as any);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: 'TENANT_MISMATCH' });
    expect(request.server.prisma.user.findFirst).not.toHaveBeenCalled();
    expect(request.server.prisma.tenant.findUnique).not.toHaveBeenCalled();
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
