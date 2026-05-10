import { Prisma, type PrismaClient } from '@prisma/client';

export const carrierAccountService = {
  async list(prisma: PrismaClient, tenantId: string) {
    return prisma.carrierAccount.findMany({
      where: { tenantId },
      include: { serviceLevels: { orderBy: { transitDays: 'asc' } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
    });
  },

  async active(prisma: PrismaClient, tenantId: string) {
    return prisma.carrierAccount.findMany({
      where: { tenantId, isActive: true },
      include: { serviceLevels: { where: { isActive: true }, orderBy: { transitDays: 'asc' } } },
      orderBy: { name: 'asc' }
    });
  },

  async create(
    prisma: PrismaClient,
    tenantId: string,
    data: {
      name: string;
      carrier: string;
      credentials: Record<string, unknown>;
      isActive?: boolean;
      serviceLevels?: Array<{ name: string; transitDays: number; regions: string[]; isActive?: boolean }>;
    }
  ) {
    return prisma.carrierAccount.create({
      data: {
        tenantId,
        name: data.name,
        carrier: data.carrier,
        credentials: data.credentials as Prisma.InputJsonValue,
        isActive: data.isActive ?? true,
        serviceLevels: data.serviceLevels?.length
          ? {
              create: data.serviceLevels.map((level) => ({
                tenantId,
                name: level.name,
                transitDays: level.transitDays,
                regions: level.regions,
                isActive: level.isActive ?? true
              }))
            }
          : undefined
      },
      include: { serviceLevels: true }
    });
  },

  async update(
    prisma: PrismaClient,
    tenantId: string,
    id: string,
    data: {
      name?: string;
      carrier?: string;
      credentials?: Record<string, unknown>;
      isActive?: boolean;
    }
  ) {
    const existing = await prisma.carrierAccount.findFirst({ where: { id, tenantId } });
    if (!existing) return null;

    return prisma.carrierAccount.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        carrier: data.carrier,
        credentials: data.credentials ? (data.credentials as Prisma.InputJsonValue) : undefined,
        isActive: data.isActive
      },
      include: { serviceLevels: true }
    });
  },

  async remove(prisma: PrismaClient, tenantId: string, id: string) {
    const existing = await prisma.carrierAccount.findFirst({ where: { id, tenantId } });
    if (!existing) return false;
    await prisma.carrierAccount.update({ where: { id: existing.id }, data: { isActive: false } });
    return true;
  }
};
