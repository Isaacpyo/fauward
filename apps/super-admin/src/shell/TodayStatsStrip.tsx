import { useQuery } from "@tanstack/react-query";

import { fetchErrorRate, fetchMetrics, fetchP95Latency, formatCurrency } from "@/lib/badges";

function StatItem({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[var(--color-text-primary)]">{loading ? "..." : value}</p>
    </div>
  );
}

export function TodayStatsStrip() {
  const metrics = useQuery({ queryKey: ["console-today-metrics"], queryFn: fetchMetrics, staleTime: 30_000 });
  const p95 = useQuery({ queryKey: ["console-p95-latency"], queryFn: fetchP95Latency, staleTime: 60_000 });
  const errorRate = useQuery({ queryKey: ["console-error-rate"], queryFn: fetchErrorRate, staleTime: 60_000 });

  return (
    <section className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatItem label="MRR" value={metrics.data ? formatCurrency(metrics.data.totalMRR) : "-"} loading={metrics.isLoading} />
      <StatItem label="Active Tenants" value={metrics.data ? String(metrics.data.activeTenantCount) : "-"} loading={metrics.isLoading} />
      <StatItem label="Shipments Today" value={metrics.data ? String(metrics.data.shipmentsToday) : "-"} loading={metrics.isLoading} />
      <StatItem label="P95 latency" value={p95.data?.label ?? "-"} loading={p95.isLoading} />
      <StatItem label="Error rate" value={errorRate.data?.label ?? "-"} loading={errorRate.isLoading} />
    </section>
  );
}
