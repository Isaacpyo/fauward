import type { Redis } from 'ioredis';
import type { HotState } from './types.js';

const HOT_STATE_PREFIX = 'track:';

export function hotStateKey(tenantId: string, shipmentId: string): string {
  return `${HOT_STATE_PREFIX}${tenantId}:${shipmentId}`;
}

export async function setHotState(
  redis: Redis,
  tenantId: string,
  shipmentId: string,
  state: Partial<HotState>
): Promise<void> {
  const key = hotStateKey(tenantId, shipmentId);
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(state)) {
    if (v !== undefined && v !== null) {
      fields[k] = String(v);
    }
  }
  if (Object.keys(fields).length === 0) return;
  await redis.hset(key, fields);
}

export async function getHotState(
  redis: Redis,
  tenantId: string,
  shipmentId: string
): Promise<HotState | null> {
  const key = hotStateKey(tenantId, shipmentId);
  const result = await redis.hgetall(key);
  if (!result || Object.keys(result).length === 0) return null;
  return result as unknown as HotState;
}

export async function clearHotState(
  redis: Redis,
  tenantId: string,
  shipmentId: string
): Promise<void> {
  const key = hotStateKey(tenantId, shipmentId);
  await redis.del(key);
}

export async function updateHotStateIfGreaterSeq(
  redis: Redis,
  tenantId: string,
  shipmentId: string,
  incomingSeq: bigint,
  state: Partial<HotState>
): Promise<boolean> {
  const key = hotStateKey(tenantId, shipmentId);
  const current = await getHotState(redis, tenantId, shipmentId);
  const currentSeq = current ? BigInt(current.seq) : BigInt(0);

  if (incomingSeq > currentSeq) {
    await setHotState(redis, tenantId, shipmentId, state);
    return true;
  }
  return false;
}
