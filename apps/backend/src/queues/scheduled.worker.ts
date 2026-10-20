import type { FastifyInstance } from 'fastify';
import { Worker } from 'bullmq';
import { Prisma } from '@prisma/client';

import { runOverdueInvoiceSweep } from '../modules/finance/finance.routes.js';
import { domainService } from '../modules/tenants/domain.service.js';
import { cleanupExpiredSlugHistory } from '../jobs/slug-history-cleanup.js';
import { sweepExpiredImpersonationSessions } from '../jobs/impersonation-expiry-sweep.js';
import { pruneOldActivity } from '../jobs/activity-prune.js';
import { sendTrialExpiryWarnings, sendUsageThresholdNotices } from '../jobs/tenant-notices.js';
import { sweepSupportSla } from '../jobs/support-sla-sweep.js';
import { dispatchNpsSurveys, npsHealthComponent } from '../services/feedback.service.js';
import { DSAR_ERASE_JOB, DSAR_GATHER_JOB, eraseDsar, gatherDsar, sweepOverdueDsars } from '../services/dsar.service.js';
import { FAILED_LOGIN_SPIKE_RULE } from '../config/safety-rules.js';
import { bullmqConnection, scheduledJobsQueue } from './queues.js';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from '../services/platform-activity.service.js';
import { findScheduledJob, listScheduledJobs, registerScheduledJob, runScheduledJob } from './scheduled-job-runner.js';
import { monthKey } from '../services/usage-storage.service.js';

type ScheduledJobData = Record<string, unknown>;

let worker: Worker<ScheduledJobData> | null = null;
let repeatableJobsRegistered = false;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Health bands used for playbook triggers and the `health.score_changed` activity (L19). */
export function healthBand(score: number) {
  return score < 45 ? 'AT_RISK' : score >= 80 ? 'HEALTHY' : 'NEUTRAL';
}

