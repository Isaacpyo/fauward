import { z } from 'zod';

const paymentProviderSchema = z.enum([
  'STRIPE',
  'PAYSTACK',
  'FLUTTERWAVE',
  'BANK_TRANSFER',
  'COD'
]);

const paymentIntegrationProviderSchema = z.object({
  enabled: z.boolean().optional(),
  accountId: z.string().optional().nullable(),
  publicKey: z.string().optional().nullable(),
  publishableKey: z.string().optional().nullable(),
  secretKey: z.string().optional().nullable(),
  webhookSecret: z.string().optional().nullable(),
  encryptionKey: z.string().optional().nullable(),
  merchantEmail: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  accountName: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  sortCode: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
  remittanceWindowDays: z.number().int().min(0).max(30).optional().nullable(),
  currency: z.string().optional().nullable()
});

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
  paymentGateway: paymentProviderSchema.optional(),
  paymentGatewayKey: z.string().optional(),
  paymentIntegrations: z
    .object({
      activeProvider: paymentProviderSchema.optional(),
      providers: z
        .object({
          STRIPE: paymentIntegrationProviderSchema.optional(),
          PAYSTACK: paymentIntegrationProviderSchema.optional(),
          FLUTTERWAVE: paymentIntegrationProviderSchema.optional(),
          BANK_TRANSFER: paymentIntegrationProviderSchema.optional(),
          COD: paymentIntegrationProviderSchema.optional()
        })
        .optional()
    })
    .optional()
});

export const domainSchema = z.object({
  domain: z.string().min(3).max(255)
});
