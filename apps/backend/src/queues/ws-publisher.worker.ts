import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { createConsumerGroup, readGroup, ackMessage } from '../modules/tracking/realtime/stream.service.js';
import { emitTrackingRealtimeUpdate, emitEscalationUpdate } from '../modules/tracking/tracking.websocket.js';

const GROUP_NAME = 'ws-publisher';
const CONSUMER_NAME = 'worker-1';
const BATCH_SIZE = 100;
const BLOCK_MS = 200;
const POLL_INTERVAL_MS = 1_000;

let workerTimer: NodeJS.Timeout | null = null;
let running = false;

async function ensureEscalationGroup(redis: Redis): Promise<void> {
  try {
    await redis.xgroup('CREATE', 'escalations:stream', 'escalations-publisher', '$', 'MKSTREAM');
  } catch (err: any) {
    if (err?.message?.includes('BUSYGROUP')) return;
    throw err;
  }
}

export async function startWsPublisherWorker(app: FastifyInstance): Promise<void> {
  if (running) return;
  running = true;

  const redis = app.redis;
  await ensureEscalationGroup(redis);
  const knownGroups = new Set<string>();

  async function processBatch() {
    if (!running) return;

    try {
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

        for (const msg of messages) {
          emitTrackingRealtimeUpdate({
            tenantId,
            trackingNumber: msg.fields.trackingNumber,
            eventType: msg.fields.eventType,
            seq: BigInt(msg.fields.seq),
            data: msg.fields,
          });
          await ackMessage(redis, tenantId, GROUP_NAME, msg.id);
        }
      }

      // Also consume escalations stream
      const escalationMessages = await redis.xreadgroup(
        'GROUP', 'escalations-publisher', CONSUMER_NAME,
        'COUNT', BATCH_SIZE,
        'BLOCK', BLOCK_MS,
        'STREAMS', 'escalations:stream', '>'
      ) as [string, [string, string[]][]][] | null;

      if (escalationMessages && escalationMessages.length > 0) {
        const [, msgs] = escalationMessages[0];
        if (msgs && msgs.length > 0) {
          for (const [id, fieldsArray] of msgs) {
            const fields: Record<string, string> = {};
            for (let i = 0; i < fieldsArray.length; i += 2) {
              fields[fieldsArray[i]] = fieldsArray[i + 1];
            }
            emitEscalationUpdate({
              tenantId: fields.tenantId,
              shipmentId: fields.shipmentId,
              trackingNumber: fields.trackingNumber,
              reason: fields.reason,
              flaggedAt: fields.flaggedAt,
            });
            await redis.xack('escalations:stream', 'escalations-publisher', id);
          }
        }
      }
    } catch (err) {
      app.log.error({ err }, 'WS publisher batch failed');
    } finally {
      if (running) {
        workerTimer = setTimeout(processBatch, POLL_INTERVAL_MS);
      }
    }
  }

  workerTimer = setTimeout(processBatch, POLL_INTERVAL_MS);
}

export async function stopWsPublisherWorker(): Promise<void> {
  running = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}
