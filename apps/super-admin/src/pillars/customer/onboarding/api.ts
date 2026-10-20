import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// customer.onboarding (WP-2.17): funnel, stuck tenants and nudges over the event-stamped onboarding steps.

export type OnboardingStep = "BRANDING_SET" | "GATEWAY_VERIFIED" | "FIRST_SHIPMENT" | "TEAMMATE_JOINED" | "DOMAIN_VERIFIED" | "FIRST_PAID_INVOICE";
export type Funnel = { cohort: string | null; accountsCreated: number; completed: number; steps: Array<{ step: OnboardingStep; label: string; required: boolean; count: number; conversionFromPrevious: number | null }> };
export type StuckTenant = { id: string; name: string; slug: string; plan: string; signedUpAt: string; daysSinceSignup: number; stepsDone: OnboardingStep[]; nextStep: OnboardingStep | null; lastNudgedAt: string | null; canNudge: boolean };

export const ONBOARDING_KEY = ["customer.onboarding"] as const;

export const ONBOARDING_STEPS: Array<{ id: OnboardingStep; label: string }> = [
  { id: "BRANDING_SET", label: "Branding set" },
  { id: "GATEWAY_VERIFIED", label: "Gateway verified" },
  { id: "FIRST_SHIPMENT", label: "First shipment" },
  { id: "TEAMMATE_JOINED", label: "Teammate joined" },
  { id: "DOMAIN_VERIFIED", label: "Domain verified" },
  { id: "FIRST_PAID_INVOICE", label: "First paid invoice" }
];

export function useOnboardingFunnel(cohort: string) {
  return useQuery({
    queryKey: [...ONBOARDING_KEY, "funnel", cohort],
    queryFn: async () => (await consoleApi.get<Funnel>("/onboarding/funnel", { params: cohort ? { cohort } : {} })).data,
    placeholderData: keepPreviousData
  });
}

export function useStuckTenants(stuckAt: OnboardingStep | "", stuckDays: number) {
  return useQuery({
    queryKey: [...ONBOARDING_KEY, "stuck", stuckAt, stuckDays],
    queryFn: async () => (await consoleApi.get<{ data: StuckTenant[] }>("/onboarding/tenants", { params: { stuckDays, ...(stuckAt ? { stuckAt } : {}) } })).data.data,
    placeholderData: keepPreviousData
  });
}

export function useNudgeTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tenantId: string) => (await consoleApi.post<{ nudgedAt: string; step: OnboardingStep }>(`/onboarding/tenants/${encodeURIComponent(tenantId)}/nudge`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...ONBOARDING_KEY, "stuck"] })
  });
}
