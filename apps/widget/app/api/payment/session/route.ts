import { NextRequest, NextResponse } from "next/server";
import { getTenantBySlug } from "@fauward/tenant-db";

import { calculateShipmentPricing, toMinorUnits } from "@/lib/shipmentPricing";
import { storePendingPayment } from "@/lib/payments/pendingPayments";
import { getPaymentProvider } from "@/lib/payments/providers";
import { buildTenantConfig } from "@/lib/shipmentTenantConfig";
import { buildWidgetShipmentPayload, validateShipmentDraft, type ShipmentDraftInput } from "@/lib/shipmentValidation";
import { verifyWidgetToken } from "@/lib/widgetToken";

export const runtime = "nodejs";

type BodyRecord = Record<string, unknown>;

function asRecord(value: unknown): BodyRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as BodyRecord;
}

function modeFromBody(body: BodyRecord): "single" | "bulk" {
  return body.mode === "bulk" ? "bulk" : "single";
}

function emailFromDrafts(drafts: ShipmentDraftInput[]): string {
  return drafts.find((draft) => draft.sender.email.trim())?.sender.email.trim() ?? "";
}

function callbackUrl(req: NextRequest, mode: "single" | "bulk", amountMinor: number, currency: string): string {
  const path = mode === "bulk" ? "/payment/bulk-success" : "/payment/success";
  const url = new URL(path, req.nextUrl.origin);
  url.searchParams.set("provider", "paystack");
  url.searchParams.set("amountMinor", String(amountMinor));
  url.searchParams.set("currency", currency);
  return url.toString();
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

  const tenant = await getTenantBySlug(tokenPayload.tenantSlug);
  if (!tenant || tenant.id !== tokenPayload.tenantId) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const tenantConfig = buildTenantConfig(tenant);
  const body = asRecord(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const requestedCurrency = typeof body.currency === "string" ? body.currency.toUpperCase() : tenantConfig.currency;
  if (requestedCurrency !== tenantConfig.currency) {
    return NextResponse.json({ error: "Currency does not match tenant configuration" }, { status: 400 });
  }

  const drafts = Array.isArray(body.shipments) ? body.shipments : body.shipment ? [body.shipment] : [];
  if (drafts.length === 0) {
    return NextResponse.json({ error: "Shipment draft is required for server-side amount validation" }, { status: 400 });
  }

  let amount = 0;
  const validatedDrafts: ShipmentDraftInput[] = [];
  const validationErrors: string[] = [];
  drafts.forEach((draft, index) => {
    const validation = validateShipmentDraft(draft, tenantConfig, { requirePhoneVerified: true });
    if (!validation.ok) {
      validationErrors.push(`shipment ${index + 1}: ${validation.issues.join(", ")}`);
      return;
    }
    const pricing = calculateShipmentPricing(
      validation.data.pkg,
      validation.data.goods.declaredValue,
      validation.data.goods.insurance,
      tenantConfig,
    );
    amount += pricing.total;
    validatedDrafts.push(validation.data);
  });

  if (validationErrors.length > 0) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: validationErrors }, { status: 422 });
  }

  const amountMinor = toMinorUnits(amount, tenantConfig.currency);
  const requestedAmount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount !== amountMinor || amountMinor <= 0) {
    return NextResponse.json({ error: "Amount does not match server-side quote" }, { status: 400 });
  }

  const mode = modeFromBody(body);
  const batchRef = typeof body.batchRef === "string" ? body.batchRef : null;
  const provider = getPaymentProvider(tenantConfig);
  const metadata = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    source: "widget",
    mode,
    batchRef: batchRef ?? "",
    shipmentCount: validatedDrafts.length,
  };

  try {
    const provisionalSession = await provider.createSession({
      amountMinor,
      currency: tenantConfig.currency,
      email: emailFromDrafts(validatedDrafts),
      metadata,
      callbackUrl: callbackUrl(req, mode, amountMinor, tenantConfig.currency),
    });

    if (provisionalSession.provider === "paystack") {
      const payloads = validatedDrafts.map((draft, index) =>
        buildWidgetShipmentPayload(draft, tenantConfig, {
          widgetSessionId: batchRef ?? provisionalSession.reference,
          idempotencyKey: `paystack:${provisionalSession.reference}:${index}`,
        }),
      );
      storePendingPayment({
        provider: "paystack",
        tenantSlug: tenant.slug,
        reference: provisionalSession.reference,
        amountMinor,
        currency: tenantConfig.currency,
        payloads,
        createdAt: Date.now(),
      });
    }

    return NextResponse.json(provisionalSession);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment session could not be initialized" },
      { status: 503 },
    );
  }
}
