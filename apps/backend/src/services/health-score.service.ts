import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { HEALTH_BANDS, HEALTH_FACTORS, HEALTH_MIN_TENANT_AGE_DAYS, HEALTH_SCORE_VERSION, type HealthFactorKey } from '../config/health-score.config.js';
import { NPS_CADENCE_DAYS, npsFromScores } from './feedback.service.js';
import { CORE_STEPS, stepStamps } from './onboarding.service.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from './platform-activity.service.js';
import { monthKey } from './usage-storage.service.js';

// customer.success health score (WP-3.3): real inputs only, weights from health-score.config.ts, NPS left out (weights
// renormalised) when the tenant has no responses, and no score at all for tenants without enough history.

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] as const;

export type HealthInputs = {
  tenantAgeDays: number;
  shipments30: number;
  shipmentsPrevious30: number;
  activeUsers: number;
  activeUsers7d: number;
  openPlatformTickets: number;
  oldestOpenTicketDays: number | null;
  nps: { nps: number | null; responses: number };
  subscriptionStatus: string | null;
  failedPlatformPayments30: number;
  overduePlatformInvoices: number;
  features: { returns30: number; customsDeclarations30: number; documents30: number; aiAgentRuns30: number; apiCallsThisMonth: number; activeWebhooks: number };
  onboardingCoreDone: number;
  onboardingCoreTotal: number;
  usage: { month: string; emailsSent: number; smsSent: number; storageBytes: number; aiRequests: number; aiCostUsd: number };
};

export type FactorResult = { weight: number; included: boolean; fraction: number | null; points: number | null };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

/** NPS −100…100 → 0…1; null (factor left out, weights renormalised) without responses. Never a default value. */
export function npsFraction(nps: number | null) {
  return nps === null ? null : clamp01((nps + 100) / 200);
}

/** Each factor's 0…1 fraction, or null when the factor has no data and is left out. */
export function factorFractions(inputs: HealthInputs): Record<HealthFactorKey, number | null> {
  const { shipments30: now, shipmentsPrevious30: before } = inputs;
  const shipmentTrend = before === 0 ? (now > 0 ? 1 : 0) : clamp01(0.5 + (now - before) / before / 2);
  const activeUsers = inputs.activeUsers === 0 ? 0 : clamp01(inputs.activeUsers7d / inputs.activeUsers);
  const stale = inputs.oldestOpenTicketDays !== null && inputs.oldestOpenTicketDays > 7 ? 0.25 : 0;
  const support = clamp01(1 - 0.15 * inputs.openPlatformTickets - stale);
  const nps = npsFraction(inputs.nps.nps);
  const payment = inputs.subscriptionStatus === 'PAST_DUE' ? 0 : clamp01(1 - 0.34 * inputs.failedPlatformPayments30 - 0.34 * inputs.overduePlatformInvoices);
  const used = Object.values(inputs.features).filter((value) => value > 0).length;
  const featureAdoption = used / Object.keys(inputs.features).length;
  const onboarding = inputs.onboardingCoreTotal === 0 ? 0 : clamp01(inputs.onboardingCoreDone / inputs.onboardingCoreTotal);
  return { shipmentTrend, activeUsers, support, nps, payment, featureAdoption, onboarding };
}

/** Weighted score 0…100 over the included factors (weights renormalised to the included total). */
export function scoreHealth(inputs: HealthInputs) {
  const fractions = factorFractions(inputs);
  const keys = Object.keys(HEALTH_FACTORS) as HealthFactorKey[];
  const includedWeight = keys.reduce((sum, key) => sum + (fractions[key] === null ? 0 : HEALTH_FACTORS[key].weight), 0);
  const factors = {} as Record<HealthFactorKey, FactorResult>;
  let total = 0;
  for (const key of keys) {
    const fraction = fractions[key];
    const weight = HEALTH_FACTORS[key].weight;
    if (fraction === null) {
      factors[key] = { weight, included: false, fraction: null, points: null };
      continue;
    }
    const points = (fraction * weight * 100) / includedWeight;
    total += points;
    factors[key] = { weight, included: true, fraction: round2(fraction), points: round2(points) };
  }
  return { score: Math.round(total), factors, includedWeight };
}

