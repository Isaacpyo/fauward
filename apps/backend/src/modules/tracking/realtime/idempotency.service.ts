import type { Redis } from 'ioredis';

const IDEMPOTENCY_PREFIX = 'idempotency:';
const DEFAULT_TTL_SEC = 86_400; // 24h

export function idempotencyKey(key: string): string {
  return `${IDEMPOTENCY_PREFIX}${key}`;
}

export async function checkAndSetIdempotency(
  redis: Redis,
  key: string,
  ttlSec = DEFAULT_TTL_SEC
): Promise<{ isNew: boolean; cachedResponse?: string }> {
  const redisKey = idempotencyKey(key);
  const result = await redis.set(redisKey, 'processing', 'EX', ttlSec, 'NX');
  if (result === 'OK') {
    return { isNew: true };
  }
  const cached = await redis.get(redisKey);
  if (cached && cached !== 'processing') {
    return { isNew: false, cachedResponse: cached };
  }
  return { isNew: false };
}

export async function cacheResponse(
  redis: Redis,
  key: string,
  payload: unknown,
  ttlSec = DEFAULT_TTL_SEC
): Promise<void> {
  const redisKey = idempotencyKey(key);
  await redis.set(redisKey, JSON.stringify(payload), 'EX', ttlSec);
}

export async function getCachedResponse(
  redis: Redis,
  key: string
): Promise<unknown | null> {
  const redisKey = idempotencyKey(key);
  const cached = await redis.get(redisKey);
  if (!cached || cached === 'processing') return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}
