import { keepPreviousData, useInfiniteQuery, useMutation } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

export type AuditEntry = {
  id: string;
  actorType: string;
  actorId: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetTenantId: string | null;
  targetUserId: string | null;
  targetTenant: { id: string; name: string; slug: string } | null;
  reason: string | null;
  before: unknown | null;
  after: unknown | null;
  metadata: unknown;
  hash: string;
  previousHash: string | null;
  createdAt: string;
};

/** Server-side filters (GET /audit/entries). Dates are ISO strings. */
export type AuditFilters = {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  tenantId?: string;
  from?: string;
  to?: string;
  q?: string;
};

export const AUDIT_FILTER_KEYS = ["actor", "action", "targetType", "targetId", "tenantId", "from", "to", "q"] as const satisfies ReadonlyArray<keyof AuditFilters>;

type AuditPage = { data: AuditEntry[]; total: number; nextCursor: string | null };

export const AUDIT_KEY = ["trust.audit"] as const;
const PAGE_SIZE = 50;

export function cleanAuditFilters(filters: AuditFilters): AuditFilters {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => typeof value === "string" && value.trim() !== "")) as AuditFilters;
}

/** Cursor-paginated audit entries ("Load more" past the first 50). */
export function useAuditEntries(filters: AuditFilters) {
  const params = cleanAuditFilters(filters);
  return useInfiniteQuery({
    queryKey: [...AUDIT_KEY, "entries", params],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await consoleApi.get<AuditPage>("/audit/entries", { params: { ...params, limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData
  });
}

export type AuditExportResult = { url: string; format: "csv" | "json"; rows: number; truncated: boolean; maxRows: number };

export async function exportAudit(input: AuditFilters & { format: "csv" | "json"; reason: string }) {
  return (await consoleApi.post<AuditExportResult>("/audit/export", { ...cleanAuditFilters(input), format: input.format, reason: input.reason })).data;
}

export type AuditVerifyResult = { ok: boolean; checked?: number; failedAt?: string; verifiedAt: string };

export function useVerifyAuditChain() {
  return useMutation({ mutationFn: async () => (await consoleApi.post<AuditVerifyResult>("/audit/verify", {})).data });
}

/** `<input type="datetime-local">` value (local time) → ISO string for the API; empty stays empty. */
export function localInputToIso(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** ISO string → `<input type="datetime-local">` value in local time. */
export function isoToLocalInput(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
