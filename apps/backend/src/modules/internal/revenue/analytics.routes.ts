import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { platformMrr } from '../../../services/console-metrics.service.js';
import { defaultQueueRegistry } from '../../../services/queue-registry.js';
import { buildTimelines, monthOf, mrrByPlan, mrrMovement, runRateForecast, signupCohorts } from '../../../services/revenue/revenue-analytics.service.js';

// revenue.analytics (WP-3.2): every endpoint needs revenue.analytics.read and carries { dataSince, reconstructedBefore }
// so the console can mark periods rebuilt by the 0051 backfill.

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const rangeQuery = z.object({ from: month.optional(), to: month.optional() });
const cohortQuery = rangeQuery.extend({ by: z.literal('signup_month').default('signup_month') });
const forecastQuery = z.object({ months: z.coerce.number().int().min(1).max(24).default(6) });

const read = { preHandler: [authenticatePlatformSession, requireConsolePermission('revenue.analytics.read')] };

/** Default window: the last 12 months including the current one. */
function range(query: { from?: string; to?: string }, now = new Date()) {
  const to = query.to ?? monthOf(now);
  const from = query.from ?? monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)));
  return { from, to };
}

export async function registerConsoleRevenueAnalyticsRoutes(app: FastifyInstance) {
  app.get('/api/internal/revenue/analytics/mrr-movement', read, async (request, reply) => {
    const parsed = rangeQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const { from, to } = range(parsed.data);
    if (from > to) return reply.status(400).send({ error: 'INVALID_QUERY', message: '`from` must not be after `to`' });
    const { timelines, coverage } = await buildTimelines(app.prisma);
    return reply.send({ ...coverage, from, to, data: mrrMovement(timelines, from, to) });
  });

  app.get('/api/internal/revenue/analytics/cohorts', read, async (request, reply) => {
    const parsed = cohortQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const { from, to } = range(parsed.data);
    const { timelines, coverage } = await buildTimelines(app.prisma);
    return reply.send({ ...coverage, by: parsed.data.by, from, to, data: signupCohorts(timelines, from, to) });
  });

  app.get('/api/internal/revenue/analytics/by-plan', read, async (_request, reply) => {
    const [{ coverage }, byPlan] = await Promise.all([buildTimelines(app.prisma), mrrByPlan(app.prisma)]);
    return reply.send({ ...coverage, ...byPlan, asOf: new Date().toISOString() });
  });

  app.get('/api/internal/revenue/analytics/forecast', read, async (request, reply) => {
    const parsed = forecastQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const now = new Date();
    const { from, to } = range({}, now);
    const [{ timelines, coverage }, mrr] = await Promise.all([buildTimelines(app.prisma), platformMrr({ app, queues: defaultQueueRegistry, now })]);
    return reply.send({ ...coverage, currency: mrr.currency, ...runRateForecast(mrr.amount, mrrMovement(timelines, from, to), parsed.data.months, now) });
  });
}
