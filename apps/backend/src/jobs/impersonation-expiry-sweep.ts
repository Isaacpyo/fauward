import type { PrismaClient } from '@prisma/client';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';

/** platform.impersonation-expiry-sweep (every 5 min): closes sessions past expiresAt with endedReason EXPIRED. */
export async function sweepExpiredImpersonationSessions(prisma: Pick<PrismaClient, 'platformImpersonationSession'>, now = new Date()) {
  return runWithTenantContext(systemContext(), async () => {
    const result = await prisma.platformImpersonationSession.updateMany({
      where: { endedAt: null, revokedAt: null, expiresAt: { lte: now } },
      data: { endedAt: now, endedReason: 'EXPIRED' }
    });
    return result.count;
  });
}
