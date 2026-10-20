import type { PrismaClient } from '@prisma/client';

type ExceptionsDb = Pick<PrismaClient, 'exceptionCase' | 'slaPolicy'>;

// The tenant sees Fauward's replies on an escalated exception (L15, WP-2.11).
const withEscalation = {
  shipment: { select: { id: true, trackingNumber: true } },
  escalationReplies: { orderBy: { createdAt: 'asc' as const } }
};

export const exceptionsService = {
  list(prisma: ExceptionsDb, tenantId: string) {
    return prisma.exceptionCase.findMany({
      where: { tenantId },
      include: withEscalation,
      orderBy: { createdAt: 'desc' },
      take: 500
    });
  },

  get(prisma: ExceptionsDb, tenantId: string, id: string) {
    return prisma.exceptionCase.findFirst({ where: { id, tenantId }, include: withEscalation });
  },

  async resolve(prisma: ExceptionsDb, tenantId: string, id: string, notes?: string) {
    const existing = await prisma.exceptionCase.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    return prisma.exceptionCase.update({
      where: { id: existing.id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), notes: notes ?? existing.notes }
    });
  },

  listSlaPolicies(prisma: ExceptionsDb, tenantId: string) {
    return prisma.slaPolicy.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
  },

  createSlaPolicy(
    prisma: ExceptionsDb,
    tenantId: string,
    data: { name: string; serviceType?: string; pickupWindowHours: number; deliveryWindowHours: number; escalationHours: number; isDefault: boolean }
  ) {
    return prisma.slaPolicy.create({ data: { tenantId, ...data } });
  }
};
