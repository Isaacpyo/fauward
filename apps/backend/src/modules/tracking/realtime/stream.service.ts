import type { Redis } from 'ioredis';
import type { StreamEvent, EscalationStreamEvent } from './types.js';

const TENANT_STREAM_PREFIX = 'track:stream:';
const ESCALATIONS_STREAM = 'escalations:stream';
const MAXLEN_APPROX = 100_000;
const ESCALATIONS_MAXLEN_APPROX = 50_000;

export function tenantStreamKey(tenantId: string): string {
  return `${TENANT_STREAM_PREFIX}${tenantId}`;
}

export async function addToTenantStream(
  redis: Redis,
  tenantId: string,
  event: StreamEvent
): Promise<string> {
  const key = tenantStreamKey(tenantId);
  const fields: Record<string, string> = {
    shipmentId: event.shipmentId,
    trackingNumber: event.trackingNumber,
    seq: String(event.seq),
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    source: event.source,
  };
  if (event.lat !== undefined) fields.lat = String(event.lat);
  if (event.lng !== undefined) fields.lng = String(event.lng);
  if (event.accuracyM !== undefined) fields.accuracyM = String(event.accuracyM);
  if (event.status !== undefined) fields.status = event.status;
  if (event.sourceRef !== undefined) fields.sourceRef = event.sourceRef;

  const id = await redis.xadd(key, '*', ...flattenObject(fields));
  await redis.xtrim(key, 'MAXLEN', '~', MAXLEN_APPROX);
  return id ?? '';
}

export async function addToEscalationsStream(
  redis: Redis,
  event: EscalationStreamEvent
): Promise<string> {
  const fields: Record<string, string> = {
    tenantId: event.tenantId,
    shipmentId: event.shipmentId,
    trackingNumber: event.trackingNumber,
    reason: event.reason,
    flaggedAt: event.flaggedAt,
  };
  const id = await redis.xadd(ESCALATIONS_STREAM, '*', ...flattenObject(fields));
  await redis.xtrim(ESCALATIONS_STREAM, 'MAXLEN', '~', ESCALATIONS_MAXLEN_APPROX);
  return id ?? '';
}

export async function readRange(
  redis: Redis,
  tenantId: string,
  start: string,
  end: string,
  count: number
): Promise<Array<{ id: string; fields: Record<string, string> }>> {
  const key = tenantStreamKey(tenantId);
  const result = await redis.xrange(key, start, end, 'COUNT', count) as [string, string[]][] | null;
  if (!result || result.length === 0) return [];

  return result.map(([id, fieldsArray]) => {
    const fields: Record<string, string> = {};
    for (let i = 0; i < fieldsArray.length; i += 2) {
      fields[fieldsArray[i]] = fieldsArray[i + 1];
    }
    return { id, fields };
  });
}

export async function createConsumerGroup(
  redis: Redis,
  tenantId: string,
  groupName: string
): Promise<void> {
  const key = tenantStreamKey(tenantId);
  try {
    await redis.xgroup('CREATE', key, groupName, '$', 'MKSTREAM');
  } catch (err: any) {
    if (err.message && err.message.includes('BUSYGROUP')) {
      return; // Group already exists
    }
    throw err;
  }
}

export async function readGroup(
  redis: Redis,
  tenantId: string,
  groupName: string,
  consumerName: string,
  count: number,
  blockMs = 500
): Promise<Array<{ id: string; fields: Record<string, string> }>> {
  const key = tenantStreamKey(tenantId);
  const result = await redis.xreadgroup(
    'GROUP',
    groupName,
    consumerName,
    'COUNT',
    count,
    'BLOCK',
    blockMs,
    'STREAMS',
    key,
    '>'
  ) as [string, [string, string[]][]][] | null;

  if (!result || result.length === 0) return [];
  const [, messages] = result[0];
  if (!messages || messages.length === 0) return [];

  return messages.map(([id, fieldsArray]) => {
    const fields: Record<string, string> = {};
    for (let i = 0; i < fieldsArray.length; i += 2) {
      fields[fieldsArray[i]] = fieldsArray[i + 1];
    }
    return { id, fields };
  });
}

export async function ackMessage(
  redis: Redis,
  tenantId: string,
  groupName: string,
  messageId: string
): Promise<void> {
  const key = tenantStreamKey(tenantId);
  await redis.xack(key, groupName, messageId);
}

function flattenObject(obj: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    out.push(k, v);
  }
  return out;
}
