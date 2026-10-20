import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// trust.safety (WP-2.4): fraud/AUP signals, every suspension cause, the appeal queue and the code-defined rules.

export type TenantRef = { id: string; name: string; slug: string; status: string };

export type Signal = {
  id: string;
  tenant: TenantRef;
  source: string;
  signalType: string;
  category: "FRAUD" | "AUP";
  severity: string;
  status: "OPEN" | "CLOSED";
  decision: "DISMISS" | "WARN" | "SUSPEND" | null;
  decisionNote: string | null;
  decidedAt: string | null;
  summary: string;
  createdAt: string;
};

export type Suspension = {
  id: string;
  tenantId: string;
  tenant: TenantRef | null;
  source: string;
  category: string;
  status: "ACTIVE" | "LIFTED";
  reason: string;
  publicReason: string | null;
  sourceRef: string | null;
  liftedVia: string | null;
  liftReason: string | null;
  createdAt: string;
  liftedAt: string | null;
};

export type AppealStatus = "PENDING" | "INFO_REQUESTED" | "APPROVED" | "REJECTED";

export type Appeal = {
  id: string;
  tenant: TenantRef;
  status: AppealStatus;
  message: string;
  contactEmail: string | null;
  infoRequest: string | null;
  infoRequestedAt: string | null;
  tenantReply: string | null;
  tenantRepliedAt: string | null;
  resolution: string | null;
  decidedAt: string | null;
  createdAt: string;
  suspension: { id: string; source: string; category: string; status: string; reason: string; publicReason: string | null; createdAt: string } | null;
};

export type AppealDetail = {
  appeal: Appeal;
  context: { activeSuspensions: Array<{ id: string; source: string; category: string; reason: string; publicReason: string | null; createdAt: string }>; previousAppeals: number };
};

export type Rule = { id: string; name: string; effect: string; parameters: Record<string, string | number | string[]> };

type Page<T> = { data: T[]; nextCursor: string | null };

export const SAFETY_KEY = ["trust.safety"] as const;

function infinite<T>(key: unknown[], path: string, params: Record<string, string | undefined>) {
  return {
    queryKey: [...SAFETY_KEY, ...key, params],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) =>
      (await consoleApi.get<Page<T>>(path, { params: { ...params, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last: Page<T>) => last.nextCursor,
    placeholderData: keepPreviousData
  };
}

export function useSignals(params: { category?: string; status?: string; tenantId?: string }) {
  return useInfiniteQuery(infinite<Signal>(["signals"], "/safety/signals", params));
}

export function useSuspensions(params: { source?: string; status?: string; tenantId?: string }) {
  return useInfiniteQuery(infinite<Suspension>(["suspensions"], "/safety/suspensions", params));
}

export function useAppeals(params: { status?: string; tenantId?: string }) {
  return useInfiniteQuery(infinite<Appeal>(["appeals"], "/safety/appeals", params));
}

export function useAppeal(id: string) {
  return useQuery({ queryKey: [...SAFETY_KEY, "appeal", id], queryFn: async () => (await consoleApi.get<AppealDetail>(`/safety/appeals/${encodeURIComponent(id)}`)).data, enabled: id.length > 0 });
}

export function useRules() {
  return useQuery({ queryKey: [...SAFETY_KEY, "rules"], queryFn: async () => (await consoleApi.get<{ data: Rule[] }>("/safety/rules")).data.data });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: SAFETY_KEY }), queryClient.invalidateQueries({ queryKey: ["platform.tenants"] })]);
}

export function useCreateSignal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { tenantId: string; category: "FRAUD" | "AUP"; severity: string; summary: string; evidenceUrl?: string }) =>
      (await consoleApi.post<{ signal: Signal }>("/safety/signals", input)).data,
    onSuccess: invalidate
  });
}

export function useDecideSignal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; decision: "DISMISS" | "WARN" | "SUSPEND"; reason: string; tenantMessage?: string }) =>
      (await consoleApi.post<{ signal: Signal; suspensionId: string | null }>(`/safety/signals/${encodeURIComponent(input.id)}/decision`, { decision: input.decision, reason: input.reason, ...(input.tenantMessage ? { tenantMessage: input.tenantMessage } : {}) })).data,
    onSuccess: invalidate
  });
}

export function useLiftSuspension() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string }) => (await consoleApi.post<{ remaining: number; tenantStatus: string }>(`/safety/suspensions/${encodeURIComponent(input.id)}/lift`, { reason: input.reason })).data,
    onSuccess: invalidate
  });
}

export function useDecideAppeal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; decision: "APPROVE" | "REJECT" | "REQUEST_INFO"; reason: string; message?: string }) =>
      (await consoleApi.post<{ appeal: Appeal; tenantReactivated: boolean }>(`/safety/appeals/${encodeURIComponent(input.id)}/decision`, { decision: input.decision, reason: input.reason, ...(input.message ? { message: input.message } : {}) })).data,
    onSuccess: invalidate
  });
}

export function words(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}
