import { describe, expect, it, vi } from 'vitest';

import { pricingService } from './pricing.service.js';

function buildPrismaMock() {
  return {
    tenantSettings: {
      findUnique: vi.fn().mockResolvedValue({
        dimensionalDivisor: 5000,
        serviceTierConfig: {
          STANDARD: { multiplier: 1 },
          EXPRESS: { multiplier: 1.6 },
          OVERNIGHT: { multiplier: 2.2 }
        },
        taxConfig: { enabled: false }
      })
    },
    rateCard: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'rc-1',
        basePrice: 10,
        pricePerKg: 2,
        minCharge: null,
        maxCharge: null,
        currency: 'GBP'
      })
    },
    surcharge: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 's-1',
          name: 'Fuel surcharge',
          condition: 'ALWAYS',
          type: 'PERCENT_OF_BASE',
          value: 10,
          threshold: null,
          peakFrom: null,
          peakTo: null
        }
      ])
    },
    weightDiscountTier: { findMany: vi.fn().mockResolvedValue([]) },
    pricingRule: { findMany: vi.fn().mockResolvedValue([]) },
    promoCode: { findFirst: vi.fn().mockResolvedValue(null) }
  } as any;
}

describe('pricingService.calculate', () => {
  it('uses zone rate card lookup for the requested zone pair', async () => {
    const prisma = buildPrismaMock();
    await pricingService.calculate(prisma, {
      tenantId: 'tenant-1',
      originZoneId: 'zone-origin',
      destZoneId: 'zone-dest',
      serviceTier: 'STANDARD',
      weightKg: 5,
      lengthCm: 20,
      widthCm: 20,
      heightCm: 20,
      declaredValue: 0
    });

    expect(prisma.rateCard.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          originZoneId: 'zone-origin',
          destZoneId: 'zone-dest',
          serviceTier: 'STANDARD',
          isActive: true
        })
      })
    );
  });

  it('applies configured service tier multipliers', async () => {
    const prisma = buildPrismaMock();
    const standard = await pricingService.calculate(prisma, {
      tenantId: 'tenant-1',
      originZoneId: 'zone-origin',
      destZoneId: 'zone-dest',
      serviceTier: 'STANDARD',
      weightKg: 5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      declaredValue: 0
    });
    const express = await pricingService.calculate(prisma, {
      tenantId: 'tenant-1',
      originZoneId: 'zone-origin',
      destZoneId: 'zone-dest',
      serviceTier: 'EXPRESS',
      weightKg: 5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      declaredValue: 0
    });
    const overnight = await pricingService.calculate(prisma, {
      tenantId: 'tenant-1',
      originZoneId: 'zone-origin',
      destZoneId: 'zone-dest',
      serviceTier: 'OVERNIGHT',
      weightKg: 5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      declaredValue: 0
    });

    expect(standard.total).toBe(22);
    expect(express.total).toBe(34);
    expect(overnight.total).toBe(46);
  });

  it('applies surcharges when conditions match', async () => {
    const prisma = buildPrismaMock();
    prisma.surcharge.findMany.mockResolvedValue([
      {
        id: 's-oversize',
        name: 'Oversize fee',
        condition: 'OVERSIZE',
        type: 'FLAT_FEE',
        value: 5,
        threshold: 120,
        peakFrom: null,
        peakTo: null
      }
    ]);

    const normal = await pricingService.calculate(prisma, {
      tenantId: 'tenant-1',
      originZoneId: 'zone-origin',
      destZoneId: 'zone-dest',
      serviceTier: 'STANDARD',
      weightKg: 5,
      lengthCm: 100,
      widthCm: 30,
      heightCm: 30,
      declaredValue: 0
    });
    const oversize = await pricingService.calculate(prisma, {
      tenantId: 'tenant-1',
      originZoneId: 'zone-origin',
      destZoneId: 'zone-dest',
      serviceTier: 'STANDARD',
      weightKg: 5,
      lengthCm: 130,
      widthCm: 30,
      heightCm: 30,
      declaredValue: 0
    });

    expect(normal.total).toBe(20);
    expect(oversize.total).toBe(25);
  });
});

