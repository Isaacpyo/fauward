import { describe, expect, it, vi } from 'vitest';

import { requireTenantMatch } from './tenantMatch.js';

describe('requireTenantMatch', () => {
  it('blocks user without tenant match', async () => {
    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });

    const request = {
      user: { role: 'TENANT_ADMIN', tenantId: 'tenant-a' },
      tenant: { id: 'tenant-b' }
    } as any;

    const reply = { status } as any;

    await requireTenantMatch(request, reply);

    expect(status).toHaveBeenCalledWith(403);
  });

  it('allows matching tenant', async () => {
    const status = vi.fn();

    const request = {
      user: { role: 'TENANT_ADMIN', tenantId: 'tenant-a' },
      tenant: { id: 'tenant-a' }
    } as any;

    const reply = { status } as any;

    await requireTenantMatch(request, reply);

    expect(status).not.toHaveBeenCalled();
  });
});
