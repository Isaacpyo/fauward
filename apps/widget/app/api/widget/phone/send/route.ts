/**
 * POST /api/widget/phone/send
 * Sends a 6-digit OTP via Twilio SMS for phone verification in the widget.
 *
 * Body: { phone: string }
 * Required header: Authorization: Bearer <widget-jwt>
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyWidgetToken } from "@/lib/widgetToken";

export const runtime = "nodejs";

// Simple in-process OTP store — replace with Redis in production
const otpStore = new Map<string, { code: string; expiresAt: number }>();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

  const { phone } = await req.json().catch(() => ({}));
  if (!phone || typeof phone !== "string") {
    return NextResponse.json({ error: "Missing phone number" }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    // Dev mode: return OTP in response (never in production)
    if (process.env.NODE_ENV !== "production") {
      const code = generateOtp();
      otpStore.set(phone, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
      return NextResponse.json({ sent: true, devCode: code });
    }
    return NextResponse.json({ error: "SMS not configured" }, { status: 503 });
  }

  const code = generateOtp();
  otpStore.set(phone, { code, expiresAt: Date.now() + 10 * 60 * 1000 });

  // Send via Twilio REST API
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: phone,
        Body: `Your Fauward verification code is: ${code}. Valid for 10 minutes.`,
      }),
    },
  );

  if (!twilioRes.ok) {
    const err = await twilioRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as Record<string, string>).message ?? "SMS send failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true });
}

// Export the store so /verify can access it (same process)
export { otpStore };
