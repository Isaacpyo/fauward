import type { FastifyInstance } from 'fastify';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';
import { notifyTenantAdmins } from '../services/platform-notifier.service.js';
import { resolveTenantEntitlements } from '../services/tenant-entitlements.service.js';

// Daily tenant notices (WP-2.2): sent through PlatformNotifier instead of the NotificationLog rows these jobs used to
// write and nobody sent (C1). Each notice goes out once per tenant per trial end / month / threshold (Redis NX key).

const DAY_SECONDS = 24 * 60 * 60;

type NoticeApp = Pick<FastifyInstance, 'prisma' | 'redis' | 'log'> & FastifyInstance;

async function firstTime(app: NoticeApp, key: string, ttlSeconds: number) {
  return (await app.redis.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
}

/** tenant.trial-expiry-warning (daily): admins of tenants whose trial ends within 3 days hear about it once. */
export async function sendTrialExpiryWarnings(app: NoticeApp, now = new Date()) {
  return runWithTenantContext(systemContext(), async () => {
    const inThreeDays = new Date(now.getTime() + 3 * DAY_SECONDS * 1000);
    const subs = await app.prisma.subscription.findMany({
      where: { status: 'TRIALING', trialEnd: { gte: now, lte: inThreeDays } },
      select: { tenantId: true, trialEnd: true, tenant: { select: { name: true } } }
    });
    let sent = 0;
    for (const sub of subs) {
      const trialEnd = sub.trialEnd?.toISOString().slice(0, 10) ?? '';
      if (!(await firstTime(app, `notice:trial-expiring:${sub.tenantId}:${trialEnd}`, 7 * DAY_SECONDS))) continue;
      await notifyTenantAdmins(app, {
        tenantId: sub.tenantId,
        event: 'trial.expiring',
        title: 'Your trial is ending soon',
        body: `Your trial ends on ${trialEnd}. Choose a plan to keep your workspace.`,
        link: '/settings?tab=billing',
        email: { template: 'trial_expiring', data: { trialEnd, tenantName: sub.tenant.name } }
      });
      sent += 1;
    }
    return { candidates: subs.length, sent };
  });
}

/** tenant.usage-report (daily): admins hear once a month at 80 % and once at 100 % of the monthly shipment limit. */
export async function sendUsageThresholdNotices(app: NoticeApp, now = new Date()) {
  return runWithTenantContext(systemContext(), async () => {
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const records = await app.prisma.usageRecord.findMany({ where: { month, shipments: { gt: 0 } }, select: { tenantId: true, shipments: true } });
    let sent = 0;
    for (const record of records) {
      const tenant = await app.prisma.tenant.findFirst({
        where: { id: record.tenantId, status: { in: ['ACTIVE', 'TRIALING'] } },
        select: { id: true, name: true, plan: true, maxStaff: true, maxShipmentsPm: true, maxOrganisations: true, limitsOverriddenAt: true }
      });
      if (!tenant) continue;
      const limit = (await resolveTenantEntitlements(app.prisma, tenant)).limits.maxShipmentsPm;
      if (limit <= 0) continue;
      const level = record.shipments >= limit ? 'limit' : record.shipments >= limit * 0.8 ? 'warning' : null;
      if (!level) continue;
      if (!(await firstTime(app, `notice:usage:${tenant.id}:${month}:${level}`, 40 * DAY_SECONDS))) continue;
      await notifyTenantAdmins(app, {
        tenantId: tenant.id,
        event: level === 'limit' ? 'usage.limit_reached' : 'usage.warning_80',
        title: level === 'limit' ? 'Monthly shipment limit reached' : 'You have used 80% of your monthly shipments',
        body: `${record.shipments} of ${limit} shipments used in ${month}.`,
        link: '/settings?tab=billing',
        email: { template: level === 'limit' ? 'usage_limit_reached' : 'usage_warning_80', data: { used: record.shipments, limit, tenantName: tenant.name } }
      });
      sent += 1;
    }
    return { tenants: records.length, sent };
  });
}
