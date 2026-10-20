import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { webhooksService } from '../../webhooks/webhooks.service.js';
import { presentConsoleGateway } from '../../../services/tenant-payment-gateway.service.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { writePlatformAuditLog } from '../../../services/platform-audit.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { platformAuditActor, reasonOf } from '../request-meta.js';

const gatewayListQuery = z.object({
  status: z.enum(['UNVERIFIED', 'VERIFIED', 'FAILED', 'DISABLED']).optional(),
  provider: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional()
});

// Tenant payment gateways and dead-lettered webhook deliveries (platform.integrations). Queues moved to queues.routes.ts
// (WP-3.6) and health to health.routes.ts (WP-3.7).

export async function registerConsoleOperationsRoutes(app: FastifyInstance) {
  // L11 (WP-2.12): tenant payment gateways across tenants — provider, mode, status, last error; never secrets.
  app.get('/api/internal/integrations/tenant-gateways', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.integrations.read')] }, async (request, reply) => {
    const parsed = gatewayListQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const rows = await app.prisma.tenantPaymentGateway.findMany({
      where: { ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.provider ? { provider: parsed.data.provider.toUpperCase() } : {}), ...(parsed.data.tenantId ? { tenantId: parsed.data.tenantId } : {}) },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 500
    });
    return reply.send({ data: rows.map((row) => ({ id: row.id, tenant: row.tenant, ...presentConsoleGateway(row) })) });
  });

  // Dead-lettered tenant webhook deliveries across tenants (was GET /api/v1/platform/webhooks/failures, tenant SUPER_ADMIN).
  app.get('/api/internal/integrations/webhooks/failures', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.integrations.read')] }, async (_request, reply) => {
    return reply.send({ failures: await webhooksService.platformFailures(app.prisma) });
  });

  // L10 (WP-2.13): staff replay a tenant's failed delivery; the worker re-sends the stored payload signed with the
  // endpoint's current secret and the tenant's delivery log shows the new attempt.
  app.post('/api/internal/integrations/webhooks/deliveries/:id/replay', { preHandler: dangerous('platform.integrations.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const delivery = await app.prisma.webhookDelivery.findUnique({ where: { id }, select: { id: true, tenantId: true, endpointId: true, eventType: true } });
    if (!delivery) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Webhook delivery not found' });
    const result = await webhooksService.replay(app.prisma, delivery.tenantId, delivery.endpointId, delivery.id);
    if (!result) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Webhook delivery not found' });
    const reason = reasonOf(request) ?? '';
    await writePlatformAuditLog(app.prisma, {
      ...platformAuditActor(request),
      actorType: 'PLATFORM_USER',
      action: 'TENANT_WEBHOOK_REPLAYED',
      targetTenantId: delivery.tenantId,
      reason,
      metadata: { deliveryId: delivery.id, replayDeliveryId: result.replayDeliveryId, endpointId: delivery.endpointId }
    });
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: app.log },
      {
        service: 'platform.integrations',
        type: 'webhook.replayed',
        tenantId: delivery.tenantId,
        ...staffActor(request),
        subjectType: 'webhook_delivery',
        subjectId: delivery.id,
        summary: `${delivery.eventType} delivery replayed by Fauward: ${reason}`,
        consoleLink: '/platform/integrations/webhooks'
      }
    );
    return reply.send(result);
  });
}
