import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// revenue.subscriptions (WP-2.7): subscriptions with MRR, tenant detail, plan change queue, contracts and overrides.
// Money is a decimal string with its currency.

export type TenantRef = { id: string; name: string; slug: string; status?: string };
export type Mrr = { amount: string; currency: string; source: "plan" | "contract" | "none"; note?: string };

export type SubscriptionRow = {
  id: string;
  tenant: TenantRef;
  plan: string;
  billingCycle: string;
  status: string;
  managedByStripe: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  mrr: Mrr;
  updatedAt: string;
};

export type PlanChangeRequest = {
  id: string;
  tenantId: string;
  tenant: { id: string; name: string; slug: string } | null;
  fromPlan: string;
  toPlan: string;
  billingCycle: string;
  status: string;
  channel: string;
  requestedByUserId: string;
  decisionReason: string | null;
  decidedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
};

export type SubscriptionEvent = { id: string; type: string; fromPlan: string | null; toPlan: string | null; fromStatus: string | null; toStatus: string | null; mrrBefore: string | null; mrrAfter: string | null; currency: string; source: string; occurredAt: string };
export type PricingOverride = { id: string; tenantId: string; tenant?: { id: string; name: string; slug: string } | null; contractId: string | null; ruleType: string; discountPercent: string | null; validFrom: string; validTo: string | null; status: string; createdAt: string };
export type Contract = { id: string; tenantId: string; tenant?: { id: string; name: string; slug: string } | null; msaUrl: string | null; termStart: string; termEnd: string; monthlyAmount: string | null; currency: string | null; status: string; signedAt: string | null; createdAt: string };

export type SubscriptionDetail = {
  tenant: { id: string; name: string; slug: string; status: string; plan: string };
  subscription: { id: string; plan: string; billingCycle: string; status: string; managedByStripe: boolean; cancelAtPeriodEnd: boolean; currentPeriodStart: string | null; currentPeriodEnd: string | null; trialEnd: string | null; cancelledAt: string | null } | null;
  mrr: Mrr;
  events: SubscriptionEvent[];
  overrides: PricingOverride[];
  contracts: Contract[];
  planChangeRequests: PlanChangeRequest[];
};

type Page<T> = { data: T[]; nextCursor: string | null };
export const SUBSCRIPTIONS_KEY = ["revenue.subscriptions"] as const;

export function useSubscriptions(params: { plan?: string; status?: string; cycle?: string }) {
  return useInfiniteQuery({
    queryKey: [...SUBSCRIPTIONS_KEY, "list", params],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) =>
      (await consoleApi.get<Page<SubscriptionRow>>("/subscriptions", { params: { ...params, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last: Page<SubscriptionRow>) => last.nextCursor,
    placeholderData: keepPreviousData
  });
}

export function useSubscriptionDetail(tenantId: string) {
  return useQuery({
    queryKey: [...SUBSCRIPTIONS_KEY, "detail", tenantId],
    queryFn: async () => (await consoleApi.get<SubscriptionDetail>(`/subscriptions/${encodeURIComponent(tenantId)}`)).data,
    enabled: tenantId.length > 0
  });
}

export function usePlanChangeRequests(status?: string) {
  return useQuery({
    queryKey: [...SUBSCRIPTIONS_KEY, "requests", status ?? "all"],
    queryFn: async () => (await consoleApi.get<{ data: PlanChangeRequest[] }>("/subscriptions/plan-change-requests", { params: status ? { status } : {} })).data.data
  });
}

export function useContracts() {
  return useQuery({ queryKey: [...SUBSCRIPTIONS_KEY, "contracts"], queryFn: async () => (await consoleApi.get<{ data: Contract[] }>("/subscriptions/contracts")).data.data });
}

export function useOverrides() {
  return useQuery({ queryKey: [...SUBSCRIPTIONS_KEY, "overrides"], queryFn: async () => (await consoleApi.get<{ data: PricingOverride[] }>("/subscriptions/overrides")).data.data });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_KEY }), queryClient.invalidateQueries({ queryKey: ["platform.tenants"] })]);
}

export function useDecidePlanChange() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; decision: "APPROVE" | "REJECT"; reason: string }) =>
      (await consoleApi.post<{ request: PlanChangeRequest }>(`/subscriptions/plan-change-requests/${encodeURIComponent(input.id)}/decision`, { decision: input.decision, reason: input.reason })).data,
    onSuccess: invalidate
  });
}

export function useCancelSubscription() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { tenantId: string; reason: string }) => (await consoleApi.post<{ stripe: string }>(`/subscriptions/${encodeURIComponent(input.tenantId)}/cancel`, { reason: input.reason })).data,
    onSuccess: invalidate
  });
}

export function useCreateContract() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { tenantId: string; monthlyAmount: string; currency: string; termStart: string; termEnd: string; msaUrl?: string }) => (await consoleApi.post<{ contract: Contract }>("/subscriptions/contracts", input)).data,
    onSuccess: invalidate
  });
}

export function useActivateContract() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string }) => (await consoleApi.post<{ contract: Contract }>(`/subscriptions/contracts/${encodeURIComponent(input.id)}/activate`, {})).data,
    onSuccess: invalidate
  });
}

export function useCreateOverride() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { tenantId: string; discountPercent: number; validTo?: string; reason: string }) => (await consoleApi.post<{ override: PricingOverride }>("/subscriptions/overrides", input)).data,
    onSuccess: invalidate
  });
}

export function words(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

export function money(amount: string | null, currency: string) {
  return amount === null ? "—" : `${amount} ${currency}`;
}
