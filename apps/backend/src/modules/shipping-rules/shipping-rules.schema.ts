import { z } from 'zod';
import { ACTION_TYPES, CONDITION_FIELDS, CONDITION_OPERATORS } from './shipping-rules.engine.js';

export const shippingRuleConditionSchema = z.object({
  field: z.enum(CONDITION_FIELDS),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.unknown()
});

export const shippingRuleActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  value: z.unknown().optional()
});

export const shippingRuleCreateSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().default(true),
  priority: z.number().int().default(0),
  conditions: z.array(shippingRuleConditionSchema).default([]),
  actions: z.array(shippingRuleActionSchema).default([])
});

export const shippingRuleUpdateSchema = shippingRuleCreateSchema.partial();

export const shippingRuleTestSchema = z.object({
  shipment: z.record(z.unknown()).default({})
});
