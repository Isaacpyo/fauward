import { describe, expect, it, vi } from 'vitest';
import { backfillSubscriptionEvents } from './subscription-events.js';

// Backfill 0051-subscription-events (WP-2.7): CREATED per subscription, CANCELLED where cancelled; re-runs are no-ops.

type Row = Record<string, unknown>;

function fixture() {
  const subscriptions: Row[] = [
    { tenantId: 't_live', plan: 'PRO', status: 'ACTIVE', createdAt: new Date('2026-01-01T00:00:00Z'), cancelledAt: null },
    { tenantId: 't_gone', plan: 'STARTER', status: 'CANCELLED', createdAt: new Date('2026-02-01T00:00:00Z'), cancelledAt: new Date('2026-06-01T00:00:00Z') }
  ];
  const events: Row[] = [];
  const prisma = {
    subscription: { findMany: vi.fn(async () => subscriptions) },
    subscriptionEvent: {
      findMany: vi.fn(async ({ where }: { where: Row }) => events.filter((row) => row.source === where.source && row.type === where.type)),
      create: vi.fn(({ data }: { data: Row }) => {
        events.push(data);
        return Promise.resolve(data);
      })
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  };
  return { prisma, events };
}

describe('backfillSubscriptionEvents (0051)', () => {
  it('dry run only counts', async () => {
    const { prisma, events } = fixture();
    expect(await backfillSubscriptionEvents(prisma as never, { dryRun: true })).toEqual({ dryRun: true, created: 2, cancelled: 1, skipped: 0 });
    expect(events).toHaveLength(0);
  });

  it('writes CREATED at createdAt and CANCELLED at cancelledAt, once', async () => {
    const { prisma, events } = fixture();
    await backfillSubscriptionEvents(prisma as never, { dryRun: false });
    expect(events).toEqual([
      expect.objectContaining({ tenantId: 't_live', type: 'CREATED', toPlan: 'PRO', source: 'BACKFILL', occurredAt: new Date('2026-01-01T00:00:00Z') }),
      expect.objectContaining({ tenantId: 't_gone', type: 'CREATED', toPlan: 'STARTER' }),
      expect.objectContaining({ tenantId: 't_gone', type: 'CANCELLED', occurredAt: new Date('2026-06-01T00:00:00Z') })
    ]);
    expect(await backfillSubscriptionEvents(prisma as never, { dryRun: false })).toEqual({ dryRun: false, created: 0, cancelled: 0, skipped: 2 });
    expect(events).toHaveLength(3);
  });
});
