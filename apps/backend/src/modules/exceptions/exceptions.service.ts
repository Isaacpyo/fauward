import type { PrismaClient } from '@prisma/client';

export const exceptionsService = {
  list(prisma: PrismaClient, tenantId: string) {
    return (prisma as any).exceptionCase.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });
  },

  get(prisma: PrismaClient, tenantId: string, id: string) {
    return (prisma as any).exceptionCase.findFirst({ where: { id, tenantId } });
  },

  async resolve(prisma: PrismaClient, tenantId: string, id: string, notes?: string) {
    const existing = await this.get(prisma, tenantId, id);
    if (!existing) return null;
    return (prisma as any).exceptionCase.update({
      where: { id: existing.id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), notes: notes ?? existing.notes }
    });
  },

  listSlaPolicies(prisma: PrismaClient, tenantId: string) {
    return (prisma as any).slaPolicy.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
  },

  createSlaPolicy(prisma: PrismaClient, tenantId: string, data: Record<string, unknown>) {
    return (prisma as any).slaPolicy.create({ data: { tenantId, ...data } });
  }
};
