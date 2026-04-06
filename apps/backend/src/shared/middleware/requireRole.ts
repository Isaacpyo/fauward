import type { FastifyReply, FastifyRequest } from 'fastify';

export function requireRole(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = (request.user as any)?.role;
    if (!role || !roles.includes(role)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
}