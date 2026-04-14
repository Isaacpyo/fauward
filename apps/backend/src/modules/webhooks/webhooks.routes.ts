import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';
import { webhooksService } from './webhooks.service.js';

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenant/webhooks', { preHandler: [authenticate, requireFeature('webhooks')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const items = await webhooksService.list(app.prisma, tenantId);
      reply.send(items);
    });

  app.post('/api/v1/tenant/webhooks', { preHandler: [authenticate, requireFeature('webhooks')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const body = req.body as { url: string; events: string[] };
      const item = await webhooksService.create(app.prisma, tenantId, body);
      reply.send(item);
    });

  app.get('/api/v1/tenant/webhooks/deliveries', { preHandler: [authenticate, requireFeature('webhooks')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const items = await webhooksService.listDeliveries(app.prisma, tenantId);
      reply.send(items);
    });

  app.patch('/api/v1/tenant/webhooks/:id', { preHandler: [authenticate, requireFeature('webhooks')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const { id } = req.params as { id: string };
      const body = req.body as { url?: string; events?: string[]; isActive?: boolean };

      const updated = await webhooksService.update(app.prisma, tenantId, id, body);
      if (!updated) return reply.status(404).send({ error: 'Webhook endpoint not found' });
      reply.send(updated);
    });

  app.delete('/api/v1/tenant/webhooks/:id', { preHandler: [authenticate, requireFeature('webhooks')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const { id } = req.params as { id: string };

      const removed = await webhooksService.remove(app.prisma, tenantId, id);
      if (!removed) return reply.status(404).send({ error: 'Webhook endpoint not found' });
      reply.status(204).send();
    });

  app.post('/api/v1/tenant/webhooks/:id/test', { preHandler: [authenticate, requireFeature('webhooks')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const { id } = req.params as { id: string };
      const body = req.body as { payload?: Record<string, unknown>; eventType?: string } | undefined;

      const result = await webhooksService.sendTest(
        app.prisma,
        tenantId,
        id,
        body?.payload,
        body?.eventType ?? 'webhook.test'
      );
      if (!result) return reply.status(404).send({ error: 'Webhook endpoint not found' });
      reply.send(result);
    });
}
