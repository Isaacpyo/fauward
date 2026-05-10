import type { PrismaClient, TenantPlan } from '@prisma/client';

export async function getActiveTenantPlanOverride(prisma: PrismaClient, tenantId: string, now = new Date()) {
  return prisma.tenantPlanOverride.findFirst({
    where: {
      tenantId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function resolveEffectiveTenantPlan(prisma: PrismaClient, tenant: { id: string; plan: TenantPlan }, now = new Date()) {
  const override = await getActiveTenantPlanOverride(prisma, tenant.id, now);
  return {
    billingPlan: tenant.plan,
    effectivePlan: override?.plan ?? tenant.plan,
    override
  };
}
