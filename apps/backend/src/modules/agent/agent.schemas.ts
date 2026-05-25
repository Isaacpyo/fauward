import { z } from 'zod';

export const AgentEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.enum(['shipment_created', 'status_changed', 'sla_check', 'failed_delivery', 'nl_query']),
  tenantId: z.string().min(1),
  shipmentId: z.string().optional(),
  payload: z.record(z.unknown()).optional()
});

export const AgentQuerySchema = z.object({
  question: z.string().min(1),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

export const PolicyDecisionSchema = z.enum(['auto_approved', 'requires_approval', 'blocked']);

export const ActionRecordSchema = z.object({
  tool: z.string(),
  decision: PolicyDecisionSchema,
  executed: z.boolean(),
  summary: z.string(),
  durationMs: z.number().optional(),
  error: z.string().optional()
});

export const AgentActionListQuerySchema = z.object({
  status: z.enum(['PENDING_APPROVAL', 'AUTO_APPLIED', 'APPLIED', 'REJECTED', 'FAILED']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20)
});

export const AgentRunResultSchema = z.object({
  status: z.enum(['completed', 'requires_approval', 'blocked', 'already_processed', 'failed']),
  eventId: z.string().optional(),
  tenantId: z.string(),
  shipmentId: z.string().optional(),
  actions: z.array(ActionRecordSchema),
  finalMessage: z.string().optional(),
  usage: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number()
    })
    .optional(),
  durationMs: z.number().optional()
});