export async function computeAndStoreHealthScore(app: FastifyInstance, tenantId: string) {
  const now = new Date();
  const [
    tenant,
    users,
    shipments30,
    shipmentsPrevious30,
    shipments90,
    failedPayments,
    openTickets,
    negativeTickets,
    apiKeys,
    webhooks,
    previous,
    nps,
    returns30,
    customs30,
    documents30,
    usageMonth,
    aiMonth
  ] = await Promise.all([
    app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, customDomain: true } }),
    app.prisma.user.findMany({ where: { tenantId, isActive: true }, select: { lastLogin: true } }),
    app.prisma.shipment.count({ where: { tenantId, createdAt: { gte: daysAgo(30) } } }),
    app.prisma.shipment.count({ where: { tenantId, createdAt: { gte: daysAgo(60), lt: daysAgo(30) } } }),
    app.prisma.shipment.count({ where: { tenantId, createdAt: { gte: daysAgo(90) } } }),
    app.prisma.payment.count({ where: { kind: 'TENANT_CUSTOMER', tenantId, status: 'FAILED' } }),
    app.prisma.supportVendorTicket.count({ where: { tenantId, status: { in: ['new', 'open', 'pending'] } } }),
    app.prisma.supportVendorTicket.count({ where: { tenantId, sentiment: { in: ['negative', 'angry', 'frustrated'] } } }),
    app.prisma.apiKey.count({ where: { tenantId, isActive: true } }),
    app.prisma.webhookEndpoint.count({ where: { tenantId, isActive: true } }),
    app.prisma.tenantHealthScore.findFirst({ where: { tenantId }, orderBy: { computedAt: 'desc' } }),
    npsHealthComponent(app.prisma, tenantId, now),
    // L19 (WP-2.18): usage inputs recorded with every score; WP-3.3 decides their weights.
    app.prisma.returnRequest.count({ where: { tenantId, createdAt: { gte: daysAgo(30) } } }),
    app.prisma.customsDeclaration.count({ where: { tenantId, createdAt: { gte: daysAgo(30) } } }),
    app.prisma.shipmentDocument.count({ where: { tenantId, generatedAt: { gte: daysAgo(30) } } }),
    app.prisma.usageRecord.findUnique({ where: { tenantId_month: { tenantId, month: monthKey(now) } } }),
    app.prisma.tenantAiUsage.aggregate({ where: { tenantId, month: monthKey(now) }, _sum: { requestCount: true, costUsd: true } })
  ]);

  const recentLogins = users.filter((user) => user.lastLogin && user.lastLogin >= daysAgo(30)).length;
  const lastLoginAt = users.map((user) => user.lastLogin?.getTime() ?? 0).sort((a, b) => b - a)[0] ?? 0;
  const daysSinceLogin = lastLoginAt > 0 ? Math.floor((now.getTime() - lastLoginAt) / (24 * 60 * 60 * 1000)) : 999;
  const loginRecency = daysSinceLogin <= 7 ? 12 : daysSinceLogin <= 30 ? 8 : daysSinceLogin <= 60 ? 4 : 0;
  const loginFrequency = users.length > 0 ? Math.round((recentLogins / users.length) * 8) : 0;
  const loginScore = clamp(loginRecency + loginFrequency, 0, 20);

  const shipmentGrowth = shipmentsPrevious30 > 0 ? (shipments30 - shipmentsPrevious30) / shipmentsPrevious30 : shipments30 > 0 ? 1 : -1;
  const shipmentScore = clamp(Math.round(10 + shipmentGrowth * 15), 0, 25);

  const featureScore =
    (shipments90 > 0 ? 2 : 0) +
    (users.length > 1 ? 2 : 0) +
    (apiKeys > 0 ? 4 : 0) +
    (webhooks > 0 ? 4 : 0) +
    (tenant?.customDomain ? 3 : 0);
  const paymentScore = clamp(15 - failedPayments * 5, 0, 15);
  const ticketScore = clamp(15 - openTickets * 2 - negativeTickets * 4, 0, 15);
  const npsScore = nps.score;
  const score = clamp(loginScore + shipmentScore + featureScore + paymentScore + ticketScore + npsScore, 0, 100);
  const trend = !previous ? 'flat' : score > previous.score ? 'up' : score < previous.score ? 'down' : 'flat';

  const row = await app.prisma.tenantHealthScore.create({
    data: {
      tenantId,
      score,
      trend,
      factors: {
        login: { score: loginScore, daysSinceLogin, recentLogins, activeUsers: users.length },
        shipmentTrend: { score: shipmentScore, shipments30, shipmentsPrevious30, shipments90 },
        featureBreadth: { score: featureScore, apiKeys, webhooks, customDomain: Boolean(tenant?.customDomain) },
        paymentHealth: { score: paymentScore, failedPayments },
        ticketSentimentVolume: { score: ticketScore, openTickets, negativeTickets },
        nps: { score: npsScore, source: nps.source, responses: nps.responses, value: nps.nps },
        inputs: {
          returns30,
          customsDeclarations30: customs30,
          documents30,
          month: monthKey(now),
          apiCalls: usageMonth?.apiCalls ?? 0,
          emailsSent: usageMonth?.emailsSent ?? 0,
          smsSent: usageMonth?.smsSent ?? 0,
          storageBytes: Number(usageMonth?.storageBytes ?? 0),
          aiRequests: aiMonth._sum.requestCount ?? 0,
          aiCostUsd: Number((aiMonth._sum.costUsd ?? 0).toFixed(2))
        }
      }
    }
  });

  const band = healthBand(score);
  const previousBand = previous ? healthBand(previous.score) : null;
  if (previousBand && previousBand !== band) {
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: app.log },
      {
        service: 'customer.success',
        type: 'health.score_changed',
        tenantId,
        ...SYSTEM_ACTOR,
        subjectType: 'tenant',
        subjectId: tenantId,
        summary: `Health ${previous!.score} → ${score} (${previousBand.replace('_', ' ').toLowerCase()} → ${band.replace('_', ' ').toLowerCase()})`,
        severity: band === 'AT_RISK' ? 'ATTENTION' : 'INFO',
        consoleLink: `/customer/360/${tenantId}?tab=health`,
        metadata: { from: previous!.score, to: score, fromBand: previousBand, toBand: band },
        dedupeKey: `health.score_changed:${row.id}`
      }
    );
  }

  const triggers: string[] = [];
  if (score < 45 && (!previous || previous.score >= 45)) triggers.push('health_below_45');
  if (score >= 80 && previous && previous.score < 80) triggers.push('health_above_80');

  if (triggers.length > 0) {
    const playbooks = await app.prisma.cSPlaybook.findMany({ where: { active: true, trigger: { in: triggers } } });
    for (const playbook of playbooks) {
      await app.prisma.cSPlaybookRun.create({
        data: {
          playbookId: playbook.id,
          tenantId,
          status: 'PENDING',
          steps: playbook.steps === null ? Prisma.JsonNull : playbook.steps,
          currentStep: 0
        }
      });
    }
  }

  return row;
}

