import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';

const TENANT_ADMIN_ROLES = ['TENANT_ADMIN', 'TENANT_MANAGER'] as const;

function tenantIdFrom(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function inDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function registerDsarRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/tenants/me/dsar',
    { preHandler: [authenticate, requireRole([...TENANT_ADMIN_ROLES])] },
    async (request, reply) => {
      const tenantId = tenantIdFrom(request, reply);
      if (!tenantId) return;

      const requests = await app.prisma.dSARRequest.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      reply.send({ requests });
    }
  );

  app.post(
    '/api/v1/tenants/me/dsar',
    { preHandler: [authenticate, requireRole([...TENANT_ADMIN_ROLES])] },
    async (request, reply) => {
      const tenantId = tenantIdFrom(request, reply);
      if (!tenantId) return;

      const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
      const requesterEmail = typeof body.requesterEmail === 'string' ? body.requesterEmail.trim().toLowerCase() : '';
      const requesterName = typeof body.requesterName === 'string' ? body.requesterName.trim() : '';
      const relation = typeof body.relation === 'string' ? body.relation.trim().toUpperCase() : 'OTHER';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      if (!requesterEmail || !description) {
        return reply.status(400).send({ error: 'requesterEmail and description are required' });
      }

      const dsar = await app.prisma.dSARRequest.create({
        data: {
          tenantId,
          requesterEmail,
          requestType: 'ACCESS',
          status: 'RECEIVED',
          notes: JSON.stringify({ requesterName, relation, description, submittedBy: request.user?.sub ?? null }),
          dueAt: inDays(30)
        }
      });
      await app.prisma.dSARTransition.create({
        data: {
          dsarId: dsar.id,
          fromStatus: null,
          toStatus: 'RECEIVED',
          actorId: request.user?.sub ?? 'tenant_user',
          notes: 'Tenant portal submission'
        }
      });

      reply.status(201).send(dsar);
    }
  );

  app.get(
    '/api/v1/tenants/me/dsar/:id',
    { preHandler: [authenticate, requireRole([...TENANT_ADMIN_ROLES])] },
    async (request, reply) => {
      const tenantId = tenantIdFrom(request, reply);
      if (!tenantId) return;
      const { id } = request.params as { id: string };

      const dsar = await app.prisma.dSARRequest.findFirst({
        where: { id, tenantId },
        include: { transitions: { orderBy: { createdAt: 'asc' } } }
      });
      if (!dsar) return reply.status(404).send({ error: 'DSAR request not found' });

      reply.send({
        ...dsar,
        downloadUrl: ['READY', 'DELIVERED'].includes(dsar.status) ? dsar.exportUrl : null
      });
    }
  );
}
