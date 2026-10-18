import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// platform.impersonation (WP-1.10): typed hooks over /api/internal/impersonation.

export type ImpersonationSession = {
  id: string;
  platformUserId: string;
  targetTenantId: string;
  targetUserId: string | null;
  scopes: string[];
  reason: string;
  createdAt: string;
  expiresAt: string;
  exchangedAt: string | null;
  endedAt: string | null;
  revokedAt: string | null;
  endedReason: string | null;
  targetTenant: { id: string; name: string; slug: string };
  platformUser: { id: string; email: string; name: string | null };
};

export type SessionAuditRow = {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
};

export type StartSessionInput = { tenantId: string; targetUserId: string; scopes: string[]; expiresInMinutes: number; reason: string };
export type StartSessionResult = {
  exchangeCode: string;
  portalUrl: string;
  impersonationSessionId: string;
  expiresAt: string;
  targetUser: { id: string; email: string; role: string };
  tenant: { id: string; name: string; slug: string };
};

export type SessionFilters = { tenantId?: string; from?: string; to?: string };

export const IMPERSONATION_KEY = ["platform.impersonation"] as const;

export function useActiveSessions() {
  return useQuery({
    queryKey: [...IMPERSONATION_KEY, "sessions", "active"],
    queryFn: async () => (await consoleApi.get<{ sessions?: ImpersonationSession[] }>("/impersonation/sessions", { params: { status: "active" } })).data.sessions ?? [],
    refetchInterval: 30_000
  });
}

export function useSessionHistory(filters: SessionFilters) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value)));
  return useInfiniteQuery({
    queryKey: [...IMPERSONATION_KEY, "sessions", "history", params],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await consoleApi.get<{ sessions: ImpersonationSession[]; nextCursor: string | null }>("/impersonation/sessions", { params: { status: "ended", limit: 25, ...params, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined
  });
}

export function useSessionDetail(id: string) {
  return useQuery({
    queryKey: [...IMPERSONATION_KEY, "session", id],
    queryFn: async () => (await consoleApi.get<{ session: ImpersonationSession; auditRows: SessionAuditRow[] }>(`/impersonation/sessions/${encodeURIComponent(id)}`)).data
  });
}

export function useStartSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: StartSessionInput) => (await consoleApi.post<StartSessionResult>("/impersonation/sessions", input, { idempotent: true })).data,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: [...IMPERSONATION_KEY, "sessions"] })
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await consoleApi.delete(`/impersonation/sessions/${encodeURIComponent(id)}`, { data: { reason } })).data,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: IMPERSONATION_KEY })
  });
}
