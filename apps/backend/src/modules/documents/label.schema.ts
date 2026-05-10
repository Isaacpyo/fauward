import { z } from 'zod';

export const labelGenerateSchema = z.object({
  format: z.enum(['PDF', 'ZPL', 'PNG']).default('PDF'),
  forceRegenerate: z.boolean().optional()
});

export const manifestGenerateSchema = z.object({
  routeId: z.string().optional(),
  shipmentIds: z.array(z.string()).default([])
});
