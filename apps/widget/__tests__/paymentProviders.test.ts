import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as confirmPayment } from "../app/api/payment/confirm/route";
import { POST as paystackWebhook } from "../app/api/payment/paystack/webhook/route";
import { storePendingPayment } from "../lib/payments/pendingPayments";
import { PaystackProvider } from "../lib/payments/providers";

describe("Paystack payment provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("initializes and verifies transactions with Paystack fields", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret");
    vi.stubEnv("PAYSTACK_PUBLIC_KEY", "pk_test_public");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: true,
          data: {
            authorization_url: "https://checkout.paystack.com/ref",
            access_code: "access_code",
            reference: "ref_123",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: true,
          data: {
            reference: "ref_123",
            amount: 125000,
            currency: "NGN",
            status: "success",
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new PaystackProvider("pk_test_public");
    const session = await provider.createSession({
      amountMinor: 125000,
      currency: "NGN",
      email: "customer@example.com",
      metadata: { tenantSlug: "lagos" },
      callbackUrl: "https://widget.test/payment/success",
    });
    expect(session.provider).toBe("paystack");
    if (session.provider !== "paystack") throw new Error("Expected Paystack session");
    const verification = await provider.verify(session.reference);

    expect(session).toMatchObject({
      provider: "paystack",
      accessCode: "access_code",
      reference: "ref_123",
      publicKey: "pk_test_public",
      authorizationUrl: "https://checkout.paystack.com/ref",
      amountMinor: 125000,
      currency: "NGN",
    });
    expect(verification).toEqual({
      reference: "ref_123",
      amountMinor: 125000,
      currency: "NGN",
      status: "success",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.paystack.co/transaction/initialize",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk_test_secret" }),
      }),
    );
  });

  it("rejects verified amount mismatches before shipment creation", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret");
    storePendingPayment({
      provider: "paystack",
      tenantSlug: "lagos",
      reference: "ref_mismatch",
      amountMinor: 125000,
      currency: "NGN",
      payloads: [],
      createdAt: Date.now(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: true,
          data: {
            reference: "ref_mismatch",
            amount: 124900,
            currency: "NGN",
            status: "success",
          },
        }),
      }),
    );

    const res = await confirmPayment(
      new NextRequest("https://widget.test/api/payment/confirm", {
        method: "POST",
        body: JSON.stringify({
          provider: "paystack",
          reference: "ref_mismatch",
          amountMinor: 125000,
          currency: "NGN",
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Verified payment amount or currency does not match the request" });
  });

  it("rejects tampered Paystack webhook signatures", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret");
    const raw = JSON.stringify({ event: "charge.success", data: { reference: "ref_123" } });
    const signature = createHmac("sha512", "wrong_secret").update(raw).digest("hex");

    const res = await paystackWebhook(
      new NextRequest("https://widget.test/api/payment/paystack/webhook", {
        method: "POST",
        headers: { "x-paystack-signature": signature },
        body: raw,
      }),
    );

    expect(res.status).toBe(401);
  });
});
