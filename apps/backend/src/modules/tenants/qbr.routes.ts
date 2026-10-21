import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { tenantSharedDeck } from '../../services/qbr.service.js';

// customer.qbr tenant touchpoint (WP-4.9): a deck Fauward shared with this workspace, for its admins.

export async function registerTenantQbrRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenants/me/qbr/:id', { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] }, async (request, reply) => {
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const { id } = request.params as { id: string };
    const deck = await tenantSharedDeck(app, tenantId, id);
    if (!deck) return reply.status(404).send({ error: 'NOT_FOUND', message: 'This review is not available' });
    return reply.send(deck);
  });
}
