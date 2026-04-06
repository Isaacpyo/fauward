import { z } from 'zod';

export const zoneCreateSchema = z.object({
  name: z.string().min(1),
  zoneType: z.enum(['NATIONAL', 'INTERNATIONAL', 'REGIONAL']).default('NATIONAL'),
  description: z.string().optional()
});

export const rateCardCreateSchema = z.object({
  name: z.string().optional(),
  originZoneId: z.string().optional(),
  destZoneId: z.string().optional(),
  serviceTier: z.string().default('STANDARD'),
  baseFee: z.number().nonnegative(),
  perKgRate: z.number().nonnegative(),
  minCharge: z.number().nonnegative().optional(),
  maxCharge: z.number().nonnegative().optional(),
  currency: z.string().default('GBP'),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  isActive: z.boolean().optional()
});

export const surchargeCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['PERCENT_OF_BASE', 'PERCENT_OF_TOTAL', 'FLAT_FEE', 'PER_KG']),
  condition: z.enum(['ALWAYS', 'OVERSIZE', 'OVERWEIGHT', 'REMOTE_AREA', 'RESIDENTIAL', 'DANGEROUS_GOODS', 'FUEL', 'PEAK_SEASON']),
  value: z.number(),
  threshold: z.number().optional(),
  peakFrom: z.string().datetime().optional(),
  peakTo: z.string().datetime().optional(),
  isEnabled: z.boolean().optional(),
  isVisibleToCustomer: z.boolean().optional()
});

export const pricingRuleCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  conditions: z.record(z.any()),
  action: z.enum(['ADD', 'SUBTRACT', 'MULTIPLY', 'OVERRIDE_TOTAL', 'OVERRIDE_PER_KG', 'SET_MIN', 'SET_MAX']),
  actionValue: z.number(),
  stopAfter: z.boolean().optional()
});

export const promoCodeCreateSchema = z.object({
  code: z.string().regex(/^[a-z0-9_-]+$/i),
  description: z.string().optional(),
  type: z.enum(['PERCENT_OFF', 'FIXED_OFF', 'FREE_INSURANCE', 'FREE_EXPRESS']),
  value: z.number().nonnegative(),
  minOrderValue: z.number().nonnegative().optional(),
  maxDiscountValue: z.number().nonnegative().optional(),
  maxUses: z.number().int().positive().optional(),
  customerIds: z.array(z.string()).optional(),
  isEnabled: z.boolean().optional(),
  expiresAt: z.string().datetime().optional()
});

export const weightTierCreateSchema = z.object({
  name: z.string().optional(),
  minWeightKg: z.number().nonnegative(),
  maxWeightKg: z.number().positive().optional(),
  discountType: z.enum(['PERCENT', 'FLAT_FEE_REDUCTION', 'FIXED_PER_KG_OVERRIDE']),
  discountValue: z.number().nonnegative(),
  isEnabled: z.boolean().optional()
});

export const calculatePricingSchema = z.object({
  originZoneId: z.string().optional(),
  destZoneId: z.string().optional(),
  serviceTier: z.string().default('STANDARD'),
  weightKg: z.number().nonnegative(),
  lengthCm: z.number().nonnegative().default(0),
  widthCm: z.number().nonnegative().default(0),
  heightCm: z.number().nonnegative().default(0),
  declaredValue: z.number().nonnegative().default(0),
  insuranceTier: z.string().optional(),
  promoCode: z.string().optional(),
  customerId: z.string().optional(),
  date: z.string().datetime().optional()
});

