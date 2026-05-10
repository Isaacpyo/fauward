import type { FastifyReply, FastifyRequest } from 'fastify';
import { PLATFORM_ACCESS_COOKIE, verifyPlatformAccessToken } from '../services/platform-session.service.js';

export async function authenticatePlatformSession(request: FastifyRequest, reply: FastifyReply) {
  const cookieToken = request.cookies?.[PLATFORM_ACCESS_COOKIE];
  const header = request.headers.authorization;
  const bearerToken = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = cookieToken ?? bearerToken;

  if (!token) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  try {
    const claims = verifyPlatformAccessToken(token);
    if (claims.actorType !== 'PLATFORM_USER' || claims.tenantId !== 'system') {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const [user, session] = await Promise.all([
      request.server.prisma.platformUser.findUnique({ where: { id: claims.sub } }),
      request.server.prisma.platformSession.findUnique({ where: { id: claims.sessionId } })
    ]);

    if (!user || user.status !== 'ACTIVE' || user.id !== claims.sub) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (!session || session.platformUserId !== user.id || session.revokedAt || session.expiresAt <= new Date()) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    request.platform = { claims, user, session };
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}
