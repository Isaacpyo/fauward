import { describe, expect, it } from 'vitest';

import { planService } from './plan.service.js';
import { brandingService } from './branding.service.js';
import { usageService } from './usage.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// planService
// ─────────────────────────────────────────────────────────────────────────────

describe('planService.hasFeature', () => {
  it('Starter does not have webhooks or API access', () => {
    expect(planService.hasFeature('STARTER', 'webhooks')).toBe(false);
    expect(planService.hasFeature('STARTER', 'apiAccess')).toBe(false);
  });

  it('Pro has webhooks and API access', () => {
    expect(planService.hasFeature('PRO', 'webhooks')).toBe(true);
    expect(planService.hasFeature('PRO', 'apiAccess')).toBe(true);
  });

  it('Pro does not have carrier integrations or SSO', () => {
    expect(planService.hasFeature('PRO', 'carrierIntegrations')).toBe(false);
    expect(planService.hasFeature('PRO', 'sso')).toBe(false);
  });

  it('Enterprise has all features including SSO, multiBranch, carrierIntegrations', () => {
    expect(planService.hasFeature('ENTERPRISE', 'sso')).toBe(true);
    expect(planService.hasFeature('ENTERPRISE', 'multiBranch')).toBe(true);
    expect(planService.hasFeature('ENTERPRISE', 'carrierIntegrations')).toBe(true);
    expect(planService.hasFeature('ENTERPRISE', 'auditLog')).toBe(true);
  });

  it('returns false for an unknown plan', () => {
    expect(planService.hasFeature('UNKNOWN_PLAN', 'webhooks')).toBe(false);
  });

  it('returns false for an unknown feature key', () => {
    expect(planService.hasFeature('PRO', 'nonExistentFeature')).toBe(false);
  });
});

describe('planService.getLimit', () => {
  it('Starter has a 300 shipment limit and 3 staff limit', () => {
    expect(planService.getLimit('STARTER', 'maxShipmentsPm')).toBe(300);
    expect(planService.getLimit('STARTER', 'maxStaff')).toBe(3);
  });

  it('Pro has a 2000 shipment limit and 15 staff limit', () => {
    expect(planService.getLimit('PRO', 'maxShipmentsPm')).toBe(2000);
    expect(planService.getLimit('PRO', 'maxStaff')).toBe(15);
  });

  it('Enterprise returns -1 (unlimited) for shipments and staff', () => {
    expect(planService.getLimit('ENTERPRISE', 'maxShipmentsPm')).toBe(-1);
    expect(planService.getLimit('ENTERPRISE', 'maxStaff')).toBe(-1);
  });

  it('returns 0 for unknown limit key', () => {
    expect(planService.getLimit('PRO', 'unknownLimit')).toBe(0);
  });
});

