import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTrackingEvent, buildStatusTitle, statusToEventType } from '../tracking-event.service.js';
import type { CreateTrackingEventInput } from '@fauward/tracking-core';

// Minimal Prisma mock
function makePrisma(overrides: Partial<{
  trackingEventFindFirst: unknown;
  trackingSnapshotFindUnique: unknown;
  shipmentFindUnique: unknown;
  trackingEventCreate: unknown;
  trackingSnapshotUpsert: unknown;
}> = {}) {
  return {
    trackingEvent: {
      findFirst: vi.fn().mockResolvedValue(overrides.trackingEventFindFirst ?? null),
      create: vi.fn().mockResolvedValue(
        overrides.trackingEventCreate ?? {
          id: 'evt_1', tenantId: 'tenant_1', shipmentId: 'ship_1',
          trackingNumber: 'FW001', status: 'IN_TRANSIT', title: 'In transit',
          visibility: 'CUSTOMER_VISIBLE', occurredAt: new Date(), createdAt: new Date()
        }
      )
    },
    trackingSnapshot: {
      findUnique: vi.fn().mockResolvedValue(overrides.trackingSnapshotFindUnique ?? null),
      upsert: vi.fn().mockResolvedValue(overrides.trackingSnapshotUpsert ?? {})
    },
    shipment: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.shipmentFindUnique ?? {
          estimatedDelivery: null,
          assignedDriverId: null,
          vehicleId: null,
          originAddress: { city: 'London' },
          destinationAddress: { city: 'Manchester' }
        }
      )
    }
  };
}

const baseInput: CreateTrackingEventInput = {
  tenantId: 'tenant_1',
  shipmentId: 'ship_1',
  trackingNumber: 'FW001',
  eventType: 'IN_TRANSIT',
  status: 'IN_TRANSIT',
  title: 'In transit',
  source: 'TENANT_PORTAL',
  actorType: 'TENANT_USER',
  visibility: 'CUSTOMER_VISIBLE',
  skipTransitionCheck: true
};

describe('createTrackingEvent', () => {
  it('creates a new event when no idempotency conflict', async () => {
    const prisma = makePrisma();
    const result = await createTrackingEvent(prisma as never, baseInput);

    expect(result.isDuplicate).toBe(false);
    expect(result.eventId).toBe('evt_1');
    expect(prisma.trackingEvent.create).toHaveBeenCalledOnce();
    expect(prisma.trackingSnapshot.upsert).toHaveBeenCalledOnce();
  });

  it('returns existing event when idempotency key already exists', async () => {
    const prisma = makePrisma({
      trackingEventFindFirst: { id: 'existing_evt' }
    });
    const result = await createTrackingEvent(prisma as never, {
      ...baseInput,
      idempotencyKey: 'key_123'
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.eventId).toBe('existing_evt');
    expect(prisma.trackingEvent.create).not.toHaveBeenCalled();
  });

  it('validates transition when snapshot exists and no skipTransitionCheck', async () => {
    const prisma = makePrisma({
      trackingSnapshotFindUnique: { currentStatus: 'DELIVERED' }
    });

    await expect(
      createTrackingEvent(prisma as never, { ...baseInput, skipTransitionCheck: false })
    ).rejects.toThrow(/Invalid tracking status transition|terminal/);
  });

  it('skips transition validation when skipTransitionCheck is true', async () => {
    const prisma = makePrisma({
      trackingSnapshotFindUnique: { currentStatus: 'DELIVERED' }
    });

    const result = await createTrackingEvent(prisma as never, {
      ...baseInput,
      skipTransitionCheck: true
    });
    expect(result.isDuplicate).toBe(false);
  });

  it('updates TrackingSnapshot after event creation', async () => {
    const prisma = makePrisma();
    await createTrackingEvent(prisma as never, baseInput);
    expect(prisma.trackingSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shipmentId: 'ship_1' }
      })
    );
  });
});

describe('buildStatusTitle', () => {
  it('returns human-readable titles for all statuses', () => {
    expect(buildStatusTitle('CREATED')).toBe('Shipment created');
    expect(buildStatusTitle('PICKED_UP')).toBe('Picked up');
    expect(buildStatusTitle('OUT_FOR_DELIVERY')).toBe('Out for delivery');
    expect(buildStatusTitle('DELIVERED')).toBe('Delivered');
    expect(buildStatusTitle('FAILED_DELIVERY')).toBe('Delivery failed');
    expect(buildStatusTitle('EXCEPTION')).toBe('Exception raised');
    expect(buildStatusTitle('CUSTOMS_HOLD')).toBe('Customs hold');
    expect(buildStatusTitle('CANCELLED')).toBe('Cancelled');
  });
});

describe('statusToEventType', () => {
  it('maps statuses to event types', () => {
    expect(statusToEventType('CREATED')).toBe('SHIPMENT_CREATED');
    expect(statusToEventType('DELIVERED')).toBe('DELIVERED');
    expect(statusToEventType('PICKED_UP')).toBe('PICKED_UP');
    expect(statusToEventType('EXCEPTION')).toBe('EXCEPTION_RAISED');
    expect(statusToEventType('CANCELLED')).toBe('CANCELLED');
  });
});
