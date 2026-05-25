/**
 * POST /api/widget/shipments
 * Validates the widget JWT, writes a shipment to the tenant's Supabase schema,
 * and returns the tracking reference.
 *
 * Required header: Authorization: Bearer <widget-jwt>
 */

import { NextRequest, NextResponse } from "next/server";
import { createShipment, getTenantBySlug } from "@fauward/tenant-db";
import { requiredAddressFieldKeys } from "@/lib/shipmentAddress";
import { calculateShipmentPricing } from "@/lib/shipmentPricing";
import { buildTenantConfig } from "@/lib/shipmentTenantConfig";
import { countryFromName } from "@/lib/shipmentTenantConfig";
import { formatPhoneE164, type WidgetShipmentPayload } from "@/lib/shipmentValidation";
import { verifyWidgetToken } from "@/lib/widgetToken";

export const runtime = "nodejs";

type BodyRecord = Record<string, unknown>;
type AddressRecord = Record<string, string>;
type CustomsDeclarationPayload = NonNullable<WidgetShipmentPayload["customs_declaration"]>;

const idempotencyCache = new Map<string, { trackingRef: string; shipmentId: string }>();

function asRecord(value: unknown): BodyRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as BodyRecord;
}

function asAddress(value: unknown): AddressRecord | null {
  const record = asRecord(value);
  if (!record) return null;
  const address: AddressRecord = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string") address[key] = item;
  }
  return address;
}

function missingAddressFields(address: AddressRecord): string[] {
  const country = address.country ?? "";
  return requiredAddressFieldKeys(country).filter((field) => !address[field]?.trim());
}