// ---- Scheduled jobs (platform.jobs, WP-3.8). Names, crons and repeat ids are unchanged from before the registry. ----

registerScheduledJob({
  name: 'finance.overdue-invoice-sweep',
  pattern: '0 0 * * *',
  repeatJobId: 'finance.overdue-invoice-sweep.daily',
  description: 'Marks unpaid invoices past their due date as overdue.',
  handler: async (app) => ({ affected: await runOverdueInvoiceSweep(app) })
});

registerScheduledJob({
  name: 'idempotency.cleanup',
  pattern: '0 * * * *',
  repeatJobId: 'idempotency.cleanup.hourly',
  description: 'Deletes expired idempotency keys.',
  handler: async (app) => {
    const result = await app.prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return { deleted: result.count };
  }
});

registerScheduledJob({
  name: 'tenant.slug-history.cleanup',
  pattern: '20 2 * * *',
  repeatJobId: 'tenant.slug-history.cleanup.daily',
  description: 'Removes tenant slug redirects past their retention.',
  handler: async (app) => cleanupExpiredSlugHistory(app.prisma)
});

registerScheduledJob({
  name: 'finance.fx-rate-refresh',
  pattern: '0 6 * * *',
  repeatJobId: 'finance.fx-rate-refresh.daily',
  description: 'No FX provider is integrated: records that rates were not refreshed (CurrencyRate is maintained by hand).',
  handler: async () => ({ refreshed: 0, reason: 'No FX provider integrated' })
});

registerScheduledJob({
  name: 'tenant.trial-expiry-warning',
  pattern: '15 0 * * *',
  repeatJobId: 'tenant.trial-expiry-warning.daily',
  description: 'Emails tenant admins whose trial ends soon.',
  handler: async (app) => sendTrialExpiryWarnings(app)
});

registerScheduledJob({
  name: 'tenant.usage-report',
  pattern: '0 1 * * *',
  repeatJobId: 'tenant.usage-report.daily',
  description: 'Sends plan usage threshold notices.',
  handler: async (app) => sendUsageThresholdNotices(app)
});

registerScheduledJob({
  name: 'customer.health-scoring',
  pattern: '30 1 * * *',
  repeatJobId: 'customer.health-scoring.nightly',
  description: 'Scores every active and trialing tenant (customer.success).',
  timeoutMs: 60 * 60_000,
  handler: async (app) => {
    const tenants = await app.prisma.tenant.findMany({ where: { status: { in: ['ACTIVE', 'TRIALING'] } }, select: { id: true } });
    for (const tenant of tenants) {
      await computeAndStoreHealthScore(app, tenant.id);
    }
    return { tenants: tenants.length };
  }
});

