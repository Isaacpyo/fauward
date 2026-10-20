import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { HEALTH_FACTORS, HEALTH_SCORE_VERSION } from '../config/health-score.config.js';
import { computeAndStoreHealthScore, healthScoringModel, scoreHealth, type HealthInputs } from './health-score.service.js';

// customer.success health score (WP-3.3).

const DAY = 24 * 60 * 60 * 1000;
const here = path.dirname(fileURLToPath(import.meta.url));

function inputs(overrides: Partial<HealthInputs> = {}): HealthInputs {
  return {
    tenantAgeDays: 120,
    shipments30: 150,
    shipmentsPrevious30: 100,
    activeUsers: 4,
    activeUsers7d: 3,
    openPlatformTickets: 1,
    oldestOpenTicketDays: 3,
    nps: { nps: 20, responses: 5 },
    subscriptionStatus: 'ACTIVE',
    failedPlatformPayments30: 0,
    overduePlatformInvoices: 0,
    features: { returns30: 3, customsDeclarations30: 0, documents30: 5, aiAgentRuns30: 0, apiCallsThisMonth: 1200, activeWebhooks: 1 },
    onboardingCoreDone: 3,
    onboardingCoreTotal: 4,
    usage: { month: '2026-10', emailsSent: 0, smsSent: 0, storageBytes: 0, aiRequests: 0, aiCostUsd: 0 },
    ...overrides
  };
}

/** In-memory Prisma for gatherHealthInputs + computeAndStoreHealthScore. */
function store(options: { createdDaysAgo: number; npsScores?: number[]; previousScore?: number | null }) {
  const now = Date.now();
  const created: Array<Record<string, unknown>> = [];
  const ticketWheres: unknown[] = [];
  const prisma = {
    tenant: { findUnique: vi.fn(async () => ({ id: 'tenant_a', createdAt: new Date(now - options.createdDaysAgo * DAY), onboardingSteps: { BRANDING_SET: '2026-09-01T00:00:00.000Z', FIRST_SHIPMENT: '2026-09-02T00:00:00.000Z', GATEWAY_VERIFIED: '2026-09-03T00:00:00.000Z' } })) },
    shipment: { count: vi.fn(async ({ where }: { where: { createdAt: { lt?: Date } } }) => (where.createdAt.lt ? 100 : 150)) },
    user: { findMany: vi.fn(async () => [{ lastLogin: new Date(now - DAY) }, { lastLogin: new Date(now - 2 * DAY) }, { lastLogin: new Date(now - 3 * DAY) }, { lastLogin: new Date(now - 20 * DAY) }]) },
    supportTicket: {
      count: vi.fn(async ({ where }: { where: unknown }) => {
        ticketWheres.push(where);
        return 1;
      }),
      findFirst: vi.fn(async ({ where }: { where: unknown }) => {
        ticketWheres.push(where);
        return { createdAt: new Date(now - 3 * DAY) };
      })
    },
    feedbackItem: { findMany: vi.fn(async () => (options.npsScores ?? [10, 10, 9, 5, 7]).map((score) => ({ score }))) },
    subscription: { findUnique: vi.fn(async () => ({ status: 'ACTIVE' })) },
    payment: { count: vi.fn(async () => 0) },
    invoice: { count: vi.fn(async () => 0) },
    returnRequest: { count: vi.fn(async () => 3) },
    customsDeclaration: { count: vi.fn(async () => 0) },
    shipmentDocument: { count: vi.fn(async () => 5) },
    aiAgentRun: { count: vi.fn(async () => 0) },
    webhookEndpoint: { count: vi.fn(async () => 1) },
    usageRecord: { findUnique: vi.fn(async () => ({ apiCalls: 1200, emailsSent: 40, smsSent: 7, storageBytes: 3_145_728n })) },
    tenantAiUsage: { aggregate: vi.fn(async () => ({ _sum: { requestCount: 19, costUsd: 1.234 } })) },
    tenantHealthScore: {
      findFirst: vi.fn(async () => (options.previousScore === undefined || options.previousScore === null ? null : { score: options.previousScore })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'hs_1', ...data };
      })
    },
    cSPlaybook: { findMany: vi.fn(async () => []) },
    platformActivity: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'act_1', ...create })) }
  };
  const app = { prisma, redis: { publish: vi.fn(async () => 1) }, log: { error: vi.fn() } } as never;
  return { app, created, ticketWheres };
}

