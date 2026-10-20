import type { FastifyInstance } from 'fastify';
import type { Permission } from '@fauward/internal-rbac';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { loadConsoleContext, type ConsoleRequestContext } from '../../../middleware/require-console-permission.js';
import { computeMetrics, type MetricsDeps } from '../../../services/console-metrics.service.js';
import { defaultQueueRegistry, type QueueRegistry } from '../../../services/queue-registry.js';

// GET /api/internal/metrics/overview (WP-3.1). Session-only: every field is computed only when the caller holds the
// permission that reads it (money — `mrr` — needs revenue.analytics.read); fields the caller cannot see are absent.

/** Role permissions plus active JIT grants, as the route guards check them. */
export function consoleCan(context: ConsoleRequestContext) {
  return (permission: Permission) => context.rolePermissions.has(permission) || context.jit.has(permission);
}

const OVERVIEW_KEYS = [
  'mrr',
  'activeTenants',
  'trialingTenants',
  'suspendedTenants',
  'signups7d',
  'shipmentsToday',
  'shipments30d',
  'dlqDepth',
  'error5xxRate1h',
  'failedPayments30d',
  'openPlatformTickets',
  'openEscalations',
  'pendingRefunds',
  'pendingJit',
  'pendingPlanChanges',
  'pendingRegionRequests',
  'pendingAppeals',
  'openDsars'
] as const;

export async function buildOverview(deps: MetricsDeps, can: (permission: Permission) => boolean) {
  const values = await computeMetrics(deps, OVERVIEW_KEYS, can);
  const { pendingRefunds, pendingJit, pendingPlanChanges, pendingRegionRequests, pendingAppeals, openDsars, ...rest } = values;
  const pendingApprovals = {
    ...(pendingRefunds !== undefined ? { refunds: pendingRefunds } : {}),
    ...(pendingJit !== undefined ? { jit: pendingJit } : {}),
    ...(pendingPlanChanges !== undefined ? { planChanges: pendingPlanChanges } : {}),
    ...(pendingRegionRequests !== undefined ? { regionRequests: pendingRegionRequests } : {}),
    ...(pendingAppeals !== undefined ? { appeals: pendingAppeals } : {}),
    ...(openDsars !== undefined ? { dsar: openDsars } : {})
  };
  return { asOf: deps.now.toISOString(), ...rest, pendingApprovals };
}

export async function registerConsoleMetricsRoutes(app: FastifyInstance, options: { queues?: QueueRegistry } = {}) {
  const queues = options.queues ?? defaultQueueRegistry;
  app.get('/api/internal/metrics/overview', { preHandler: [authenticatePlatformSession] }, async (request, reply) => {
    const context = await loadConsoleContext(request);
    return reply.send(await buildOverview({ app, queues, now: new Date() }, consoleCan(context)));
  });
}
