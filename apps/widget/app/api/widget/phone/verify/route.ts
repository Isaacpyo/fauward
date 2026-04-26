/**
 * POST /api/widget/phone/verify
 * Verifies the OTP sent to a phone number.
 *
 * Body: { phone: string; code: string }
 * Required header: Authorization: Bearer <widget-jwt>
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyWidgetToken } from "@/lib/widgetToken";
import { otpStore } from "../send/route";

export const runtime = "nodejs";

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

  const { phone, code } = await req.json().catch(() => ({}));
  if (!phone || !code) {
    return NextResponse.json({ error: "Missing phone or code" }, { status: 400 });
  }

  const stored = otpStore.get(phone);
  if (!stored) {
    return NextResponse.json({ error: "No OTP found for this number. Request a new code." }, { status: 400 });
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(phone);
    return NextResponse.json({ error: "OTP expired. Request a new code." }, { status: 400 });
  }

  if (stored.code !== String(code).trim()) {
    return NextResponse.json({ verified: false, error: "Incorrect code" }, { status: 400 });
  }

  otpStore.delete(phone);
  return NextResponse.json({ verified: true });
}
