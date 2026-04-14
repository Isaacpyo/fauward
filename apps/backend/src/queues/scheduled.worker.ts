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