registerScheduledJob({
  name: 'trust.security-anomaly-scan',
  pattern: '15 * * * *',
  repeatJobId: 'trust.security-anomaly-scan.hourly',
  description: 'Flags failed staff login spikes and blocks noisy IPs.',
  handler: async (app) => {
    const cutoff = new Date(Date.now() - FAILED_LOGIN_SPIKE_RULE.windowMinutes * 60 * 1000);
    const failedAttempts = await app.prisma.staffLoginAttempt.groupBy({
      by: ['staffEmail'],
      where: { success: false, createdAt: { gte: cutoff } },
      _count: { id: true }
    });
    const spikes = failedAttempts.filter((row) => row._count.id > FAILED_LOGIN_SPIKE_RULE.maxFailuresPerAccount);
    for (const attempt of spikes) {
      await app.prisma.securityAnomaly.create({
        data: { anomalyType: 'failed_login_spike', severity: 'HIGH', status: 'OPEN', payload: { staffEmail: attempt.staffEmail, count: attempt._count.id } }
      });
    }
    const failedIpAttempts = await app.prisma.staffLoginAttempt.groupBy({
      by: ['ipAddress'],
      where: { success: false, createdAt: { gte: cutoff }, ipAddress: { not: null } },
      _count: { id: true }
    });
    const blocked = failedIpAttempts.filter((row) => row.ipAddress && row._count.id > FAILED_LOGIN_SPIKE_RULE.maxFailuresPerIp);
    for (const attempt of blocked) {
      await app.prisma.ipBlock.upsert({
        where: { ipAddress: attempt.ipAddress! },
        create: { ipAddress: attempt.ipAddress!, reason: 'Failed login spike', expiresAt: new Date(Date.now() + FAILED_LOGIN_SPIKE_RULE.ipBlockMinutes * 60 * 1000), createdBy: 'trust.security-anomaly-scan' },
        update: { reason: 'Failed login spike', expiresAt: new Date(Date.now() + FAILED_LOGIN_SPIKE_RULE.ipBlockMinutes * 60 * 1000) }
      });
    }
    return { accountsChecked: failedAttempts.length, anomalies: spikes.length, ipsBlocked: blocked.length };
  }
});

registerScheduledJob({
  name: 'trust.sanctions-quarterly-rescreen',
  pattern: '0 3 1 * *',
  repeatJobId: 'trust.sanctions-quarterly-rescreen.monthly',
  description: 'Queues a sanctions re-screen for every active tenant.',
  handler: async (app) => {
    const tenants = await app.prisma.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    await app.prisma.sanctionsScreening.createMany({
      data: tenants.map((tenant) => ({ tenantId: tenant.id, status: 'PENDING', provider: 'complyadvantage', payload: { source: 'quarterly_rescreen' } }))
    });
    return { queued: tenants.length };
  }
});

registerScheduledJob({
  name: 'gtm.trial-activation-score',
  pattern: '45 1 * * *',
  repeatJobId: 'gtm.trial-activation-score.daily',
  description: 'Scores trial activation (first shipment, team, payments, webhooks, domain).',
  handler: async (app) => {
    const trialTenants = await app.prisma.tenant.findMany({ where: { status: 'TRIALING' }, select: { id: true, customDomain: true } });
    for (const tenant of trialTenants) {
      const [shipments, users, payments, webhooks] = await Promise.all([
        app.prisma.shipment.count({ where: { tenantId: tenant.id } }),
        app.prisma.user.count({ where: { tenantId: tenant.id } }),
        app.prisma.payment.count({ where: { kind: 'TENANT_CUSTOMER', tenantId: tenant.id } }),
        app.prisma.webhookEndpoint.count({ where: { tenantId: tenant.id } })
      ]);
      const score = (shipments > 0 ? 30 : 0) + (users > 1 ? 20 : 0) + (payments > 0 ? 25 : 0) + (webhooks > 0 ? 15 : 0) + (tenant.customDomain ? 10 : 0);
      const fields = {
        score,
        firstShipmentCreated: shipments > 0,
        teamInvited: users > 1,
        paymentMethodConnected: payments > 0,
        webhookConfigured: webhooks > 0,
        customDomainSet: Boolean(tenant.customDomain),
        interventionStatus: score < 50 ? 'CSM_INTERVENTION' : 'NONE'
      };
      await app.prisma.trialActivation.upsert({ where: { tenantId: tenant.id }, create: { tenantId: tenant.id, ...fields }, update: fields });
    }
    return { tenants: trialTenants.length };
  }
});

registerScheduledJob({
  name: 'gtm.demo-expiry',
  pattern: '30 * * * *',
  repeatJobId: 'gtm.demo-expiry.hourly',
  description: 'Expires demo environments past their end date and cancels their tenants.',
  handler: async (app) => {
    const expired = await app.prisma.demoEnvironment.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: new Date() } } });
    for (const demo of expired) {
      await domainService.removeCustomDomain(app.prisma, { tenantId: demo.tenantId, actorUserId: null, actorIp: null, actorType: 'SYSTEM' });
      await app.prisma.$transaction([
        app.prisma.demoEnvironment.update({ where: { id: demo.id }, data: { status: 'EXPIRED' } }),
        app.prisma.tenant.update({ where: { id: demo.tenantId }, data: { status: 'CANCELLED' } })
      ]);
    }
    return { expired: expired.length };
  }
});

