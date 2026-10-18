export type BillingPlan = "starter" | "pro" | "enterprise";

/** -1 = unlimited (entitlements convention). */
export type UsageLimit = { used: number; limit: number };

/** From `GET /v1/tenants/me/billing/summary` + `GET /v1/payments/billing-status`. Unknown values are null, never guessed. */
export type BillingSummary = {
  /** What Fauward bills (`Tenant.plan`). */
  plan: BillingPlan;
  /** What the workspace gets right now (plan override applied). */
  effectivePlan: BillingPlan;
  cycle: "monthly" | "annual";
  /** List price for the billed plan; null for ENTERPRISE (custom contract). Decimal string. */
  price: { amount: string; currency: string } | null;
  /** End of the current billing period, when a subscription records it. */
  renewalDate: string | null;
  trialDaysRemaining?: number;
  subscriptionStatus: string | null;
  /** True when Stripe holds the subscription (card details live there). */
  managedByStripe: boolean;
  paymentStatus: "active" | "failed" | "suspended";
  nextRetryAt?: string | null;
  saveOffer?: {
    discount: number;
    validUntil: string;
    code: string;
  };
  usage: {
    shipments: UsageLimit;
    staff: UsageLimit;
  };
};
