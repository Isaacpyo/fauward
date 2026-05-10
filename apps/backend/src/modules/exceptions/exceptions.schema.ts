import { z } from 'zod';

export const resolveExceptionSchema = z.object({
  notes: z.string().optional()
});

export const slaPolicyCreateSchema = z.object({
  name: z.string().min(1),
  serviceType: z.string().optional(),
  pickupWindowHours: z.number().int().positive(),
  deliveryWindowHours: z.number().int().positive(),
  escalationHours: z.number().int().positive(),
  isDefault: z.boolean().default(false)
});
