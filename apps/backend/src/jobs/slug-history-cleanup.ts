import type { PrismaClient } from '@prisma/client';

export async function cleanupExpiredSlugHistory(prisma: PrismaClient) {
  const result = await prisma.tenantSlugHistory.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });

  return { deleted: result.count };
}
