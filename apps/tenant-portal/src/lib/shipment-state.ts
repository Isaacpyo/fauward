import type { ShipmentState } from "@/types/domain";

export const SHIPMENT_PROGRESS_STEPS: ShipmentState[] = [
  "PENDING",
  "PROCESSING",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED"
];

export const TERMINAL_SHIPMENT_STATES: ShipmentState[] = [
  "DELIVERED",
  "RETURNED",
  "CANCELLED"
];

export const SHIPMENT_TRANSITIONS: Record<ShipmentState, ShipmentState[]> = {
  PENDING: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "EXCEPTION"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "EXCEPTION"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED_DELIVERY", "EXCEPTION"],
  FAILED_DELIVERY: ["IN_TRANSIT", "RETURNED", "EXCEPTION"],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
  EXCEPTION: ["PENDING", "PROCESSING", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "FAILED_DELIVERY"]
};

export function getValidNextShipmentStates(state: ShipmentState): ShipmentState[] {
  return SHIPMENT_TRANSITIONS[state] ?? [];
}

export function isValidShipmentTransition(
  current: ShipmentState,
  next: ShipmentState
): boolean {
  return getValidNextShipmentStates(current).includes(next);
}
