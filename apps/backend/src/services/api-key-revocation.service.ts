import type { FastifyInstance } from 'fastify';
import type { ApiKey } from '@prisma/client';
import { recordAndPublishActivity, type ActivityActorType } from './platform-activity.service.js';
import { notifyTenantAdmins } from './platform-notifier.service.js';

// L9 (WP-2.13): API keys as tenants and the console see them (never the hash), and the one revoke path. Keys are
// checked against the database on every request (`authenticate.ts`), so a revoked key fails with 401 at once.

export function presentApiKey(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    isActive: key.isActive,
    isSandbox: key.isSandbox,
    rateLimit: key.rateLimit,
    monthlyRequestCount: key.monthlyRequestCount,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: (key.lastUsedAt ?? key.lastUsed)?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    revokedBy: key.revokedByType === 'STAFF' ? ('FAUWARD' as const) : key.revokedByType === 'TENANT_USER' ? ('TENANT' as const) : null,
    revokedReason: key.revokedReason
  };
}

type Actor = { type: Extract<ActivityActorType, 'TENANT_USER' | 'STAFF'>; id: string; label: string };

function activityDeps(app: FastifyInstance) {
  return { prisma: app.prisma, redis: app.redis, log: app.log };
}

export async function recordApiKeyCreated(app: FastifyInstance, key: ApiKey, actor: Actor) {
  await recordAndPublishActivity(activityDeps(app), {
    service: 'customer.360',
    type: 'api_key.created',
    tenantId: key.tenantId,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    subjectType: 'api_key',
    subjectId: key.id,
    summary: `API key ${key.keyPrefix}… created${key.isSandbox ? ' (sandbox)' : ''}`,
    consoleLink: `/customer/360/${key.tenantId}?tab=config`
  });
}

/**
 * Revokes an active key of the tenant. Staff revocations (dangerous, with a reason) tell the tenant's admins in-app and
 * by email. Returns null when the key does not exist for this tenant; an already revoked key is returned unchanged.
 */
export async function revokeApiKey(app: FastifyInstance, input: { tenantId: string; keyId: string; actor: Actor; reason?: string | null }) {
  const key = await app.prisma.apiKey.findFirst({ where: { id: input.keyId, tenantId: input.tenantId } });
  if (!key) return null;
  if (!key.isActive) return { key, changed: false };
  const now = new Date();
  const claimed = await app.prisma.apiKey.updateMany({
    where: { id: key.id, tenantId: input.tenantId, isActive: true },
    data: { isActive: false, revokedAt: now, revokedByType: input.actor.type, revokedById: input.actor.id, revokedReason: input.reason ?? null }
  });
  const updated = (await app.prisma.apiKey.findFirst({ where: { id: key.id, tenantId: input.tenantId } })) ?? key;
  if (claimed.count !== 1) return { key: updated, changed: false };
  const byStaff = input.actor.type === 'STAFF';
  await recordAndPublishActivity(activityDeps(app), {
    service: 'customer.360',
    type: 'api_key.revoked',
    tenantId: input.tenantId,
    actorType: input.actor.type,
    actorId: input.actor.id,
    actorLabel: input.actor.label,
    subjectType: 'api_key',
    subjectId: key.id,
    summary: `API key ${key.keyPrefix}… revoked${byStaff ? ` by Fauward: ${input.reason ?? ''}` : ''}`,
    severity: byStaff ? 'ATTENTION' : 'INFO',
    consoleLink: `/customer/360/${input.tenantId}?tab=config`
  });
  if (byStaff) {
    await notifyTenantAdmins(app, {
      tenantId: input.tenantId,
      event: 'api_key.revoked',
      title: `Fauward revoked API key ${key.keyPrefix}…`,
      body: input.reason ?? undefined,
      link: '/developer?tab=keys',
      email: { template: 'api_key_revoked_by_fauward', data: { keyPrefix: `${key.keyPrefix}…`, reason: input.reason ?? '' } }
    });
  }
  return { key: updated, changed: true };
}
