import { useInfiniteQuery } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// Console activity feed (D7). Rows come back already filtered by the caller's service permissions.

export type ActivitySeverity = "INFO" | "ATTENTION" | "CRITICAL";

export type ActivityRow = {
  id: string;
  occurredAt: string;
  tenantId: string | null;
  tenant: { id: string; name: string; slug: string } | null;
  service: string;
  type: string;
  actorType: string;
  actorId: string | null;
  actorLabel: string;
  subjectType: string;
  subjectId: string;
  summary: string;
  severity: ActivitySeverity;
  consoleLink: string | null;
  metadata: Record<string, unknown>;
};

export type ActivityPage = { data: ActivityRow[]; nextCursor: string | null };

export type ActivityFilters = { service?: string; severity?: ActivitySeverity; type?: string };

/** `path` is `/activity` (cross-tenant, optional `tenantId`) or `/customer360/:tenantId/activity`. */
export function useActivityFeed(path: string, filters: ActivityFilters & { tenantId?: string } = {}, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["activity", path, filters],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await consoleApi.get<ActivityPage>(path, { params: { ...filters, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last) => last.nextCursor,
    enabled
  });
}

export const severityTone: Record<ActivitySeverity, string> = {
  INFO: "border-[var(--color-border)] bg-[var(--color-surface-50)] text-[var(--color-text-muted)]",
  ATTENTION: "border-amber-200 bg-amber-50 text-amber-800",
  CRITICAL: "border-red-200 bg-red-50 text-red-700"
};
