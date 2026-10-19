import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

// L7 (WP-2.17): the server-computed onboarding checklist — the only truth. Steps are completed by doing them (a real
// shipment, a verified gateway, a teammate signing in, …), never by clicking through the wizard.

export type OnboardingStepKey = "BRANDING_SET" | "GATEWAY_VERIFIED" | "FIRST_SHIPMENT" | "TEAMMATE_JOINED" | "DOMAIN_VERIFIED" | "FIRST_PAID_INVOICE";

export type OnboardingChecklist = {
  completedAt: string | null;
  signedUpAt: string;
  nextStep: OnboardingStepKey | null;
  steps: Array<{ step: OnboardingStepKey; label: string; required: boolean; doneAt: string | null; actionPath: string }>;
};

export const ONBOARDING_CHECKLIST_KEY = ["onboarding-checklist"];

export function useOnboardingChecklist(enabled = true) {
  return useQuery({
    queryKey: ONBOARDING_CHECKLIST_KEY,
    queryFn: async () => (await api.get<OnboardingChecklist>("/v1/onboarding/checklist")).data,
    enabled,
    refetchInterval: 60_000
  });
}
