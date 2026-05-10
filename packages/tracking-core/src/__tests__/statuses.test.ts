import { describe, it, expect } from 'vitest';
import {
  TrackingStatus,
  CUSTOMER_STATUS_MAP,
  CUSTOMER_MESSAGE_MAP,
  ALLOWED_TRACKING_TRANSITIONS,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES
} from '../statuses.js';

describe('TrackingStatus enum', () => {
  it('contains all required statuses', () => {
    const required = [
      'CREATED', 'BOOKED', 'LABEL_GENERATED', 'ASSIGNED',
      'PICKUP_SCHEDULED', 'PICKED_UP', 'AT_ORIGIN_HUB',
      'DEPARTED_ORIGIN_HUB', 'IN_TRANSIT', 'AT_DESTINATION_HUB',
      'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED', 'DELIVERED',
      'FAILED_DELIVERY', 'EXCEPTION', 'CUSTOMS_HOLD',
      'CUSTOMS_RELEASED', 'RETURN_STARTED', 'RETURNED', 'CANCELLED'
    ];

    for (const status of required) {
      expect(TrackingStatus).toHaveProperty(status);
    }
  });
});

describe('CUSTOMER_STATUS_MAP', () => {
  it('has an entry for every TrackingStatus', () => {
    for (const status of Object.keys(TrackingStatus)) {
      expect(CUSTOMER_STATUS_MAP).toHaveProperty(status);
    }
  });

  it('never uses the raw status name as the customer label', () => {
    for (const [status, label] of Object.entries(CUSTOMER_STATUS_MAP)) {
      expect(label).not.toBe(status);
    }
  });
});

describe('CUSTOMER_MESSAGE_MAP', () => {
  it('has an entry for every TrackingStatus', () => {
    for (const status of Object.keys(TrackingStatus)) {
      expect(CUSTOMER_MESSAGE_MAP).toHaveProperty(status);
    }
  });
});

describe('ALLOWED_TRACKING_TRANSITIONS', () => {
  it('has entries for every status', () => {
    for (const status of Object.keys(TrackingStatus)) {
      expect(ALLOWED_TRACKING_TRANSITIONS).toHaveProperty(status);
    }
  });

  it('terminal statuses have no automatic transitions', () => {
    expect(ALLOWED_TRACKING_TRANSITIONS['RETURNED']).toEqual([]);
    expect(ALLOWED_TRACKING_TRANSITIONS['CANCELLED']).toEqual([]);
  });

  it('DELIVERED can only transition to RETURN_STARTED', () => {
    expect(ALLOWED_TRACKING_TRANSITIONS['DELIVERED']).toEqual(['RETURN_STARTED']);
  });

  it('CREATED can transition to BOOKED or CANCELLED', () => {
    expect(ALLOWED_TRACKING_TRANSITIONS['CREATED']).toContain('BOOKED');
    expect(ALLOWED_TRACKING_TRANSITIONS['CREATED']).toContain('CANCELLED');
  });
});

describe('TERMINAL_STATUSES', () => {
  it('includes DELIVERED, RETURNED, CANCELLED', () => {
    expect(TERMINAL_STATUSES).toContain('DELIVERED');
    expect(TERMINAL_STATUSES).toContain('RETURNED');
    expect(TERMINAL_STATUSES).toContain('CANCELLED');
  });

  it('does not include active statuses', () => {
    expect(TERMINAL_STATUSES).not.toContain('IN_TRANSIT');
    expect(TERMINAL_STATUSES).not.toContain('OUT_FOR_DELIVERY');
  });
});

describe('ACTIVE_STATUSES', () => {
  it('includes all non-terminal statuses', () => {
    expect(ACTIVE_STATUSES).toContain('CREATED');
    expect(ACTIVE_STATUSES).toContain('IN_TRANSIT');
    expect(ACTIVE_STATUSES).toContain('OUT_FOR_DELIVERY');
    expect(ACTIVE_STATUSES).toContain('EXCEPTION');
  });

  it('does not include terminal statuses', () => {
    expect(ACTIVE_STATUSES).not.toContain('DELIVERED');
    expect(ACTIVE_STATUSES).not.toContain('RETURNED');
    expect(ACTIVE_STATUSES).not.toContain('CANCELLED');
  });
});
