import type { FastifyRequest } from 'fastify';
import { brandingService } from './branding.service.js';
import { domainService } from './domain.service.js';
import { planService } from './plan.service.js';
import { usageService } from './usage.service.js';

function serializePaymentIntegrations(
  paymentGatewayKey?: string,
  paymentIntegrations?: unknown
) {
  if (paymentIntegrations !== undefined) {
    return JSON.stringify(paymentIntegrations);
  }

  return paymentGatewayKey;
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
      plan: planOverride?.plan ?? tenant.plan,
      billingPlan: tenant.plan,
      activePlanOverride: planOverride,
      featureFlags,
      settings
    };
  },
  updateBranding: async (req: FastifyRequest, payload: { primaryColor: string; accentColor?: string; brandName: string; logoUrl?: string }) => {
    const tenant = req.tenant;
    if (!tenant) throw new Error('Tenant context required');
    return brandingService.updateBranding(req.server.prisma, tenant.id, payload);
  },
  updateSettings: async (
    req: FastifyRequest,
    payload: {
      timezone?: string;
      currency?: string;
      notificationEmail?: string;
      smsEnabled?: boolean;
      paymentGateway?: string;
      paymentGatewayKey?: string;
      paymentIntegrations?: unknown;
    }
  ) => {
    const tenant = req.tenant;
    if (!tenant) throw new Error('Tenant context required');

    const serializedPaymentIntegrations = serializePaymentIntegrations(
      payload.paymentGatewayKey,
      payload.paymentIntegrations
    );

    return req.server.prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        timezone: payload.timezone ?? tenant.timezone,
        currency: payload.currency ?? tenant.defaultCurrency,
        notificationEmail: payload.notificationEmail,
        smsEnabled: payload.smsEnabled ?? false,
        paymentGateway: payload.paymentGateway ?? 'STRIPE',
        paymentGatewayKey: serializedPaymentIntegrations
      },
      update: {
        timezone: payload.timezone,
        currency: payload.currency,
        notificationEmail: payload.notificationEmail,
        smsEnabled: payload.smsEnabled,
        paymentGateway: payload.paymentGateway,
        paymentGatewayKey: serializedPaymentIntegrations
      }
    });
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
    return usageService.getOnboarding(req.server.prisma, tenant);
  },
  getPlanFeatures: async (req: FastifyRequest) => {
    const tenant = req.tenant;
    if (!tenant) throw new Error('Tenant context required');
    return planService.getFeatures(tenant.plan);
  }
};
