import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// trust.compliance (WP-2.5): DSAR queue and state machine, exports, legal holds.

export type TenantRef = { id: string; name: string; slug: string };
export type DsarType = "ACCESS" | "ERASURE" | "PORTABILITY" | "RECTIFICATION";
export const DSAR_TYPES: DsarType[] = ["ACCESS", "ERASURE", "PORTABILITY", "RECTIFICATION"];

export type Dsar = {
  id: string;
  tenant: TenantRef | null;
  requestType: DsarType;
  subjectEmail: string;
  subjectUserId: string | null;
  status: string;
  notes: string | null;
  details: Record<string, unknown> | null;
  receivedAt: string;
  dueAt: string;
  overdue: boolean;
  identityVerifiedAt: string | null;
  erasureCompletedAt: string | null;
  closedAt: string | null;
  createdAt: string;
};

export type ComplianceExport = {
  id: string;
  tenant: TenantRef | null;
  dsarId: string | null;
  exportType: string;
  status: string;
  storageProvider: string | null;
  byteSize: number | null;
  sha256: string | null;
  tokenIssued: boolean;
  tokenExpiresAt: string | null;
  downloadedAt: string | null;
  error: string | null;
  requestedBy: string;
  createdAt: string;
};

export type DsarDetail = {
  dsar: Dsar;
  transitions: Array<{ id: string; fromStatus: string | null; toStatus: string; actorId: string; notes: string | null; createdAt: string }>;
  exports: ComplianceExport[];
  legalHold: { id: string; reason: string } | null;
  subjectAccount: { id: string; role: string; name: string | null; createdAt: string } | null;
};

export type LegalHold = {
  id: string;
  tenant: TenantRef | null;
  scope: unknown;
  reason: string;
  status: "ACTIVE" | "RELEASED";
  createdBy: string;
  createdAt: string;
  releasedBy: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
};

type Page<T> = { data: T[]; nextCursor: string | null };

export const COMPLIANCE_KEY = ["trust.compliance"] as const;

export function useDsars(params: { status?: string; type?: string; overdue?: string }) {
  return useInfiniteQuery({
    queryKey: [...COMPLIANCE_KEY, "dsar", params],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) =>
      (await consoleApi.get<Page<Dsar>>("/compliance/dsar", { params: { ...params, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last: Page<Dsar>) => last.nextCursor,
    placeholderData: keepPreviousData
  });
}

export function useDsar(id: string) {
  return useQuery({
    queryKey: [...COMPLIANCE_KEY, "dsar-detail", id],
    queryFn: async () => (await consoleApi.get<DsarDetail>(`/compliance/dsar/${encodeURIComponent(id)}`)).data,
    enabled: id.length > 0,
    // Gather and erase run as jobs: poll while one is in flight.
    refetchInterval: (query) => (["GATHERING", "ERASING"].includes(query.state.data?.dsar.status ?? "") ? 3000 : false)
  });
}

export function useLegalHolds(status?: string) {
  return useQuery({ queryKey: [...COMPLIANCE_KEY, "holds", status ?? "all"], queryFn: async () => (await consoleApi.get<{ data: LegalHold[] }>("/compliance/legal-holds", { params: status ? { status } : {} })).data.data });
}

export function useExports() {
  return useQuery({ queryKey: [...COMPLIANCE_KEY, "exports"], queryFn: async () => (await consoleApi.get<{ data: ComplianceExport[] }>("/compliance/exports")).data.data });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: COMPLIANCE_KEY });
}

export type DsarStep = "verify-identity" | "gather" | "approve" | "deliver" | "erase" | "close";

export function useDsarStep() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; step: DsarStep; reason?: string; notes?: string }) =>
      (await consoleApi.post<{ dsar: Dsar }>(`/compliance/dsar/${encodeURIComponent(input.id)}/${input.step}`, { ...(input.reason ? { reason: input.reason } : {}), ...(input.notes ? { notes: input.notes } : {}) })).data,
    onSuccess: invalidate
  });
}

export function useCreateDsar() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { tenantId: string; requestType: DsarType; subjectEmail: string; notes?: string }) => (await consoleApi.post<{ dsar: Dsar }>("/compliance/dsar", input)).data,
    onSuccess: invalidate
  });
}

export function useCreateHold() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { tenantId: string; reason: string }) => (await consoleApi.post<{ hold: LegalHold }>("/compliance/legal-holds", input)).data,
    onSuccess: invalidate
  });
}

export function useReleaseHold() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string }) => (await consoleApi.post<{ hold: LegalHold }>(`/compliance/legal-holds/${encodeURIComponent(input.id)}/release`, { reason: input.reason })).data,
    onSuccess: invalidate
  });
}

export function words(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}
