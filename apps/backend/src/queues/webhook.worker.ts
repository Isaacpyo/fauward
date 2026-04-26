import { createHmac, randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import type { FastifyInstance } from 'fastify';

import { bullmqConnection } from './queues.js';

type WebhookJobData = {
  endpointId?: unknown;
  eventType?: unknown;
  payload?: unknown;
  tenantId?: unknown;
  shipmentId?: unknown;
};

const DLQ_WEBHOOK_QUEUE = 'dlq-webhookQueue';

export const dlqWebhookQueue = new Queue<Record<string, unknown>>(DLQ_WEBHOOK_QUEUE, {
  connection: bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false
  }
});

let worker: Worker<WebhookJobData> | null = null;

export function startWebhookWorker(app: FastifyInstance) {
  if (worker) return worker;

  worker = new Worker<WebhookJobData>(
    'webhook',
    async (job) => {
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
            'X-Delivery-Id': job.id ?? randomUUID(),
            ...(signature ? { 'X-Webhook-Signature': signature } : {})
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
      await app.prisma.webhookDelivery.create({
        data: {
          tenantId,
          endpointId: endpoint.id,
          eventType,
          payload: payload as Prisma.InputJsonValue,
          responseStatus,
          responseBody,
          durationMs: Date.now() - startedAt,
          attempt,
          status: errorToThrow ? 'FAILED' : 'DELIVERED'
        }
      });

      if (errorToThrow) {
        throw errorToThrow;
      }
    },
    {
      connection: bullmqConnection,
      concurrency: 20,
      limiter: { max: 50, duration: 1_000 }
    }
  );

  worker.on('failed', async (job, error) => {
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade !== maxAttempts) {
      return;
    }

    await dlqWebhookQueue.add('webhook.dead-letter', {
      ...job.data,
      queue: 'webhook',
      jobId: job.id,
      failedAt: new Date().toISOString(),
      reason: error.message,
      attemptsMade: job.attemptsMade
    });
  });

  return worker;
}

export async function stopWebhookWorker() {
  if (!worker) return;
  await worker.close();
  await dlqWebhookQueue.close();
  worker = null;
}
