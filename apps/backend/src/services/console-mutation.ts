import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { publishActivity, recordActivity, staffActor, SYSTEM_ACTOR, type ActivityInput } from './platform-activity.service.js';
import { writePlatformAuditLog } from './platform-audit.service.js';
import { platformAuditActor } from '../modules/internal/request-meta.js';

// Architecture §12.4: every console mutation writes one PlatformAuditLog row and one PlatformActivity row in the same
// transaction as the change, then publishes the activity to the console stream after commit. Console requests run in
// system context, so the change itself names every tenant it touches.

export type MutationActor = { kind: 'staff'; request: FastifyRequest } | { kind: 'system'; id: string; label: string };

export type MutationAudit = { action: string; targetTenantId?: string | null; reason?: string | null; metadata: Prisma.InputJsonObject };
export type MutationActivity = Omit<ActivityInput, 'service' | 'actorType' | 'actorId' | 'actorLabel'>;
export type MutationOutcome<T> = { result: T; audit: MutationAudit; activity: MutationActivity };

export function staffMutationActor(request: FastifyRequest): MutationActor {
  return { kind: 'staff', request };
}

function auditActor(actor: MutationActor) {
  if (actor.kind === 'staff') return { ...platformAuditActor(actor.request), actorType: 'PLATFORM_USER' as const };
  return { actorType: 'SYSTEM' as const, actorId: actor.id, actorEmail: null, ipAddress: null, userAgent: null };
}

function activityActor(actor: MutationActor): Pick<ActivityInput, 'actorType' | 'actorId' | 'actorLabel'> {
  return actor.kind === 'staff' ? staffActor(actor.request) : { ...SYSTEM_ACTOR, actorLabel: actor.label };
}

export async function auditedMutation<T>(
  app: Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>,
  service: string,
  actor: MutationActor,
  change: (tx: Prisma.TransactionClient) => Promise<MutationOutcome<T>>
): Promise<T> {
  const { result, activity } = await app.prisma.$transaction(async (tx) => {
    const out = await change(tx);
    await writePlatformAuditLog(tx, { ...auditActor(actor), action: out.audit.action, targetTenantId: out.audit.targetTenantId ?? null, reason: out.audit.reason ?? null, metadata: out.audit.metadata });
    const row = await recordActivity(tx, { service, ...activityActor(actor), ...out.activity });
    return { result: out.result, activity: row };
  });
  publishActivity(app.redis, activity, app.log);
  return result;
}
