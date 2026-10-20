import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// customer.feedback (WP-2.8): triage board, item detail, NPS summary.

export const FEEDBACK_STATUSES = ["NEW", "UNDER_REVIEW", "PLANNED", "SHIPPED", "DECLINED", "CLOSED"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export type FeedbackType = "NPS" | "FEATURE_REQUEST" | "BUG" | "GENERAL";

export type FeedbackItem = {
  id: string;
  tenant: { id: string; name: string; slug: string } | null;
  requester: { email: string; name: string | null } | null;
  type: FeedbackType;
  score: number | null;
  title: string | null;
  body: string | null;
  featureKey: string | null;
  source: string;
  status: FeedbackStatus;
  assignedPlatformUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NpsBreakdown = { responses: number; promoters: number; passives: number; detractors: number; nps: number | null };
export type FeedbackList = { data: FeedbackItem[]; nps: { overall: NpsBreakdown; byMonth: Array<NpsBreakdown & { month: string }> } };
export type FeedbackComment = { id: string; authorType: string; authorId: string; body: string; visibleToTenant: boolean; createdAt: string };

export const FEEDBACK_KEY = ["customer.feedback"] as const;

export function useFeedback(params: { type?: string; status?: string; featureKey?: string }) {
  return useQuery({
    queryKey: [...FEEDBACK_KEY, "list", params],
    queryFn: async () => (await consoleApi.get<FeedbackList>("/feedback", { params: { ...params, limit: 200 } })).data,
    placeholderData: keepPreviousData
  });
}

export function useFeedbackItem(id: string) {
  return useQuery({
    queryKey: [...FEEDBACK_KEY, "item", id],
    queryFn: async () => (await consoleApi.get<{ item: FeedbackItem; comments: FeedbackComment[] }>(`/feedback/${encodeURIComponent(id)}`)).data,
    enabled: id.length > 0
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY });
}

export function useUpdateFeedback() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; status?: FeedbackStatus; assignedPlatformUserId?: string | null; message?: string }) => {
      const { id, ...body } = input;
      return (await consoleApi.patch<{ item: FeedbackItem }>(`/feedback/${encodeURIComponent(id)}`, body)).data;
    },
    onSuccess: invalidate
  });
}

export function useCommentFeedback() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; body: string; visibleToTenant: boolean }) =>
      (await consoleApi.post<{ comment: FeedbackComment }>(`/feedback/${encodeURIComponent(input.id)}/comments`, { body: input.body, visibleToTenant: input.visibleToTenant })).data,
    onSuccess: invalidate
  });
}

export function words(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}
