import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/index.js';
import { PLATFORM_ACCESS_COOKIE, verifyPlatformAccessToken } from '../services/platform-session.service.js';

const CONSOLE_AUTH_PREFIXES = ['/api/internal/auth'] as const;
// Routes an MFA-pending session may call (architecture §2.1).
const MFA_PENDING_ALLOWED_SUFFIXES = ['/me', '/mfa/enroll/start', '/mfa/enroll/confirm', '/mfa/verify', '/logout'] as const;

export function isMfaPendingAllowedRoute(routeUrl: string | undefined) {
  if (!routeUrl) return false;
  return CONSOLE_AUTH_PREFIXES.some((prefix) => MFA_PENDING_ALLOWED_SUFFIXES.some((suffix) => routeUrl === `${prefix}${suffix}`));
}

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

    const [user, session, staff] = await Promise.all([
      request.server.prisma.platformUser.findUnique({ where: { id: claims.sub } }),
      request.server.prisma.platformSession.findUnique({ where: { id: claims.sessionId } }),
      request.server.prisma.staffUser.findUnique({ where: { platformUserId: claims.sub }, select: { id: true, status: true } })
    ]);

    if (!user || user.status !== 'ACTIVE' || user.id !== claims.sub) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Suspended or offboarded staff lose access immediately (S4, architecture §2.3).
    if (staff && staff.status !== 'ACTIVE') {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (!session || session.platformUserId !== user.id || session.revokedAt || session.expiresAt <= new Date()) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (config.platformAuth.mfaRequired && !session.mfaVerifiedAt && !isMfaPendingAllowedRoute(request.routeOptions?.url)) {
      return reply.status(401).send({ error: 'MFA_PENDING', mfa: user.mfaEnabled ? 'VERIFY' : 'ENROLL' });
    }

    request.platform = { claims, user, session };
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}
