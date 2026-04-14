import type { FastifyInstance } from 'fastify';
import { Queue, Worker } from 'bullmq';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';

import { config } from '../../config/index.js';
import { bullmqConnection } from '../../queues/queues.js';

type NotificationJobData = {
  tenantId?: unknown;
  userId?: unknown;
  channel?: unknown;
  event?: unknown;
  to?: unknown;
  template?: unknown;
  data?: unknown;
  message?: unknown;
};

const sendgridApiKey = config.sendgridApiKey;
if (sendgridApiKey) {
  sgMail.setApiKey(sendgridApiKey);
}

const twilioClient =
  config.twilio.accountSid && config.twilio.authToken
    ? twilio(config.twilio.accountSid, config.twilio.authToken)
    : null;

let worker: Worker<NotificationJobData> | null = null;
export const dlqNotificationQueue = new Queue<Record<string, unknown>>('dlq:notificationQueue', {
  connection: bullmqConnection
});

async function sendEmail(
  app: FastifyInstance,
  jobData: NotificationJobData,
  tenantId: string
) {
  if (!sendgridApiKey) {
    throw new Error('SENDGRID_API_KEY is not configured');
  }
  if (!jobData.to) {
    throw new Error('Missing recipient for EMAIL notification');
  }

  const tenantSettings = await app.prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: {
      notificationEmail: true,
      emailFromName: true
    }
  });

  const [response] = await sgMail.send({
    to: String(jobData.to),
    from: {
      email: tenantSettings?.notificationEmail ?? 'noreply@fauward.com',
      name: tenantSettings?.emailFromName ?? 'Fauward'
    },
    templateId: String(jobData.template ?? ''),
    dynamicTemplateData:
      jobData.data && typeof jobData.data === 'object' ? (jobData.data as Record<string, unknown>) : {}
  });

  const providerRef = response?.headers?.['x-message-id'];
  return typeof providerRef === 'string' ? providerRef : undefined;
}

async function sendSms(
  app: FastifyInstance,
  jobData: NotificationJobData,
  tenantId: string
) {
  if (!twilioClient) {
    throw new Error('TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is not configured');
  }
  if (!config.twilio.from) {
    throw new Error('TWILIO_FROM is not configured');
  }
  if (!jobData.to) {
    throw new Error('Missing recipient for SMS notification');
  }

  const quotaKey = `sms:count:${tenantId}:${new Date().toISOString().slice(0, 10)}`;
  const currentCount = await app.redis.incr(quotaKey);
  await app.redis.expire(quotaKey, 48 * 60 * 60);

  const tenant = await app.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true }
  });
  const dailyLimit = tenant?.plan === 'ENTERPRISE' ? Number.POSITIVE_INFINITY : tenant?.plan === 'PRO' ? 500 : 0;

  if (currentCount > dailyLimit) {
    return { quotaExceeded: true as const };
  }

  const message = await twilioClient.messages.create({
    to: String(jobData.to),
    from: config.twilio.from,
    body: String(jobData.message ?? '')
  });

  return { quotaExceeded: false as const, sid: message.sid };
}

export function startNotificationWorker(app: FastifyInstance) {
  if (worker) return worker;

  worker = new Worker<NotificationJobData>(
    'notification',
    async (job) => {
      const tenantId = String(job.data.tenantId ?? '');
      if (!tenantId) return;

      const userId = typeof job.data.userId === 'string' ? job.data.userId : undefined;
      const channel = String(job.data.channel ?? 'EMAIL').toUpperCase() === 'SMS' ? 'SMS' : 'EMAIL';
      const event = String(job.data.event ?? job.name);

      const log = await app.prisma.notificationLog.create({
        data: {
          tenantId,
          userId,
          channel,
          event,
          status: 'QUEUED'
        }
      });

      try {
        if (channel === 'EMAIL') {
          const providerRef = await sendEmail(app, job.data, tenantId);
          await app.prisma.notificationLog.update({
            where: { id: log.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              providerRef: providerRef ?? null,
              error: null
            }
          });
          return;
        }

        const result = await sendSms(app, job.data, tenantId);
        if (result.quotaExceeded) {
          await app.prisma.notificationLog.update({
            where: { id: log.id },
            data: {
              status: 'QUOTA_EXCEEDED',
              error: 'Daily SMS quota exceeded'
            }
          });
          return;
        }

        await app.prisma.notificationLog.update({
          where: { id: log.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            providerRef: result.sid ?? null,
            error: null
          }
        });
      } catch (error) {
        await app.prisma.notificationLog.update({
          where: { id: log.id },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message : 'Notification delivery failed'
          }
        });
        throw error;
      }
    },
    {
      connection: bullmqConnection,
      concurrency: 10
    }
  );

  worker.on('failed', (job, error) => {
    const maxAttempts = job?.opts.attempts ?? 1;
    if (job && job.attemptsMade >= maxAttempts) {
      dlqNotificationQueue
        .add('notification.dead-letter', {
          ...job.data,
          queue: 'notification',
          jobId: job.id,
          failedAt: new Date().toISOString(),
          reason: error.message,
          attemptsMade: job.attemptsMade
        })
        .catch((dlqError) => {
          app.log.error({ dlqError, jobId: job.id }, 'Failed to enqueue notification DLQ item');
        });
    }

    app.log.error(
      {
        jobId: job?.id,
        queue: 'notification',
        error
      },
      'Notification job failed'
    );
  });

  return worker;
}

export async function stopNotificationWorker() {
  if (!worker) return;
  await worker.close();
  await dlqNotificationQueue.close();
  worker = null;
}
