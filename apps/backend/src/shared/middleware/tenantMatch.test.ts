import { describe, expect, it, vi } from 'vitest';

import { requireTenantMatch } from './tenantMatch.js';

// ─────────────────────────────────────────────────────────────────────────────
// requireTenantMatch
// ─────────────────────────────────────────────────────────────────────────────

describe('requireTenantMatch', () => {
  it('allows request when JWT tenantId matches resolved tenant', async () => {
    const status = vi.fn();
    const request = {
      user: { role: 'TENANT_ADMIN', tenantId: 'tenant-a' },
      tenant: { id: 'tenant-a' }
    } as any;
    const reply = { status } as any;

    await requireTenantMatch(request, reply);

    expect(status).not.toHaveBeenCalled();
  });

  it('blocks request with 403 when tenantId mismatches resolved tenant', async () => {
    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });
    const request = {
      user: { role: 'TENANT_ADMIN', tenantId: 'tenant-a' },
      tenant: { id: 'tenant-b' }
    } as any;
    const reply = { status } as any;

    await requireTenantMatch(request, reply);

    expect(status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('blocks request with 403 when there is no resolved tenant', async () => {
    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });
    const request = {
      user: { role: 'TENANT_ADMIN', tenantId: 'tenant-a' },
      tenant: undefined
    } as any;
    const reply = { status } as any;

    await requireTenantMatch(request, reply);

    expect(status).toHaveBeenCalledWith(403);
  });

  it('blocks unauthenticated request with 401', async () => {
    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });
    const request = {
      user: undefined,
      tenant: { id: 'tenant-a' }
    } as any;
    const reply = { status } as any;

    await requireTenantMatch(request, reply);

    expect(status).toHaveBeenCalledWith(401);
    expect(send).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('allows SUPER_ADMIN regardless of resolved tenant — bypass for impersonation', async () => {
    const status = vi.fn();
    const request = {
      user: { role: 'SUPER_ADMIN', tenantId: 'internal' },
      tenant: { id: 'any-customer-tenant' } // different tenant
    } as any;
    const reply = { status } as any;

    await requireTenantMatch(request, reply);

    // SUPER_ADMIN bypasses the tenant match check
    expect(status).not.toHaveBeenCalled();
  });

  it('blocks TENANT_DRIVER attempting to use another tenant\'s context', async () => {
    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });
    const request = {
      user: { role: 'TENANT_DRIVER', tenantId: 'tenant-a' },
      tenant: { id: 'tenant-b' }
    } as any;
    const reply = { status } as any;

    await requireTenantMatch(request, reply);

    expect(status).toHaveBeenCalledWith(403);
  });
});
