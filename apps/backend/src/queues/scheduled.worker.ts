import type { FastifyInstance } from 'fastify';
import { Worker } from 'bullmq';

import { runOverdueInvoiceSweep } from '../modules/finance/finance.routes.js';
import { domainService } from '../modules/tenants/domain.service.js';
import { cleanupExpiredSlugHistory } from '../jobs/slug-history-cleanup.js';
import { sweepExpiredImpersonationSessions } from '../jobs/impersonation-expiry-sweep.js';
import { pruneOldActivity } from '../jobs/activity-prune.js';
import { sendTrialExpiryWarnings, sendUsageThresholdNotices } from '../jobs/tenant-notices.js';
import { sweepSupportSla } from '../jobs/support-sla-sweep.js';
import { dispatchNpsSurveys } from '../services/feedback.service.js';
import { computeAndStoreHealthScore, healthBand } from '../services/health-score.service.js';
import { runSecretInventory } from '../services/secret-inventory.service.js';
import { DSAR_ERASE_JOB, DSAR_GATHER_JOB, eraseDsar, gatherDsar, sweepOverdueDsars } from '../services/dsar.service.js';
import { FAILED_LOGIN_SPIKE_RULE } from '../config/safety-rules.js';
import { bullmqConnection, scheduledJobsQueue } from './queues.js';
import { findScheduledJob, listScheduledJobs, registerScheduledJob, runScheduledJob } from './scheduled-job-runner.js';

type ScheduledJobData = Record<string, unknown>;

const SECRET_INVENTORY_JOB = 'trust.secret-inventory';

let worker: Worker<ScheduledJobData> | null = null;
let repeatableJobsRegistered = false;

// customer.success scoring lives in services/health-score.service.ts (WP-3.3); re-exported for existing callers.
export { computeAndStoreHealthScore, healthBand };

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
    let scored = 0;
    for (const tenant of tenants) {
      if (await computeAndStoreHealthScore(app, tenant.id)) scored += 1;
    }
    // Tenants younger than HEALTH_MIN_TENANT_AGE_DAYS are not scored ("Not yet scored"; no fallback score).
    return { tenants: tenants.length, scored, notYetScored: tenants.length - scored };
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

registerScheduledJob({
  name: SECRET_INVENTORY_JOB,
  pattern: '50 4 * * *',
  repeatJobId: 'trust.secret-inventory.daily',
  description: 'Records which registered secrets are set, detects rotations by fingerprint and reports overdue rotations (never reads values out).',
  handler: async (app) => runSecretInventory(app)
});

export async function registerScheduledJobs() {
  if (repeatableJobsRegistered) return;
  for (const job of listScheduledJobs()) {
    await scheduledJobsQueue.add(job.name, {}, { jobId: job.repeatJobId, repeat: { pattern: job.pattern, tz: 'UTC' } });
  }
  // trust.secrets runs at boot too, so a deploy that rotates a secret is seen at once (one boot run per process start).
  await scheduledJobsQueue.add(SECRET_INVENTORY_JOB, {}, { jobId: `${SECRET_INVENTORY_JOB}.boot.${Date.now()}`, removeOnComplete: 50, removeOnFail: 50 });
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
