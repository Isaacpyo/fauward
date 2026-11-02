import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { TrialError, requestExtension, tenantRequestBody, tenantTrialStatus } from '../../services/trials.service.js';

// gtm.trials tenant touchpoint (WP-4.14): the trial banner shows the trial end and the latest extension request; a
// TENANT_ADMIN asks for up to 14 more days with a reason. One pending request per tenant; staff decide in the console.

export async function registerTenantTrialExtensionRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenants/me/trial-extension-request', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    return reply.send(await tenantTrialStatus(app, tenantId));
  });

  app.post('/api/v1/tenants/me/trial-extension-request', { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] }, async (request, reply) => {
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    const userId = request.user?.sub;
    if (!tenantId || !userId) return reply.status(400).send({ error: 'Tenant context required' });
    const parsed = tenantRequestBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    try {
      return reply.status(201).send(await requestExtension(app, request, { tenantId, userId, body: parsed.data }));
    } catch (error) {
      if (error instanceof TrialError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      throw error;
    }
  });
}
