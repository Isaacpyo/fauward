import { z } from 'zod';

export const TenantHealthSchema = z.object({
  healthScore: z.number(),
  topRisks: z.array(z.string()),
  recommendedAction: z.string(),
  escalate: z.boolean(),
  confidence: z.number()
});
