import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { KycError, attachTenantDocument, evidenceBody, tenantVerification } from '../../services/kyc.service.js';

// trust.kyc tenant touchpoint (WP-4.10): Settings → Verification. A TENANT_ADMIN sees whether Fauward asked for
// verification documents and uploads them to the open review.

const admin = requireRole(['TENANT_ADMIN']);

export async function registerTenantVerificationRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenants/me/verification', { preHandler: [authenticate, admin] }, async (request, reply) => {
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    return reply.send(await tenantVerification(app, tenantId));
  });

  app.post('/api/v1/tenants/me/verification/documents', { preHandler: [authenticate, admin] }, async (request, reply) => {
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    const userId = request.user?.sub;
    if (!tenantId || !userId) return reply.status(400).send({ error: 'Tenant context required' });
    const parsed = evidenceBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    try {
      return reply.status(201).send(await attachTenantDocument(app, { tenantId, userId, userEmail: request.user?.email ?? null, body: parsed.data }));
    } catch (error) {
      if (error instanceof KycError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      throw error;
    }
  });
}
