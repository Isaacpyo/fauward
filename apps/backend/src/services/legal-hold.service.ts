import type { PrismaClient } from '@prisma/client';

export async function activeLegalHoldForTenant(prisma: PrismaClient, tenantId: string | undefined | null) {
  if (!tenantId) return null;

  return prisma.legalHold.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [{ tenantId }, { tenantId: null }]
    },
    select: { id: true, tenantId: true, reason: true }
  });
}

