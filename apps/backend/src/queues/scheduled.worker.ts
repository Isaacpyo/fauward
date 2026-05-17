import type { FastifyInstance } from 'fastify';
import { Worker } from 'bullmq';

import { runOverdueInvoiceSweep } from '../modules/finance/finance.routes.js';
import { bullmqConnection, scheduledJobsQueue } from './queues.js';

type ScheduledJobData = Record<string, unknown>;

let worker: Worker<ScheduledJobData> | null = null;
let repeatableJobsRegistered = false;

export async function registerScheduledJobs() {
  if (repeatableJobsRegistered) return;

  await scheduledJobsQueue.add('finance.overdue-invoice-sweep', {}, {
    jobId: 'finance.overdue-invoice-sweep.daily',
    repeat: { pattern: '0 0 * * *', tz: 'UTC' }
  });

  await scheduledJobsQueue.add('idempotency.cleanup', {}, {
    jobId: 'idempotency.cleanup.hourly',
    repeat: { pattern: '0 * * * *', tz: 'UTC' }
  });

  await scheduledJobsQueue.add('finance.fx-rate-refresh', {}, {
    jobId: 'finance.fx-rate-refresh.daily',
    repeat: { pattern: '0 6 * * *', tz: 'UTC' }
  });

  await scheduledJobsQueue.add('tenant.trial-expiry-warning', {}, {
    jobId: 'tenant.trial-expiry-warning.daily',
    repeat: { pattern: '15 0 * * *', tz: 'UTC' }
  });

  await scheduledJobsQueue.add('tenant.usage-report', {}, {
    jobId: 'tenant.usage-report.daily',
    repeat: { pattern: '0 1 * * *', tz: 'UTC' }
  });

  await scheduledJobsQueue.add('customer.health-scoring', {}, {
    jobId: 'customer.health-scoring.nightly',
    repeat: { pattern: '30 1 * * *', tz: 'UTC' }
  });

  await scheduledJobsQueue.add('trust.security-anomaly-scan', {}, {
    jobId: 'trust.security-anomaly-scan.hourly',
    repeat: { pattern: '15 * * * *', tz: 'UTC' }
  });

  await scheduledJobsQueue.add('trust.sanctions-quarterly-rescreen', {}, {
    jobId: 'trust.sanctions-quarterly-rescreen.monthly',
    repeat: { pattern: '0 3 1 * *', tz: 'UTC' }
  });

  await scheduledJobsQueue.add('gtm.trial-activation-score', {}, {
    jobId: 'gtm.trial-activation-score.daily',
    repeat: { pattern: '45 1 * * *', tz: 'UTC' }
  });

  await scheduledJobsQueue.add('gtm.demo-expiry', {}, {
    jobId: 'gtm.demo-expiry.hourly',
    repeat: { pattern: '30 * * * *', tz: 'UTC' }
  });

  await scheduledJobsQueue.add('revenue.commission-aggregation', {}, {
    jobId: 'revenue.commission-aggregation.monthly',
    repeat: { pattern: '0 4 1 * *', tz: 'UTC' }
  });

  repeatableJobsRegistered = true;
}

