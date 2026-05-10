import { describe, it, expect, vi } from 'vitest';
import { upsertTrackingSnapshot, markPodAvailable } from '../tracking-snapshot.service.js';
import type { TrackingEvent } from '@prisma/client';

function makeEvent(status: string): TrackingEvent {
  return {
    id: 'evt_1',
    tenantId: 'tenant_1',
    shipmentId: 'ship_1',
    trackingNumber: 'FW001',
    eventType: 'IN_TRANSIT' as never,
    status: status as never,
    title: 'In transit',
    description: null,
    source: 'TENANT_PORTAL' as never,
    actorType: 'TENANT_USER' as never,
    actorId: null,
    visibility: 'CUSTOMER_VISIBLE' as never,
    locationName: null,
    city: null,
    region: null,
    country: null,
    lat: null,
    lng: null,
    metadata: null,
    idempotencyKey: null,
    occurredAt: new Date('2026-05-02T10:00:00Z'),
    createdAt: new Date('2026-05-02T10:00:00Z')
  };
}

function makePrisma() {
  return {
    trackingSnapshot: {
      upsert: vi.fn().mockResolvedValue({})
    }
  };
}

describe('upsertTrackingSnapshot', () => {
  it('upserts snapshot with customer-friendly status', async () => {
    const prisma = makePrisma();
    await upsertTrackingSnapshot(prisma as never, makeEvent('OUT_FOR_DELIVERY'));

    const call = prisma.trackingSnapshot.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ shipmentId: 'ship_1' });
    expect(call.update.customerStatus).toBe('Out for delivery');
    expect(call.update.currentStatus).toBe('OUT_FOR_DELIVERY');
  });

  it('sets deliveredAt when status is DELIVERED', async () => {
    const prisma = makePrisma();
    await upsertTrackingSnapshot(prisma as never, makeEvent('DELIVERED'));

    const call = prisma.trackingSnapshot.upsert.mock.calls[0][0];
    expect(call.update.deliveredAt).toBeDefined();
  });

  it('sets hasException when status is EXCEPTION', async () => {
    const prisma = makePrisma();
    await upsertTrackingSnapshot(prisma as never, makeEvent('EXCEPTION'));

    const call = prisma.trackingSnapshot.upsert.mock.calls[0][0];
    expect(call.update.hasException).toBe(true);
  });

  it('clears exception state for non-exception statuses', async () => {
    const prisma = makePrisma();
    await upsertTrackingSnapshot(prisma as never, makeEvent('IN_TRANSIT'));

    const call = prisma.trackingSnapshot.upsert.mock.calls[0][0];
    expect(call.update.hasException).toBe(false);
    expect(call.update.exceptionCode).toBeNull();
    expect(call.update.exceptionMessage).toBeNull();
  });

  it('propagates origin and destination names', async () => {
    const prisma = makePrisma();
    await upsertTrackingSnapshot(prisma as never, makeEvent('IN_TRANSIT'), {
      originName: 'London',
      destinationName: 'Manchester'
    });

    const call = prisma.trackingSnapshot.upsert.mock.calls[0][0];
    expect(call.update.originName).toBe('London');
    expect(call.update.destinationName).toBe('Manchester');
  });
});

describe('markPodAvailable', () => {
  it('updates podAvailable on the snapshot', async () => {
    const prisma = {
      trackingSnapshot: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };
    await markPodAvailable(prisma as never, 'ship_1');
    expect(prisma.trackingSnapshot.updateMany).toHaveBeenCalledWith({
      where: { shipmentId: 'ship_1' },
      data: { podAvailable: true }
    });
  });
});
