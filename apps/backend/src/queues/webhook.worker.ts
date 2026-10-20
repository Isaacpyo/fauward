import { createHmac, randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';

import { bullmqConnection } from './queues.js';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from '../services/platform-activity.service.js';

type WebhookJobData = {
  endpointId?: unknown;
  eventType?: unknown;
  payload?: unknown;
  tenantId?: unknown;
  shipmentId?: unknown;
  /** Set by a replay (tenant or console): the PENDING delivery row this job fills in. */
  replayDeliveryId?: unknown;
};

type WebhookJob = { id?: string; data: WebhookJobData; attemptsMade: number };
type WorkerApp = Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>;

function hourKey(date: Date) {
  return date.toISOString().slice(0, 13);
}

const DLQ_WEBHOOK_QUEUE = 'dlq-webhookQueue';
const RETRY_DELAYS_MS = [60_000, 120_000, 240_000, 480_000, 960_000];

export const dlqWebhookQueue = new Queue<Record<string, unknown>>(DLQ_WEBHOOK_QUEUE, {
  connection: bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false
  }
});

let worker: Worker<WebhookJobData> | null = null;

/** One delivery attempt (exported for tests). Runs in system context: WebhookDelivery is a tenant-scoped model. */
export async function processWebhookJob(app: WorkerApp, job: WebhookJob) {
  return runWithTenantContext(systemContext(), async () => {
    const endpointId = typeof job.data.endpointId === 'string' ? job.data.endpointId : '';
    const eventType = typeof job.data.eventType === 'string' ? job.data.eventType : '';
    const tenantId = typeof job.data.tenantId === 'string' ? job.data.tenantId : '';
    const shipmentId = typeof job.data.shipmentId === 'string' ? job.data.shipmentId : '';

    if (!endpointId || !eventType || !tenantId || !shipmentId) {
      app.log.warn({ jobId: job.id, data: job.data }, 'Skipping webhook job with incomplete payload');
      return;
    }

    const endpoint = await app.prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
      select: {
        id: true,
        tenantId: true,
        url: true,
        secret: true,
        isActive: true
      }
    });

    if (!endpoint?.isActive || endpoint.tenantId !== tenantId) {
      return;
    }

    const payload =
      job.data.payload && typeof job.data.payload === 'object'
        ? (job.data.payload as Record<string, unknown>)
        : {};
    const body = JSON.stringify(payload);
    const signature = endpoint.secret
      ? `sha256=${createHmac('sha256', endpoint.secret).update(body).digest('hex')}`
      : undefined;
    const eventId = String(job.id ?? randomUUID());

    const startedAt = Date.now();
    let responseStatus: number | undefined;
    let responseBody: string | undefined;
    let errorToThrow: Error | null = null;

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Type': eventType,
          'X-Delivery-Id': eventId,
          'X-Fauward-Event-Id': eventId,
          ...(signature ? { 'X-Webhook-Signature': signature, 'X-Fauward-Signature': signature } : {})
        },
        signal: AbortSignal.timeout(10_000),
        body
      });

      responseStatus = response.status;
      responseBody = await response.text();

      if (!response.ok) {
        errorToThrow = new Error(`Webhook responded with status ${response.status}`);
      }
    } catch (error) {
      errorToThrow = error instanceof Error ? error : new Error('Webhook delivery failed');
      if (!responseBody) {
        responseBody = errorToThrow.message;
      }
    }

    const attempt = job.attemptsMade + 1;
    const result = {
      responseStatus,
      responseCode: responseStatus,
      responseBody,
      durationMs: Date.now() - startedAt,
      responseLatencyMs: Date.now() - startedAt,
      attempt,
      attemptCount: attempt,
      hmacSignature: signature,
      nextRetryAt: errorToThrow && attempt < 5 ? new Date(Date.now() + RETRY_DELAYS_MS[attempt - 1]) : null,
      status: errorToThrow ? ('FAILED' as const) : ('DELIVERED' as const)
    };
    // A replay fills in the PENDING row the replay created (the tenant's log shows one entry per replay).
    const replayDeliveryId = typeof job.data.replayDeliveryId === 'string' ? job.data.replayDeliveryId : null;
    const updated = replayDeliveryId
      ? await app.prisma.webhookDelivery.updateMany({ where: { id: replayDeliveryId, tenantId, endpointId: endpoint.id }, data: result })
      : { count: 0 };
    if (updated.count === 0) {
      await app.prisma.webhookDelivery.create({
        data: { tenantId, endpointId: endpoint.id, eventType, payload: payload as Prisma.InputJsonValue, ...result }
      });
    }

    if (errorToThrow) {
      // L10: at most one console activity per endpoint per hour, however many deliveries fail.
      const now = new Date();
      await recordAndPublishActivity(
        { prisma: app.prisma, redis: app.redis, log: app.log },
        {
          service: 'platform.integrations',
          type: 'webhook.delivery_failed',
          tenantId,
          ...SYSTEM_ACTOR,
          subjectType: 'webhook_endpoint',
          subjectId: endpoint.id,
          summary: `Webhook ${eventType} to ${endpoint.url} failed (${responseStatus ?? errorToThrow.message})`,
          severity: 'ATTENTION',
          consoleLink: '/platform/integrations/webhooks',
          metadata: { eventType, responseStatus: responseStatus ?? null, attempt },
          dedupeKey: `webhook.delivery_failed:${endpoint.id}:${hourKey(now)}`,
          occurredAt: now
        }
      ).catch((err: unknown) => app.log.error({ err, endpointId: endpoint.id }, 'Failed to record webhook failure activity'));
    }

    if (errorToThrow) {
      throw errorToThrow;
    }
  });
}

export function startWebhookWorker(app: FastifyInstance) {
  if (worker) return worker;

  worker = new Worker<WebhookJobData>(
    'webhook',
    (job) => processWebhookJob(app, job),
    {
      connection: bullmqConnection,
      concurrency: 20,
      limiter: { max: 50, duration: 1_000 },
      stalledInterval: 60_000
    }
  );

  worker.on('failed', (job, error) => {
    if (!job) return;
    // Never an unhandled rejection: a failing dead-letter write is logged, not thrown.
    deadLetter(job, error).catch((err: unknown) => app.log.error({ err, jobId: job.id }, 'Failed to dead-letter webhook job'));
  });

  async function deadLetter(job: Job<WebhookJobData>, error: Error) {

    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade !== maxAttempts) {
      return;
    }

    await dlqWebhookQueue.add('webhook.dead-letter', {
      ...job.data,
      queue: 'webhook',
      jobId: job.id,
      jobName: job.name,
      failedAt: new Date().toISOString(),
      reason: error.message,
      attemptsMade: job.attemptsMade
    });

    const endpointId = typeof job.data.endpointId === 'string' ? job.data.endpointId : '';
    const tenantId = typeof job.data.tenantId === 'string' ? job.data.tenantId : '';
    if (endpointId && tenantId) {
      await runWithTenantContext(systemContext(), () =>
        app.prisma.webhookDelivery.updateMany({
          where: { endpointId, tenantId, status: 'FAILED', deadLetteredAt: null },
          data: { deadLetteredAt: new Date(), attemptCount: job.attemptsMade }
        })
      );
    }
  }

  return worker;
}

export async function stopWebhookWorker() {
  if (!worker) return;
  await worker.close();
  await dlqWebhookQueue.close();
  worker = null;
}
