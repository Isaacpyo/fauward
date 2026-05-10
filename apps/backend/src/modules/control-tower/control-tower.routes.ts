import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { controlTowerService } from './control-tower.service.js';

export async function registerControlTowerRoutes(app: FastifyInstance) {
  const platformGuard = { preHandler: [app.authenticate, requireRole(['SUPER_ADMIN'])] };

  app.get('/api/v1/platform/control-tower/health', platformGuard, async (_request, reply) => {
    reply.send({ metrics: await controlTowerService.metrics(app.prisma) });
  });

  app.get('/api/v1/platform/control-tower/tenants/:tenantId/health', platformGuard, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    reply.send(await controlTowerService.tenantHealth(app.prisma, tenantId));
  });
}