export async function startScheduledWorker(app: FastifyInstance) {
  await registerScheduledJobs();

  if (worker) return worker;

  worker = new Worker<ScheduledJobData>(
    'scheduled-jobs',
    async (job) => {
      if (job.name === 'finance.overdue-invoice-sweep') {
        const affected = await runOverdueInvoiceSweep(app);
        app.log.info({ affected }, 'Scheduled overdue invoice sweep finished');
        return;
      }

      if (job.name === 'idempotency.cleanup') {
        const result = await app.prisma.idempotencyKey.deleteMany({
          where: { expiresAt: { lt: new Date() } }
        });
        app.log.info({ deleted: result.count }, 'Scheduled idempotency cleanup finished');
        return;
      }

      if (job.name === 'finance.fx-rate-refresh') {
        app.log.info('Scheduled FX rate refresh triggered (provider integration pending)');
        return;
      }

      if (job.name === 'tenant.trial-expiry-warning') {
        const now = new Date();
        const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

        const subs = await app.prisma.subscription.findMany({
          where: {
            status: 'TRIALING',
            trialEnd: {
              gte: now,
              lte: inThreeDays
            }
          },
          select: { tenantId: true }
        });

        if (subs.length > 0) {
          await app.prisma.notificationLog.createMany({
            data: subs.map((sub) => ({
              tenantId: sub.tenantId,
              channel: 'EMAIL',
              event: 'trial_expiring',
              status: 'QUEUED'
            }))
          });
        }

        app.log.info({ count: subs.length }, 'Scheduled trial expiry warning job finished');
        return;
      }

      if (job.name === 'tenant.usage-report') {
        const month = new Date().toISOString().slice(0, 7);
        const usageRecords = await app.prisma.usageRecord.findMany({
          where: { month },
          select: { tenantId: true }
        });

        if (usageRecords.length > 0) {
          await app.prisma.notificationLog.createMany({
            data: usageRecords.map((usage) => ({
              tenantId: usage.tenantId,
              channel: 'EMAIL',
              event: 'daily_usage_report',
              status: 'QUEUED'
            }))
          });
        }

        app.log.info({ count: usageRecords.length }, 'Scheduled usage report job finished');
        return;
      }

      if (job.name === 'customer.health-scoring') {
        const tenants = await app.prisma.tenant.findMany({ where: { status: { in: ['ACTIVE', 'TRIALING'] } }, select: { id: true } });
        for (const tenant of tenants) {
          const [shipments, failedPayments, tickets, previous] = await Promise.all([
            app.prisma.shipment.count({ where: { tenantId: tenant.id, createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } } }),
            app.prisma.payment.count({ where: { tenantId: tenant.id, status: 'FAILED' } }),
            app.prisma.supportVendorTicket.count({ where: { tenantId: tenant.id } }),
            app.prisma.tenantHealthScore.findFirst({ where: { tenantId: tenant.id }, orderBy: { computedAt: 'desc' } })
          ]);
          const score = Math.max(0, Math.min(100, 55 + Math.min(25, shipments) - failedPayments * 10 - Math.min(15, tickets)));
          const trend = !previous ? 'flat' : score > previous.score ? 'up' : score < previous.score ? 'down' : 'flat';
          await app.prisma.tenantHealthScore.create({ data: { tenantId: tenant.id, score, trend, factors: { shipments, failedPayments, tickets } } });
        }
        app.log.info({ count: tenants.length }, 'Scheduled customer health scoring finished');
        return;
      }

      if (job.name === 'trust.security-anomaly-scan') {
        const cutoff = new Date(Date.now() - 10 * 60 * 1000);
        const failedAttempts = await app.prisma.staffLoginAttempt.groupBy({
          by: ['staffEmail'],
          where: { success: false, createdAt: { gte: cutoff } },
          _count: { id: true }
        });
        for (const attempt of failedAttempts.filter((row) => row._count.id > 5)) {
          await app.prisma.securityAnomaly.create({
            data: { anomalyType: 'failed_login_spike', severity: 'HIGH', status: 'OPEN', payload: { staffEmail: attempt.staffEmail, count: attempt._count.id } }
          });
        }
        app.log.info({ count: failedAttempts.length }, 'Scheduled security anomaly scan finished');
        return;
      }

      if (job.name === 'trust.sanctions-quarterly-rescreen') {
        const tenants = await app.prisma.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
        await app.prisma.sanctionsScreening.createMany({
          data: tenants.map((tenant) => ({ tenantId: tenant.id, status: 'PENDING', provider: 'complyadvantage', payload: { source: 'quarterly_rescreen' } }))
        });
        app.log.info({ count: tenants.length }, 'Scheduled sanctions re-screen queued');
        return;
      }

      if (job.name === 'gtm.trial-activation-score') {
        const trialTenants = await app.prisma.tenant.findMany({ where: { status: 'TRIALING' }, select: { id: true, customDomain: true } });
        for (const tenant of trialTenants) {
          const [shipments, users, payments, webhooks] = await Promise.all([
            app.prisma.shipment.count({ where: { tenantId: tenant.id } }),
            app.prisma.user.count({ where: { tenantId: tenant.id } }),
            app.prisma.payment.count({ where: { tenantId: tenant.id } }),
            app.prisma.webhookEndpoint.count({ where: { tenantId: tenant.id } })
          ]);
          const score = (shipments > 0 ? 30 : 0) + (users > 1 ? 20 : 0) + (payments > 0 ? 25 : 0) + (webhooks > 0 ? 15 : 0) + (tenant.customDomain ? 10 : 0);
          await app.prisma.trialActivation.upsert({
            where: { tenantId: tenant.id },
            create: {
              tenantId: tenant.id,
              score,
              firstShipmentCreated: shipments > 0,
              teamInvited: users > 1,
              paymentMethodConnected: payments > 0,
              webhookConfigured: webhooks > 0,
              customDomainSet: Boolean(tenant.customDomain),
              interventionStatus: score < 50 ? 'CSM_INTERVENTION' : 'NONE'
            },
            update: {
              score,
              firstShipmentCreated: shipments > 0,
              teamInvited: users > 1,
              paymentMethodConnected: payments > 0,
              webhookConfigured: webhooks > 0,
              customDomainSet: Boolean(tenant.customDomain),
              interventionStatus: score < 50 ? 'CSM_INTERVENTION' : 'NONE'
            }
          });
        }
        app.log.info({ count: trialTenants.length }, 'Scheduled trial activation scoring finished');
        return;
      }

      if (job.name === 'gtm.demo-expiry') {
        const expired = await app.prisma.demoEnvironment.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: new Date() } } });
        for (const demo of expired) {
          await app.prisma.$transaction([
            app.prisma.demoEnvironment.update({ where: { id: demo.id }, data: { status: 'EXPIRED' } }),
            app.prisma.tenant.update({ where: { id: demo.tenantId }, data: { status: 'CANCELLED' } })
          ]);
        }
        app.log.info({ count: expired.length }, 'Scheduled demo expiry finished');
        return;
      }

      if (job.name === 'revenue.commission-aggregation') {
        app.log.info('Scheduled commission aggregation triggered (calculation rules handled by revenue module)');
        return;
      }

      app.log.warn({ jobName: job.name }, 'Unknown scheduled job name');
    },
    {
      connection: bullmqConnection,
      concurrency: 2
    }
  );

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
