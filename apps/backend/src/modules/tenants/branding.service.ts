import type { PrismaClient } from '@prisma/client';

export const brandingService = {
  async updateBranding(
    prisma: PrismaClient,
    tenantId: string,
    payload: { primaryColor: string; accentColor?: string; brandName: string; logoUrl?: string }
  ) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: {
        primaryColor: payload.primaryColor,
        accentColor: payload.accentColor ?? undefined,
        brandName: payload.brandName,
        logoUrl: payload.logoUrl
      }
    });
  }
};