import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// trust.secrets (WP-4.12): inventory observed by the trust.secret-inventory job (never values), owner/policy, manual
// rotation, per-secret audit.

export type SecretStatus = "NOT_CONFIGURED" | "OK" | "DUE_SOON" | "OVERDUE" | "NO_POLICY";
export type VendorStatus = { vendor: string; configured: boolean; missing: string[] };

export type Secret = {
  id: string;
  name: string;
  envName: string | null;
  source: string;
  configured: boolean;
  fingerprint: string | null;
  owner: { id: string; email: string | null; name: string | null } | null;
  ownerTeam: string | null;
  usedBy: string[];
  integration: string | null;
  inRegistry: boolean;
  rotateEveryDays: number | null;
  rotationNotes: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastRotatedAt: string | null;
  rotationDueAt: string | null;
  status: SecretStatus;
  updatedAt: string;
};

export type SecretList = {
  data: Secret[];
  total: number;
  doppler: VendorStatus;
  lastInventoryRun: { status: string; startedAt: string; finishedAt: string | null; error: string | null } | null;
};

export type SecretAuditEntry = { id: string; action: string; actorType: string; actorId: string; actorEmail: string | null; reason: string | null; metadata: unknown; createdAt: string };

const KEY = ["trust.secrets"] as const;

export function useSecrets() {
  return useQuery({ queryKey: [...KEY, "list"], queryFn: async () => (await consoleApi.get<SecretList>("/secrets")).data });
}

export function useExpiringSecrets() {
  return useQuery({ queryKey: [...KEY, "expiring"], queryFn: async () => (await consoleApi.get<{ data: Secret[]; total: number; windowDays: number }>("/secrets/expiring")).data });
}

export function useSecret(id: string) {
  return useQuery({ queryKey: [...KEY, "detail", id], queryFn: async () => (await consoleApi.get<Secret>(`/secrets/${encodeURIComponent(id)}`)).data, enabled: Boolean(id) });
}

export function useSecretAudit(id: string) {
  return useInfiniteQuery({
    queryKey: [...KEY, "audit", id],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await consoleApi.get<{ data: SecretAuditEntry[]; nextCursor: string | null }>(`/secrets/${encodeURIComponent(id)}/audit`, { params: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(id)
  });
}

export type SecretPatch = Partial<{ ownerId: string | null; rotateEveryDays: number | null; rotationNotes: string | null }>;

export function usePatchSecret(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SecretPatch) => (await consoleApi.patch<Secret>(`/secrets/${encodeURIComponent(id)}`, body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
}

export function useMarkRotated(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { reason: string }) => (await consoleApi.post<Secret>(`/secrets/${encodeURIComponent(id)}/mark-rotated`, body, { idempotent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
}

export const STATUS_LABEL: Record<SecretStatus, string> = {
  NOT_CONFIGURED: "Not set",
  OK: "OK",
  DUE_SOON: "Due soon",
  OVERDUE: "Overdue",
  NO_POLICY: "No rotation policy"
};
