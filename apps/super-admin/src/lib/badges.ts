import { consoleApi as api } from "@/lib/console-api";
import type { BadgeKey } from "@/pillars/_manifests";
import { fetchHealth, formatPercent, isUnavailable } from "@/pillars/platform/health/api";

type TenantsResponse = {
  total: number;
};

type QueuesResponse = {
  queues: Array<{ dlqDepth: number | null }>;
};

export type MetricsResponse = {
  activeTenantCount: number;
  shipmentsToday: number;
  /** Null unless the caller holds revenue.analytics.read. Decimal string in the platform base currency. */
  mrr: { amount: string; currency: string; unconverted: number } | null;
};

export type BadgeResult = {
  label: string;
  tone: "neutral" | "green" | "amber" | "red";
};

export async function fetchTenantCountBadge(): Promise<BadgeResult> {
  const response = await api.get<TenantsResponse>("/tenants?limit=1");
  return { label: String(response.data.total), tone: "green" };
}

export async function fetchDlqDepthBadge(): Promise<BadgeResult> {
  const response = await api.get<QueuesResponse>("/queues");
  const total = response.data.queues.reduce((sum, queue) => sum + (queue.dlqDepth ?? 0), 0);
  return { label: total > 0 ? `DLQ ${total}` : "ok", tone: total > 0 ? "red" : "green" };
}

export async function fetchMrrBadge(): Promise<BadgeResult> {
  const response = await api.get<MetricsResponse>("/metrics/overview");
  const mrr = response.data.mrr;
  return mrr ? { label: formatCurrency(mrr.amount, mrr.currency), tone: "green" } : { label: "-", tone: "neutral" };
}

export async function fetchMetrics() {
  const response = await api.get<MetricsResponse>("/metrics/overview");
  return response.data;
}

// WP-3.4 replaces these per-key fetches with one GET /api/internal/badges endpoint.
export async function fetchBadge(key: BadgeKey): Promise<BadgeResult> {
  if (key === "tenant-count") return fetchTenantCountBadge();
  if (key === "dlq-depth") return fetchDlqDepthBadge();
  return fetchMrrBadge();
}

export async function fetchP95Latency(): Promise<BadgeResult> {
  const report = await fetchHealth();
  if (isUnavailable(report.http)) return { label: "no traffic", tone: "neutral" };
  return { label: `${report.http.p95} ms`, tone: report.http.p95 > 1_000 ? "red" : report.http.p95 > 500 ? "amber" : "green" };
}

export async function fetchErrorRate(): Promise<BadgeResult> {
  const report = await fetchHealth();
  if (isUnavailable(report.http)) return { label: "no traffic", tone: "neutral" };
  const rate = report.http.errorRate5xx;
  return { label: formatPercent(rate), tone: rate >= 0.05 ? "red" : rate >= 0.01 ? "amber" : "green" };
}

/** Formats an API decimal string in the currency the API returned (never assumes GBP). */
export function formatCurrency(amount: string, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount));
}