describe('planService.getFeatures', () => {
  it('returns Starter feature set for unknown plans (safe fallback)', () => {
    const features = planService.getFeatures('TRIALING');
    expect(features.maxShipmentsPm).toBe(300);
    expect(features.webhooks).toBe(false);
  });

  it('returns the correct feature set for Pro', () => {
    const features = planService.getFeatures('PRO');
    expect(features.webhooks).toBe(true);
    expect(features.maxStaff).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// brandingService
// ─────────────────────────────────────────────────────────────────────────────

describe('brandingService.updateBranding', () => {
  it('calls prisma.tenant.update with the correct fields', async () => {
    const updatedTenant = { id: 'tenant-1', primaryColor: '#FF0000', brandName: 'Acme Cargo', logoUrl: 'https://cdn.example.com/logo.png' };
    const prisma = {
      tenant: { update: vi.fn().mockResolvedValue(updatedTenant) }
    } as any;

    const result = await brandingService.updateBranding(prisma, 'tenant-1', {
      primaryColor: '#FF0000',
      brandName: 'Acme Cargo',
      logoUrl: 'https://cdn.example.com/logo.png'
    });

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: expect.objectContaining({ primaryColor: '#FF0000', brandName: 'Acme Cargo' })
    });
    expect(result.primaryColor).toBe('#FF0000');
  });

  it('does not pass undefined accentColor to the update', async () => {
    const prisma = {
      tenant: { update: vi.fn().mockResolvedValue({}) }
    } as any;

    await brandingService.updateBranding(prisma, 'tenant-1', {
      primaryColor: '#000000',
      brandName: 'Test'
    });

    const updateData = prisma.tenant.update.mock.calls[0][0].data;
    expect(updateData.accentColor).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// usageService
// ─────────────────────────────────────────────────────────────────────────────

const baseTenant = {
  id: 'tenant-1',
  plan: 'STARTER',
  maxShipmentsPm: 300,
  maxStaff: 3,
  maxOrganisations: 10
} as any;

describe('usageService.checkAndIncrement', () => {
  it('allows shipment creation when under the limit', async () => {
    const prisma = {
      usageRecord: {
        findUnique: vi.fn().mockResolvedValue({ tenantId: 'tenant-1', month: '2026-04', shipments: 150 }),
        upsert: vi.fn().mockResolvedValue({})
      }
    } as any;

    const result = await usageService.checkAndIncrement(prisma, baseTenant, 'shipments');

    expect(result.allowed).toBe(true);
    expect(result.overage).toBe(false);
    expect(prisma.usageRecord.upsert).toHaveBeenCalledTimes(1);
  });

  it('blocks Starter tenant at the shipment limit', async () => {
    const prisma = {
      usageRecord: {
        findUnique: vi.fn().mockResolvedValue({ tenantId: 'tenant-1', month: '2026-04', shipments: 300 }),
        upsert: vi.fn().mockResolvedValue({})
      }
    } as any;

    const result = await usageService.checkAndIncrement(prisma, baseTenant, 'shipments');

    expect(result.allowed).toBe(false);
    expect(result.code).toBe('LIMIT_EXCEEDED');
    expect(prisma.usageRecord.upsert).not.toHaveBeenCalled();
  });

  it('allows Pro tenant to exceed limit with overage flag', async () => {
    const proTenant = { ...baseTenant, plan: 'PRO', maxShipmentsPm: 2000 };
    const prisma = {
      usageRecord: {
        findUnique: vi.fn().mockResolvedValue({ tenantId: 'tenant-1', month: '2026-04', shipments: 2001 }),
        upsert: vi.fn().mockResolvedValue({})
      }
    } as any;

    const result = await usageService.checkAndIncrement(prisma, proTenant, 'shipments');

    expect(result.allowed).toBe(true);
    expect(result.overage).toBe(true);
  });

  it('Enterprise tenant (-1 limit) is always allowed', async () => {
    const enterpriseTenant = { ...baseTenant, plan: 'ENTERPRISE', maxShipmentsPm: -1 };
    const prisma = {
      usageRecord: {
        findUnique: vi.fn().mockResolvedValue({ tenantId: 'tenant-1', month: '2026-04', shipments: 999999 }),
        upsert: vi.fn().mockResolvedValue({})
      }
    } as any;

    const result = await usageService.checkAndIncrement(prisma, enterpriseTenant, 'shipments');

    expect(result.allowed).toBe(true);
  });
});

describe('usageService.getUsage', () => {
  it('returns correct usage percentage at 50%', async () => {
    const prisma = {
      usageRecord: {
        findUnique: vi.fn().mockResolvedValue({ shipments: 150 })
      }
    } as any;

    const result = await usageService.getUsage(prisma, baseTenant);

    expect(result.shipments.used).toBe(150);
    expect(result.shipments.limit).toBe(300);
    expect(result.shipments.percent).toBe(50);
  });

  it('returns 0 usage when no record exists yet', async () => {
    const prisma = {
      usageRecord: { findUnique: vi.fn().mockResolvedValue(null) }
    } as any;

    const result = await usageService.getUsage(prisma, baseTenant);

    expect(result.shipments.used).toBe(0);
    expect(result.shipments.percent).toBe(0);
  });
});

// vitest does not auto-import vi — import explicitly
import { vi } from 'vitest';
