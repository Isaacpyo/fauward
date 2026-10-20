import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Permission } from "@fauward/internal-rbac";

import { consoleApi } from "@/lib/console-api";
import { ME_QUERY_KEY } from "@/lib/use-me";

// trust.jit (WP-1.7): typed hooks over /api/internal/jit. Every mutation refreshes /auth/me so a grant (or its end)
// shows in the session straight away rather than at the next 60 s refetch.

export type JitState = "PENDING" | "ACTIVE" | "EXPIRED" | "DENIED" | "REVOKED";

type StaffLabel = { id: string; email: string | null; name: string | null };

export type JitRequest = {
  id: string;
  permission: string;
  reason: string;
  durationMinutes: number;
  status: string;
  state: JitState;
  rootRequest: boolean;
  approvalsRequired: number;
  expiresAt: string | null;
  revokedAt: string | null;
  deniedReason: string | null;
  createdAt: string;
  updatedAt: string;
  ownRequest: boolean;
  requester: StaffLabel;
  approvals: Array<{ approver: StaffLabel; decision: string; notes: string | null; createdAt: string }>;
};

export type JitRequestInput = { permission: Permission; reason: string; durationMinutes: number; hardwareKeyAssertion?: string };
export type JitHistoryFilters = { state?: JitState; permission?: string };

export const JIT_KEY = ["trust.jit"] as const;

export function useMyJitRequests() {
  return useQuery({
    queryKey: [...JIT_KEY, "my"],
    queryFn: async () => (await consoleApi.get<{ data: JitRequest[] }>("/jit/sessions/my")).data.data,
    refetchInterval: 30_000
  });
}

export function usePendingJitRequests() {
  return useQuery({
    queryKey: [...JIT_KEY, "pending"],
    queryFn: async () => (await consoleApi.get<{ data: JitRequest[] }>("/jit/requests/pending")).data.data,
    refetchInterval: 30_000
  });
}

export function useActiveJitGrants() {
  return useQuery({
    queryKey: [...JIT_KEY, "active"],
    queryFn: async () => (await consoleApi.get<{ data: JitRequest[] }>("/jit/sessions/active")).data.data,
    refetchInterval: 30_000
  });
}

export function useJitHistory(filters: JitHistoryFilters) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value)));
  return useInfiniteQuery({
    queryKey: [...JIT_KEY, "history", params],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await consoleApi.get<{ data: JitRequest[]; nextCursor: string | null }>("/jit/requests", { params: { ...params, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (page) => page.nextCursor
  });
}

function useJitInvalidation() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([client.invalidateQueries({ queryKey: JIT_KEY }), client.invalidateQueries({ queryKey: ME_QUERY_KEY })]);
  };
}

export async function createJitRequest(input: JitRequestInput) {
  return (await consoleApi.post<JitRequest>("/jit/requests", input, { idempotent: true })).data;
}

export function useCreateJitRequest() {
  const invalidate = useJitInvalidation();
  return useMutation({ mutationFn: createJitRequest, onSuccess: invalidate });
}

export function useApproveJitRequest() {
  const invalidate = useJitInvalidation();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await consoleApi.post<{ approvals: number; required: number; request: JitRequest }>(`/jit/requests/${encodeURIComponent(id)}/approve`, { reason }, { idempotent: true })).data,
    onSuccess: invalidate
  });
}

export function useDenyJitRequest() {
  const invalidate = useJitInvalidation();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await consoleApi.post<JitRequest>(`/jit/requests/${encodeURIComponent(id)}/deny`, { reason }, { idempotent: true })).data,
    onSuccess: invalidate
  });
}

export function useRevokeJitGrant() {
  const invalidate = useJitInvalidation();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await consoleApi.post<JitRequest>(`/jit/sessions/${encodeURIComponent(id)}/revoke`, { reason }, { idempotent: true })).data,
    onSuccess: invalidate
  });
}