registerScheduledJob({
  name: 'revenue.commission-aggregation',
  pattern: '0 4 1 * *',
  repeatJobId: 'revenue.commission-aggregation.monthly',
  description: 'No-op: there is no reseller programme; the job is deleted with commissions in WP-4.0b.',
  handler: async () => ({ aggregated: 0, reason: 'No reseller programme' })
});

registerScheduledJob({
  name: 'platform.impersonation-expiry-sweep',
  pattern: '*/5 * * * *',
  repeatJobId: 'platform.impersonation-expiry-sweep',
  description: 'Ends impersonation sessions past their expiry and records the end time.',
  handler: async (app) => ({ ended: await sweepExpiredImpersonationSessions(app.prisma) })
});

registerScheduledJob({
  name: 'customer.support-sla-sweep',
  pattern: '*/15 * * * *',
  repeatJobId: 'customer.support-sla-sweep',
  description: 'Flags platform tickets breaching their SLA.',
  handler: async (app) => sweepSupportSla(app)
});

registerScheduledJob({
  name: 'customer.nps-survey-dispatch',
  pattern: '10 7 * * *',
  repeatJobId: 'customer.nps-survey-dispatch',
  description: 'Shows the NPS survey to eligible tenant users.',
  handler: async (app) => dispatchNpsSurveys(app)
});

registerScheduledJob({
  name: 'trust.dsar-overdue-sweep',
  pattern: '20 6 * * *',
  repeatJobId: 'trust.dsar-overdue-sweep',
  description: 'Escalates DSARs close to or past their legal deadline.',
  handler: async (app) => sweepOverdueDsars(app)
});

registerScheduledJob({
  name: 'platform.activity-prune',
  pattern: '40 3 * * *',
  repeatJobId: 'platform.activity-prune',
  description: 'Deletes console activity older than 180 days.',
  handler: async (app) => pruneOldActivity(app.prisma)
});

export async function registerScheduledJobs() {
  if (repeatableJobsRegistered) return;
  for (const job of listScheduledJobs()) {
    await scheduledJobsQueue.add(job.name, {}, { jobId: job.repeatJobId, repeat: { pattern: job.pattern, tz: 'UTC' } });
  }
  repeatableJobsRegistered = true;
}

/** Scheduled runs carry no data; console-triggered runs carry `triggeredBy` (PlatformUser id) and `reason`. */
export async function processScheduledJob(app: FastifyInstance, job: { id?: string | null; name: string; data?: ScheduledJobData }) {
  const data = job.data ?? {};
  if (job.name === DSAR_GATHER_JOB) {
    const result = await gatherDsar(app, { dsarId: String(data.dsarId ?? ''), exportId: String(data.exportId ?? '') });
    app.log.info({ ...result, dsarId: data.dsarId }, 'DSAR gather finished');
    return;
  }
  if (job.name === DSAR_ERASE_JOB) {
    const result = await eraseDsar(app, { dsarId: String(data.dsarId ?? ''), tenantId: String(data.tenantId ?? '') });
    app.log.info({ status: result.status, dsarId: data.dsarId }, 'DSAR erasure finished');
    return;
  }
  const definition = findScheduledJob(job.name);
  if (!definition) {
    app.log.warn({ jobName: job.name }, 'Unknown scheduled job name');
    return;
  }
  await runScheduledJob(app, definition, {
    bullJobId: job.id ?? null,
    triggeredBy: typeof data.triggeredBy === 'string' ? data.triggeredBy : null,
    reason: typeof data.reason === 'string' ? data.reason : null
  });
}

export async function startScheduledWorker(app: FastifyInstance) {
  await registerScheduledJobs();

  if (worker) return worker;

  worker = new Worker<ScheduledJobData>('scheduled-jobs', async (job) => processScheduledJob(app, job), {
    connection: bullmqConnection,
    concurrency: 2,
    stalledInterval: 60_000
  });

  worker.on('failed', (job, error) => {
    app.log.error({ jobId: job?.id, jobName: job?.name, error }, 'Scheduled job failed');
  });

  return worker;
}

export async function stopScheduledWorker() {
  if (!worker) return;
  await worker.close();
  worker = null;
}
