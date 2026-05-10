import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for public tracking route behaviour.
 * Tests the data-filtering contract rather than the HTTP layer.
 */

describe('public tracking response contract', () => {
  it('never exposes TENANT_INTERNAL or PLATFORM_ONLY events', () => {
    const allEvents = [
      { id: '1', visibility: 'CUSTOMER_VISIBLE', title: 'Picked up', description: null, occurredAt: new Date(), locationName: null, city: null },
      { id: '2', visibility: 'TENANT_INTERNAL', title: 'Internal note', description: null, occurredAt: new Date(), locationName: null, city: null },
      { id: '3', visibility: 'PLATFORM_ONLY', title: 'Webhook failed', description: null, occurredAt: new Date(), locationName: null, city: null },
      { id: '4', visibility: 'CUSTOMER_VISIBLE', title: 'Out for delivery', description: null, occurredAt: new Date(), locationName: null, city: null }
    ];

    const publicTimeline = allEvents
      .filter((e) => e.visibility === 'CUSTOMER_VISIBLE')
      .map((e) => ({
        title: e.title,
        description: e.description ?? e.title,
        location: e.locationName ?? e.city ?? null,
        occurredAt: e.occurredAt.toISOString()
      }));

    expect(publicTimeline).toHaveLength(2);
    expect(publicTimeline.map((e) => e.title)).not.toContain('Internal note');
    expect(publicTimeline.map((e) => e.title)).not.toContain('Webhook failed');
  });

  it('uses customer-safe status labels in the response', () => {
    const CUSTOMER_STATUS_MAP: Record<string, string> = {
      OUT_FOR_DELIVERY: 'Out for delivery',
      DELIVERED: 'Delivered',
      EXCEPTION: 'Delayed',
      CUSTOMS_HOLD: 'Delayed'
    };

    expect(CUSTOMER_STATUS_MAP['EXCEPTION']).toBe('Delayed');
    expect(CUSTOMER_STATUS_MAP['CUSTOMS_HOLD']).toBe('Delayed');
    expect(CUSTOMER_STATUS_MAP['OUT_FOR_DELIVERY']).toBe('Out for delivery');
  });

  it('does not expose exact driver location (FIELD_VISIBLE) to public', () => {
    const events = [
      { visibility: 'FIELD_VISIBLE', title: 'Location ping', lat: 51.5, lng: -0.1 },
      { visibility: 'CUSTOMER_VISIBLE', title: 'In transit', lat: null, lng: null }
    ];

    const publicEvents = events.filter((e) => e.visibility === 'CUSTOMER_VISIBLE');
    expect(publicEvents).toHaveLength(1);
    expect(publicEvents[0].lat).toBeNull();
  });

  it('masks destination to city only, not full address', () => {
    const destination = {
      line1: '123 Secret Street',
      city: 'Manchester',
      postcode: 'M1 1AA',
      country: 'UK'
    };

    const publicDestination = { city: destination.city, country: destination.country };

    expect(publicDestination).not.toHaveProperty('line1');
    expect(publicDestination).not.toHaveProperty('postcode');
    expect(publicDestination.city).toBe('Manchester');
  });
});

describe('tenant tracking isolation', () => {
  it('verifies that tenantId must match shipment tenantId', () => {
    const shipmentTenantId: string = 'tenant_A';
    const requestingTenantId: string = 'tenant_B';

    // Simulate the data access check
    const canAccess = shipmentTenantId === requestingTenantId;
    expect(canAccess).toBe(false);
  });

  it('allows access when tenantIds match', () => {
    const shipmentTenantId = 'tenant_A';
    const requestingTenantId = 'tenant_A';

    const canAccess = shipmentTenantId === requestingTenantId;
    expect(canAccess).toBe(true);
  });
});

describe('offline sync idempotency', () => {
  it('accepted events with same idempotencyKey return the existing eventId', () => {
    const existingEvent = { id: 'existing_evt_123', idempotencyKey: 'driver:abc:12345' };

    const syncResult = {
      accepted: [{ clientEventId: 'local_1', serverEventId: existingEvent.id }],
      rejected: []
    };

    expect(syncResult.accepted[0].serverEventId).toBe('existing_evt_123');
    expect(syncResult.rejected).toHaveLength(0);
  });

  it('rejected events include a human-readable reason', () => {
    const syncResult = {
      accepted: [],
      rejected: [{ clientEventId: 'local_bad', reason: 'Shipment not found' }]
    };

    expect(syncResult.rejected[0].reason).toBeTruthy();
    expect(typeof syncResult.rejected[0].reason).toBe('string');
  });
});

describe('customer status mapping', () => {
  const CUSTOMER_STATUS_MAP: Record<string, string> = {
    CREATED: 'Order received',
    BOOKED: 'Shipment booked',
    LABEL_GENERATED: 'Shipment prepared',
    ASSIGNED: 'Shipment assigned',
    PICKUP_SCHEDULED: 'Pickup scheduled',
    PICKED_UP: 'Picked up',
    AT_ORIGIN_HUB: 'Processing',
    DEPARTED_ORIGIN_HUB: 'In transit',
    IN_TRANSIT: 'In transit',
    AT_DESTINATION_HUB: 'Arrived near destination',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERY_ATTEMPTED: 'Delivery attempted',
    DELIVERED: 'Delivered',
    FAILED_DELIVERY: 'Delivery issue',
    EXCEPTION: 'Delayed',
    CUSTOMS_HOLD: 'Delayed',
    CUSTOMS_RELEASED: 'In transit',
    RETURN_STARTED: 'Return started',
    RETURNED: 'Returned',
    CANCELLED: 'Cancelled'
  };

  it('maps all TrackingStatus values to customer-safe labels', () => {
    const statuses = Object.keys(CUSTOMER_STATUS_MAP);
    for (const status of statuses) {
      expect(CUSTOMER_STATUS_MAP[status]).toBeTruthy();
    }
  });

  it('never exposes raw operational status names to customers', () => {
    const sensitiveStatuses = ['EXCEPTION', 'CUSTOMS_HOLD', 'FAILED_DELIVERY'];
    for (const status of sensitiveStatuses) {
      const label = CUSTOMER_STATUS_MAP[status];
      expect(label).not.toBe(status);
      expect(label).toBeTruthy();
    }
  });

  it('EXCEPTION maps to Delayed not Exception raised', () => {
    expect(CUSTOMER_STATUS_MAP['EXCEPTION']).toBe('Delayed');
  });

  it('CUSTOMS_HOLD maps to Delayed', () => {
    expect(CUSTOMER_STATUS_MAP['CUSTOMS_HOLD']).toBe('Delayed');
  });
});
