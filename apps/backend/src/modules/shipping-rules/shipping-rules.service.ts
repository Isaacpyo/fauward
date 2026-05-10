import { Prisma, type PrismaClient } from '@prisma/client';
import { evaluateShippingRules, type ShipmentRuleContext, type ShippingRuleAction } from './shipping-rules.engine.js';

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function country(address: unknown) {
  if (!address || typeof address !== 'object') return undefined;
  const rec = address as Record<string, unknown>;
  return rec.country ?? rec.countryCode;
}

export function buildShipmentRuleContext(data: {
  originAddress?: unknown;
  destinationAddress?: unknown;
  serviceTier?: string;
  serviceType?: string;
  branchId?: string;
  originBranchId?: string;
  customerTag?: string | string[];
  items?: Array<{
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    declaredValue?: number;
  }>;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  declaredValue?: number;
}): ShipmentRuleContext {
  const items = data.items ?? [];
  const firstItem = items[0] ?? {};
  return {
    destinationCountry: country(data.destinationAddress),
    originCountry: country(data.originAddress),
    weightKg: data.weightKg ?? items.reduce((sum, item) => sum + Number(item.weightKg ?? 0), 0),
    lengthCm: data.lengthCm ?? firstItem.lengthCm,
    widthCm: data.widthCm ?? firstItem.widthCm,
    heightCm: data.heightCm ?? firstItem.heightCm,
    declaredValue: data.declaredValue ?? items.reduce((sum, item) => sum + Number(item.declaredValue ?? 0), 0),
    serviceType: data.serviceType ?? data.serviceTier ?? 'STANDARD',
    originBranchId: data.originBranchId ?? data.branchId,
    customerTag: data.customerTag
  };
}

export function findAction(actions: ShippingRuleAction[], type: string) {
  return actions.find((action) => action.type === type);
}

export const shippingRulesService = {
  async list(prisma: PrismaClient, tenantId: string) {
    return (prisma as any).shippingRule.findMany({
      where: { tenantId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
    });
  },

  async create(prisma: PrismaClient, tenantId: string, data: {
    name: string;
    isActive?: boolean;
    priority?: number;
    conditions?: unknown[];
    actions?: unknown[];
  }) {
    return (prisma as any).shippingRule.create({
      data: {
        tenantId,
        name: data.name,
        isActive: data.isActive ?? true,
        priority: data.priority ?? 0,
        conditions: json(data.conditions ?? []),
        actions: json(data.actions ?? [])
      }
    });
  },

  async update(prisma: PrismaClient, tenantId: string, id: string, data: Record<string, unknown>) {
    const existing = await (prisma as any).shippingRule.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    return (prisma as any).shippingRule.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        isActive: data.isActive,
        priority: data.priority,
        conditions: data.conditions === undefined ? undefined : json(data.conditions),
        actions: data.actions === undefined ? undefined : json(data.actions)
      }
    });
  },

  async remove(prisma: PrismaClient, tenantId: string, id: string) {
    const existing = await (prisma as any).shippingRule.findFirst({ where: { id, tenantId } });
    if (!existing) return false;
    await (prisma as any).shippingRule.delete({ where: { id: existing.id } });
    return true;
  },

  async evaluateForBooking(prisma: PrismaClient, tenantId: string, shipmentData: Parameters<typeof buildShipmentRuleContext>[0]) {
    const rules = await (prisma as any).shippingRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
    });
    const context = buildShipmentRuleContext(shipmentData);
    return evaluateShippingRules(rules, context)[0] ?? null;
  },

  async test(prisma: PrismaClient, tenantId: string, id: string, shipmentData: Parameters<typeof buildShipmentRuleContext>[0]) {
    const rule = await (prisma as any).shippingRule.findFirst({ where: { id, tenantId } });
    if (!rule) return null;
    const context = buildShipmentRuleContext(shipmentData);
    const matches = evaluateShippingRules([rule], context, { evaluateAll: true });
    return {
      dryRun: true,
      matched: matches.length > 0,
      matchedRules: matches.map((match) => ({
        id: match.rule.id,
        name: match.rule.name,
        priority: match.rule.priority,
        actions: match.actions
      }))
    };
  }
};