describe('health score (WP-3.3)', () => {
  it('ACC-CS-1 fixture inputs produce the hand-computed score', () => {
    // shipments 150 vs 100 → 0.75 × 20 = 15; users 3/4 → 0.75 × 20 = 15; tickets 1 open, 3 d → 0.85 × 15 = 12.75;
    // NPS +20 → 0.6 × 10 = 6; payments clean → 15; features 4/6 × 10 = 6.67; onboarding 3/4 × 10 = 7.5 → 77.92 → 78.
    const { score, factors, includedWeight } = scoreHealth(inputs());
    expect(includedWeight).toBe(100);
    expect(score).toBe(78);
    expect(factors.shipmentTrend).toEqual({ weight: 20, included: true, fraction: 0.75, points: 15 });
    expect(factors.support.points).toBe(12.75);
    expect(factors.nps).toEqual({ weight: 10, included: true, fraction: 0.6, points: 6 });
  });

  it('ACC-CS-1 without NPS responses the factor is left out and the other weights are renormalised (no default 10)', () => {
    // Same inputs minus NPS: 71.92 of 90 included weight → 79.91 → 80.
    const { score, factors, includedWeight } = scoreHealth(inputs({ nps: { nps: null, responses: 0 } }));
    expect(includedWeight).toBe(90);
    expect(factors.nps).toEqual({ weight: 10, included: false, fraction: null, points: null });
    expect(score).toBe(80);
    expect(factors.shipmentTrend.points).toBeCloseTo((0.75 * 20 * 100) / 90, 2);
  });

  it('ACC-CS-1 dunning zeroes payment health; no shipments in either window scores the trend 0', () => {
    expect(scoreHealth(inputs({ subscriptionStatus: 'PAST_DUE' })).factors.payment.fraction).toBe(0);
    expect(scoreHealth(inputs({ shipments30: 0, shipmentsPrevious30: 0 })).factors.shipmentTrend.fraction).toBe(0);
    expect(scoreHealth(inputs({ shipments30: 12, shipmentsPrevious30: 0 })).factors.shipmentTrend.fraction).toBe(1);
  });

  it('ACC-CS-1 the stored row carries the score, per-factor points, raw inputs and the model version', async () => {
    const { app, created } = store({ createdDaysAgo: 120 });
    await computeAndStoreHealthScore(app, 'tenant_a');
    expect(created).toHaveLength(1);
    // NPS from [10, 10, 9, 5, 7]: 3 promoters, 1 detractor of 5 → +40 → 0.7.
    expect(created[0]).toMatchObject({ tenantId: 'tenant_a', version: HEALTH_SCORE_VERSION, inputs: expect.objectContaining({ shipments30: 150, activeUsers7d: 3, openPlatformTickets: 1, nps: { nps: 40, responses: 5 }, onboardingCoreDone: 3 }) });
    expect((created[0].factors as Record<string, { fraction: number }>).nps.fraction).toBe(0.7);
    expect(created[0].score).toBe(scoreHealth(created[0].inputs as HealthInputs).score);
  });

  it('ACC-CS-2 the ticket factor counts PLATFORM tickets; scoring never reads SupportVendorTicket', async () => {
    const { app, ticketWheres } = store({ createdDaysAgo: 120 });
    await computeAndStoreHealthScore(app, 'tenant_a');
    expect(ticketWheres).toHaveLength(2);
    for (const where of ticketWheres) expect(where).toMatchObject({ tenantId: 'tenant_a', audience: 'PLATFORM' });
    for (const file of ['health-score.service.ts', '../queues/scheduled.worker.ts', '../config/health-score.config.ts']) {
      expect(fs.readFileSync(path.resolve(here, file), 'utf8'), file).not.toMatch(/supportVendorTicket/i);
    }
  });

  it('ACC-CS-3 no fallback score: a tenant without enough history gets no row; the NPS default is gone', async () => {
    const { app, created } = store({ createdDaysAgo: 5 });
    expect(await computeAndStoreHealthScore(app, 'tenant_a')).toBeNull();
    expect(created).toHaveLength(0);
    const feedback = fs.readFileSync(path.resolve(here, 'feedback.service.ts'), 'utf8');
    expect(feedback).not.toMatch(/NPS_HEALTH_DEFAULT|npsHealthComponent/);
  });

  it('the scoring model is served from config: weights sum to 100, every factor has a definition', () => {
    const model = healthScoringModel();
    expect(model.version).toBe(HEALTH_SCORE_VERSION);
    expect(Object.values(model.weights).reduce((sum, weight) => sum + weight, 0)).toBe(100);
    expect(model.factors.map((factor) => factor.key).sort()).toEqual(Object.keys(HEALTH_FACTORS).sort());
    for (const factor of model.factors) expect(factor.definition.length).toBeGreaterThan(20);
  });
});
