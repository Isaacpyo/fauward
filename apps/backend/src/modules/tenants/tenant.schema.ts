import { z } from 'zod';

export const brandingSchema = z.object({
  primaryColor: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  accentColor: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  brandName: z.string().min(2).max(100),
  logoUrl: z.string().url().optional()
});

export const settingsSchema = z.object({
  timezone: z.string().min(2).max(100).optional(),
  currency: z.string().length(3).optional(),
  notificationEmail: z.string().email().optional(),
  smsEnabled: z.boolean().optional(),
  paymentGatewayKey: z.string().optional()
});

export const domainSchema = z.object({
  domain: z.string().min(3).max(255)
});