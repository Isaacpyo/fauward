import type { Permission } from '@fauward/internal-rbac';
import { CONSOLE_METRICS, platformMrr, type MetricsDeps } from './console-metrics.service.js';
import { readRequestMetrics } from './metrics/request-metrics.js';

// GET /api/internal/badges (WP-3.4, architecture §6.4): one value per badge key, computed only for keys the caller may
// read. A key without data says why (`reason`); there are no placeholder badges.

export type BadgeTone = 'neutral' | 'green' | 'amber' | 'red';
export type BadgeValue = { value: number | { amount: string; currency: string } | null; tone: BadgeTone; asOf: string; unit?: 'ms' | 'ratio'; reason?: string };

export const BADGE_KEYS = [
  'tenant-count',
  'suspended-count',
  'dlq-depth',
  'mrr',
  'open-platform-tickets',
  'open-escalations',
  'pending-approvals',
  'open-appeals',
  'dsar-due-7d',
  'failed-jobs-24h',
  'integrations-degraded',
  'p95-latency',
  'error-rate'
] as const;
export type BadgeKey = (typeof BADGE_KEYS)[number];

/** Provider statuses that read as healthy or not yet known; anything else counts as degraded. */
// Statuses written by the integration-health poll (WP-4.3) that need attention.
const UNHEALTHY_PROVIDER_STATUSES = ['DEGRADED', 'DOWN'];
export const HEALTH_BADGE_WINDOW_MINUTES = 15;

const countTone = (value: number, whenPositive: BadgeTone): BadgeTone => (value > 0 ? whenPositive : 'green');

type BadgeDefinition = { permissions: readonly Permission[]; compute: (deps: MetricsDeps, can: (permission: Permission) => boolean) => Promise<Omit<BadgeValue, 'asOf'>> };

const fromMetric = (key: keyof typeof CONSOLE_METRICS, tone: (value: number) => BadgeTone): BadgeDefinition => ({
  permissions: [CONSOLE_METRICS[key].permission],
  compute: async (deps) => {
    const value = (await CONSOLE_METRICS[key].compute(deps)) as number;
    return { value, tone: tone(value) };
  }
});

async function httpWindow(deps: MetricsDeps) {
  return readRequestMetrics(deps.app.redis, { minutes: HEALTH_BADGE_WINDOW_MINUTES, now: deps.now.getTime() });
}

const PENDING_KEYS = ['pendingRefunds', 'pendingJit', 'pendingPlanChanges', 'pendingRegionRequests', 'pendingAppeals', 'openDsars'] as const;

export const BADGES: Record<BadgeKey, BadgeDefinition> = {
  'tenant-count': {
    permissions: ['platform.tenants.read'],
    compute: async (deps) => {
      const [active, trialing] = await Promise.all([CONSOLE_METRICS.activeTenants.compute(deps), CONSOLE_METRICS.trialingTenants.compute(deps)]);
      return { value: active + trialing, tone: 'neutral' };
    }
  },
  'suspended-count': fromMetric('suspendedTenants', (value) => countTone(value, 'amber')),
  'dlq-depth': fromMetric('dlqDepth', (value) => countTone(value, 'red')),
  mrr: {
    permissions: ['revenue.analytics.read'],
    compute: async (deps) => {
      const mrr = await platformMrr(deps);
      return { value: { amount: mrr.amount, currency: mrr.currency }, tone: 'neutral', ...(mrr.unconverted ? { reason: `${mrr.unconverted} subscription(s) without an FX rate are not included` } : {}) };
    }
  },
  'open-platform-tickets': fromMetric('openPlatformTickets', (value) => (value > 0 ? 'amber' : 'green')),
  'open-escalations': fromMetric('openEscalations', (value) => countTone(value, 'red')),
  'pending-approvals': {
    permissions: PENDING_KEYS.map((key) => CONSOLE_METRICS[key].permission),
    compute: async (deps, can) => {
      const visible = PENDING_KEYS.filter((key) => can(CONSOLE_METRICS[key].permission));
      const values = await Promise.all(visible.map((key) => CONSOLE_METRICS[key].compute(deps)));
      const total = values.reduce((sum, value) => sum + value, 0);
      return { value: total, tone: countTone(total, 'amber') };
    }
  },
  'open-appeals': fromMetric('pendingAppeals', (value) => countTone(value, 'amber')),
  'dsar-due-7d': fromMetric('dsarDue7d', (value) => countTone(value, 'red')),
  'failed-jobs-24h': fromMetric('failedJobs24h', (value) => countTone(value, 'red')),
  'integrations-degraded': {
    permissions: ['platform.integrations.read'],
    compute: async (deps) => {
      const [providers, gateways] = await Promise.all([
        deps.app.prisma.integrationProviderStatus.count({ where: { status: { in: UNHEALTHY_PROVIDER_STATUSES } } }),
        deps.app.prisma.tenantPaymentGateway.count({ where: { status: 'FAILED' } })
      ]);
      const value = providers + gateways;
      return { value, tone: countTone(value, 'red') };
    }
  },
  'p95-latency': {
    permissions: ['platform.health.read'],
    compute: async (deps) => {
      const report = await httpWindow(deps);
      if (!report) return { value: null, tone: 'neutral', unit: 'ms', reason: `No API requests recorded in the last ${HEALTH_BADGE_WINDOW_MINUTES} minutes` };
      const p95 = report.http.p95;
      return { value: p95, unit: 'ms', tone: p95 > 1_000 ? 'red' : p95 > 500 ? 'amber' : 'green' };
    }
  },
  'error-rate': {
    permissions: ['platform.health.read'],
    compute: async (deps) => {
      const report = await httpWindow(deps);
      if (!report) return { value: null, tone: 'neutral', unit: 'ratio', reason: `No API requests recorded in the last ${HEALTH_BADGE_WINDOW_MINUTES} minutes` };
      const rate = report.http.errorRate5xx;
      return { value: rate, unit: 'ratio', tone: rate >= 0.05 ? 'red' : rate >= 0.01 ? 'amber' : 'green' };
    }
  }
};

/** Every badge the caller may read (any of the key's permissions). A failing computation is reported, not hidden. */
export async function computeBadges(deps: MetricsDeps, can: (permission: Permission) => boolean, keys: readonly BadgeKey[] = BADGE_KEYS) {
  const asOf = deps.now.toISOString();
  const entries = await Promise.all(
    keys
      .filter((key) => BADGES[key].permissions.some(can))
      .map(async (key) => {
        try {
          return [key, { ...(await BADGES[key].compute(deps, can)), asOf }] as const;
        } catch (err: unknown) {
          deps.app.log.warn({ err, badge: key }, 'Badge computation failed');
          return [key, { value: null, tone: 'neutral' as const, asOf, reason: 'Could not be computed; see the API log' }] as const;
        }
      })
  );
  return Object.fromEntries(entries) as Partial<Record<BadgeKey, BadgeValue>>;
}
