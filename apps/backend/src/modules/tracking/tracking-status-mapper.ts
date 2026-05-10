import { TrackingStatus } from '@fauward/tracking-core';

const LEGACY_TO_TRACKING: Record<string, TrackingStatus> = {
  PENDING: TrackingStatus.CREATED,
  PROCESSING: TrackingStatus.BOOKED,
  PICKED_UP: TrackingStatus.PICKED_UP,
  IN_TRANSIT: TrackingStatus.IN_TRANSIT,
  OUT_FOR_DELIVERY: TrackingStatus.OUT_FOR_DELIVERY,
  DELIVERED: TrackingStatus.DELIVERED,
  FAILED_DELIVERY: TrackingStatus.FAILED_DELIVERY,
  RETURNED: TrackingStatus.RETURNED,
  CANCELLED: TrackingStatus.CANCELLED,
  EXCEPTION: TrackingStatus.EXCEPTION
};

const TRACKING_TO_LEGACY: Record<TrackingStatus, string> = {
  CREATED: 'PENDING',
  BOOKED: 'PROCESSING',
  LABEL_GENERATED: 'PROCESSING',
  ASSIGNED: 'PROCESSING',
  PICKUP_SCHEDULED: 'PROCESSING',
  PICKED_UP: 'PICKED_UP',
  AT_ORIGIN_HUB: 'IN_TRANSIT',
  DEPARTED_ORIGIN_HUB: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  AT_DESTINATION_HUB: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERY_ATTEMPTED: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  FAILED_DELIVERY: 'FAILED_DELIVERY',
  EXCEPTION: 'EXCEPTION',
  CUSTOMS_HOLD: 'IN_TRANSIT',
  CUSTOMS_RELEASED: 'IN_TRANSIT',
  RETURN_STARTED: 'FAILED_DELIVERY',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED'
};

export function legacyToTrackingStatus(legacy: string): TrackingStatus {
  return LEGACY_TO_TRACKING[legacy] ?? TrackingStatus.EXCEPTION;
}

export function trackingToLegacyStatus(status: TrackingStatus): string {
  return TRACKING_TO_LEGACY[status] ?? 'EXCEPTION';
}
