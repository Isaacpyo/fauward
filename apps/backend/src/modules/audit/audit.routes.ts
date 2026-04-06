import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';

export async function registerAuditRoutes(app: FastifyInstance) {
  app.get('/api/v1/audit-log', { preHandler: [authenticate, requireFeature('auditLog')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const { page = '1', limit = '50' } = req.query as { page?: string; limit?: string };
      const take = Math.min(100, Number(limit));
      const skip = (Number(page) - 1) * take;

      const [events, total] = await Promise.all([
        app.prisma.auditLog.findMany({
          where: { tenantId },
          orderBy: { timestamp: 'desc' },
          include: { actor: true },
          take,
          skip
        }),
        app.prisma.auditLog.count({ where: { tenantId } })
      ]);

      reply.send({
        events,
        total,
        totalPages: Math.ceil(total / take)
      });
    });
}