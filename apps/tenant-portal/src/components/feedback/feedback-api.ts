import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

// customer.feedback tenant touchpoint (WP-2.8): send feedback / request a feature, the NPS prompt, "My feedback".

export type FeedbackType = "NPS" | "FEATURE_REQUEST" | "BUG" | "GENERAL";
export type FeedbackSource = "IN_APP_SURVEY" | "HELP_MENU" | "PLAN_GATE" | "SUPPORT";
export type FeedbackItem = {
  id: string;
  type: FeedbackType;
  title: string | null;
  body: string | null;
  featureKey: string | null;
  source: FeedbackSource;
  status: string;
  createdAt: string;
  comments: Array<{ id: string; authorType: string; body: string; createdAt: string }>;
};

export const FEEDBACK_KEY = ["tenant-feedback"];
export const NPS_ELIGIBILITY_KEY = ["tenant-nps-eligibility"];

export function useMyFeedback() {
  return useQuery({ queryKey: FEEDBACK_KEY, queryFn: async () => (await api.get<{ items: FeedbackItem[] }>("/v1/tenants/me/feedback")).data.items });
}

export function useSendFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { type: FeedbackType; source: FeedbackSource; title?: string; body?: string; featureKey?: string; score?: number }) =>
      (await api.post<{ item: FeedbackItem }>("/v1/tenants/me/feedback", input)).data.item,
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY }), queryClient.invalidateQueries({ queryKey: NPS_ELIGIBILITY_KEY })])
  });
}

export function useNpsEligibility(enabled: boolean) {
  return useQuery({ queryKey: NPS_ELIGIBILITY_KEY, queryFn: async () => (await api.get<{ eligible: boolean }>("/v1/tenants/me/nps-eligibility")).data.eligible, enabled, staleTime: 5 * 60_000, retry: false });
}

export function useNpsPromptEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: "SHOWN" | "DISMISSED") => api.post("/v1/tenants/me/nps-prompt", { event }),
    onSuccess: (_result, event) => (event === "DISMISSED" ? queryClient.invalidateQueries({ queryKey: NPS_ELIGIBILITY_KEY }) : undefined)
  });
}

export function statusWords(status: string) {
  return status.replace(/_/g, " ").toLowerCase();
}
