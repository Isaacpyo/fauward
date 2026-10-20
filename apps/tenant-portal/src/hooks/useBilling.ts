import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getAccessToken, hasDevTestSession } from "@/lib/auth";
import type { BillingPlan, BillingSummary } from "@/types/billing";

type BillingSummaryPayload = {
  billingPlan: string;
  effectivePlan: string;
  tenantStatus: string;
  subscription: {
    status: string;
    billingCycle: "MONTHLY" | "ANNUAL";
    currentPeriodEnd: string | null;
    trialEnd: string | null;
    cancelAtPeriodEnd: boolean;
    managedByStripe: boolean;
  } | null;
  price: { amount: string; currency: string; cycle: "MONTHLY" | "ANNUAL" } | null;
  usage: {
    shipments: { used: number; limit: number };
    staff: { used: number; limit: number };
  };
};

type BillingStatusPayload = {
  status?: "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "TRIAL" | "TRIAL_EXPIRED";
  overdueInvoiceCount?: number;
  nextRetryAt?: string | null;
  saveOffer?: BillingSummary["saveOffer"];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizePlan(plan?: string): BillingPlan {
  const normalized = plan?.toLowerCase();
  if (normalized === "pro" || normalized === "enterprise") return normalized;
  return "starter";
}

function paymentStatus(status?: string): BillingSummary["paymentStatus"] {
  if (status === "PAST_DUE" || status === "TRIAL_EXPIRED") return "failed";
  if (status === "SUSPENDED") return "suspended";
  if (status === "CANCELLED") return "failed";
  return "active";
}

export function toBillingSummary(payload: BillingSummaryPayload, billingStatus: BillingStatusPayload, now = Date.now()): BillingSummary {
  const subscription = payload.subscription;
  const trialEnd = subscription?.status === "TRIALING" && subscription.trialEnd ? new Date(subscription.trialEnd).getTime() : null;
  return {
    plan: normalizePlan(payload.billingPlan),
    effectivePlan: normalizePlan(payload.effectivePlan),
    cycle: subscription?.billingCycle === "ANNUAL" ? "annual" : "monthly",
    price: payload.price ? { amount: payload.price.amount, currency: payload.price.currency } : null,
    renewalDate: subscription?.currentPeriodEnd ?? null,
    trialDaysRemaining: trialEnd !== null ? Math.max(0, Math.ceil((trialEnd - now) / DAY_MS)) : undefined,
    subscriptionStatus: subscription?.status ?? null,
    managedByStripe: subscription?.managedByStripe ?? false,
    paymentStatus: paymentStatus(billingStatus.status ?? payload.tenantStatus),
    nextRetryAt: billingStatus.nextRetryAt,
    saveOffer: billingStatus.saveOffer,
    usage: payload.usage
  };
}

async function fetchBillingSummary(): Promise<BillingSummary> {
  const [summary, billingStatus] = await Promise.all([
    api.get<BillingSummaryPayload>("/v1/tenants/me/billing/summary"),
    // Status is advisory (dunning banners); a failure there must not hide the plan.
    api.get<BillingStatusPayload>("/v1/payments/billing-status").then((response) => response.data).catch(() => ({}))
  ]);
  return toBillingSummary(summary.data, billingStatus);
}

/** `summary` is undefined until the API answers; a failed request is `isError`, never sample data. */
export function useBilling() {
  const canFetchBilling = Boolean(getAccessToken()) && !hasDevTestSession();
  const query = useQuery({
    queryKey: ["billing-summary"],
    queryFn: fetchBillingSummary,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.paymentStatus && query.state.data.paymentStatus !== "active" ? 60_000 : false),
    retry: 1,
    enabled: canFetchBilling
  });

  return { ...query, summary: query.data };
}
