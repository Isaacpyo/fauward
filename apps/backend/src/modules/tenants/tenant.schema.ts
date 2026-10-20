import { z } from 'zod';
import { isDomainFormatValid, normalizeDomainInput } from './domain.validator.js';

export const brandingSchema = z.object({
  primaryColor: z.string().regex(/^#([0-9a-fA-F]{6})$/, 'Must be a 6-digit hex color (e.g. #2563EB)'),
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, 'Must be a 6-digit hex color (e.g. #F59E0B)')
    .optional(),
  brandName: z.string().min(2).max(100),
  logoUrl: z
    .union([
      z.string().url().startsWith('https://', 'Logo URL must start with https://'),
      z.literal('')
    ])
    .optional(),
  supportEmail: z.union([z.string().email(), z.literal('')]).optional(),
  trackingHeadline: z.string().max(280).optional()
});

export const settingsSchema = z.object({
  timezone: z.string().min(2).max(100).optional(),
  currency: z.string().length(3).optional(),
  notificationEmail: z.string().email().optional(),
  smsEnabled: z.boolean().optional()
});

export const domainSchema = z.object({
  domain: z
    .string()
    .min(4)
    .max(253)
    .transform(normalizeDomainInput)
    .refine(isDomainFormatValid, { message: 'Invalid domain format' })
});
