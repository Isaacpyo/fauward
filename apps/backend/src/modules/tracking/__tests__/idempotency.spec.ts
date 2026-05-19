import { describe, expect, it, beforeEach, vi } from 'vitest';
import { checkAndSetIdempotency, cacheResponse, getCachedResponse } from '../realtime/idempotency.service.js';
import type { Redis } from 'ioredis';

function createMockRedis(): Redis {
  const store = new Map<string, { value: string; ttl: number }>();
  return {
    set: vi.fn(async (key: string, value: string, ...args: (string | number)[]) => {
      const exIndex = args.indexOf('EX');
      const ttl = exIndex >= 0 ? Number(args[exIndex + 1]) : 86400;
      const hasNx = args.includes('NX');
      if (hasNx && store.has(key)) return null;
      store.set(key, { value, ttl });
      return 'OK';
    }),
    get: vi.fn(async (key: string) => {
      const entry = store.get(key);
      return entry ? entry.value : null;
    }),
  } as unknown as Redis;
}

describe('checkAndSetIdempotency', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = createMockRedis();
  });

  it('returns isNew=true on first call', async () => {
    const result = await checkAndSetIdempotency(redis, 'key1');
    expect(result.isNew).toBe(true);
  });

  it('returns isNew=false and cached response on duplicate', async () => {
    await checkAndSetIdempotency(redis, 'key1');
    await cacheResponse(redis, 'key1', { accepted: 1 });
    const result = await checkAndSetIdempotency(redis, 'key1');
    expect(result.isNew).toBe(false);
    expect(JSON.parse(result.cachedResponse!)).toEqual({ accepted: 1 });
  });

  it('returns isNew=false without cached response when in flight', async () => {
    await checkAndSetIdempotency(redis, 'key1');
    const result = await checkAndSetIdempotency(redis, 'key1');
    expect(result.isNew).toBe(false);
    expect(result.cachedResponse).toBeUndefined();
  });
});

describe('getCachedResponse', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = createMockRedis();
  });

  it('returns parsed JSON', async () => {
    await cacheResponse(redis, 'key1', { accepted: 2 });
    const result = await getCachedResponse(redis, 'key1');
    expect(result).toEqual({ accepted: 2 });
  });

  it('returns null for missing key', async () => {
    const result = await getCachedResponse(redis, 'missing');
    expect(result).toBeNull();
  });
});
