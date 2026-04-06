import type { FastifyReply, FastifyRequest } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const userId = request.user?.sub;
    const tenantId = request.user?.tenantId;
    if (!userId || !tenantId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    const user = await request.server.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { isActive: true }
    });
    if (!user?.isActive) {
      return reply.status(401).send({ error: 'Account suspended', code: 'USER_SUSPENDED' });
    }
  } catch (err) {
    return reply.send(err);
  }
}
