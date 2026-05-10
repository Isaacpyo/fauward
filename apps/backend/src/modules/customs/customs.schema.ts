import { z } from 'zod';

export const customsItemSchema = z.object({
  description: z.string().min(1),
  hsCode: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  value: z.number().nonnegative(),
  weight: z.number().nonnegative().optional(),
  origin: z.string().optional()
});

export const customsDeclarationSchema = z.object({
  type: z.enum(['DDP', 'DDU']),
  items: z.array(customsItemSchema).default([]),
  totalValue: z.number().nonnegative(),
  currency: z.string().min(3).max(3).default('GBP'),
  documents: z.array(z.record(z.unknown())).optional()
});

export const customsDeclarationUpdateSchema = customsDeclarationSchema.partial().extend({
  status: z.enum(['DRAFT', 'SUBMITTED', 'CLEARED', 'HELD', 'REJECTED']).optional(),
  holdReason: z.string().optional()
});

export const hsLookupSchema = z.object({
  description: z.string().min(2).max(200)
});
