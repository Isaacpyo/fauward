import type { PrismaClient } from '@prisma/client';

/**
 * The hold that blocks deleting or erasing this tenant's data, if any (WP-5.2): an ACTIVE hold on the tenant, or an
 * ACTIVE global hold (`tenantId` null and `appliesToAllTenants`). A released hold never blocks.
 */
export async function activeLegalHoldForTenant(prisma: Pick<PrismaClient, 'legalHold'>, tenantId: string | undefined | null) {
  if (!tenantId) return null;

  return prisma.legalHold.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [{ tenantId }, { tenantId: null, appliesToAllTenants: true }]
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, tenantId: true, appliesToAllTenants: true, reason: true }
  });
}
