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
}