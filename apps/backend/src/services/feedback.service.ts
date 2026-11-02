import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';

// customer.feedback (WP-2.8): NPS arithmetic, the NPS component of the health score, and the in-app prompt cadence.

export const FEEDBACK_TYPES = ['NPS', 'FEATURE_REQUEST', 'BUG', 'GENERAL'] as const;
export const FEEDBACK_SOURCES = ['IN_APP_SURVEY', 'HELP_MENU', 'PLAN_GATE', 'SUPPORT'] as const;
export const FEEDBACK_STATUSES = ['NEW', 'UNDER_REVIEW', 'PLANNED', 'SHIPPED', 'DECLINED', 'CLOSED'] as const;
/** A user answers or dismisses the survey at most once per cadence. */
export const NPS_CADENCE_DAYS = 90;
/** Users are surveyed only after this long on the platform, and only if they logged in within it. */
export const NPS_MIN_ACCOUNT_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type NpsBreakdown = { responses: number; promoters: number; passives: number; detractors: number; nps: number | null };

/** NPS = % promoters (9-10) − % detractors (0-6), rounded; null without responses. */
export function npsFromScores(scores: number[]): NpsBreakdown {
  const promoters = scores.filter((score) => score >= 9).length;
  const detractors = scores.filter((score) => score <= 6).length;
  const passives = scores.length - promoters - detractors;
  return { responses: scores.length, promoters, passives, detractors, nps: scores.length ? Math.round(((promoters - detractors) / scores.length) * 100) : null };
}

/** Monthly NPS for the console summary. */
export function npsByMonth(rows: Array<{ score: number | null; createdAt: Date }>) {
  const months = new Map<string, number[]>();
  for (const row of rows) {
    if (row.score === null) continue;
    const key = row.createdAt.toISOString().slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), row.score]);
  }
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, scores]) => ({ month, ...npsFromScores(scores) }));
}

export function npsEligible(state: { eligibleAt: Date | null; dismissedAt: Date | null; lastRespondedAt: Date | null } | null, now = new Date()) {
  if (!(state?.eligibleAt instanceof Date) || state.eligibleAt > now) return false;
  const since = (value: Date | null) => value instanceof Date && value.getTime() > now.getTime() - NPS_CADENCE_DAYS * DAY_MS;
  return !since(state.dismissedAt) && !since(state.lastRespondedAt);
}

/**
 * `customer.nps-survey-dispatch` (daily): marks users eligible who have been on the platform at least
 * NPS_MIN_ACCOUNT_AGE_DAYS, logged in within that window, and neither answered nor dismissed the survey in the last
 * NPS_CADENCE_DAYS (ACC-FB-4).
 */
export async function dispatchNpsSurveys(app: Pick<FastifyInstance, 'prisma' | 'log'>, now = new Date()) {
  return runWithTenantContext(systemContext(), async () => {
    const cutoff = new Date(now.getTime() - NPS_MIN_ACCOUNT_AGE_DAYS * DAY_MS);
    const cadence = new Date(now.getTime() - NPS_CADENCE_DAYS * DAY_MS);
    const users = await app.prisma.user.findMany({
      where: { isActive: true, createdAt: { lte: cutoff }, lastLogin: { gte: cutoff }, role: { in: ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_FINANCE', 'TENANT_STAFF'] }, tenant: { status: { in: ['ACTIVE', 'TRIALING'] } } },
      select: { id: true, tenantId: true },
      take: 5000
    });
    const states = await app.prisma.npsPromptState.findMany({ where: { userId: { in: users.map((user) => user.id) } } });
    const byUser = new Map(states.map((state) => [state.userId, state]));
    let marked = 0;
    for (const user of users) {
      const state = byUser.get(user.id);
      if (state?.eligibleAt) continue;
      if ((state?.lastRespondedAt && state.lastRespondedAt > cadence) || (state?.dismissedAt && state.dismissedAt > cadence)) continue;
      await app.prisma.npsPromptState.upsert({ where: { userId: user.id }, update: { eligibleAt: now }, create: { userId: user.id, tenantId: user.tenantId, eligibleAt: now } });
      marked += 1;
    }
    return { checked: users.length, marked };
  });
}
