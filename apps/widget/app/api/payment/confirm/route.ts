import { NextRequest, NextResponse } from "next/server";
import { getTenantBySlug } from "@fauward/tenant-db";

import { createShipmentsForPayment, getPendingPayment } from "@/lib/payments/pendingPayments";
import { getPaymentProvider, PaystackProvider, type PaymentProvider } from "@/lib/payments/providers";
import { buildTenantConfig } from "@/lib/shipmentTenantConfig";
import { verifyWidgetToken } from "@/lib/widgetToken";

export const runtime = "nodejs";

type BodyRecord = Record<string, unknown>;

function asRecord(value: unknown): BodyRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as BodyRecord;
}

export async function POST(req: NextRequest) {
  const body = asRecord(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const providerName = typeof body.provider === "string" ? body.provider.toLowerCase() : "";
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  const expectedAmount = typeof body.amountMinor === "number" ? body.amountMinor : Number(body.amountMinor);
  const expectedCurrency = typeof body.currency === "string" ? body.currency.toUpperCase() : "";

  if (providerName !== "paystack" || !reference || !Number.isFinite(expectedAmount) || !expectedCurrency) {
    return NextResponse.json({ error: "provider, reference, amountMinor, and currency are required" }, { status: 400 });
  }

  const pending = await getPendingPayment(reference);
  if (!pending) {
    return NextResponse.json({ error: "No pending payment session exists for this reference" }, { status: 404 });
  }

  const rawToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  let provider: PaymentProvider = new PaystackProvider(process.env.PAYSTACK_PUBLIC_KEY ?? null);
  if (rawToken) {
    try {
      const tokenPayload = await verifyWidgetToken(rawToken);
      if (tokenPayload.tenantSlug !== pending.tenantSlug) {
        return NextResponse.json({ error: "Payment reference does not belong to this tenant" }, { status: 403 });
      }
      const tenant = await getTenantBySlug(tokenPayload.tenantSlug);
      if (tenant && tenant.id === tokenPayload.tenantId) {
        provider = getPaymentProvider(buildTenantConfig(tenant));
      }
    } catch {
      return NextResponse.json({ error: "Invalid or expired widget token" }, { status: 401 });
    }
  }

  try {
    const verification = await provider.verify(reference);
    if (verification.amountMinor !== expectedAmount || verification.currency !== expectedCurrency) {
      return NextResponse.json({ error: "Verified payment amount or currency does not match the request" }, { status: 400 });
    }
    if (verification.status !== "success") {
      return NextResponse.json({ success: false, status: verification.status }, { status: 202 });
    }

    const shipments = await createShipmentsForPayment(reference, verification);
    return NextResponse.json({
      success: true,
      status: verification.status,
      reference,
      shipments,
      trackingRef: shipments[0]?.trackingRef ?? null,
      shipmentId: shipments[0]?.shipmentId ?? null,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment confirmation failed" },
      { status: 503 },
    );
  }
}
