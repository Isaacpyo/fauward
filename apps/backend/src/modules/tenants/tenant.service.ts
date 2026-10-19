import type { FastifyRequest } from 'fastify';
import type { Prisma, TenantSettings } from '@prisma/client';
import { brandingService, type BrandingPayload } from './branding.service.js';
import { domainService } from './domain.service.js';
import { planService } from './plan.service.js';
import { usageService } from './usage.service.js';
import { markOnboardingStep, onboardingChecklist } from '../../services/onboarding.service.js';

/** Settings as the tenant sees them: gateway keys live in TenantPaymentGateway (WP-2.12) and secrets never leave the API. */
function publicSettings(settings: TenantSettings | null) {
  if (!settings) return null;
  const { webhookSecret, ...rest } = settings;
  return { ...rest, paymentGatewayKey: undefined, webhookSecretSet: Boolean(webhookSecret) };
}

export const tenantService = {
  getCurrentTenant: async (req: FastifyRequest) => {
    const tenant = req.tenant;
    if (!tenant) throw new Error('Tenant context required');
    const now = new Date();
    const [settings, planOverride, flagAudits] = await Promise.all([
      req.server.prisma.tenantSettings.findUnique({
        where: { tenantId: tenant.id }
      }),
      req.server.prisma.tenantPlanOverride.findFirst({
        where: {
          tenantId: tenant.id,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
        },
        orderBy: { createdAt: 'desc' }
      }),
      req.server.prisma.featureFlagOverrideAudit.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        take: 100
      })
    ]);
    const featureFlags = flagAudits.reduce<Record<string, boolean>>((acc, audit) => {
      if (acc[audit.flagKey] === undefined) {
        acc[audit.flagKey] = audit.value === true;
      }
      return acc;
    }, {});
    return {
      ...tenant,
      displayName: tenant.brandName ?? tenant.name,
      branding: {
        primary: tenant.primaryColor,
        accent: tenant.accentColor,
        radius: '8px',
        logoUrl: tenant.logoUrl
      },
      plan: planOverride?.plan ?? tenant.plan,
      billingPlan: tenant.plan,
      activePlanOverride: planOverride,
      featureFlags,
      settings: publicSettings(settings)
    };
  },
  updateBranding: async (req: FastifyRequest, payload: BrandingPayload) => {
    const tenant = req.tenant;
    if (!tenant) throw new Error('Tenant context required');

    const before = await brandingService.getBrandingSnapshot(req.server.prisma, tenant.id);
    const updated = await brandingService.updateBranding(req.server.prisma, tenant.id, payload);
    const after = await brandingService.getBrandingSnapshot(req.server.prisma, tenant.id);
    await markOnboardingStep({ prisma: req.server.prisma, redis: req.server.redis, log: req.log }, tenant.id, 'BRANDING_SET');

    const diff: Record<string, { before: unknown; after: unknown }> = {};
    (Object.keys(after) as Array<keyof typeof after>).forEach((key) => {
      if (before[key] !== after[key]) diff[key] = { before: before[key], after: after[key] };
    });

    if (Object.keys(diff).length > 0) {
      await req.server.prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: req.user?.sub ?? null,
          actorType: req.apiKey ? 'API_KEY' : 'USER',
          actorIp: req.ip,
          action: 'BRANDING_UPDATED',
          resourceType: 'TENANT_BRANDING',
          resourceId: tenant.id,
          beforeState: before as unknown as Prisma.InputJsonValue,
          afterState: after as unknown as Prisma.InputJsonValue,
          metadata: { diff } as unknown as Prisma.InputJsonValue
        }
      });
    }

    return updated;
  },
  updateSettings: async (
    req: FastifyRequest,
    payload: {
      timezone?: string;
      currency?: string;
      notificationEmail?: string;
      smsEnabled?: boolean;
    }
  ) => {
    const tenant = req.tenant;
    if (!tenant) throw new Error('Tenant context required');

    const settings = await req.server.prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        timezone: payload.timezone ?? tenant.timezone,
        currency: payload.currency ?? tenant.defaultCurrency,
        notificationEmail: payload.notificationEmail,
        smsEnabled: payload.smsEnabled ?? false
      },
      update: {
        timezone: payload.timezone,
        currency: payload.currency,
        notificationEmail: payload.notificationEmail,
        smsEnabled: payload.smsEnabled
      }
    });
    return publicSettings(settings);
  },
  setDomain: async (req: FastifyRequest, domain: string) => {
    const tenant = req.tenant;
    if (!tenant) throw new Error('Tenant context required');
    return domainService.setCustomDomain(req.server.prisma, {
      tenantId: tenant.id,
      domain,
      actorUserId: req.apiKey ? null : req.user?.sub ?? null,
      actorIp: req.ip,
      actorType: req.apiKey ? 'API_KEY' : 'USER'
    });
  },
  domainStatus: async (req: FastifyRequest) => {
    const tenant = req.tenant;
    if (!tenant) throw new Error('Tenant context required');
    return domainService.checkStatus(req.server.prisma, tenant.id);
  },
  getUsage: async (req: FastifyRequest) => {
    const tenant = req.tenant;
    if (!tenant) throw new Error('Tenant context required');
    return usageService.getUsage(req.server.prisma, tenant);
  },
  getOnboarding: async (req: FastifyRequest) => {
    const tenant = req.tenant;
    if (!tenant) throw new Error('Tenant context required');
    return onboardingChecklist(req.server.prisma, tenant.id);
  },
  getPlanFeatures: async (req: FastifyRequest) => {
    const tenant = req.tenant;
    if (!tenant) throw new Error('Tenant context required');
    return planService.getFeatures(tenant.plan);
  }
};
