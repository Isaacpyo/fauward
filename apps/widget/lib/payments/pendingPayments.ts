import { createShipment, getSupabaseAdmin, type CreateShipmentInput } from "@fauward/tenant-db";

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
  status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdShipments?: CreatedPaymentShipment[];
};

type PaymentSessionRow = {
  reference: string;
  provider: string;
  tenant_slug: string;
  amount_minor: number;
  currency: string;
  payloads: WidgetShipmentPayload[];
  created_shipments: CreatedPaymentShipment[] | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  error: string | null;
  created_at: string;
};

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

function paymentSessionsTable() {
  return getSupabaseAdmin().from("widget_payment_sessions");
}

function rowToPending(row: PaymentSessionRow): PendingPayment {
  return {
    provider: "paystack",
    tenantSlug: row.tenant_slug,
    reference: row.reference,
    amountMinor: row.amount_minor,
    currency: row.currency,
    payloads: row.payloads,
    createdAt: new Date(row.created_at).getTime(),
    status: row.status,
    createdShipments: row.created_shipments ?? undefined,
  };
}

function isNoRowsError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "PGRST116" || error?.message?.toLowerCase().includes("no rows") === true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function storePendingPayment(input: PendingPayment): Promise<void> {
  const { error } = await paymentSessionsTable().upsert(
    {
      reference: input.reference,
      provider: input.provider,
      tenant_slug: input.tenantSlug,
      amount_minor: input.amountMinor,
      currency: input.currency.toUpperCase(),
      payloads: input.payloads,
      status: "PENDING",
      error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "reference" },
  );
  if (error) throw new Error(`storePendingPayment: ${error.message}`);
}

export async function getPendingPayment(reference: string): Promise<PendingPayment | null> {
  const { data, error } = await paymentSessionsTable().select("*").eq("reference", reference).maybeSingle();
  if (error && !isNoRowsError(error)) throw new Error(`getPendingPayment: ${error.message}`);
  return data ? rowToPending(data as PaymentSessionRow) : null;
}

async function claimPendingPayment(reference: string): Promise<PendingPayment | null> {
  const { data, error } = await paymentSessionsTable()
    .update({ status: "PROCESSING", updated_at: new Date().toISOString() })
    .eq("reference", reference)
    .eq("status", "PENDING")
    .select("*")
    .maybeSingle();
  if (error && !isNoRowsError(error)) throw new Error(`claimPendingPayment: ${error.message}`);
  return data ? rowToPending(data as PaymentSessionRow) : null;
}

async function markCompleted(reference: string, shipments: CreatedPaymentShipment[]): Promise<void> {
  const { error } = await paymentSessionsTable()
    .update({
      status: "COMPLETED",
      created_shipments: shipments,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("reference", reference);
  if (error) throw new Error(`markCompleted: ${error.message}`);
}

async function markFailed(reference: string, errorMessage: string): Promise<void> {
  await paymentSessionsTable()
    .update({
      status: "FAILED",
      error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("reference", reference);
}

async function waitForCompleted(reference: string): Promise<CreatedPaymentShipment[]> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pending = await getPendingPayment(reference);
    if (!pending) throw new Error("No pending shipment draft was found for this payment reference");
    if (pending.status === "COMPLETED" && pending.createdShipments) return pending.createdShipments;
    if (pending.status === "FAILED") throw new Error("Payment session processing failed");
    await sleep(250);
  }
  throw new Error("Payment session is already being processed");
}

export async function createShipmentsForPayment(
  reference: string,
  verification: PaymentVerification,
): Promise<CreatedPaymentShipment[]> {
  const current = await getPendingPayment(reference);
  if (!current) {
    throw new Error("No pending shipment draft was found for this payment reference");
  }
  if (current.status === "COMPLETED" && current.createdShipments) return current.createdShipments;

  const claimed = await claimPendingPayment(reference);
  if (!claimed) return waitForCompleted(reference);

  try {
    if (verification.status !== "success") {
      throw new Error(`Payment is ${verification.status}`);
    }
    if (verification.amountMinor !== claimed.amountMinor || verification.currency.toUpperCase() !== claimed.currency.toUpperCase()) {
      throw new Error("Verified payment amount or currency does not match the server quote");
    }

    const created: CreatedPaymentShipment[] = [];
    for (const payload of claimed.payloads) {
      const shipment = await createShipment(claimed.tenantSlug, toCreateShipmentInput(payload));
      created.push({ trackingRef: shipment.tracking_ref, shipmentId: shipment.id });
    }
    await markCompleted(reference, created);
    return created;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Payment session processing failed";
    await markFailed(reference, message);
    throw error;
  }
}
