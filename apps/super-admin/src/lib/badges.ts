import { api } from "@/lib/api";
import type { BadgeKey } from "@/pillars/_manifests";

type TenantsResponse = {
  meta?: {
    total?: number;
  };
};

type QueuesResponse = {
  dlq?: Record<string, number>;
};

type MetricsResponse = {
  totalMRR: number;
  activeTenantCount: number;
  shipmentsToday: number;
};

export type BadgeResult = {
  label: string;
  tone: "neutral" | "green" | "amber" | "red";
};

export async function fetchTenantCountBadge(): Promise<BadgeResult> {
  const response = await api.get<TenantsResponse>("/tenants?limit=1");
  return { label: String(response.data.meta?.total ?? 0), tone: "green" };
}

export async function fetchDlqDepthBadge(): Promise<BadgeResult> {
  const response = await api.get<QueuesResponse>("/queues");
  const total = Object.values(response.data.dlq ?? {}).reduce((sum, value) => sum + value, 0);
  return { label: total > 0 ? `DLQ ${total}` : "ok", tone: total > 0 ? "red" : "green" };
}

export async function fetchMrrBadge(): Promise<BadgeResult> {
  const response = await api.get<MetricsResponse>("/metrics");
  return { label: formatCurrency(response.data.totalMRR), tone: "green" };
}

export async function fetchMetrics() {
  const response = await api.get<MetricsResponse>("/metrics");
  return response.data;
}

export async function fetchPlaceholderBadge(_key: BadgeKey): Promise<BadgeResult> {
  // TODO: Replace with per-service endpoints under /api/v1/platform/internal-badges.
  return { label: "-", tone: "neutral" };
}

export async function fetchBadge(key: BadgeKey | undefined): Promise<BadgeResult> {
  if (key === "tenant-count") return fetchTenantCountBadge();
  if (key === "dlq-depth") return fetchDlqDepthBadge();
  if (key === "mrr") return fetchMrrBadge();
  return fetchPlaceholderBadge(key ?? "placeholder");
}

export async function fetchP95Latency(): Promise<BadgeResult> {
  // TODO: Wire to /api/v1/platform/health once latency percentiles are exposed.
  return { label: "-", tone: "neutral" };
}

export async function fetchErrorRate(): Promise<BadgeResult> {
  // TODO: Wire to /api/v1/platform/health once error-rate telemetry is exposed.
  return { label: "-", tone: "neutral" };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(value);
}
