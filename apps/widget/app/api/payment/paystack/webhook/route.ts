import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createShipmentsForPayment } from "@/lib/payments/pendingPayments";
import { PaystackProvider } from "@/lib/payments/providers";

export const runtime = "nodejs";

const webhookSchema = z.object({
  event: z.string(),
  data: z.object({
    reference: z.string(),
  }),
});

function validSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(signature, "hex");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(req: NextRequest) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "PAYSTACK_SECRET_KEY is not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!validSignature(rawBody, req.headers.get("x-paystack-signature"), secretKey)) {
    return NextResponse.json({ error: "Invalid Paystack signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON webhook body" }, { status: 400 });
  }

  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Paystack webhook payload" }, { status: 400 });
  }

  if (parsed.data.event !== "charge.success") {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const provider = new PaystackProvider(process.env.PAYSTACK_PUBLIC_KEY ?? null);
    const verification = await provider.verify(parsed.data.data.reference);
    if (verification.status !== "success") {
      return NextResponse.json({ received: true, status: verification.status });
    }

    const shipments = await createShipmentsForPayment(parsed.data.data.reference, verification);
    return NextResponse.json({ received: true, shipments });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Paystack webhook processing failed" },
      { status: 503 },
    );
  }
}
