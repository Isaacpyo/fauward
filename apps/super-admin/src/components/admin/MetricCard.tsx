type MetricCardProps = {
  title: string;
  value: string;
  trend?: string;
};

export function MetricCard({ title, value, trend }: MetricCardProps) {
  return (
    <article className="rounded-md border border-[var(--color-border)] bg-white p-3">
      <p className="text-xs text-[var(--color-text-muted)]">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">{value}</p>
      {trend ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">{trend}</p> : null}
    </article>
  );
}

