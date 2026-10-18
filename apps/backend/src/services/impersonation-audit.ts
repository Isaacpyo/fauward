import type { RequestActor } from '../context/request-actor.context.js';

type AuditData = { actorType?: unknown; metadata?: unknown; [key: string]: unknown };

/**
 * Tenant AuditLog rows written while a staff member impersonates a tenant user get `actorType: 'IMPERSONATOR'` and
 * the session ids in `metadata` (D8). Applied by the Prisma middleware to every AuditLog create/createMany.
 */
export function stampImpersonatedAuditData<T extends AuditData>(data: T, actor: RequestActor | undefined): T {
  const impersonation = actor?.impersonation;
  if (!impersonation) return data;
  const metadata = data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata) ? (data.metadata as Record<string, unknown>) : {};
  return {
    ...data,
    actorType: 'IMPERSONATOR',
    metadata: { ...metadata, impersonationSessionId: impersonation.sessionId, platformUserId: impersonation.platformUserId }
  };
}
