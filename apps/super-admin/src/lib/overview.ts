import { useQuery } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// GET /metrics/overview (WP-3.1) and GET /activity/summary. A field is absent when the caller lacks the permission
// that reads it — the dashboard then shows no tile for it rather than a placeholder.

export type Overview = {
  asOf: string;
  /** Present only with revenue.analytics.read. Decimal string in the platform base currency. */
  mrr?: { amount: string; currency: string; asOf: string; converted: number; unconverted: number; subscriptions: number };
  activeTenants?: number;
  trialingTenants?: number;
  suspendedTenants?: number;
  signups7d?: number;
  shipmentsToday?: number;
  shipments30d?: number;
  dlqDepth?: number;
  /** `rate` is null when no requests were recorded in the last hour. */
  error5xxRate1h?: { rate: number | null; requests: number };
  failedPayments30d?: number;
  openPlatformTickets?: number;
  openEscalations?: number;
  pendingApprovals?: { refunds?: number; jit?: number; planChanges?: number; regionRequests?: number; appeals?: number; dsar?: number };
};

export type ActivitySummary = { services: Array<{ service: string; lastOccurredAt: string | null; count: number; alerts24h: number }> };

export const OVERVIEW_KEY = ["console", "overview"] as const;
export const ACTIVITY_SUMMARY_KEY = ["activity", "summary"] as const;

export function useOverview() {
  return useQuery({ queryKey: OVERVIEW_KEY, queryFn: async () => (await consoleApi.get<Overview>("/metrics/overview")).data, refetchInterval: 60_000 });
}

export function useActivitySummary() {
  return useQuery({ queryKey: ACTIVITY_SUMMARY_KEY, queryFn: async () => (await consoleApi.get<ActivitySummary>("/activity/summary")).data, staleTime: 30_000 });
}
