import type { FastifyInstance } from 'fastify';
import { invalidateTenantEntitlements } from './tenant-entitlements.service.js';

export const TENANT_CHANGE_PATTERNS = ['tenant:*:plan-changed', 'tenant:*:status-changed', 'tenant:*:entitlements-changed'] as const;

/** `tenant:<id>:<event>` → `<id>`. */
export function tenantIdFromChannel(channel: string) {
  const match = /^tenant:([^:]+):/.exec(channel);
  return match?.[1] ?? null;
}

/**
 * Every API instance listens for tenant plan/status/entitlement changes (Redis pub/sub) and drops the cached
 * entitlements, so a plan or feature override takes effect everywhere within seconds without a restart (WP-1.4).
 */
export async function startTenantCacheSubscriber(app: FastifyInstance) {
  const subscriber = app.redis.duplicate();
  subscriber.on('pmessage', (_pattern: string, channel: string) => {
    const tenantId = tenantIdFromChannel(channel);
    if (!tenantId) return;
    invalidateTenantEntitlements(app.redis, tenantId).catch((err: unknown) => app.log.error({ err, tenantId }, 'Failed to invalidate tenant entitlements'));
  });
  subscriber.on('error', (err: unknown) => app.log.error({ err }, 'Tenant cache subscriber error'));
  await subscriber.psubscribe(...TENANT_CHANGE_PATTERNS);
  app.addHook('onClose', async () => {
    await subscriber.quit();
  });
  return subscriber;
}
