import type { FastifyInstance } from 'fastify';
import type { Permission } from '@fauward/internal-rbac';
import { config } from '../config/index.js';
import { OPEN_DSAR_STATUSES } from './dsar.service.js';
import { readRequestMetrics } from './metrics/request-metrics.js';
import { summariseQueue } from './queue-operations.service.js';
import type { QueueRegistry } from './queue-registry.js';
import { mrrForSubscription, sumMrr } from './revenue/mrr.service.js';

// Console dashboard numbers (WP-3.1) shared by GET /metrics/overview and GET /badges (WP-3.4). Each metric names the
// permission that may see it; callers compute only what the staff member holds. Console routes run in system context,
// so these cross-tenant counts are deliberate and permission-gated.

export type MetricsDeps = { app: Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>; queues: QueueRegistry; now: Date };

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] as const;
/** Statuses an appeal sits in while it waits for a decision (OPEN is the pre-WP-2.4 name). */
const PENDING_APPEAL_STATUSES = ['PENDING', 'OPEN'];
/** Subscriptions that bill (D4): trialing, cancelled and incomplete ones contribute no MRR. */
export const MRR_SUBSCRIPTION_STATUSES = ['ACTIVE', 'PAST_DUE'];

export async function platformMrr(deps: MetricsDeps) {
  const subscriptions = await deps.app.prisma.subscription.findMany({
    where: { status: { in: MRR_SUBSCRIPTION_STATUSES }, tenant: { status: { not: 'DEMO' } } },
    select: { plan: true, billingCycle: true, status: true, tenant: { select: { id: true, status: true, plan: true } } }
  });
  const contributions = await Promise.all(
    subscriptions.map((subscription) => mrrForSubscription(deps.app.prisma, subscription.tenant, subscription, { now: deps.now, baseCurrency: config.billing.baseCurrency }))
  );
  const total = sumMrr(contributions, config.billing.baseCurrency);
  return { ...total, subscriptions: subscriptions.length, asOf: deps.now.toISOString() };
}

async function errorRateLastHour(deps: MetricsDeps) {
  const report = await readRequestMetrics(deps.app.redis, { minutes: 60, now: deps.now.getTime() });
  return report ? { rate: report.http.errorRate5xx, requests: report.http.count } : { rate: null, requests: 0 };
}

async function dlqDepth(deps: MetricsDeps) {
  const queues = await Promise.all(deps.queues().map((entry) => summariseQueue(entry, deps.now.getTime())));
  return queues.reduce((sum, queue) => sum + (queue.dlqDepth ?? 0), 0);
}

const since = (deps: MetricsDeps, days: number) => new Date(deps.now.getTime() - days * DAY_MS);
const startOfDay = (deps: MetricsDeps) => {
  const day = new Date(deps.now);
  day.setUTCHours(0, 0, 0, 0);
  return day;
};

