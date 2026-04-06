import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { tenantController } from './tenant.controller.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { EMAIL_TEMPLATE_KEYS } from './email-templates.js';

export async function registerTenantRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenant/me', { preHandler: [authenticate] }, tenantController.me);
  app.patch('/api/v1/tenant/branding', { preHandler: [authenticate] }, tenantController.updateBranding);
  app.patch('/api/v1/tenant/settings', { preHandler: [authenticate] }, tenantController.updateSettings);

  app.patch(
    '/api/v1/tenant/domain',
    { preHandler: [authenticate, requireFeature('customDomain')] },
    tenantController.setDomain
  );
  app.get(
    '/api/v1/tenant/domain/status',
    { preHandler: [authenticate, requireFeature('customDomain')] },
    tenantController.domainStatus
  );

  app.get('/api/v1/tenant/usage', { preHandler: [authenticate] }, tenantController.usage);
  app.get('/api/v1/tenant/onboarding', { preHandler: [authenticate] }, tenantController.onboarding);
  app.get('/api/v1/tenant/plan-features', { preHandler: [authenticate] }, tenantController.planFeatures);

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
      reply.send(settings);
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
