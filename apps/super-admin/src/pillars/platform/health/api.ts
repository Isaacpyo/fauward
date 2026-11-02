import { useQuery } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// platform.health (WP-3.7): measured values only; anything the backend cannot measure comes back as `unavailable`
// with the reason.

export type Unavailable = { unavailable: true; reason: string };
export type Latency = { latencyMs: number };
export type HttpSummary = { p50: number; p95: number; p99: number; count: number; errorRate5xx: number; rpm: number };
export type RouteLatency = HttpSummary & { group: string };
export type WorkerStatus = { name: string; alive: boolean; lastBeat: string | null };
export type QueuesSummary = { queues: number; waiting: number; active: number; failed1h: number; dlqDepth: number; paused: number };

export type HealthReport = {
  asOf: string;
  windowMinutes: number;
  db: Latency | Unavailable;
  redis: Latency | Unavailable;
  uptimeSeconds: number;
  version: { version: string | null; commit: string | null } | Unavailable;
  http: HttpSummary | Unavailable;
  routes: RouteLatency[];
  workers: WorkerStatus[] | Unavailable;
  queuesSummary: QueuesSummary | Unavailable;
};

export function isUnavailable(value: unknown): value is Unavailable {
  return typeof value === "object" && value !== null && (value as { unavailable?: unknown }).unavailable === true;
}

export const HEALTH_KEY = ["platform.health"] as const;

export async function fetchHealth() {
  return (await consoleApi.get<HealthReport>("/health")).data;
}

export function useHealth() {
  return useQuery({ queryKey: HEALTH_KEY, queryFn: fetchHealth, refetchInterval: 15_000 });
}

export function formatPercent(rate: number) {
  return `${(rate * 100).toFixed(rate < 0.01 && rate > 0 ? 2 : 1)}%`;
}

export function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
