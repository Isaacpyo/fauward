/**
 * POST /api/widget/shipments
 * Validates the widget JWT, writes a shipment to the tenant's Supabase schema,
 * and returns the tracking reference.
 *
 * Required header: Authorization: Bearer <widget-jwt>
 */

import { NextRequest, NextResponse } from "next/server";
import { createShipment } from "@fauward/tenant-db";
import { verifyWidgetToken } from "@/lib/widgetToken";

export const runtime = "nodejs";

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields
  const required = ["direction", "route", "sender_name", "sender_phone", "sender_address",
    "recipient_name", "recipient_phone", "recipient_address", "category", "declared_value", "weight_kg"];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  try {
    const shipment = await createShipment(tokenPayload.tenantSlug, {
      source: "widget",
      direction: body.direction as "SHIP_TO_AFRICA" | "SHIP_TO_UK",
      route: body.route as string,
      sender_name: body.sender_name as string,
      sender_email: (body.sender_email as string) ?? null,
      sender_phone: body.sender_phone as string,
      sender_address: body.sender_address as Record<string, string>,
      recipient_name: body.recipient_name as string,
      recipient_email: (body.recipient_email as string) ?? null,
      recipient_phone: body.recipient_phone as string,
      recipient_address: body.recipient_address as Record<string, string>,
      category: body.category as string,
      declared_value: Number(body.declared_value),
      insurance: (body.insurance as string) ?? "NONE",
      notes: (body.notes as string) ?? null,
      length_cm: body.length_cm != null ? Number(body.length_cm) : null,
      width_cm: body.width_cm != null ? Number(body.width_cm) : null,
      height_cm: body.height_cm != null ? Number(body.height_cm) : null,
      weight_kg: Number(body.weight_kg),
      chargeable_weight: body.chargeable_weight != null ? Number(body.chargeable_weight) : null,
      price_estimate: body.price_estimate != null ? Number(body.price_estimate) : null,
      currency: (body.currency as string) ?? "GBP",
      created_by_user_id: null,
      widget_session_id: (body.widget_session_id as string) ?? null,
      phone_verified: Boolean(body.phone_verified),
      assigned_agent: null,
    });

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
