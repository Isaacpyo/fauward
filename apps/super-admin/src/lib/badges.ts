import { consoleApi as api } from "@/lib/console-api";
import type { BadgeKey } from "@/pillars/_manifests";

type TenantsResponse = {
  total: number;
};

type QueuesResponse = {
  dlq?: Record<string, number>;
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
  const total = Object.values(response.data.dlq ?? {}).reduce((sum, value) => sum + value, 0);
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

export async function fetchPlaceholderBadge(_key: BadgeKey): Promise<BadgeResult> {
  // TODO(WP-3.4): one GET /api/internal/badges endpoint replaces per-key fetches.
  return { label: "-", tone: "neutral" };
}

export async function fetchBadge(key: BadgeKey | undefined): Promise<BadgeResult> {
  if (key === "tenant-count") return fetchTenantCountBadge();
  if (key === "dlq-depth") return fetchDlqDepthBadge();
  if (key === "mrr") return fetchMrrBadge();
  return fetchPlaceholderBadge(key ?? "placeholder");
}

export async function fetchP95Latency(): Promise<BadgeResult> {
  // TODO(WP-3.x): wire to /api/internal/health once latency percentiles are exposed.
  return { label: "-", tone: "neutral" };
}

export async function fetchErrorRate(): Promise<BadgeResult> {
  // TODO(WP-3.x): wire to /api/internal/health once error-rate telemetry is exposed.
  return { label: "-", tone: "neutral" };
}

/** Formats an API decimal string in the currency the API returned (never assumes GBP). */
export function formatCurrency(amount: string, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount));
}
