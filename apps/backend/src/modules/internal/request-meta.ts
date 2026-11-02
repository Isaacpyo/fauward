import type { FastifyRequest } from 'fastify';
import { clientIp } from '../../shared/client-ip.js';

export function ipAddress(request: FastifyRequest) {
  return clientIp(request);
}

export function userAgent(request: FastifyRequest) {
  return typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null;
}

export function reasonOf(request: FastifyRequest) {
  const reason = (request.body as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' ? reason.trim() : null;
}

/** Actor columns for writePlatformAuditLog from an authenticated console request. */
export function platformAuditActor(request: FastifyRequest) {
  return {
    actorType: 'PLATFORM_USER',
    actorId: request.platform!.user.id,
    actorEmail: request.platform!.user.email,
    ipAddress: ipAddress(request),
    userAgent: userAgent(request)
  };
}
