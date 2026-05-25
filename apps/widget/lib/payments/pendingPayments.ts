import { createShipment, type CreateShipmentInput } from "@fauward/tenant-db";

import type { WidgetShipmentPayload } from "@/lib/shipmentValidation";
import type { PaymentVerification } from "./providers";

export type CreatedPaymentShipment = {
  trackingRef: string;
  shipmentId: string;
};

export type PendingPayment = {
  provider: "paystack";
  tenantSlug: string;
  reference: string;
  amountMinor: number;
  currency: string;
  payloads: WidgetShipmentPayload[];
  createdAt: number;
  createdShipments?: CreatedPaymentShipment[];
};

const pendingPayments = new Map<string, PendingPayment>();

function toCreateShipmentInput(payload: WidgetShipmentPayload): CreateShipmentInput {
  return {
    source: "widget",
    direction: payload.direction,
    route: payload.route,
    sender_name: payload.sender_name,
    sender_email: payload.sender_email,
    sender_phone: payload.sender_phone,
    sender_address: payload.sender_address,
    recipient_name: payload.recipient_name,
    recipient_email: payload.recipient_email,
    recipient_phone: payload.recipient_phone,
    recipient_address: payload.recipient_address,
    category: payload.category,
    declared_value: payload.declared_value,
    insurance: payload.insurance,
    notes: payload.notes,
    length_cm: payload.length_cm,
    width_cm: payload.width_cm,
    height_cm: payload.height_cm,
    weight_kg: payload.weight_kg,
    chargeable_weight: payload.chargeable_weight,
    price_estimate: payload.price_estimate,
    currency: payload.currency,
    created_by_user_id: null,
    widget_session_id: payload.widget_session_id,
    phone_verified: payload.phone_verified,
    assigned_agent: null,
    customs_declaration: payload.customs_declaration ?? null,
  };
}

export function storePendingPayment(input: PendingPayment) {
  pendingPayments.set(input.reference, input);
}

export function getPendingPayment(reference: string): PendingPayment | null {
  return pendingPayments.get(reference) ?? null;
}

export async function createShipmentsForPayment(
  reference: string,
  verification: PaymentVerification,
): Promise<CreatedPaymentShipment[]> {
  const pending = pendingPayments.get(reference);
  if (!pending) {
    throw new Error("No pending shipment draft was found for this payment reference");
  }
  if (pending.createdShipments) return pending.createdShipments;
  if (verification.status !== "success") {
    throw new Error(`Payment is ${verification.status}`);
  }
  if (verification.amountMinor !== pending.amountMinor || verification.currency.toUpperCase() !== pending.currency.toUpperCase()) {
    throw new Error("Verified payment amount or currency does not match the server quote");
  }

  const created: CreatedPaymentShipment[] = [];
  for (const payload of pending.payloads) {
    const shipment = await createShipment(pending.tenantSlug, toCreateShipmentInput(payload));
    created.push({ trackingRef: shipment.tracking_ref, shipmentId: shipment.id });
  }
  pending.createdShipments = created;
  pendingPayments.set(reference, pending);
  return created;
}
