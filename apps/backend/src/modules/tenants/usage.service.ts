import type { PrismaClient, Tenant } from '@prisma/client';
import { resolveTenantEntitlements } from '../../services/tenant-entitlements.service.js';

function getCurrentMonth(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export const usageService = {
  async checkAndIncrement(prisma: PrismaClient, tenant: Tenant, type: 'shipments' | 'apiCalls' | 'smsSent') {
    const month = getCurrentMonth();
    const usage = await prisma.usageRecord.findUnique({
      where: { tenantId_month: { tenantId: tenant.id, month } }
    });
    const current = (usage as any)?.[type] ?? 0;

    if (type === 'shipments') {
      // Effective limits (plan override, or limits Fauward staff set) — WP-1.2, C42.
      const entitlements = await resolveTenantEntitlements(prisma, tenant);
      const limit = entitlements.limits.maxShipmentsPm;
      if (limit !== -1 && current >= limit) {
        if (entitlements.effectivePlan === 'PRO') {
          return { allowed: true, overage: true };
        }
        return {
          allowed: false,
          overage: false,
          error: 'Monthly shipment limit reached',
          code: 'LIMIT_EXCEEDED',
          current,
          limit,
          upgradeUrl: 'https://fauward.com/upgrade'
        };
      }
    }

    await prisma.usageRecord.upsert({
      where: { tenantId_month: { tenantId: tenant.id, month } },
      create: { tenantId: tenant.id, month, [type]: 1 },
      update: { [type]: { increment: 1 } }
    });

    return { allowed: true, overage: false };
  },

  async getUsage(prisma: PrismaClient, tenant: Tenant) {
    const month = getCurrentMonth();
    const usage = await prisma.usageRecord.findUnique({
      where: { tenantId_month: { tenantId: tenant.id, month } }
    });
    const shipmentsUsed = usage?.shipments ?? 0;
    const limit = (await resolveTenantEntitlements(prisma, tenant)).limits.maxShipmentsPm;
    const percent = limit > 0 ? Math.round((shipmentsUsed / limit) * 100) : 0;

    return {
      month,
      shipments: {
        used: shipmentsUsed,
        limit,
        percent
      }
    };
  }
};
