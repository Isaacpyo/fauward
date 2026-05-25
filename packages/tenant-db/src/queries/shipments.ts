import { getTenantDb } from "../client";

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

export type ShipmentCustomsDeclaration = {
  type: "DDP" | "DDU" | string;
  items: Array<{
    description: string;
    hsCode: string;
    quantity: number;
    declaredValue: number;
    currency: string;
    countryOfOrigin: string;
    reasonForExport: string;
  }>;
  totalValue: number;
  currency: string;
  documents: unknown[] | null;
  status: string;
  holdReason: string | null;
};

export type Shipment = {
  id: string;
  tracking_ref: string;
  source: ShipmentSource;
  status: ShipmentStatus;
  direction: string;
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
  customs_declaration: ShipmentCustomsDeclaration | null;
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

function generateTrackingRef(tenantName = "XX"): string {
  const DIGITS = "0123456789";
  const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const pick = (chars: string, n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  const prefix = (tenantName.replace(/[^A-Za-z]/g, "") || "XX").toUpperCase().slice(0, 2).padEnd(2, "X");
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");

  return `${prefix}${yy}${mm}-${pick(DIGITS, 2)}-${pick(ALPHANUM, 4)}-${pick(DIGITS, 5)}`;
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
  const tracking_ref = generateTrackingRef(tenantSlug);

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
