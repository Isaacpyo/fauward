import type { PrismaClient } from '@prisma/client';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';

/** D7 retention for the console activity feed. */
export const ACTIVITY_RETENTION_DAYS = 180;

/** platform.activity-prune (daily): deletes PlatformActivity rows older than the retention window. */
export async function pruneOldActivity(prisma: Pick<PrismaClient, 'platformActivity'>, now = new Date()) {
  const cutoff = new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return runWithTenantContext(systemContext(), async () => {
    const result = await prisma.platformActivity.deleteMany({ where: { occurredAt: { lt: cutoff } } });
    return { deleted: result.count, cutoff: cutoff.toISOString() };
  });
}
