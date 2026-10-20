import type { FastifyInstance } from 'fastify';
import { Queue, Worker } from 'bullmq';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import nodemailer, { type Transporter } from 'nodemailer';

import { config } from '../../config/index.js';
import { bullmqConnection } from '../../queues/queues.js';
import { tenantStorage, type TenantContext } from '../../context/tenant.context.js';
import { renderEmail, subjectOverride } from './email-content.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from '../../services/platform-activity.service.js';

// The notification worker is the only writer of NotificationLog (D6, gate no-direct-notification-log.test.ts).
//
// Workers run outside Fastify's request scope, so AsyncLocalStorage is empty and the Prisma tenant-scoping plugin would
// refuse every NotificationLog write; each job runs in a SUPER_ADMIN context (the job data carries the tenant, or none
// for Fauward staff notifications).
function buildWorkerContext(tenantId: string | null): TenantContext {
  return {
    tenantId: tenantId ?? 'system',
    tenantSlug: '',
    plan: 'SYSTEM',
    region: 'global',
    isSuperAdmin: true
  };
}

export type NotificationJobData = {
  tenantId?: unknown;
  userId?: unknown;
  platformUserId?: unknown;
  channel?: unknown;
  event?: unknown;
  to?: unknown;
  template?: unknown;
  data?: unknown;
  message?: unknown;
};

export type NotificationJob = { id?: string | null; name: string; data: NotificationJobData };

type Outcome =
  | { status: 'SENT'; provider: 'SENDGRID' | 'SMTP' | 'TWILIO'; providerRef?: string }
  | { status: 'SKIPPED'; error: string }
  | { status: 'QUOTA_EXCEEDED'; error: string };

type WorkerApp = Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>;

/** L14: more than 5% of the last hour's notifications failed (with enough volume for the rate to mean something). */
export const NOTIFICATION_FAILURE_SPIKE = { windowMs: 60 * 60 * 1000, rate: 0.05, minVolume: 20 } as const;

/**
 * After a failed delivery: if the last hour's failure rate is above the threshold, record one
 * `notifications.failure_spike` activity for that hour (customer.comms). Never throws into the worker.
 */
export async function checkNotificationFailureSpike(app: WorkerApp, now = new Date()) {
  try {
    const since = new Date(now.getTime() - NOTIFICATION_FAILURE_SPIKE.windowMs);
    const [total, failed] = await Promise.all([
      app.prisma.notificationLog.count({ where: { createdAt: { gte: since } } }),
      app.prisma.notificationLog.count({ where: { createdAt: { gte: since }, status: 'FAILED' } })
    ]);
    if (total < NOTIFICATION_FAILURE_SPIKE.minVolume || failed / total <= NOTIFICATION_FAILURE_SPIKE.rate) return null;
    const hour = now.toISOString().slice(0, 13);
    return await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: app.log },
      {
        service: 'customer.comms',
        type: 'notifications.failure_spike',
        ...SYSTEM_ACTOR,
        subjectType: 'notification_log',
        subjectId: hour,
        summary: `${failed} of ${total} notifications failed in the last hour (${Math.round((failed / total) * 100)}%)`,
        severity: 'CRITICAL',
        consoleLink: '/customer/comms/delivery-log?status=FAILED',
        metadata: { failed, total },
        dedupeKey: `notifications.failure_spike:${hour}`,
        occurredAt: now
      }
    );
  } catch (err) {
    app.log.error({ err }, 'Failed to check the notification failure rate');
    return null;
  }
}

const sendgridApiKey = config.sendgridApiKey;
if (sendgridApiKey) {
  sgMail.setApiKey(sendgridApiKey);
}

const twilioClient =
  config.twilio.accountSid?.startsWith('AC') && config.twilio.authToken
    ? twilio(config.twilio.accountSid, config.twilio.authToken)
    : null;

let smtpTransport: Transporter | null = null;
function smtp(): Transporter | null {
  if (!config.smtpUrl) return null;
  smtpTransport ??= nodemailer.createTransport(config.smtpUrl);
  return smtpTransport;
}

