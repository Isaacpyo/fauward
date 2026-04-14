import type { FastifyInstance } from 'fastify';
import { Worker } from 'bullmq';

import { bullmqConnection } from './queues.js';

type AnalyticsJobData = {
  tenantId?: unknown;
  shipmentId?: unknown;
  eventType?: unknown;
  status?: unknown;
  timestamp?: unknown;
};

let worker: Worker<AnalyticsJobData> | null = null;

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function startAnalyticsWorker(app: FastifyInstance) {
  if (worker) return worker;

  worker = new Worker<AnalyticsJobData>(
    'analytics',
    async (job) => {
      const tenantId = typeof job.data.tenantId === 'string' ? job.data.tenantId : '';
      const shipmentId = typeof job.data.shipmentId === 'string' ? job.data.shipmentId : '';
      const eventType = typeof job.data.eventType === 'string' ? job.data.eventType : '';
      const status = typeof job.data.status === 'string' ? job.data.status : '';

      if (!tenantId || !shipmentId || !eventType) {
        return;
      }

      if (eventType !== 'shipment.status.updated' || status !== 'DELIVERED') {
        return;
      }

      const shipment = await app.prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId },
        select: {
          createdAt: true,
          actualDelivery: true
        }
      });
      if (!shipment) return;

      const deliveredAt =
        typeof job.data.timestamp === 'string' ? new Date(job.data.timestamp) : shipment.actualDelivery ?? new Date();
      const latencyMs = Math.max(0, deliveredAt.getTime() - shipment.createdAt.getTime());
      const keyDate = dayKey(deliveredAt);

      const deliveredCountKey = `analytics:deliveries:count:${tenantId}:${keyDate}`;
      const deliveredLatencyKey = `analytics:deliveries:latency_ms:${tenantId}:${keyDate}`;
      const ttlSeconds = 45 * 24 * 60 * 60;

      await app.redis.multi().incr(deliveredCountKey).incrby(deliveredLatencyKey, latencyMs).expire(deliveredCountKey, ttlSeconds).expire(deliveredLatencyKey, ttlSeconds).exec();
    },
    {
      connection: bullmqConnection,
      concurrency: 5
    }
  );

  worker.on('failed', (job, error) => {
    app.log.error({ jobId: job?.id, error }, 'Analytics job failed');
  });

  return worker;
}

export async function stopAnalyticsWorker() {
  if (!worker) return;
  await worker.close();
  worker = null;
}
