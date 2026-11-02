import type { FastifyInstance } from 'fastify';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { IntegrationError, checkProviderNow, getProviderDetail, integrationCredentials, listIntegrations } from '../../../services/integration-health.service.js';

// platform.integrations (WP-4.3): provider health from the integration-health poll, one provider's history and recent
// errors, a manual check, and the credentials view (secret inventory rows tied to an integration). Tenant gateways and
// webhook failures/replay live in operations.routes.ts (WP-2.12, WP-2.13).

const read = [authenticatePlatformSession, requireConsolePermission('platform.integrations.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('platform.integrations.write')];

export async function registerConsoleIntegrationRoutes(app: FastifyInstance) {
  app.get('/api/internal/integrations', { preHandler: read }, async (_request, reply) => reply.send(await listIntegrations(app)));

  app.get('/api/internal/integrations/credentials', { preHandler: read }, async (_request, reply) => reply.send(await integrationCredentials(app)));

  app.get('/api/internal/integrations/:provider', { preHandler: read }, async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const detail = await getProviderDetail(app, provider);
    if (!detail) return reply.status(404).send({ error: 'UNKNOWN_PROVIDER', message: `Unknown provider ${provider}` });
    return reply.send(detail);
  });

  app.post('/api/internal/integrations/:provider/check', { preHandler: write }, async (request, reply) => {
    const { provider } = request.params as { provider: string };
    try {
      return reply.send(await checkProviderNow(app, request, provider));
    } catch (error) {
      if (error instanceof IntegrationError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      throw error;
    }
  });
}
