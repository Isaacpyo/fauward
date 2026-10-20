import type { PrismaClient } from '@prisma/client';

export type SubscriptionEventsBackfillResult = { dryRun: boolean; created: number; cancelled: number; skipped: number };

/**
 * Backfill for migration 0051_plan_change (spec label 0047): one CREATED SubscriptionEvent per Subscription (at its
 * createdAt) and a CANCELLED event where cancelledAt is set, `source: BACKFILL`. Idempotent: a subscription that
 * already has a BACKFILL CREATED event is skipped. Revenue analytics labels history before the run as reconstructed.
 */
export async function backfillSubscriptionEvents(prisma: PrismaClient, options: { dryRun: boolean }): Promise<SubscriptionEventsBackfillResult> {
  const subscriptions = await prisma.subscription.findMany({ select: { tenantId: true, plan: true, status: true, createdAt: true, cancelledAt: true } });
  const done = new Set(
    (await prisma.subscriptionEvent.findMany({ where: { source: 'BACKFILL', type: 'CREATED' }, select: { tenantId: true } })).map((row) => row.tenantId)
  );
  const pending = subscriptions.filter((row) => !done.has(row.tenantId));
  const cancelled = pending.filter((row) => row.cancelledAt);
  if (!options.dryRun) {
    for (const row of pending) {
      await prisma.$transaction([
        prisma.subscriptionEvent.create({ data: { tenantId: row.tenantId, type: 'CREATED', toPlan: row.plan, toStatus: 'TRIALING', source: 'BACKFILL', occurredAt: row.createdAt } }),
        ...(row.cancelledAt
          ? [prisma.subscriptionEvent.create({ data: { tenantId: row.tenantId, type: 'CANCELLED', fromPlan: row.plan, toPlan: row.plan, toStatus: 'CANCELLED', source: 'BACKFILL', occurredAt: row.cancelledAt } })]
          : [])
      ]);
    }
  }
  return { dryRun: options.dryRun, created: pending.length, cancelled: cancelled.length, skipped: subscriptions.length - pending.length };
}
