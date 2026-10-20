import type { FastifyInstance } from 'fastify';
import { redeemExchangeCode, signImpersonationToken } from '../../services/impersonation.service.js';

const INVALID = { error: 'EXCHANGE_CODE_INVALID', message: 'This staff access link has expired or was already used.' };

/**
 * Tenant portal side of the impersonation hand-off (D8): redeems the console's single-use code (60 s, GETDEL) for the
 * tenant access token. Public (the code is the credential) and rate limited.
 */
export async function registerImpersonationExchangeRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/impersonation/exchange', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const code = (request.body as { code?: unknown } | undefined)?.code;
    if (typeof code !== 'string' || code.length === 0) return reply.status(400).send({ error: 'INVALID_CODE', message: 'code is required' });

    const sessionId = await redeemExchangeCode(app.redis, code);
    if (!sessionId) return reply.status(401).send(INVALID);

    const now = new Date();
    const session = await app.prisma.platformImpersonationSession.findUnique({
      where: { id: sessionId },
      include: { platformUser: { select: { id: true, email: true } }, targetTenant: { select: { id: true, slug: true, name: true, plan: true } } }
    });
    if (!session || session.revokedAt || session.endedAt || session.exchangedAt || session.expiresAt <= now || !session.targetUserId) {
      return reply.status(401).send(INVALID);
    }

    const targetUser = await app.prisma.user.findFirst({
      where: { id: session.targetUserId, tenantId: session.targetTenantId, isActive: true },
      select: { id: true, email: true, role: true }
    });
    if (!targetUser) return reply.status(401).send(INVALID);

    // Conditional update: only the first redemption wins even under a race.
    const marked = await app.prisma.platformImpersonationSession.updateMany({ where: { id: session.id, exchangedAt: null }, data: { exchangedAt: now } });
    if (marked.count === 0) return reply.status(401).send(INVALID);

    const token = await signImpersonationToken(app.prisma, {
      session,
      platformUser: session.platformUser,
      tenant: session.targetTenant,
      targetUser
    });
    request.log.info({ impersonationSessionId: session.id, tenantId: session.targetTenantId }, 'Impersonation exchange code redeemed');
    return reply.send({
      token,
      expiresAt: session.expiresAt.toISOString(),
      scopes: session.scopes,
      tenant: { id: session.targetTenant.id, slug: session.targetTenant.slug, name: session.targetTenant.name },
      user: targetUser
    });
  });
}
