import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { exchangeShareToken, tenantDemoStatus } from '../../services/demos.service.js';

const INVALID = { error: 'DEMO_LINK_INVALID', message: 'This demo link has expired or was replaced. Ask your Fauward contact for a new one.' };

/**
 * gtm.demos tenant side (WP-4.15). The tenant portal's `/demo/<token>` page trades the share token for a read-only
 * session as the demo admin (public, the token is the credential, rate limited). The banner reads the demo status.
 */
export async function registerDemoExchangeRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/demo/exchange', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const token = (request.body as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string' || token.length < 16 || token.length > 200) return reply.status(400).send({ error: 'INVALID_TOKEN', message: 'token is required' });
    const session = await exchangeShareToken(app, token);
    if (!session) return reply.status(401).send(INVALID);
    request.log.info({ tenantId: session.tenant.id }, 'Demo share link exchanged');
    return reply.send(session);
  });

  app.get('/api/v1/tenants/me/demo', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    return reply.send(await tenantDemoStatus(app, tenantId, request.user?.mode));
  });
}
