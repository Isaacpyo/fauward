import { describe, expect, it, vi } from 'vitest';
import { startEscalationSweeper } from '../escalation/sweeper.worker.js';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

describe('escalation sweeper', () => {
  it('flips flag for stale OUT_FOR_DELIVERY shipment', async () => {
    const shipment = {
      id: 'ship-1',
      tenantId: 'tenant-1',
      trackingNumber: 'FCL-202507-A3F9K2',
      status: 'OUT_FOR_DELIVERY' as const,
      lastSeenAt: new Date(Date.now() - 5 * 3_600_000),
      estimatedDelivery: null,
      createdAt: new Date(Date.now() - 10 * 3_600_000),
    };

    const prisma = {
      shipment: {
        findMany: vi.fn(async () => [shipment]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    } as unknown as PrismaClient;

    const redis = {
      xadd: vi.fn(async () => '1-0'),
      xtrim: vi.fn(async () => 0),
    } as unknown as Redis;

    const stop = startEscalationSweeper({ prisma, redis, intervalMs: 10 });

    // Wait for first sweep
    await new Promise((r) => setTimeout(r, 50));
    stop();

    expect(prisma.shipment.findMany).toHaveBeenCalled();
    expect(prisma.shipment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ship-1', escalationFlag: false },
        data: expect.objectContaining({ escalationFlag: true }),
      })
    );
  });
});