function numberField(body: BodyRecord, key: string): number {
  const value = body[key];
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function asCustomsDeclaration(value: unknown, expectedCurrency: string): CustomsDeclarationPayload | null {
  const record = asRecord(value);
  if (!record) return null;
  const type = record.type === "DDP" || record.type === "DDU" ? record.type : null;
  const items = Array.isArray(record.items) ? record.items : [];
  const currency = typeof record.currency === "string" ? record.currency.toUpperCase() : "";
  const totalValue = typeof record.totalValue === "number" ? record.totalValue : Number(record.totalValue);
  const normalizedItems: CustomsDeclarationPayload["items"] = [];

  for (const item of items) {
    const itemRecord = asRecord(item);
    if (!itemRecord) return null;
    const description = typeof itemRecord.description === "string" ? itemRecord.description.trim() : "";
    const hsCode = typeof itemRecord.hsCode === "string" ? itemRecord.hsCode.trim() : "";
    const quantity = typeof itemRecord.quantity === "number" ? itemRecord.quantity : Number(itemRecord.quantity);
    const declaredValue = typeof itemRecord.declaredValue === "number" ? itemRecord.declaredValue : Number(itemRecord.declaredValue);
    const itemCurrency = typeof itemRecord.currency === "string" ? itemRecord.currency.toUpperCase() : "";
    const countryOfOrigin = typeof itemRecord.countryOfOrigin === "string" ? itemRecord.countryOfOrigin.trim() : "";
    const reasonForExport = typeof itemRecord.reasonForExport === "string" ? itemRecord.reasonForExport.trim() : "";
    if (
      !description ||
      !hsCode ||
      !(quantity > 0) ||
      !(declaredValue > 0) ||
      itemCurrency !== expectedCurrency ||
      !countryFromName(countryOfOrigin) ||
      !reasonForExport
    ) {
      return null;
    }
    normalizedItems.push({ description, hsCode, quantity, declaredValue, currency: itemCurrency, countryOfOrigin, reasonForExport });
  }

  if (!type || normalizedItems.length === 0 || currency !== expectedCurrency || !(totalValue > 0)) return null;

  return {
    type,
    items: normalizedItems,
    totalValue,
    currency,
    documents: Array.isArray(record.documents) ? record.documents : [],
    status: "PENDING",
    holdReason: null,
  };
}

export async function POST(req: NextRequest) {
  const rawToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!rawToken) {
    return NextResponse.json({ error: "Missing widget token" }, { status: 401 });
  }

  let tokenPayload;
  try {
    tokenPayload = await verifyWidgetToken(rawToken);
  } catch {
    return NextResponse.json({ error: "Invalid or expired widget token" }, { status: 401 });
  }

  // Optional: enforce origin matches allowedOrigin in token
  const origin = req.headers.get("origin");
  if (tokenPayload.allowedOrigin !== "*" && origin && origin !== tokenPayload.allowedOrigin) {
    return NextResponse.json({ error: "Origin mismatch" }, { status: 403 });
  }

  const tenant = await getTenantBySlug(tokenPayload.tenantSlug);
  if (!tenant || tenant.id !== tokenPayload.tenantId) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  const tenantConfig = buildTenantConfig(tenant);

  const body = asRecord(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  const cacheKey = idempotencyKey ? `${tokenPayload.tenantId}:${idempotencyKey}` : "";
  const cached = cacheKey ? idempotencyCache.get(cacheKey) : null;
  if (cached) return NextResponse.json({ success: true, ...cached, idempotent: true });

  // Validate required fields
  const required = ["direction", "route", "sender_name", "sender_phone", "sender_address",
    "recipient_name", "recipient_phone", "recipient_address", "category", "declared_value", "weight_kg"];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  const senderAddress = asAddress(body.sender_address);
  const recipientAddress = asAddress(body.recipient_address);
  if (!senderAddress || !recipientAddress) {
    return NextResponse.json({ error: "Address payloads must be structured objects" }, { status: 400 });
  }
  const addressIssues = [
    ...missingAddressFields(senderAddress).map((field) => `sender_address.${field}`),
    ...missingAddressFields(recipientAddress).map((field) => `recipient_address.${field}`),
  ];
  if (addressIssues.length > 0) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: addressIssues }, { status: 422 });
  }

  const senderPhone = typeof body.sender_phone === "string" ? formatPhoneE164(body.sender_phone, senderAddress.country) : null;
  const recipientPhone = typeof body.recipient_phone === "string" ? formatPhoneE164(body.recipient_phone, recipientAddress.country) : null;
  if (!senderPhone || !recipientPhone) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: ["sender_phone", "recipient_phone"] }, { status: 422 });
  }

  const declaredValue = numberField(body, "declared_value");
  const lengthCm = numberField(body, "length_cm");
  const widthCm = numberField(body, "width_cm");
  const heightCm = numberField(body, "height_cm");
  const weightKg = numberField(body, "weight_kg");
  if (!(declaredValue > 0 && lengthCm > 0 && widthCm > 0 && heightCm > 0 && weightKg >= 5)) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: ["declared_value", "dimensions", "weight_kg"] }, { status: 422 });
  }

  const category = typeof body.category === "string" ? body.category : "";
  const categoryRule = tenantConfig.allowedCategories.find((item) => item.key === category);
  if (!categoryRule || categoryRule.status === "blocked") {
    return NextResponse.json({ error: "Category is not allowed in this region" }, { status: 422 });
  }

  const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : tenantConfig.currency;
  if (currency !== tenantConfig.currency) {
    return NextResponse.json({ error: "Currency does not match tenant configuration" }, { status: 400 });
  }

  const customsRequired = senderAddress.country !== recipientAddress.country;
  const customsDeclaration = asCustomsDeclaration(body.customs_declaration, currency);
  if (customsRequired && !customsDeclaration) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: ["customs_declaration"] }, { status: 422 });
  }
  if (!customsRequired && body.customs_declaration !== undefined && body.customs_declaration !== null) {
    return NextResponse.json({ error: "Customs declaration is only accepted for cross-border shipments" }, { status: 422 });
  }

  const insurance = typeof body.insurance === "string" ? body.insurance : "NONE";
  const pricing = calculateShipmentPricing(
    { lengthCm, widthCm, heightCm, weightKg },
    declaredValue,
    insurance,
    tenantConfig,
  );
  const priceEstimate = numberField(body, "price_estimate");
  if (Number.isFinite(priceEstimate) && Math.abs(priceEstimate - pricing.total) > 0.01) {
    return NextResponse.json({ error: "Price estimate does not match server-side quote" }, { status: 400 });
  }

  try {
    const shipment = await createShipment(tokenPayload.tenantSlug, {
      source: "widget",
      direction: body.direction as string,
      route: body.route as string,
      sender_name: body.sender_name as string,
      sender_email: (body.sender_email as string) ?? null,
      sender_phone: senderPhone,
      sender_address: senderAddress,
      recipient_name: body.recipient_name as string,
      recipient_email: (body.recipient_email as string) ?? null,
      recipient_phone: recipientPhone,
      recipient_address: recipientAddress,
      category,
      declared_value: declaredValue,
      insurance,
      notes: (body.notes as string) ?? null,
      customs_declaration: customsDeclaration,
      length_cm: lengthCm,
      width_cm: widthCm,
      height_cm: heightCm,
      weight_kg: weightKg,
      chargeable_weight: pricing.chargeableWeight,
      price_estimate: pricing.total,
      currency,
      created_by_user_id: null,
      widget_session_id: (body.widget_session_id as string) ?? null,
      phone_verified: Boolean(body.phone_verified),
      assigned_agent: null,
    });

    if (cacheKey) {
      idempotencyCache.set(cacheKey, { trackingRef: shipment.tracking_ref, shipmentId: shipment.id });
    }

    return NextResponse.json({
      success: true,
      trackingRef: shipment.tracking_ref,
      shipmentId: shipment.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
