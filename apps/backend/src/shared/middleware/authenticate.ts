import type { FastifyReply, FastifyRequest } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const userId = request.user?.sub;
    const tenantId = request.user?.tenantId;
    const role = request.user?.role;
    const path = request.url.split('?')[0];
    if (!userId || !tenantId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (userId === 'platform-admin' && tenantId === 'system' && role === 'SUPER_ADMIN') {
      return;
    }
    const user = await request.server.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { isActive: true }
    });
    if (!user?.isActive) {
      return reply.status(401).send({ error: 'Account suspended', code: 'USER_SUSPENDED' });
    }

    if (role !== 'SUPER_ADMIN') {
      const tenantStatus =
        request.tenant?.status ??
        (
          await request.server.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { status: true }
          })
        )?.status;

      if (tenantStatus === 'SUSPENDED') {
        return reply.status(403).send({ error: 'Tenant suspended', code: 'TENANT_SUSPENDED' });
      }
    }

    const isMfaRoute = path.startsWith('/api/v1/auth/mfa/');
    const requiresMfa = role === 'SUPER_ADMIN' || path.startsWith('/api/v1/admin/');
    if (!isMfaRoute && requiresMfa && request.user?.mfaVerified !== true) {
      return reply.status(403).send({ error: 'MFA required', code: 'MFA_REQUIRED' });
    }
  } catch (err) {
    return reply.send(err);
  }
}
