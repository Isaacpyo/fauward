import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { activeLegalHoldForTenant } from '../services/legal-hold.service.js';

/**
 * Tenant API: every DELETE on a tenant that an active legal hold covers answers 409 LEGAL_HOLD_ACTIVE (WP-5.2). Console
 * routes that delete tenant data (tenant close, DSAR erasure) check the same hold in their services.
 */
export function legalHoldDeleteGuard(app: Pick<FastifyInstance, 'prisma'>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.method !== 'DELETE' || !request.tenant?.id) return;
    const hold = await activeLegalHoldForTenant(app.prisma, request.tenant.id);
    if (hold) {
      return reply.status(409).send({ error: 'LEGAL_HOLD_ACTIVE', tenantId: request.tenant.id, holdId: hold.id });
    }
  };
}
