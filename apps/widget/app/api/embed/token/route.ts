/**
 * GET /api/embed/token?tenant=acme
 * Called by embed.js to exchange a tenant API key for a short-lived widget JWT.
 *
 * Required header: Authorization: Bearer fw_<api-key>
 */

import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@fauward/tenant-db";
import { getTenantBySlug } from "@fauward/tenant-db";
import { signWidgetToken } from "@/lib/widgetToken";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rawKey = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!rawKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  const keyResult = await validateApiKey(rawKey);
  if (!keyResult) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  const tenantSlug = req.nextUrl.searchParams.get("tenant");
  if (!tenantSlug) {
    return NextResponse.json({ error: "Missing tenant param" }, { status: 400 });
  }

  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || tenant.id !== keyResult.tenantId) {
    return NextResponse.json({ error: "Tenant mismatch" }, { status: 403 });
  }

  const allowedOrigin = req.headers.get("origin") ?? "*";

  const token = await signWidgetToken({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    allowedOrigin,
  });

  return NextResponse.json({ token, expiresIn: 900 });
}