let worker: Worker<NotificationJobData> | null = null;
export const dlqNotificationQueue = new Queue<Record<string, unknown>>('dlq-notificationQueue', {
  connection: bullmqConnection
});

function resolveSendgridTemplateId(templateKey: string): string | undefined {
  const direct = config.sendgrid.templateIds[templateKey];
  if (direct) return direct;
  if (templateKey.startsWith('d-')) return templateKey;
  return undefined;
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Email: SendGrid when configured (dynamic template if one is mapped, else the built-in content), else SMTP, else SKIPPED. */
async function deliverEmail(app: WorkerApp, jobData: NotificationJobData, tenantId: string | null): Promise<Outcome> {
  if (!jobData.to) throw new Error('Missing recipient for EMAIL notification');
  const to = String(jobData.to);
  const templateKey = String(jobData.template ?? '');
  const data: Record<string, unknown> = jobData.data && typeof jobData.data === 'object' ? (jobData.data as Record<string, unknown>) : {};

  if (!sendgridApiKey && !config.smtpUrl) {
    return { status: 'SKIPPED', error: 'EMAIL_PROVIDER_NOT_CONFIGURED' };
  }

  const tenantSettings = tenantId
    ? await app.prisma.tenantSettings.findUnique({ where: { tenantId }, select: { notificationEmail: true, emailFromName: true, emailReplyTo: true } })
    : null;
  const from = { email: tenantSettings?.notificationEmail ?? config.sendgrid.fromEmail, name: tenantSettings?.emailFromName ?? config.sendgrid.fromName };
  const replyTo = tenantSettings?.emailReplyTo ?? undefined;

  if (sendgridApiKey) {
    const templateId = resolveSendgridTemplateId(templateKey);
    if (templateId) {
      // For dynamic templates SendGrid ignores the top-level subject; personalizations[].subject overrides it.
      const subject = subjectOverride(templateKey, data);
      const [response] = await sgMail.send({
        from,
        replyTo,
        templateId,
        personalizations: [{ to: [{ email: to }], ...(subject ? { subject } : {}), dynamicTemplateData: data }]
      });
      const providerRef = response?.headers?.['x-message-id'];
      return { status: 'SENT', provider: 'SENDGRID', providerRef: typeof providerRef === 'string' ? providerRef : undefined };
    }
    const rendered = renderEmail(templateKey, data);
    const [response] = await sgMail.send({ from, replyTo, to, subject: rendered.subject, text: rendered.text, html: rendered.html });
    const providerRef = response?.headers?.['x-message-id'];
    return { status: 'SENT', provider: 'SENDGRID', providerRef: typeof providerRef === 'string' ? providerRef : undefined };
  }

  const transport = smtp();
  if (!transport) return { status: 'SKIPPED', error: 'EMAIL_PROVIDER_NOT_CONFIGURED' };
  const rendered = renderEmail(templateKey, data);
  const info = await transport.sendMail({ from: { address: from.email, name: from.name }, replyTo, to, subject: rendered.subject, text: rendered.text, html: rendered.html });
  return { status: 'SENT', provider: 'SMTP', providerRef: typeof info.messageId === 'string' ? info.messageId : undefined };
}

async function deliverSms(app: WorkerApp, jobData: NotificationJobData, tenantId: string | null): Promise<Outcome> {
  if (!twilioClient || !config.twilio.from) {
    return { status: 'SKIPPED', error: 'SMS_PROVIDER_NOT_CONFIGURED' };
  }
  if (!jobData.to) throw new Error('Missing recipient for SMS notification');
  if (!tenantId) throw new Error('SMS notifications need a tenant');

  const quotaKey = `sms:count:${tenantId}:${new Date().toISOString().slice(0, 10)}`;
  const currentCount = await app.redis.incr(quotaKey);
  await app.redis.expire(quotaKey, 48 * 60 * 60);

  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
  const dailyLimit = tenant?.plan === 'ENTERPRISE' ? Number.POSITIVE_INFINITY : tenant?.plan === 'PRO' ? 500 : 0;
  if (currentCount > dailyLimit) return { status: 'QUOTA_EXCEEDED', error: 'Daily SMS quota exceeded' };

  const message = await twilioClient.messages.create({ to: String(jobData.to), from: config.twilio.from, body: String(jobData.message ?? '') });
  return { status: 'SENT', provider: 'TWILIO', providerRef: message.sid };
}

/**
 * One notification job: writes (or, on retry, reuses) the job's NotificationLog row, delivers through the configured
 * transport and records SENT / SKIPPED / QUOTA_EXCEEDED / FAILED. A job that already reached SENT is not sent again.
 * The tenant's UsageRecord.emailsSent / smsSent goes up exactly once per sent job (L19).
 */
export async function processNotificationJob(app: WorkerApp, job: NotificationJob) {
  const rawTenantId = typeof job.data.tenantId === 'string' ? job.data.tenantId : '';
  const tenantId = rawTenantId && rawTenantId !== 'system' ? rawTenantId : null;
  return tenantStorage.run(buildWorkerContext(tenantId), async () => {
    const userId = typeof job.data.userId === 'string' ? job.data.userId : null;
    const platformUserId = typeof job.data.platformUserId === 'string' ? job.data.platformUserId : null;
    if (!tenantId && !platformUserId) {
      app.log.warn({ jobId: job.id, event: job.data.event }, 'Notification job without tenant or staff recipient dropped');
      return null;
    }
    const channel = String(job.data.channel ?? 'EMAIL').toUpperCase() === 'SMS' ? 'SMS' : 'EMAIL';
    const event = String(job.data.event ?? job.name);
    const fields = {
      tenantId,
      userId,
      platformUserId,
      channel,
      event,
      template: typeof job.data.template === 'string' ? job.data.template : null,
      recipient: typeof job.data.to === 'string' ? job.data.to : null
    } as const;

    const jobId = job.id ? String(job.id) : null;
    const log = jobId
      ? await app.prisma.notificationLog.upsert({
          where: { jobId },
          create: { ...fields, jobId, status: 'QUEUED', attempts: 1 },
          update: { attempts: { increment: 1 } }
        })
      : await app.prisma.notificationLog.create({ data: { ...fields, status: 'QUEUED', attempts: 1 } });
    if (log.status === 'SENT') return log;

    let outcome: Outcome;
    try {
      outcome = channel === 'EMAIL' ? await deliverEmail(app, job.data, tenantId) : await deliverSms(app, job.data, tenantId);
    } catch (error) {
      await app.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', error: error instanceof Error ? error.message : 'Notification delivery failed' }
      });
      await checkNotificationFailureSpike(app);
      throw error;
    }

    if (outcome.status !== 'SENT') {
      return app.prisma.notificationLog.update({ where: { id: log.id }, data: { status: outcome.status, error: outcome.error } });
    }

    // Guarded flip so a duplicate delivery of the same job can never count twice.
    const flipped = await app.prisma.notificationLog.updateMany({
      where: { id: log.id, status: { not: 'SENT' } },
      data: { status: 'SENT', sentAt: new Date(), provider: outcome.provider, providerRef: outcome.providerRef ?? null, error: null }
    });
    if (flipped.count === 1 && tenantId) {
      const counter = channel === 'EMAIL' ? 'emailsSent' : 'smsSent';
      const month = monthKey();
      await app.prisma.usageRecord.upsert({
        where: { tenantId_month: { tenantId, month } },
        create: { tenantId, month, [counter]: 1 },
        update: { [counter]: { increment: 1 } }
      });
    }
    return app.prisma.notificationLog.findUnique({ where: { id: log.id } });
  });
}

export function startNotificationWorker(app: FastifyInstance) {
  if (worker) return worker;

  worker = new Worker<NotificationJobData>('notification', async (job) => processNotificationJob(app, job), {
    connection: bullmqConnection,
    concurrency: 10,
    stalledInterval: 60_000
  });

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

    app.log.error({ jobId: job?.id, queue: 'notification', error }, 'Notification job failed');
  });

  return worker;
}

export async function stopNotificationWorker() {
  if (!worker) return;
  await worker.close();
  await dlqNotificationQueue.close();
  worker = null;
}