/** Every countable metric: the permission that may read it and how it is computed. */
export const CONSOLE_METRICS = {
  activeTenants: { permission: 'platform.tenants.read', compute: (deps: MetricsDeps) => deps.app.prisma.tenant.count({ where: { status: 'ACTIVE' } }) },
  trialingTenants: { permission: 'platform.tenants.read', compute: (deps: MetricsDeps) => deps.app.prisma.tenant.count({ where: { status: 'TRIALING' } }) },
  suspendedTenants: { permission: 'platform.tenants.read', compute: (deps: MetricsDeps) => deps.app.prisma.tenant.count({ where: { status: 'SUSPENDED' } }) },
  signups7d: { permission: 'platform.tenants.read', compute: (deps: MetricsDeps) => deps.app.prisma.tenant.count({ where: { createdAt: { gte: since(deps, 7) }, status: { not: 'DEMO' } } }) },
  shipmentsToday: { permission: 'platform.tenants.read', compute: (deps: MetricsDeps) => deps.app.prisma.shipment.count({ where: { createdAt: { gte: startOfDay(deps) } } }) },
  shipments30d: { permission: 'platform.tenants.read', compute: (deps: MetricsDeps) => deps.app.prisma.shipment.count({ where: { createdAt: { gte: since(deps, 30) } } }) },
  dlqDepth: { permission: 'platform.queues.read', compute: dlqDepth },
  error5xxRate1h: { permission: 'platform.health.read', compute: errorRateLastHour },
  failedPayments30d: {
    permission: 'revenue.invoices.read',
    compute: (deps: MetricsDeps) => deps.app.prisma.payment.count({ where: { kind: 'PLATFORM', status: 'FAILED', createdAt: { gte: since(deps, 30) } } })
  },
  openPlatformTickets: {
    permission: 'customer.support.read',
    compute: (deps: MetricsDeps) => deps.app.prisma.supportTicket.count({ where: { audience: 'PLATFORM', status: { in: [...OPEN_TICKET_STATUSES] } } })
  },
  openEscalations: {
    permission: 'platform.incidents.read',
    compute: (deps: MetricsDeps) => deps.app.prisma.exceptionCase.count({ where: { escalatedAt: { not: null }, platformResolvedAt: null } })
  },
  pendingRefunds: { permission: 'revenue.invoices.read', compute: (deps: MetricsDeps) => deps.app.prisma.refundApproval.count({ where: { status: 'PENDING' } }) },
  pendingJit: { permission: 'trust.jit.approve', compute: (deps: MetricsDeps) => deps.app.prisma.jitAccessRequest.count({ where: { status: 'PENDING' } }) },
  pendingPlanChanges: { permission: 'revenue.subscriptions.read', compute: (deps: MetricsDeps) => deps.app.prisma.planChangeRequest.count({ where: { status: 'PENDING' } }) },
  pendingRegionRequests: { permission: 'platform.tenants.read', compute: (deps: MetricsDeps) => deps.app.prisma.regionChangeRequest.count({ where: { status: 'PENDING' } }) },
  pendingAppeals: { permission: 'trust.safety.read', compute: (deps: MetricsDeps) => deps.app.prisma.tenantAppeal.count({ where: { status: { in: PENDING_APPEAL_STATUSES } } }) },
  openDsars: { permission: 'trust.compliance.dsar.read', compute: (deps: MetricsDeps) => deps.app.prisma.dSARRequest.count({ where: { status: { in: OPEN_DSAR_STATUSES } } }) },
  dsarDue7d: {
    permission: 'trust.compliance.dsar.read',
    compute: (deps: MetricsDeps) => deps.app.prisma.dSARRequest.count({ where: { status: { in: OPEN_DSAR_STATUSES }, dueAt: { lte: new Date(deps.now.getTime() + 7 * DAY_MS) } } })
  },
  failedJobs24h: {
    permission: 'platform.jobs.read',
    compute: (deps: MetricsDeps) => deps.app.prisma.scheduledJobRun.count({ where: { status: { in: ['FAILED', 'TIMED_OUT'] }, startedAt: { gte: since(deps, 1) } } })
  },
  mrr: { permission: 'revenue.analytics.read', compute: platformMrr }
} as const satisfies Record<string, { permission: Permission; compute: (deps: MetricsDeps) => Promise<unknown> }>;

export type ConsoleMetricKey = keyof typeof CONSOLE_METRICS;
export type ConsoleMetricValue<K extends ConsoleMetricKey> = Awaited<ReturnType<(typeof CONSOLE_METRICS)[K]['compute']>>;

/** Computes the requested metrics the caller may see; the others are left out of the result. */
export async function computeMetrics<K extends ConsoleMetricKey>(deps: MetricsDeps, keys: readonly K[], can: (permission: Permission) => boolean) {
  const visible = keys.filter((key) => can(CONSOLE_METRICS[key].permission));
  const values = await Promise.all(visible.map(async (key) => [key, await CONSOLE_METRICS[key].compute(deps)] as const));
  return Object.fromEntries(values) as { [P in K]?: ConsoleMetricValue<P> };
}
