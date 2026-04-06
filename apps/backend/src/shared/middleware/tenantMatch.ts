import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requireTenantMatch(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user;
  const tenant = request.tenant;

  if (!user) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (user.role === 'SUPER_ADMIN') {
    return;
  }

  if (!tenant || user.tenantId !== tenant.id) {
    return reply.status(403).send({ error: 'Forbidden' });
  }
}