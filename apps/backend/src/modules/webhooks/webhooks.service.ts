import type { PrismaClient } from '@prisma/client';

export const webhooksService = {
  async list(prisma: PrismaClient, tenantId: string) {
    return prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });
  },
  async create(prisma: PrismaClient, tenantId: string, data: { url: string; events: string[] }) {
    return prisma.webhookEndpoint.create({
      data: {
        tenantId,
        url: data.url,
        secret: 'whsec_' + Math.random().toString(36).slice(2),
        events: data.events ?? [],
        isActive: true
      }
    });
  },
  async listDeliveries(prisma: PrismaClient, tenantId: string) {
    return prisma.webhookDelivery.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }
};