import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { createConsumerGroup, readGroup, ackMessage, tenantStreamKey } from '../modules/tracking/realtime/stream.service.js';
import { batchInsertBreadcrumbs } from '../modules/tracking/history/history.repository.js';

const GROUP_NAME = 'history-writer';
const CONSUMER_NAME = 'worker-1';
const BATCH_SIZE = 100;
const BLOCK_MS = 500;
const FLUSH_INTERVAL_MS = 2_000;

let workerTimer: NodeJS.Timeout | null = null;
let running = false;

export async function startHistoryWriterWorker(app: FastifyInstance): Promise<void> {
  if (running) return;
  running = true;

  const redis = app.redis;
  const prisma = app.prisma;

  // We need to create consumer groups for all known tenant streams.
  // Since tenants are dynamic, we lazily create groups when we first see a stream.
  const knownGroups = new Set<string>();

  async function processBatch() {
    if (!running) return;

    try {
      // Get all stream keys matching track:stream:*
      const streamKeys = await redis.keys('track:stream:*');

      for (const key of streamKeys) {
        const tenantId = key.slice('track:stream:'.length);
        if (!tenantId) continue;

        if (!knownGroups.has(tenantId)) {
          await createConsumerGroup(redis, tenantId, GROUP_NAME);
          knownGroups.add(tenantId);
        }

        const messages = await readGroup(
          redis,
          tenantId,
          GROUP_NAME,
          CONSUMER_NAME,
          BATCH_SIZE,
          BLOCK_MS
        );

        if (messages.length === 0) continue;

        const rows = messages.map((msg) => ({
          tenantId,
          shipmentId: msg.fields.shipmentId,
          seq: BigInt(msg.fields.seq),
          eventType: msg.fields.eventType,
          lat: msg.fields.lat ? parseFloat(msg.fields.lat) : undefined,
          lng: msg.fields.lng ? parseFloat(msg.fields.lng) : undefined,
          accuracyM: msg.fields.accuracyM ? parseInt(msg.fields.accuracyM, 10) : undefined,
          status: msg.fields.status || undefined,
          source: msg.fields.source,
          sourceRef: msg.fields.sourceRef || undefined,
          occurredAt: new Date(msg.fields.occurredAt),
        }));

        await batchInsertBreadcrumbs(prisma, rows);

        for (const msg of messages) {
          await ackMessage(redis, tenantId, GROUP_NAME, msg.id);
        }
      }
    } catch (err) {
      app.log.error({ err }, 'History writer batch failed');
    } finally {
      if (running) {
        workerTimer = setTimeout(processBatch, FLUSH_INTERVAL_MS);
      }
    }
  }

  workerTimer = setTimeout(processBatch, FLUSH_INTERVAL_MS);
}

export async function stopHistoryWriterWorker(): Promise<void> {
  running = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}
