import { describe, expect, it, vi } from 'vitest';
import { resolveEscalation } from '../escalation/resolve.service.js';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

describe('resolveEscalation', () => {
  it('clears flag and writes unflag event', async () => {
    const prisma = {
      shipment: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    } as unknown as PrismaClient;

    let seqValue = 0;
    const redis = {
      incr: vi.fn(async () => ++seqValue),
      hset: vi.fn(async () => 1),
      xadd: vi.fn(async () => '1-0'),
      xtrim: vi.fn(async () => 0),
    } as unknown as Redis;

    await resolveEscalation(prisma, redis, {
      tenantId: 'tenant-1',
      shipmentId: 'ship-1',
      trackingNumber: 'FCL-202507-A3F9K2',
      note: 'Resolved by ops',
      resolvedBy: 'user-1',
    });

    expect(prisma.shipment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ship-1', tenantId: 'tenant-1', escalationFlag: true },
        data: expect.objectContaining({ escalationFlag: false }),
      })
    );
  });

  it('throws when shipment is not escalated', async () => {
    const prisma = {
      shipment: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    } as unknown as PrismaClient;

    const redis = {
      incr: vi.fn(async () => 1),
      hset: vi.fn(async () => 1),
      xadd: vi.fn(async () => '1-0'),
    } as unknown as Redis;

    await expect(
      resolveEscalation(prisma, redis, {
        tenantId: 'tenant-1',
        shipmentId: 'ship-1',
        trackingNumber: 'FCL-202507-A3F9K2',
        note: 'Resolved by ops',
      })
    ).rejects.toThrow('Escalation not found or already resolved');
  });
});
