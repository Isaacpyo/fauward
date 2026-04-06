export type ShipmentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED_DELIVERY'
  | 'RETURNED'
  | 'CANCELLED'
  | 'EXCEPTION';

const TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PICKED_UP', 'IN_TRANSIT', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY'],
  DELIVERED: [],
  FAILED_DELIVERY: ['OUT_FOR_DELIVERY'],
  RETURNED: [],
  CANCELLED: [],
  EXCEPTION: []
};

export function getAllowedTransitions(status: ShipmentStatus): ShipmentStatus[] {
  return TRANSITIONS[status] ?? [];
}