import type { TrackingStatus } from './statuses.js';

// Maps legacy ShipmentStatus values to canonical TrackingStatus
const LEGACY_TO_TRACKING: Record<string, TrackingStatus> = {
  PENDING: 'CREATED',
  PROCESSING: 'BOOKED',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  FAILED_DELIVERY: 'FAILED_DELIVERY',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
  EXCEPTION: 'EXCEPTION'
};

// Maps canonical TrackingStatus back to legacy ShipmentStatus
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

export function legacyToTrackingStatus(legacyStatus: string): TrackingStatus {
  return (LEGACY_TO_TRACKING[legacyStatus] as TrackingStatus) ?? 'EXCEPTION';
}

export function trackingToLegacyStatus(status: TrackingStatus): string {
  return TRACKING_TO_LEGACY[status] ?? 'EXCEPTION';
}