export function healthBand(score: number) {
  return score < HEALTH_BANDS.atRiskBelow ? 'AT_RISK' : score >= HEALTH_BANDS.healthyFrom ? 'HEALTHY' : 'NEUTRAL';
}

type HealthDb = FastifyInstance['prisma'];

export async function gatherHealthInputs(db: HealthDb, tenantId: string, now = new Date()): Promise<HealthInputs | null> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, createdAt: true, onboardingSteps: true } });
  if (!tenant) return null;
  const [
    shipments30,
    shipmentsPrevious30,
    users,
    openTickets,
    oldestTicket,
    npsRows,
    subscription,
    failedPayments,
    overdueInvoices,
    returns30,
    customs30,
    documents30,
    aiRuns30,
    activeWebhooks,
    usageMonth,
    aiMonth
  ] = await Promise.all([
    db.shipment.count({ where: { tenantId, createdAt: { gte: ago(30) } } }),
    db.shipment.count({ where: { tenantId, createdAt: { gte: ago(60), lt: ago(30) } } }),
    db.user.findMany({ where: { tenantId, isActive: true }, select: { lastLogin: true } }),
    db.supportTicket.count({ where: { tenantId, audience: 'PLATFORM', status: { in: [...OPEN_TICKET_STATUSES] } } }),
    db.supportTicket.findFirst({ where: { tenantId, audience: 'PLATFORM', status: { in: [...OPEN_TICKET_STATUSES] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    db.feedbackItem.findMany({ where: { tenantId, type: 'NPS', score: { not: null }, createdAt: { gte: ago(NPS_CADENCE_DAYS) } }, select: { score: true } }),
    db.subscription.findUnique({ where: { tenantId }, select: { status: true } }),
    db.payment.count({ where: { kind: 'PLATFORM', tenantId, status: 'FAILED', createdAt: { gte: ago(30) } } }),
    db.invoice.count({ where: { kind: 'PLATFORM', tenantId, status: 'OVERDUE' } }),
    db.returnRequest.count({ where: { tenantId, createdAt: { gte: ago(30) } } }),
    db.customsDeclaration.count({ where: { tenantId, createdAt: { gte: ago(30) } } }),
    db.shipmentDocument.count({ where: { tenantId, generatedAt: { gte: ago(30) } } }),
    db.aiAgentRun.count({ where: { tenantId, createdAt: { gte: ago(30) } } }),
    db.webhookEndpoint.count({ where: { tenantId, isActive: true } }),
    db.usageRecord.findUnique({ where: { tenantId_month: { tenantId, month: monthKey(now) } } }),
    db.tenantAiUsage.aggregate({ where: { tenantId, month: monthKey(now) }, _sum: { requestCount: true, costUsd: true } })
  ]);
  const stamps = stepStamps(tenant.onboardingSteps);
  const npsBreakdown = npsFromScores(npsRows.map((row) => row.score ?? 0));
  return {
    tenantAgeDays: Math.floor((now.getTime() - tenant.createdAt.getTime()) / DAY_MS),
    shipments30,
    shipmentsPrevious30,
    activeUsers: users.length,
    activeUsers7d: users.filter((user) => user.lastLogin && user.lastLogin >= ago(7)).length,
    openPlatformTickets: openTickets,
    oldestOpenTicketDays: oldestTicket ? Math.floor((now.getTime() - oldestTicket.createdAt.getTime()) / DAY_MS) : null,
    nps: { nps: npsBreakdown.nps, responses: npsBreakdown.responses },
    subscriptionStatus: subscription?.status ?? null,
    failedPlatformPayments30: failedPayments,
    overduePlatformInvoices: overdueInvoices,
    features: { returns30, customsDeclarations30: customs30, documents30, aiAgentRuns30: aiRuns30, apiCallsThisMonth: usageMonth?.apiCalls ?? 0, activeWebhooks },
    onboardingCoreDone: CORE_STEPS.filter((step) => stamps[step]).length,
    onboardingCoreTotal: CORE_STEPS.length,
    usage: {
      month: monthKey(now),
      emailsSent: usageMonth?.emailsSent ?? 0,
      smsSent: usageMonth?.smsSent ?? 0,
      storageBytes: Number(usageMonth?.storageBytes ?? 0),
      aiRequests: aiMonth._sum.requestCount ?? 0,
      aiCostUsd: Number((aiMonth._sum.costUsd ?? 0).toFixed(2))
    }
  };
}

type HealthApp = Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>;

/**
 * Scores one tenant and stores the score with its inputs and model version. Returns null (nothing stored) for a tenant
 * without enough history — it reads "Not yet scored" everywhere; there is no fallback score.
 */
export async function computeAndStoreHealthScore(app: HealthApp, tenantId: string, now = new Date()) {
  const inputs = await gatherHealthInputs(app.prisma, tenantId, now);
  if (!inputs || inputs.tenantAgeDays < HEALTH_MIN_TENANT_AGE_DAYS) return null;
  const { score, factors } = scoreHealth(inputs);
  const previous = await app.prisma.tenantHealthScore.findFirst({ where: { tenantId }, orderBy: { computedAt: 'desc' } });
  const trend = !previous ? 'flat' : score > previous.score ? 'up' : score < previous.score ? 'down' : 'flat';

  const row = await app.prisma.tenantHealthScore.create({
    data: { tenantId, score, trend, factors, inputs, version: HEALTH_SCORE_VERSION, computedAt: now }
  });

  const band = healthBand(score);
  const previousBand = previous ? healthBand(previous.score) : null;
  if (previous && previousBand && previousBand !== band) {
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: app.log },
      {
        service: 'customer.success',
        type: 'health.score_changed',
        tenantId,
        ...SYSTEM_ACTOR,
        subjectType: 'tenant',
        subjectId: tenantId,
        summary: `Health ${previous.score} → ${score} (${previousBand.replace('_', ' ').toLowerCase()} → ${band.replace('_', ' ').toLowerCase()})`,
        severity: band === 'AT_RISK' ? 'ATTENTION' : 'INFO',
        consoleLink: `/customer/360/${tenantId}?tab=health`,
        metadata: { from: previous.score, to: score, fromBand: previousBand, toBand: band },
        dedupeKey: `health.score_changed:${row.id}`
      }
    );
  }

  const triggers: string[] = [];
  if (score < HEALTH_BANDS.atRiskBelow && (!previous || previous.score >= HEALTH_BANDS.atRiskBelow)) triggers.push('health_below_45');
  if (score >= HEALTH_BANDS.healthyFrom && previous && previous.score < HEALTH_BANDS.healthyFrom) triggers.push('health_above_80');
  if (triggers.length > 0) {
    const playbooks = await app.prisma.cSPlaybook.findMany({ where: { active: true, trigger: { in: triggers } } });
    for (const playbook of playbooks) {
      await app.prisma.cSPlaybookRun.create({
        data: { playbookId: playbook.id, tenantId, status: 'PENDING', steps: playbook.steps === null ? Prisma.JsonNull : playbook.steps, currentStep: 0 }
      });
    }
  }
  return row;
}

/** The model served at GET /api/internal/success/health-scoring. */
export function healthScoringModel() {
  return {
    version: HEALTH_SCORE_VERSION,
    minTenantAgeDays: HEALTH_MIN_TENANT_AGE_DAYS,
    bands: HEALTH_BANDS,
    factors: (Object.keys(HEALTH_FACTORS) as HealthFactorKey[]).map((key) => ({ key, ...HEALTH_FACTORS[key] })),
    weights: Object.fromEntries((Object.keys(HEALTH_FACTORS) as HealthFactorKey[]).map((key) => [key, HEALTH_FACTORS[key].weight]))
  };
}
