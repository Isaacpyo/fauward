import { describe, expect, it, vi } from 'vitest';

// L19 (WP-2.18): storage usage counts stored files in bytes; every health score records the usage inputs (returns,
// customs, documents, API, email, SMS, storage, AI) and a band change emits health.score_changed.

vi.mock('../queues/queues.js', () => ({ bullmqConnection: {}, scheduledJobsQueue: { add: vi.fn() }, notificationQueue: { add: vi.fn() } }));
vi.mock('bullmq', () => ({ Worker: class { on = vi.fn(); close = vi.fn(async () => undefined); }, Queue: class { add = vi.fn(); close = vi.fn(async () => undefined); } }));

describe('storage usage (WP-2.18)', () => {
  it('dataUrlBytes measures inline POD files; other URLs are not sized', async () => {
    const { dataUrlBytes } = await import('./usage-storage.service.js');
    const payload = Buffer.from('a'.repeat(1000)).toString('base64');
    expect(dataUrlBytes(`data:image/png;base64,${payload}`)).toBe(1000);
    expect(dataUrlBytes('data:text/plain,hello%20world')).toBe(11);
    expect(dataUrlBytes('https://cdn.example/pod.jpg')).toBeNull();
  });

  it('recordStorageBytes adds bytes to this month once per call and ignores empty sizes', async () => {
    const { recordStorageBytes } = await import('./usage-storage.service.js');
    const upsert = vi.fn(async () => ({}));
    await recordStorageBytes({ usageRecord: { upsert } } as never, 'tenant_a', 2048, new Date('2026-10-19T09:00:00Z'));
    await recordStorageBytes({ usageRecord: { upsert } } as never, 'tenant_a', 0);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId_month: { tenantId: 'tenant_a', month: '2026-10' } },
      create: { tenantId: 'tenant_a', month: '2026-10', storageBytes: 2048n },
      update: { storageBytes: { increment: 2048n } }
    });
  });
});

function healthPrisma(previousScore: number | null) {
  const created: Array<Record<string, unknown>> = [];
  const activity: Array<Record<string, unknown>> = [];
  return {
    created,
    activity,
    tenant: { findUnique: vi.fn(async () => ({ id: 'tenant_a', createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), onboardingSteps: {} })) },
    user: { findMany: vi.fn(async () => [{ lastLogin: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }]) },
    shipment: { count: vi.fn(async () => 0) },
    payment: { count: vi.fn(async () => 0) },
    invoice: { count: vi.fn(async () => 0) },
    subscription: { findUnique: vi.fn(async () => null) },
    supportTicket: { count: vi.fn(async () => 0), findFirst: vi.fn(async () => null) },
    aiAgentRun: { count: vi.fn(async () => 0) },
    webhookEndpoint: { count: vi.fn(async () => 0) },
    tenantHealthScore: {
      findFirst: vi.fn(async () => (previousScore === null ? null : { score: previousScore })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'hs_new', ...data };
      })
    },
    feedbackItem: { findMany: vi.fn(async () => []) },
    returnRequest: { count: vi.fn(async () => 3) },
    customsDeclaration: { count: vi.fn(async () => 2) },
    shipmentDocument: { count: vi.fn(async () => 5) },
    usageRecord: { findUnique: vi.fn(async () => ({ apiCalls: 1200, emailsSent: 40, smsSent: 7, storageBytes: 3_145_728n })) },
    tenantAiUsage: { aggregate: vi.fn(async () => ({ _sum: { requestCount: 19, costUsd: 1.234 } })) },
    cSPlaybook: { findMany: vi.fn(async () => []) },
    platformActivity: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        activity.push(create);
        return { id: 'act_1', ...create };
      })
    }
  };
}

describe('health score inputs (WP-2.18)', () => {
  it('records returns, customs, documents, API, email, SMS, storage and AI usage with the score', async () => {
    const { computeAndStoreHealthScore } = await import('../queues/scheduled.worker.js');
    const prisma = healthPrisma(null);
    await computeAndStoreHealthScore({ prisma, redis: { publish: vi.fn(async () => 1) }, log: { error: vi.fn() } } as never, 'tenant_a');
    // WP-3.3: inputs are stored in their own column; feature use feeds the adoption factor.
    const inputs = prisma.created[0].inputs as { features: Record<string, number>; usage: Record<string, unknown> };
    expect(inputs.features).toEqual({ returns30: 3, customsDeclarations30: 2, documents30: 5, aiAgentRuns30: 0, apiCallsThisMonth: 1200, activeWebhooks: 0 });
    expect(inputs.usage).toEqual({ month: expect.stringMatching(/^\d{4}-\d{2}$/), emailsSent: 40, smsSent: 7, storageBytes: 3_145_728, aiRequests: 19, aiCostUsd: 1.23 });
    expect(prisma.activity).toEqual([]);
  });

  it('a band change records health.score_changed; staying in the band does not', async () => {
    const { computeAndStoreHealthScore, healthBand } = await import('../queues/scheduled.worker.js');
    const deps = (prisma: ReturnType<typeof healthPrisma>) => ({ prisma, redis: { publish: vi.fn(async () => 1) }, log: { error: vi.fn() } }) as never;
    const healthy = healthPrisma(90);
    await computeAndStoreHealthScore(deps(healthy), 'tenant_a');
    const score = Number(healthy.created[0].score);
    expect(healthBand(score)).not.toBe('HEALTHY');
    expect(healthy.activity).toEqual([expect.objectContaining({ service: 'customer.success', type: 'health.score_changed', tenantId: 'tenant_a', metadata: expect.objectContaining({ from: 90, to: score, fromBand: 'HEALTHY' }) })]);
    const same = healthPrisma(score);
    await computeAndStoreHealthScore(deps(same), 'tenant_a');
    expect(same.activity).toEqual([]);
  });
});
