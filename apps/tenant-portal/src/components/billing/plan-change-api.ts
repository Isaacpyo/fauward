import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { FAUWARD_INVOICES_KEY } from "./FauwardInvoicesTable";

// L6 tenant touchpoint (WP-2.7): plans with list prices from the API, plan change (Stripe or a staff-approved
// request), the Stripe billing portal and save offer redemption.

export type PlanOption = {
  plan: "STARTER" | "PRO" | "ENTERPRISE";
  price: { currency: string; monthly: string; annual: string } | null;
  features: Record<string, boolean | number>;
  selfServe: boolean;
};

export type PlanChangeRequest = {
  id: string;
  fromPlan: string;
  toPlan: string;
  billingCycle: string;
  status: string;
  channel: string;
  decisionReason: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type PlanChangeState = { currentPlan: string | null; billingCycle: string; plans: PlanOption[]; request: PlanChangeRequest | null };
export type PlanChangeResult = { kind: "REQUESTED" | "APPLIED" | "CHECKOUT"; redirectUrl?: string; request: PlanChangeRequest };

export const PLAN_CHANGE_KEY = ["tenant-plan-change"];

export function usePlanChangeState(enabled = true) {
  return useQuery({ queryKey: PLAN_CHANGE_KEY, queryFn: async () => (await api.get<PlanChangeState>("/v1/tenants/me/plan-change")).data, enabled });
}

export function useRequestPlanChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { plan: string; billingCycle: string }) => (await api.post<PlanChangeResult>("/v1/tenants/me/plan-change", input)).data,
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: PLAN_CHANGE_KEY }), queryClient.invalidateQueries({ queryKey: ["billing-summary"] })])
  });
}

export function useBillingPortal() {
  return useMutation({ mutationFn: async () => (await api.post<{ url: string }>("/v1/tenants/me/billing/portal-session", {})).data });
}

export function useContactBilling() {
  return useMutation({
    mutationFn: async (input: { subject: string; body: string }) =>
      (await api.post<{ ticket: { id: string; ticketNumber: string } }>("/v1/tenants/me/fauward-tickets", { ...input, category: "BILLING_QUERY" })).data
  });
}

export function useRedeemSaveOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) =>
      (await api.post<{ via: "STRIPE_COUPON"; couponId: string } | { via: "CREDIT_NOTE"; creditNoteId: string; invoiceNumber: string; amount: string }>(`/v1/tenants/me/save-offers/${encodeURIComponent(code)}/redeem`, {})).data,
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ["billing-summary"] }), queryClient.invalidateQueries({ queryKey: FAUWARD_INVOICES_KEY })])
  });
}

export function featureWords(key: string) {
  return key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (first) => first.toUpperCase());
}
