import type { PrismaClient, Tenant } from '@prisma/client';

function getCurrentMonth(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function hasConnectedPaymentGateway(rawValue?: string | null) {
  if (!rawValue) return false;

  try {
    const parsed = JSON.parse(rawValue) as {
      providers?: Record<string, { enabled?: boolean } | undefined>;
    };
    const providers = Object.values(parsed.providers ?? {});
    if (providers.length === 0) {
      return false;
    }
    return providers.some((provider) => provider?.enabled);
  } catch {
    return rawValue.trim().length > 0;
  }
}

export const usageService = {
  async checkAndIncrement(prisma: PrismaClient, tenant: Tenant, type: 'shipments' | 'apiCalls' | 'smsSent') {
    const month = getCurrentMonth();
    const usage = await prisma.usageRecord.findUnique({
      where: { tenantId_month: { tenantId: tenant.id, month } }
    });
    const current = (usage as any)?.[type] ?? 0;

    if (type === 'shipments') {
      const limit = tenant.maxShipmentsPm;
      if (limit !== -1 && current >= limit) {
        if (tenant.plan === 'PRO') {
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
    const limit = tenant.maxShipmentsPm;
    const percent = limit > 0 ? Math.round((shipmentsUsed / limit) * 100) : 0;

    return {
      month,
      shipments: {
        used: shipmentsUsed,
        limit,
        percent
      }
    };
  },

  async getOnboarding(prisma: PrismaClient, tenant: Tenant) {
    const [settings, shipmentCount, staffCount] = await Promise.all([
      prisma.tenantSettings.findUnique({ where: { tenantId: tenant.id } }),
      prisma.shipment.count(),
      prisma.user.count({ where: { tenantId: tenant.id, role: { notIn: ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] } } })
    ]);

    const checklist = {
      logoUploaded: !!tenant.logoUrl,
      colourSet: tenant.primaryColor !== '#0D1F3C',
      firstShipmentCreated: shipmentCount > 0,
      staffInvited: staffCount > 1,
      paymentConnected: hasConnectedPaymentGateway(settings?.paymentGatewayKey),
      customDomain: !!tenant.domainVerified,
      apiKeyGenerated: false
    };

    const values = Object.values(checklist);
    const completeCount = values.filter(Boolean).length;
    const percentComplete = Math.round((completeCount / values.length) * 100);

    return { ...checklist, percentComplete };
  }
};
