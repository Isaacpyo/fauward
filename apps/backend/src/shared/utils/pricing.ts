import type { PrismaClient } from '@prisma/client';
import { pricingService } from '../../modules/pricing/pricing.service.js';

type ItemInput = {
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  declaredValue?: number;
  isDangerous?: boolean;
};

type ShipmentPricingInput = {
  tenantId: string;
  originZoneId?: string;
  destZoneId?: string;
  serviceTier: string;
  items: ItemInput[];
  declaredValue?: number;
  insuranceTier?: string;
  promoCode?: string;
  customerId?: string;
};

export async function calculateShipmentPrice(prisma: PrismaClient, input: ShipmentPricingInput) {
  const items = input.items.length > 0 ? input.items : [{}];

  const totalWeightKg = items.reduce((sum, item) => sum + Number(item.weightKg ?? 0), 0);
  const totalDeclaredValue: number =
    input.declaredValue ?? items.reduce((sum, item) => sum + Number(item.declaredValue ?? 0), 0);

  const maxDimensions = items.reduce<{ lengthCm: number; widthCm: number; heightCm: number }>(
    (acc, item) => ({
      lengthCm: Math.max(acc.lengthCm, Number(item.lengthCm ?? 0)),
      widthCm: Math.max(acc.widthCm, Number(item.widthCm ?? 0)),
      heightCm: Math.max(acc.heightCm, Number(item.heightCm ?? 0))
    }),
    { lengthCm: 0, widthCm: 0, heightCm: 0 }
  );

  const result = await pricingService.calculate(prisma, {
    tenantId: input.tenantId,
    originZoneId: input.originZoneId,
    destZoneId: input.destZoneId,
    serviceTier: input.serviceTier,
    weightKg: totalWeightKg,
    lengthCm: maxDimensions.lengthCm,
    widthCm: maxDimensions.widthCm,
    heightCm: maxDimensions.heightCm,
    declaredValue: totalDeclaredValue,
    insuranceTier: input.insuranceTier,
    promoCode: input.promoCode,
    customerId: input.customerId
  });

  return {
    total: result.total,
    subtotal: result.subtotal,
    taxAmount: result.taxAmount,
    currency: result.currency,
    chargeableWeightKg: result.chargeableWeightKg,
    breakdown: result.breakdown,
    quoteExpiresAt: result.quoteExpiresAt
  };
}
