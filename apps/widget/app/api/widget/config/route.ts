import { NextRequest, NextResponse } from "next/server";
import { getTenantBySlug } from "@fauward/tenant-db";

import { buildTenantConfig } from "@/lib/shipmentTenantConfig";
import { verifyWidgetToken } from "@/lib/widgetToken";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
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

  return NextResponse.json({ tenantConfig: buildTenantConfig(tenant) });
}

