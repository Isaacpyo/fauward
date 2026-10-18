import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import type { ActivitySeverity, PlatformActivity, Prisma } from '@prisma/client';
import type Redis from 'ioredis';

/** Redis channel the console SSE stream (WP-2.1) subscribes to; the payload is the activity row id. */
export const ACTIVITY_CHANNEL = 'console:activity';

export type ActivityActorType = 'TENANT_USER' | 'END_CUSTOMER' | 'STAFF' | 'SYSTEM' | 'API_KEY' | 'IMPERSONATOR';

export type ActivityInput = {
  /** Manifest service id, e.g. `platform.tenants`. */
  service: string;
  /** Dotted event type, e.g. `tenant.suspended`. */
  type: string;
  tenantId?: string | null;
  actorType: ActivityActorType;
  actorId?: string | null;
  actorLabel: string;
  subjectType: string;
  subjectId: string;
  /** Staff-visible one-liner; no PII beyond names/emails staff can already see. */
  summary: string;
  severity?: ActivitySeverity;
  consoleLink?: string | null;
  metadata?: Prisma.InputJsonObject;
  /**
   * Makes the producer idempotent: a retried producer with the same key gets the existing row back. Defaults to
   * `<type>:<subjectId>:<random>` (one row per call) when the producer has no natural key.
   */
  dedupeKey?: string;
  occurredAt?: Date;
};

type ActivityDb = { platformActivity: Pick<Prisma.TransactionClient['platformActivity'], 'upsert'> };

/**
 * Writes one PlatformActivity row (D7). Call it inside the producer's transaction so the activity exists exactly when
 * the change does, then call `publishActivity` after commit.
 */
export async function recordActivity(db: ActivityDb, input: ActivityInput): Promise<PlatformActivity> {
  const dedupeKey = input.dedupeKey ?? `${input.type}:${input.subjectId}:${randomUUID()}`;
  return db.platformActivity.upsert({
    where: { dedupeKey },
    update: {},
    create: {
      service: input.service,
      type: input.type,
      tenantId: input.tenantId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      summary: input.summary,
      severity: input.severity ?? 'INFO',
      consoleLink: input.consoleLink ?? null,
      metadata: input.metadata ?? {},
      dedupeKey,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {})
    }
  });
}

/** Post-commit fan-out to the console stream. Fire-and-forget: a Redis outage never fails the mutation. */
export function publishActivity(redis: Pick<Redis, 'publish'> | undefined, activity: Pick<PlatformActivity, 'id'>, log: Pick<FastifyBaseLogger, 'error'>) {
  if (!redis) return;
  redis.publish(ACTIVITY_CHANNEL, activity.id).catch((err: unknown) => log.error({ err, activityId: activity.id }, 'Failed to publish console activity'));
}

/** For producers without their own transaction: write, then publish. */
export async function recordAndPublishActivity(
  deps: { prisma: ActivityDb; redis?: Pick<Redis, 'publish'>; log: Pick<FastifyBaseLogger, 'error'> },
  input: ActivityInput
) {
  const activity = await recordActivity(deps.prisma, input);
  publishActivity(deps.redis, activity, deps.log);
  return activity;
}

/** Actor fields for an activity written by an authenticated console request. */
export function staffActor(request: FastifyRequest): Pick<ActivityInput, 'actorType' | 'actorId' | 'actorLabel'> {
  const user = request.platform?.user;
  return { actorType: 'STAFF', actorId: user?.id ?? null, actorLabel: user?.name ?? user?.email ?? 'Unknown staff' };
}

export const SYSTEM_ACTOR: Pick<ActivityInput, 'actorType' | 'actorId' | 'actorLabel'> = { actorType: 'SYSTEM', actorId: null, actorLabel: 'System' };
