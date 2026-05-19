import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requirePlan } from '../../shared/middleware/planGuard.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { domainController } from './domain.controller.js';

function tenantRateLimitKey(name: string) {
  return (request: FastifyRequest) => {
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    return `${name}:${tenantId ?? request.ip}`;
  };
}

export async function registerDomainRoutes(app: FastifyInstance) {
  const proPlan = requirePlan(['PRO', 'ENTERPRISE']);
  const domainAdmin = requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']);

  app.patch('/api/v1/tenant/domain', {
    preHandler: [
      app.authenticate,
      requireTenantMatch,
      domainAdmin,
      proPlan,
      app.rateLimit({
        max: 5,
        timeWindow: '1 hour',
        keyGenerator: tenantRateLimitKey('tenant-domain-write')
      })
    ]
  }, domainController.setDomain);

  app.get('/api/v1/tenant/domain/status', {
    preHandler: [
      app.authenticate,
      requireTenantMatch,
      domainAdmin,
      proPlan,
      app.rateLimit({
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: tenantRateLimitKey('tenant-domain-status')
      })
    ]
  }, domainController.domainStatus);

  app.delete('/api/v1/tenant/domain', {
    preHandler: [
      app.authenticate,
      requireTenantMatch,
      domainAdmin,
      proPlan,
      app.rateLimit({
        max: 5,
        timeWindow: '1 hour',
        keyGenerator: tenantRateLimitKey('tenant-domain-write')
      })
    ]
  }, domainController.removeDomain);
}
