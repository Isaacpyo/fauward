import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

type MockPaymentSessionRow = {
  reference: string;
  provider: string;
  tenant_slug: string;
  amount_minor: number;
  currency: string;
  payloads: unknown[];
  created_shipments: Array<{ trackingRef: string; shipmentId: string }> | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  error: string | null;
  created_at: string;
  updated_at: string;
};

const mockState = vi.hoisted(() => ({
  paymentSessions: new Map<string, MockPaymentSessionRow>(),
  createShipment: vi.fn(),
}));

function createQueryBuilder() {
  const filters: Array<[string, unknown]> = [];
  let updateValues: Record<string, unknown> | null = null;

  function matches(row: MockPaymentSessionRow): boolean {
    return filters.every(([key, value]) => row[key as keyof MockPaymentSessionRow] === value);
  }

  const builder = {
    upsert: async (row: Record<string, unknown>) => {
      mockState.paymentSessions.set(String(row.reference), {
        reference: String(row.reference),
        provider: String(row.provider),
        tenant_slug: String(row.tenant_slug),
        amount_minor: Number(row.amount_minor),
        currency: String(row.currency),
        payloads: Array.isArray(row.payloads) ? row.payloads : [],
        created_shipments: null,
        status: "PENDING",
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return { error: null };
    },
    update: (values: Record<string, unknown>) => {
      updateValues = values;
      return builder;
    },
    select: () => builder,
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return builder;
    },
    maybeSingle: async () => {
      const row = Array.from(mockState.paymentSessions.values()).find(matches) ?? null;
      if (row && updateValues) {
        const updated = { ...row, ...updateValues } as MockPaymentSessionRow;
        mockState.paymentSessions.set(updated.reference, updated);
        return { data: updated, error: null };
      }
      return { data: row, error: null };
    },
    then: (resolve: (value: { error: null }) => void) => {
      if (updateValues) {
        for (const row of Array.from(mockState.paymentSessions.values())) {
          if (matches(row)) {
            const updated = { ...row, ...updateValues } as MockPaymentSessionRow;
            mockState.paymentSessions.set(updated.reference, updated);
          }
        }
      }
      resolve({ error: null });
    },
  };

  return builder;
}

vi.mock("@fauward/tenant-db", () => ({
  getSupabaseAdmin: () => ({
    from: () => createQueryBuilder(),
  }),
  createShipment: mockState.createShipment,
  getTenantBySlug: vi.fn(),
}));

import { POST as confirmPayment } from "../app/api/payment/confirm/route";
import { POST as paystackWebhook } from "../app/api/payment/paystack/webhook/route";
import { storePendingPayment } from "../lib/payments/pendingPayments";
import { PaystackProvider } from "../lib/payments/providers";

describe("Paystack payment provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mockState.paymentSessions.clear();
    mockState.createShipment.mockReset();
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
    await storePendingPayment({
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

  it("processes valid Paystack webhook replays idempotently", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret");
    vi.stubEnv("PAYSTACK_PUBLIC_KEY", "pk_test_public");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: true,
          data: {
            reference: "ref_replay",
            amount: 125000,
            currency: "NGN",
            status: "success",
          },
        }),
      }),
    );
    mockState.createShipment.mockResolvedValue({ tracking_ref: "TC-20260525-AAAAA", id: "shipment-1" });
    await storePendingPayment({
      provider: "paystack",
      tenantSlug: "lagos",
      reference: "ref_replay",
      amountMinor: 125000,
      currency: "NGN",
      payloads: [
        {
          direction: "GB-NG",
          route: "United Kingdom to Nigeria",
          sender_name: "Sender",
          sender_email: "sender@example.com",
          sender_phone: "+447123456789",
          sender_address: { country: "United Kingdom", address1: "1 High Street", city: "London", postcode: "SW1A 1AA" },
          recipient_name: "Recipient",
          recipient_email: null,
          recipient_phone: "+2348012345678",
          recipient_address: { country: "Nigeria", address1: "1 Marina", city: "Lagos", state: "Lagos" },
          category: "documents",
          declared_value: 1000,
          insurance: "NONE",
          notes: null,
          length_cm: 30,
          width_cm: 20,
          height_cm: 10,
          weight_kg: 5,
          chargeable_weight: 5,
          price_estimate: 1250,
          currency: "NGN",
          phone_verified: true,
          source: "widget",
          widget_session_id: "ref_replay",
          idempotency_key: "paystack:ref_replay:0",
          customs_declaration: {
            type: "DDU",
            items: [
              {
                description: "Cotton shirts",
                hsCode: "610910",
                quantity: 1,
                declaredValue: 1000,
                currency: "NGN",
                countryOfOrigin: "United Kingdom",
                reasonForExport: "Sale",
              },
            ],
            totalValue: 1000,
            currency: "NGN",
            documents: [],
            status: "PENDING",
            holdReason: null,
          },
        },
      ],
      createdAt: Date.now(),
    });

    const raw = JSON.stringify({ event: "charge.success", data: { reference: "ref_replay" } });
    const signature = createHmac("sha512", "sk_test_secret").update(raw).digest("hex");
    const first = await paystackWebhook(
      new NextRequest("https://widget.test/api/payment/paystack/webhook", {
        method: "POST",
        headers: { "x-paystack-signature": signature },
        body: raw,
      }),
    );
    const replay = await paystackWebhook(
      new NextRequest("https://widget.test/api/payment/paystack/webhook", {
        method: "POST",
        headers: { "x-paystack-signature": signature },
        body: raw,
      }),
    );

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(mockState.createShipment).toHaveBeenCalledTimes(1);
  });
});
