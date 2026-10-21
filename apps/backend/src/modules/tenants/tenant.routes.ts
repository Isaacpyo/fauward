import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { tenantController } from './tenant.controller.js';
import { publicSettings } from './tenant.service.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { EMAIL_TEMPLATE_KEYS } from './email-templates.js';
import { config } from '../../config/index.js';
import { REGIONS } from '../../config/regions.js';
import { RegionChangeError, presentRegionRequest, requestRegionChange } from '../../services/region-change.service.js';
import { registerDomainRoutes } from './domain.routes.js';
import { registerTenantSlugRoutes } from './slug.routes.js';
import { registerPaymentGatewayRoutes } from './payment-gateways.routes.js';
import { registerStaffAccessRoutes } from './staff-access.routes.js';
import { registerTenantPlatformInvoiceRoutes } from './platform-invoices.routes.js';
import { registerTenantTaxExemptionRoutes } from './tax-exemption.routes.js';
import { registerTenantTrialExtensionRoutes } from './trial-extension.routes.js';
import { registerTenantQbrRoutes } from './qbr.routes.js';
import { registerTenantVerificationRoutes } from './verification.routes.js';
import { registerPlanChangeRoutes } from './plan-change.routes.js';
import { loadRequestEntitlements } from '../../shared/middleware/entitlements.js';

export async function registerTenantRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenant/me', { preHandler: [authenticate] }, tenantController.me);
  app.get('/api/v1/tenants/me', { preHandler: [authenticate] }, tenantController.me);
  // What the tenant may use right now (WP-1.4): effective plan, plan override, features with their source, limits.
  // The portal's PlanGate reads this instead of the static plan table.
  app.get('/api/v1/tenants/me/entitlements', { preHandler: [authenticate] }, async (request, reply) => {
    const entitlements = await loadRequestEntitlements(request);
    if (!entitlements) return reply.status(400).send({ error: 'Tenant context required' });
    return reply.send(entitlements);
  });
  app.patch(
    '/api/v1/tenant/branding',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] },
    tenantController.updateBranding
  );
  app.patch('/api/v1/tenant/settings', { preHandler: [authenticate] }, tenantController.updateSettings);

  async function exitImpersonation(request: FastifyRequest, reply: FastifyReply) {
    const sessionId = request.user?.impersonationSessionId;
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    if (!sessionId || request.user?.mode !== 'IMPERSONATION') {
      return reply.send({ redirectUrl: `https://admin.${config.platformDomain}/platform/tenants/${tenantId ?? ''}` });
    }

    const now = new Date();
    await app.prisma.platformImpersonationSession.updateMany({
      where: { id: sessionId, targetTenantId: tenantId, revokedAt: null, endedAt: null },
      data: { revokedAt: now, endedAt: now, endedReason: 'LOGOUT' }
    });
    await app.redis.del(`platform:impersonation:${sessionId}`);
    reply.send({ redirectUrl: `https://admin.${config.platformDomain}/platform/tenants/${tenantId}` });
  }

  app.post('/api/v1/tenant/impersonation/exit', { preHandler: [authenticate] }, exitImpersonation);
  app.post('/api/v1/tenants/me/impersonation/exit', { preHandler: [authenticate] }, exitImpersonation);

  await registerDomainRoutes(app);
  await registerTenantSlugRoutes(app);
  await registerStaffAccessRoutes(app);
  await registerPaymentGatewayRoutes(app);
  await registerTenantPlatformInvoiceRoutes(app);
  await registerTenantTaxExemptionRoutes(app);
  await registerTenantTrialExtensionRoutes(app);
  await registerTenantQbrRoutes(app);
  await registerTenantVerificationRoutes(app);
  await registerPlanChangeRoutes(app);

  app.get('/api/v1/tenant/usage', { preHandler: [authenticate] }, tenantController.usage);
  app.get('/api/v1/tenant/onboarding', { preHandler: [authenticate] }, tenantController.onboarding);
  app.get('/api/v1/tenant/plan-features', { preHandler: [authenticate] }, tenantController.planFeatures);

  // L5 (WP-2.6): current region, the regions on offer and this tenant's latest request.
  app.get('/api/v1/tenant/region-change-requests', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const [tenant, latest] = await Promise.all([
      app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { region: true } }),
      app.prisma.regionChangeRequest.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
    ]);
    return reply.send({ current: tenant?.region ?? null, regions: REGIONS, latest: latest ? presentRegionRequest(latest) : null });
  });

  app.post('/api/v1/tenant/region-change-requests', { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const { requestedRegion } = (request.body ?? {}) as { requestedRegion?: unknown };
    if (typeof requestedRegion !== 'string' || !requestedRegion) return reply.status(400).send({ error: 'VALIDATION', message: 'requestedRegion is required' });
    try {
      const regionRequest = await requestRegionChange(app, request, { tenantId, requestedRegion, userId: request.user?.sub ?? 'unknown', actorLabel: request.user?.email ?? 'Tenant admin' });
      return reply.status(201).send({ request: regionRequest });
    } catch (error) {
      if (error instanceof RegionChangeError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      throw error;
    }
  });

  app.get('/api/v1/tenant/email-templates', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const configs = await app.prisma.emailTemplateConfig.findMany({
      where: { tenantId }
    });
    const byKey = new Map(configs.map((item) => [item.templateKey, item]));

    reply.send({
      templates: EMAIL_TEMPLATE_KEYS.map((key) => ({
        key,
        isEnabled: byKey.get(key)?.isEnabled ?? true,
        customSubject: byKey.get(key)?.customSubject ?? null
      }))
    });
  });

  app.patch(
    '/api/v1/tenant/email-templates/:key',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const { key } = request.params as { key: string };
      const { isEnabled, customSubject } = request.body as {
        isEnabled?: boolean;
        customSubject?: string | null;
      };

      if (!EMAIL_TEMPLATE_KEYS.includes(key as any)) {
        return reply.status(400).send({ error: 'Invalid template key' });
      }

      const config = await app.prisma.emailTemplateConfig.upsert({
        where: { tenantId_templateKey: { tenantId, templateKey: key } },
        create: {
          tenantId,
          templateKey: key,
          isEnabled: isEnabled ?? true,
          customSubject: customSubject ?? null
        },
        update: {
          isEnabled,
          customSubject
        }
      });
      reply.send(config);
    }
  );

  app.patch(
    '/api/v1/tenant/email-settings',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const { fromName, replyTo, opsRecipients } = request.body as {
        fromName?: string;
        replyTo?: string;
        opsRecipients?: string[] | string;
      };

      const recipients = Array.isArray(opsRecipients)
        ? opsRecipients
        : typeof opsRecipients === 'string'
          ? opsRecipients
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined;

      const settings = await app.prisma.tenantSettings.upsert({
        where: { tenantId },
        create: {
          tenantId,
          emailFromName: fromName,
          emailReplyTo: replyTo,
          opsEmailRecipients: recipients ?? []
        },
        update: {
          emailFromName: fromName,
          emailReplyTo: replyTo,
          opsEmailRecipients: recipients
        }
      });
      // Never echo the stored webhook secret (CC6.6, WP-5.3).
      reply.send(publicSettings(settings));
    }
  );

  app.post(
    '/api/v1/tenant/email-templates/:key/test',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const { key } = request.params as { key: string };
      if (!EMAIL_TEMPLATE_KEYS.includes(key as any)) {
        return reply.status(400).send({ error: 'Invalid template key' });
      }
      reply.send({
        success: true,
        message: `Test email queued for template "${key}"`,
        recipient: request.user?.email
      });
    }
  );
}
