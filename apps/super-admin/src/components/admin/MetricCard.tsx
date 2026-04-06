type MetricCardProps = {
  title: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
};

export function MetricCard({ title, value, trend, trendUp }: MetricCardProps) {
  const isUp = trendUp ?? (trend ? trend.startsWith("↑") || trend.startsWith("+") : undefined);

  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-white p-4 transition hover:shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{title}</p>
      <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
      {trend ? (
        <p className={`mt-1.5 inline-flex items-center gap-1 text-xs font-semibold ${isUp ? "text-green-600" : "text-red-500"}`}>
          <svg
            className={`h-3 w-3 shrink-0 ${isUp === false ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
          </svg>
          {trend}
        </p>
      ) : null}
    </article>
  );
}
