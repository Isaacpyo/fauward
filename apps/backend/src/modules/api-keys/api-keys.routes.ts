import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';
import { presentApiKey, recordApiKeyCreated, revokeApiKey } from '../../services/api-key-revocation.service.js';
import { apiKeyService } from './api-keys.service.js';

function tenantActor(req: FastifyRequest) {
  const user = req.user;
  return { type: 'TENANT_USER' as const, id: user?.sub ?? 'unknown', label: user?.impersonator ? 'Fauward staff (via impersonation)' : user?.email ?? 'Tenant user' };
}

export async function registerApiKeyRoutes(app: FastifyInstance) {
  // Key hashes never leave the API (L9, WP-2.13).
  app.get('/api/v1/tenant/api-keys', { preHandler: [authenticate, requireFeature('apiAccess')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const keys = await apiKeyService.list(app.prisma, tenantId);
      reply.send(keys.map(presentApiKey));
    });

  app.post('/api/v1/tenant/api-keys', { preHandler: [authenticate, requireFeature('apiAccess')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const body = req.body as { name?: string; scopes?: string[]; isSandbox?: boolean };
      const { key, record } = await apiKeyService.create(app.prisma, tenantId, body);
      await recordApiKeyCreated(app, record, tenantActor(req));
      reply.send({ key, record: presentApiKey(record) });
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
      const result = await revokeApiKey(app, { tenantId, keyId: id, actor: tenantActor(req) });
      if (!result) return reply.status(404).send({ error: 'API key not found' });
      reply.status(204).send();
    });
}
