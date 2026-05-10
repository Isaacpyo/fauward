import { describe, it, expect } from 'vitest';
import { legacyToTrackingStatus, trackingToLegacyStatus } from '../tracking-status-mapper.js';

describe('legacyToTrackingStatus', () => {
  it('maps all legacy statuses to tracking statuses', () => {
    expect(legacyToTrackingStatus('PENDING')).toBe('CREATED');
    expect(legacyToTrackingStatus('PROCESSING')).toBe('BOOKED');
    expect(legacyToTrackingStatus('PICKED_UP')).toBe('PICKED_UP');
    expect(legacyToTrackingStatus('IN_TRANSIT')).toBe('IN_TRANSIT');
    expect(legacyToTrackingStatus('OUT_FOR_DELIVERY')).toBe('OUT_FOR_DELIVERY');
    expect(legacyToTrackingStatus('DELIVERED')).toBe('DELIVERED');
    expect(legacyToTrackingStatus('FAILED_DELIVERY')).toBe('FAILED_DELIVERY');
    expect(legacyToTrackingStatus('RETURNED')).toBe('RETURNED');
    expect(legacyToTrackingStatus('CANCELLED')).toBe('CANCELLED');
    expect(legacyToTrackingStatus('EXCEPTION')).toBe('EXCEPTION');
  });

  it('returns EXCEPTION for unknown status', () => {
    expect(legacyToTrackingStatus('UNKNOWN_STATUS')).toBe('EXCEPTION');
  });
});

describe('trackingToLegacyStatus', () => {
  it('maps canonical statuses back to legacy', () => {
    expect(trackingToLegacyStatus('CREATED')).toBe('PENDING');
    expect(trackingToLegacyStatus('BOOKED')).toBe('PROCESSING');
    expect(trackingToLegacyStatus('PICKED_UP')).toBe('PICKED_UP');
    expect(trackingToLegacyStatus('IN_TRANSIT')).toBe('IN_TRANSIT');
    expect(trackingToLegacyStatus('DELIVERED')).toBe('DELIVERED');
    expect(trackingToLegacyStatus('CANCELLED')).toBe('CANCELLED');
  });

  it('maps new statuses to closest legacy equivalent', () => {
    expect(trackingToLegacyStatus('AT_ORIGIN_HUB')).toBe('IN_TRANSIT');
    expect(trackingToLegacyStatus('CUSTOMS_HOLD')).toBe('IN_TRANSIT');
    expect(trackingToLegacyStatus('DELIVERY_ATTEMPTED')).toBe('OUT_FOR_DELIVERY');
    expect(trackingToLegacyStatus('RETURN_STARTED')).toBe('FAILED_DELIVERY');
    expect(trackingToLegacyStatus('LABEL_GENERATED')).toBe('PROCESSING');
  });
});
