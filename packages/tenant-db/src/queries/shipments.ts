import { getTenantDb } from "../client.js";

export type ShipmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "COLLECTED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "EXCEPTION"
  | "CANCELLED";

export type ShipmentSource = "dashboard" | "widget" | "api" | "csv";

export type Shipment = {
  id: string;
  tracking_ref: string;
  source: ShipmentSource;
  status: ShipmentStatus;
  direction: "SHIP_TO_AFRICA" | "SHIP_TO_UK";
  route: string;
  sender_name: string;
  sender_email: string | null;
  sender_phone: string;
  sender_address: Record<string, string>;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string;
  recipient_address: Record<string, string>;
  category: string;
  declared_value: number;
  insurance: string;
  notes: string | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  weight_kg: number;
  chargeable_weight: number | null;
  price_estimate: number | null;
  currency: string;
  created_by_user_id: string | null;
  widget_session_id: string | null;
  phone_verified: boolean;
  assigned_agent: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateShipmentInput = Omit<
  Shipment,
  "id" | "tracking_ref" | "status" | "created_at" | "updated_at"
> & { source: ShipmentSource };

function generateTrackingRef(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TC-${date}-${rand}`;
}

export type ListShipmentsOptions = {
  status?: ShipmentStatus;
  source?: ShipmentSource;
  limit?: number;
  offset?: number;
};

export async function listShipments(
  tenantSlug: string,
  opts: ListShipmentsOptions = {},
): Promise<{ data: Shipment[]; total: number }> {
  const db = getTenantDb(tenantSlug);
  let query = db
    .from("shipments")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50) - 1);

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.source) query = query.eq("source", opts.source);

  const { data, count, error } = await query;
  if (error) throw new Error(`listShipments: ${error.message}`);
  return { data: (data ?? []) as Shipment[], total: count ?? 0 };
}

export async function getShipmentById(
  tenantSlug: string,
  shipmentId: string,
): Promise<Shipment | null> {
  const db = getTenantDb(tenantSlug);
  const { data, error } = await db
    .from("shipments")
    .select("*")
    .eq("id", shipmentId)
    .single();
  if (error || !data) return null;
  return data as Shipment;
}

export async function getShipmentByTrackingRef(
  tenantSlug: string,
  trackingRef: string,
): Promise<Shipment | null> {
  const db = getTenantDb(tenantSlug);
  const { data, error } = await db
    .from("shipments")
    .select("*")
    .eq("tracking_ref", trackingRef)
    .single();
  if (error || !data) return null;
  return data as Shipment;
}

export async function createShipment(
  tenantSlug: string,
  input: CreateShipmentInput,
): Promise<Shipment> {
  const db = getTenantDb(tenantSlug);
  const tracking_ref = generateTrackingRef();

  const { data, error } = await db
    .from("shipments")
    .insert({ ...input, tracking_ref, status: "PENDING" })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`createShipment: ${error?.message ?? "unknown error"}`);
  }
  return data as Shipment;
}

export async function updateShipmentStatus(
  tenantSlug: string,
  shipmentId: string,
  status: ShipmentStatus,
  note?: string,
  actorId?: string,
): Promise<void> {
  const db = getTenantDb(tenantSlug);

  await db.from("shipments").update({ status }).eq("id", shipmentId);

  await db.from("shipment_events").insert({
    shipment_id: shipmentId,
    status,
    note: note ?? null,
    actor_id: actorId ?? null,
  });
}
