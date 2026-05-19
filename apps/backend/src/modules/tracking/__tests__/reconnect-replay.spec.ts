import { describe, expect, it, vi } from 'vitest';
import { readRange } from '../realtime/stream.service.js';
import type { Redis } from 'ioredis';

describe('reconnect replay', () => {
  it('returns events from lastSeq + 1', async () => {
    const events = [
      ['1-0', ['seq', '1', 'eventType', 'location']],
      ['2-0', ['seq', '2', 'eventType', 'location']],
      ['3-0', ['seq', '3', 'eventType', 'status']],
    ];

    const redis = {
      xrange: vi.fn(async () => events),
    } as unknown as Redis;

    const result = await readRange(redis, 'tenant-1', '2-0', '+', 1000);
    expect(result).toHaveLength(3);
    expect(result[0].fields.seq).toBe('1');
  });

  it('returns empty array when no events', async () => {
    const redis = {
      xrange: vi.fn(async () => []),
    } as unknown as Redis;

    const result = await readRange(redis, 'tenant-1', '0-0', '+', 1000);
    expect(result).toHaveLength(0);
  });
});
