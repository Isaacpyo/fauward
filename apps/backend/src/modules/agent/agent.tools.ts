import { z } from 'zod';

export const toolSchemas = {
  assign_shipment: z.object({
    shipmentId: z.string().min(1),
    driverId: z.string().min(1),
    reason: z.string().min(1)
  }),

  get_available_drivers: z.object({
    tenantId: z.string().min(1),
    originPostcode: z.string().nullable().optional()
  }),

  get_shipment_details: z.object({
    shipmentId: z.string().min(1)
  }),

  reroute_shipment: z.object({
    shipmentId: z.string().min(1),
    newDriverId: z.string().min(1),
    reason: z.string().min(1)
  }),

  send_customer_notification: z.object({
    shipmentId: z.string().min(1),
    channel: z.enum(['email', 'sms']),
    templateKey: z.enum([
      'out_for_delivery',
      'delayed',
      'failed_delivery',
      'reattempt_scheduled',
      'sla_risk_update'
    ]),
    customMessage: z.string().nullable().optional()
  }),

  get_carrier_rates: z.object({
    originPostcode: z.string().min(1),
    destPostcode: z.string().min(1),
    weightKg: z.number().positive(),
    tenantId: z.string().min(1)
  }),

  flag_sla_risk: z.object({
    shipmentId: z.string().min(1),
    riskLevel: z.enum(['HIGH', 'MEDIUM']),
    estimatedDelayMinutes: z.number().nonnegative().nullable().optional(),
    reason: z.string().min(1)
  }),

  // Scoped analytics tools — no free-form queries, no raw SQL
  get_failed_shipments_count: z
    .object({
      tenantId: z.string().min(1),
      dateFrom: z.string().nullable().optional(),
      dateTo: z.string().nullable().optional()
    })
    .strict(),

  get_delay_reasons: z
    .object({
      tenantId: z.string().min(1),
      dateFrom: z.string().nullable().optional(),
      dateTo: z.string().nullable().optional()
    })
    .strict(),

  get_sla_breach_rate: z
    .object({
      tenantId: z.string().min(1),
      dateFrom: z.string().nullable().optional(),
      dateTo: z.string().nullable().optional()
    })
    .strict(),

  get_driver_performance: z
    .object({
      tenantId: z.string().min(1),
      dateFrom: z.string().nullable().optional(),
      dateTo: z.string().nullable().optional()
    })
    .strict(),

  get_carrier_performance: z
    .object({
      tenantId: z.string().min(1),
      dateFrom: z.string().nullable().optional(),
      dateTo: z.string().nullable().optional()
    })
    .strict(),

  get_shipments_by_status: z
    .object({
      tenantId: z.string().min(1),
      dateFrom: z.string().nullable().optional(),
      dateTo: z.string().nullable().optional()
    })
    .strict(),

  get_weekly_operations_summary: z
    .object({
      tenantId: z.string().min(1),
      dateFrom: z.string().nullable().optional(),
      dateTo: z.string().nullable().optional()
    })
    .strict()
} as const;

export type ToolName = keyof typeof toolSchemas;

const analyticsDateParams = {
  type: 'object' as const,
  properties: {
    tenantId: { type: 'string' },
    dateFrom: { type: ['string', 'null'] as ['string', 'null'], description: 'ISO date (YYYY-MM-DD)' },
    dateTo: { type: ['string', 'null'] as ['string', 'null'], description: 'ISO date (YYYY-MM-DD)' }
  },
  required: ['tenantId', 'dateFrom', 'dateTo'],
  additionalProperties: false
};

export const tools: Array<Record<string, unknown>> = [
  {
    type: 'function',
    function: {
      name: 'assign_shipment',
      description:
        'Assign a shipment to the optimal available driver based on proximity, capacity, and current workload. Always call get_available_drivers first.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          shipmentId: { type: 'string' },
          driverId: { type: 'string' },
          reason: { type: 'string', description: 'Why this driver was chosen' }
        },
        required: ['shipmentId', 'driverId', 'reason'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_available_drivers',
      description:
        'Get all available drivers for a tenant, including current location, capacity, and active job count.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          originPostcode: {
            type: ['string', 'null'],
            description: 'Filter by proximity to origin'
          }
        },
        required: ['tenantId', 'originPostcode'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_shipment_details',
      description:
        'Get full details of a shipment including current status, route, SLA deadline, and history.',
      strict: true,
      parameters: {
        type: 'object',
        properties: { shipmentId: { type: 'string' } },
        required: ['shipmentId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reroute_shipment',
      description:
        'Re-assign a shipment to a different driver due to failure, delay, or SLA risk. Requires human approval — use only when escalation is confirmed. Always call get_shipment_details first.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          shipmentId: { type: 'string' },
          newDriverId: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['shipmentId', 'newDriverId', 'reason'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_customer_notification',
      description:
        'Send a status update notification to the customer via email or SMS using an approved template. Deduplication is handled at the handler layer. Do not use customMessage for free-form text.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          shipmentId: { type: 'string' },
          channel: { type: 'string', enum: ['email', 'sms'] },
          templateKey: {
            type: 'string',
            enum: [
              'out_for_delivery',
              'delayed',
              'failed_delivery',
              'reattempt_scheduled',
              'sla_risk_update'
            ]
          },
          customMessage: {
            type: ['string', 'null'],
            description: 'Supplementary note — must not replace the template'
          }
        },
        required: ['shipmentId', 'channel', 'templateKey', 'customMessage'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_carrier_rates',
      description:
        'Get available carrier options for a route with pricing and estimated delivery time.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          originPostcode: { type: 'string' },
          destPostcode: { type: 'string' },
          weightKg: { type: 'number' },
          tenantId: { type: 'string' }
        },
        required: ['originPostcode', 'destPostcode', 'weightKg', 'tenantId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'flag_sla_risk',
      description:
        'Flag a shipment as at-risk of SLA breach and log it for supervisor review. Use HIGH for >60 min delay, MEDIUM for 30–60 min.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          shipmentId: { type: 'string' },
          riskLevel: { type: 'string', enum: ['HIGH', 'MEDIUM'] },
          estimatedDelayMinutes: { type: ['number', 'null'] },
          reason: { type: 'string' }
        },
        required: ['shipmentId', 'riskLevel', 'estimatedDelayMinutes', 'reason'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_failed_shipments_count',
      description: 'Count of failed deliveries in the given date range for the tenant.',
      strict: true,
      parameters: analyticsDateParams
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_delay_reasons',
      description: 'Breakdown of delay and exception reason codes for the given date range.',
      strict: true,
      parameters: analyticsDateParams
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sla_breach_rate',
      description:
        'Percentage of shipments that breached their SLA deadline in the given date range.',
      strict: true,
      parameters: analyticsDateParams
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_driver_performance',
      description:
        'Per-driver on-time delivery rate and total job count for the given date range.',
      strict: true,
      parameters: analyticsDateParams
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_carrier_performance',
      description:
        'Per-carrier on-time rate and shipment volume for the given date range.',
      strict: true,
      parameters: analyticsDateParams
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_shipments_by_status',
      description: 'Count of shipments grouped by status for the given date range.',
      strict: true,
      parameters: analyticsDateParams
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weekly_operations_summary',
      description:
        'Pre-built weekly digest combining all key operational KPIs: deliveries, failures, SLA breach rate, and top delay reasons.',
      strict: true,
      parameters: analyticsDateParams
    }
  }
];
