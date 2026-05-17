import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Permission } from '@fauward/internal-rbac';
import { platformUserHasStaffPermission } from '../services/staff-iam.service.js';

export function requireInternalPermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.platform?.user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const allowed = await platformUserHasStaffPermission(request.server.prisma, user, permission);
    if (allowed) return undefined;

    const jitGrant = await request.server.prisma.jitAccessRequest.findFirst({
      where: {
        requesterPlatformUserId: user.id,
        permission,
        status: 'APPROVED',
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { expiresAt: 'desc' }
    });

    if (jitGrant) {
      request.jitSessionId = jitGrant.id;
      return undefined;
    }

    return reply.status(403).send({ error: 'Forbidden', permission });
  };
}
