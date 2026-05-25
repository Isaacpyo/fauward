import Stripe from "stripe";
import { z } from "zod";

import type { TenantConfig } from "@/lib/shipmentTenantConfig";

export type PaymentSession =
  | {
      provider: "stripe";
      clientSecret: string;
      publishableKey: string;
      currency: string;
      amountMinor: number;
    }
  | {
      provider: "paystack";
      accessCode: string;
      reference: string;
      publicKey: string;
      authorizationUrl: string;
      currency: string;
      amountMinor: number;
    };

export type PaymentVerification = {
  status: "success" | "pending" | "failed";
  reference: string;
  amountMinor: number;
  currency: string;
};

export type PaymentSessionInput = {
  amountMinor: number;
  currency: string;
  email: string;
  metadata: Record<string, unknown>;
  callbackUrl?: string;
};

export interface PaymentProvider {
  createSession(input: PaymentSessionInput): Promise<PaymentSession>;
  verify(reference: string): Promise<PaymentVerification>;
}

const paystackInitSchema = z.object({
  status: z.boolean(),
  message: z.string().optional(),
  data: z.object({
    authorization_url: z.string(),
    access_code: z.string(),
    reference: z.string(),
  }),
});

const paystackVerifySchema = z.object({
  status: z.boolean(),
  message: z.string().optional(),
  data: z.object({
    reference: z.string(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
  }),
});

function metadataForStripe(metadata: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (typeof value === "string") return [key, value];
      if (typeof value === "number" || typeof value === "boolean") return [key, String(value)];
      return [key, JSON.stringify(value).slice(0, 500)];
    }),
  );
}

function mapPaystackStatus(status: string): PaymentVerification["status"] {
  if (status === "success") return "success";
  if (status === "failed" || status === "abandoned" || status === "reversed") return "failed";
  return "pending";
}

export class StripeProvider implements PaymentProvider {
  constructor(private readonly publishableKey: string | null) {}

  async createSession(input: PaymentSessionInput): Promise<PaymentSession> {
    const secretKey = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY;
    if (!this.publishableKey) {
      throw new Error("Stripe publishable key is not configured");
    }
    if (!secretKey) {
      if (process.env.NODE_ENV !== "production") {
        return {
          provider: "stripe",
          clientSecret: `pi_dev_${Date.now()}_secret_dev`,
          publishableKey: this.publishableKey,
          amountMinor: input.amountMinor,
          currency: input.currency.toLowerCase(),
        };
      }
      throw new Error("Stripe secret key is not configured");
    }

    const stripe = new Stripe(secretKey);
    const intent = await stripe.paymentIntents.create({
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: metadataForStripe(input.metadata),
      receipt_email: input.email || undefined,
    });

    if (!intent.client_secret) {
      throw new Error("Stripe did not return a client secret");
    }

    return {
      provider: "stripe",
      clientSecret: intent.client_secret,
      publishableKey: this.publishableKey,
      amountMinor: input.amountMinor,
      currency: input.currency.toLowerCase(),
    };
  }

  async verify(reference: string): Promise<PaymentVerification> {
    const secretKey = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY;
    if (!secretKey) throw new Error("Stripe secret key is not configured");
    const stripe = new Stripe(secretKey);
    const intent = await stripe.paymentIntents.retrieve(reference);
    return {
      reference: intent.id,
      amountMinor: intent.amount,
      currency: intent.currency.toUpperCase(),
      status: intent.status === "succeeded" ? "success" : intent.status === "requires_payment_method" ? "failed" : "pending",
    };
  }
}

export class PaystackProvider implements PaymentProvider {
  private readonly supportedCurrencies = new Set(["NGN", "GHS", "ZAR", "USD", "KES"]);

  constructor(private readonly publicKey: string | null) {}

  async createSession(input: PaymentSessionInput): Promise<PaymentSession> {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const publicKey = this.publicKey ?? process.env.PAYSTACK_PUBLIC_KEY ?? null;
    const currency = input.currency.toUpperCase();

    if (!this.supportedCurrencies.has(currency)) {
      throw new Error(`Paystack does not support ${currency} for this widget flow`);
    }
    if (!secretKey) throw new Error("PAYSTACK_SECRET_KEY is not configured");
    if (!publicKey) throw new Error("PAYSTACK_PUBLIC_KEY is not configured");
    if (!input.email) throw new Error("Paystack requires a customer email address");

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor,
        currency,
        metadata: input.metadata,
        callback_url: input.callbackUrl,
      }),
    });

    const parsed = paystackInitSchema.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success || !parsed.data.status) {
      throw new Error(parsed.success ? parsed.data.message ?? "Paystack initialization failed" : "Invalid Paystack initialization response");
    }

    return {
      provider: "paystack",
      accessCode: parsed.data.data.access_code,
      reference: parsed.data.data.reference,
      publicKey,
      authorizationUrl: parsed.data.data.authorization_url,
      amountMinor: input.amountMinor,
      currency,
    };
  }

  async verify(reference: string): Promise<PaymentVerification> {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) throw new Error("PAYSTACK_SECRET_KEY is not configured");

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const parsed = paystackVerifySchema.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success || !parsed.data.status) {
      throw new Error(parsed.success ? parsed.data.message ?? "Paystack verification failed" : "Invalid Paystack verification response");
    }

    return {
      reference: parsed.data.data.reference,
      amountMinor: parsed.data.data.amount,
      currency: parsed.data.data.currency.toUpperCase(),
      status: mapPaystackStatus(parsed.data.data.status),
    };
  }
}

export function getPaymentProvider(config: TenantConfig): PaymentProvider {
  const provider = config.paymentGateway.provider.toUpperCase();
  if (provider === "STRIPE") return new StripeProvider(config.paymentGateway.publishableKey);
  if (provider === "PAYSTACK") return new PaystackProvider(config.paymentGateway.publishableKey);
  throw new Error(`${config.paymentGateway.provider} payments are not implemented`);
}
