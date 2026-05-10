import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';
import { apiKeyService } from './api-keys.service.js';

export async function registerApiKeyRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenant/api-keys', { preHandler: [authenticate, requireFeature('apiAccess')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const keys = await apiKeyService.list(app.prisma, tenantId);
      reply.send(keys);
    });

  app.post('/api/v1/tenant/api-keys', { preHandler: [authenticate, requireFeature('apiAccess')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const body = req.body as { name?: string; scopes?: string[]; isSandbox?: boolean };
      const { key, record } = await apiKeyService.create(app.prisma, tenantId, body);
      reply.send({ key, record });
    });

  app.get('/api/v1/tenant/api-usage', { preHandler: [authenticate, requireFeature('apiAccess')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const usage = await apiKeyService.usage(app.prisma, tenantId);
      reply.send(usage);
    });

  app.delete('/api/v1/tenant/api-keys/:id', { preHandler: [authenticate, requireFeature('apiAccess')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const { id } = req.params as { id: string };
      await apiKeyService.revoke(app.prisma, tenantId, id);
      reply.status(204).send();
    });
}
