import type { Prisma, PrismaClient } from '@prisma/client';

export type BrandingPayload = {
  primaryColor: string;
  accentColor?: string;
  brandName: string;
  logoUrl?: string;
  supportEmail?: string;
  trackingHeadline?: string;
};

export type BrandingBeforeAfter = {
  primaryColor: string | null;
  accentColor: string | null;
  brandName: string | null;
  logoUrl: string | null;
  trackingHeadline: string | null;
  supportEmail: string | null;
};

const TENANT_FIELDS = {
  primaryColor: true,
  accentColor: true,
  brandName: true,
  logoUrl: true,
  trackingHeadline: true
} satisfies Prisma.TenantSelect;

export const brandingService = {
  async getBrandingSnapshot(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<BrandingBeforeAfter> {
    const [tenant, settings] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: TENANT_FIELDS
      }),
      prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { notificationEmail: true }
      })
    ]);
    return {
      primaryColor: tenant.primaryColor ?? null,
      accentColor: tenant.accentColor ?? null,
      brandName: tenant.brandName ?? null,
      logoUrl: tenant.logoUrl ?? null,
      trackingHeadline: tenant.trackingHeadline ?? null,
      supportEmail: settings?.notificationEmail ?? null
    };
  },

  async updateBranding(
    prisma: PrismaClient,
    tenantId: string,
    payload: BrandingPayload
  ) {
    // Empty string from the UI clears the field; undefined leaves it unchanged.
    const clearable = <T>(v: T | '' | undefined): T | null | undefined =>
      v === undefined ? undefined : v === '' ? null : (v as T);

    const tenantData: Prisma.TenantUpdateInput = {
      primaryColor: payload.primaryColor,
      brandName: payload.brandName
    };
    if (payload.accentColor !== undefined) tenantData.accentColor = payload.accentColor;
    const logoUrl = clearable(payload.logoUrl);
    if (logoUrl !== undefined) tenantData.logoUrl = logoUrl;
    const trackingHeadline = clearable(payload.trackingHeadline);
    if (trackingHeadline !== undefined) tenantData.trackingHeadline = trackingHeadline;

    const supportEmail = clearable(payload.supportEmail);

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.tenant.update({ where: { id: tenantId }, data: tenantData })
    ];
    if (supportEmail !== undefined) {
      ops.push(
        prisma.tenantSettings.upsert({
          where: { tenantId },
          create: { tenantId, notificationEmail: supportEmail ?? undefined },
          update: { notificationEmail: supportEmail }
        })
      );
    }

    const [updatedTenant] = await prisma.$transaction(ops);
    return updatedTenant;
  }
};
