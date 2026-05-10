import { z } from 'zod';

export const relayToolSchemas = {
  lookup_shipment: z
    .object({
      identifier: z.string().min(1)
    })
    .strict(),

  request_tracking_number: z
    .object({
      message: z.string().min(1).max(300)
    })
    .strict(),

  draft_reply: z
    .object({
      message: z.string().min(1).max(1500)
    })
    .strict(),

  request_human_handoff: z
    .object({
      reason: z.string().min(1),
      summary: z.string().min(1)
    })
    .strict()
} as const;

export type RelayToolName = keyof typeof relayToolSchemas;

export const relayTools: Array<Record<string, unknown>> = [
  {
    type: 'function',
    function: {
      name: 'lookup_shipment',
      description:
        'Look up a shipment by its ID or tracking number to get current status, origin, destination, and estimated delivery. Only use when the customer has already provided a tracking number or shipment ID.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Shipment ID or tracking number provided by the customer'
          }
        },
        required: ['identifier'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_tracking_number',
      description:
        'Ask the customer to enter their tracking number. ONLY call this when the customer has explicitly mentioned a parcel, shipment, order, package, or tracking status in their message AND has not yet provided a tracking number. Do NOT call this for greetings, general questions, billing queries, or any message that does not clearly reference a shipment.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'A short, friendly message asking the customer to enter their tracking number'
          }
        },
        required: ['message'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'draft_reply',
      description:
        'Draft your response for human approval. Call this exactly once with your complete message. Keep it concise and professional. Do not pad with pleasantries.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            maxLength: 1500
          }
        },
        required: ['message'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_human_handoff',
      description:
        'Escalate to a human support agent. Use when: the issue involves refunds, compensation, cancellation, or legal; the customer is very upset; you cannot resolve with certainty; or the knowledge base entry is marked escalate=true.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          summary: { type: 'string' }
        },
        required: ['reason', 'summary'],
        additionalProperties: false
      }
    }
  }
];
