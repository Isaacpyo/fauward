type SystemMetricsProps = {
  dbLatencyMs?: number;
  redisLatencyMs?: number;
  uptimeSeconds?: number;
};

export function SystemMetrics({ dbLatencyMs, redisLatencyMs, uptimeSeconds }: SystemMetricsProps) {
  return (
    <section className="grid gap-2 lg:grid-cols-2">
      <article className="rounded-md border border-[var(--color-border)] bg-white p-3 text-xs">API latency p50/p95/p99 chart placeholder</article>
      <article className="rounded-md border border-[var(--color-border)] bg-white p-3 text-xs">Error rate chart placeholder</article>
      <article className="rounded-md border border-[var(--color-border)] bg-white p-3 text-xs">
        <p>Uptime: <span className="font-semibold text-green-700">{uptimeSeconds ? `${Math.floor(uptimeSeconds / 60)}m` : "n/a"}</span></p>
        <p className="mt-1">DB latency: <span className="font-mono">{dbLatencyMs ?? "n/a"} ms</span></p>
        <p className="mt-1">Redis latency: <span className="font-mono">{redisLatencyMs ?? "n/a"} ms</span></p>
      </article>
      <article className="rounded-md border border-[var(--color-border)] bg-white p-3 text-xs">Infrastructure incident feed placeholder</article>
    </section>
  );
}
