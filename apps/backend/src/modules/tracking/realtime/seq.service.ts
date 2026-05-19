import type { Redis } from 'ioredis';

const SEQ_KEY_PREFIX = 'track:seq:';

export function seqKey(shipmentId: string): string {
  return `${SEQ_KEY_PREFIX}${shipmentId}`;
}

export async function getNextSeq(redis: Redis, shipmentId: string): Promise<bigint> {
  const result = await redis.incr(seqKey(shipmentId));
  return BigInt(result);
}

export async function getCurrentSeq(redis: Redis, shipmentId: string): Promise<bigint> {
  const result = await redis.get(seqKey(shipmentId));
  if (result === null) return BigInt(0);
  return BigInt(result);
}

export async function resetSeq(redis: Redis, shipmentId: string): Promise<void> {
  await redis.del(seqKey(shipmentId));
}
