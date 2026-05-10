import { describe, it, expect } from 'vitest';
import { legacyToTrackingStatus, trackingToLegacyStatus } from '../status-mapper.js';

describe('legacyToTrackingStatus (package)', () => {
  const cases: [string, string][] = [
    ['PENDING', 'CREATED'],
    ['PROCESSING', 'BOOKED'],
    ['PICKED_UP', 'PICKED_UP'],
    ['IN_TRANSIT', 'IN_TRANSIT'],
    ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
    ['DELIVERED', 'DELIVERED'],
    ['FAILED_DELIVERY', 'FAILED_DELIVERY'],
    ['RETURNED', 'RETURNED'],
    ['CANCELLED', 'CANCELLED'],
    ['EXCEPTION', 'EXCEPTION']
  ];

  it.each(cases)('%s → %s', (legacy, expected) => {
    expect(legacyToTrackingStatus(legacy)).toBe(expected);
  });

  it('returns EXCEPTION for unknown status', () => {
    expect(legacyToTrackingStatus('INVENTED_STATUS')).toBe('EXCEPTION');
  });
});

describe('trackingToLegacyStatus (package)', () => {
  it('maps CREATED back to PENDING', () => {
    expect(trackingToLegacyStatus('CREATED')).toBe('PENDING');
  });

  it('maps AT_ORIGIN_HUB to IN_TRANSIT', () => {
    expect(trackingToLegacyStatus('AT_ORIGIN_HUB')).toBe('IN_TRANSIT');
  });

  it('all TrackingStatus values produce a non-empty string', () => {
    const statuses = [
      'CREATED', 'BOOKED', 'LABEL_GENERATED', 'ASSIGNED',
      'PICKUP_SCHEDULED', 'PICKED_UP', 'AT_ORIGIN_HUB', 'DEPARTED_ORIGIN_HUB',
      'IN_TRANSIT', 'AT_DESTINATION_HUB', 'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED',
      'DELIVERED', 'FAILED_DELIVERY', 'EXCEPTION', 'CUSTOMS_HOLD',
      'CUSTOMS_RELEASED', 'RETURN_STARTED', 'RETURNED', 'CANCELLED'
    ] as const;

    for (const s of statuses) {
      const result = trackingToLegacyStatus(s);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
