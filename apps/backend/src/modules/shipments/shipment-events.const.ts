// Free-form ShipmentEvent.status values that the platform writes.
// ShipmentEvent.status is a String column (not an enum), so these are conventions, not schema.
export const SHIPMENT_EVENT_DELIVERED = 'DELIVERED';
export const SHIPMENT_EVENT_FAILED_DELIVERY = 'FAILED_DELIVERY';
export const SHIPMENT_EVENT_RETURN_STARTED = 'RETURN_STARTED';
export const SHIPMENT_EVENT_COD_COLLECTED = 'COD_COLLECTED';

export type CodCollectionPayload = {
  amount: number;
  currency: string;
  method: 'CASH' | 'CARD_TERMINAL' | 'BANK_TRANSFER';
  collectedBy?: string;
};
