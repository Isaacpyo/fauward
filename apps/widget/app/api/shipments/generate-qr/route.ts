import { NextRequest, NextResponse } from "next/server";

import { verifyWidgetToken } from "@/lib/widgetToken";

export const runtime = "nodejs";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function POST(req: NextRequest) {
  const rawToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!rawToken) {
    return NextResponse.json({ error: "Missing widget token" }, { status: 401 });
  }

  try {
    await verifyWidgetToken(rawToken);
  } catch {
    return NextResponse.json({ error: "Invalid or expired widget token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { trackingRef?: unknown; shipmentId?: unknown } | null;
  const trackingRef = typeof body?.trackingRef === "string" ? body.trackingRef.trim() : "";
  const shipmentId = typeof body?.shipmentId === "string" ? body.shipmentId.trim() : "";
  if (!trackingRef || !shipmentId) {
    return NextResponse.json({ error: "trackingRef and shipmentId are required" }, { status: 400 });
  }

  const payload = JSON.stringify({ trackingRef, shipmentId });
  const bars = Array.from(payload).slice(0, 40).map((char, index) => {
    const height = 18 + (char.charCodeAt(0) % 46);
    const x = 12 + index * 3;
    return `<rect x="${x}" y="${76 - height}" width="2" height="${height}" fill="#111827"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Shipment QR placeholder"><rect width="160" height="160" fill="#fff"/><rect x="8" y="8" width="144" height="144" fill="none" stroke="#111827" stroke-width="2"/><g>${bars.join("")}</g><text x="80" y="128" text-anchor="middle" font-family="Arial" font-size="10" fill="#111827">${escapeXml(trackingRef)}</text></svg>`;

  return NextResponse.json({
    trackingRef,
    shipmentId,
    qrPayload: payload,
    svg,
  });
}

