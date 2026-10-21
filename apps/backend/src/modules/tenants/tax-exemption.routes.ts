import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { TaxError, exemptionUploadBody, submitExemption, tenantExemptionStatus } from '../../services/tax.service.js';

// revenue.tax tenant touchpoint (WP-4.7): Billing → "Tax exemption". The tenant uploads a certificate (PDF, PNG or JPEG,
// up to 5 MB) and sees its status; Fauward staff decide it in the console.

const billingRoles = requireRole(['TENANT_ADMIN', 'TENANT_FINANCE']);

export async function registerTenantTaxExemptionRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenants/me/tax-exemption', { preHandler: [authenticate, billingRoles] }, async (request, reply) => {
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    return reply.send(await tenantExemptionStatus(app, tenantId));
  });

  app.post('/api/v1/tenants/me/tax-exemption', { preHandler: [authenticate, billingRoles] }, async (request, reply) => {
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    const userId = request.user?.sub;
    if (!tenantId || !userId) return reply.status(400).send({ error: 'Tenant context required' });
    const parsed = exemptionUploadBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    try {
      return reply.status(201).send(await submitExemption(app, request, { tenantId, userId, body: parsed.data }));
    } catch (error) {
      if (error instanceof TaxError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      throw error;
    }
  });
}
