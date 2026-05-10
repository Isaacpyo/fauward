import { z } from 'zod';

export const addressSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().min(2),
  landmark: z.string().optional(),
  deliveryNotes: z.string().optional()
}).passthrough();

export const dimensionsSchema = z.object({
  lengthCm: z.number().nonnegative(),
  widthCm: z.number().nonnegative(),
  heightCm: z.number().nonnegative()
});

export const rateQuoteRequestSchema = z.object({
  origin: addressSchema,
  destination: addressSchema,
  weightKg: z.number().positive(),
  dimensions: dimensionsSchema,
  serviceType: z.string().min(1).default('STANDARD'),
  shipmentId: z.string().optional(),
  declaredValue: z.number().nonnegative().default(0),
  insuranceTier: z.string().optional(),
  preferredCarriers: z.array(z.string()).optional()
});

export const carrierAccountCreateSchema = z.object({
  name: z.string().min(1),
  carrier: z.string().min(1),
  credentials: z.record(z.any()).default({}),
  isActive: z.boolean().optional(),
  serviceLevels: z.array(z.object({
    name: z.string().min(1),
    transitDays: z.number().int().positive(),
    regions: z.array(z.string()).default([]),
    isActive: z.boolean().optional()
  })).optional()
});

export const carrierAccountUpdateSchema = carrierAccountCreateSchema.partial();

export const quoteSelectionSchema = z.object({
  selectedCarrier: z.string().min(1),
  selectedServiceLevel: z.string().min(1)
});
