import { TrendingUp } from 'lucide-react';
import { cn } from './cn.js';

type StatCardProps = {
  label: string;
  value: string | number;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  className?: string;
};

export function StatCard({ label, value, trend, trendDirection = 'neutral', className }: StatCardProps) {
  const trendClass = trendDirection === 'up' ? 'text-green-600' : trendDirection === 'down' ? 'text-red-500' : 'text-[var(--color-text-muted)]';

  return (
    <article className={cn('rounded-lg border border-[var(--color-border)] bg-white p-4 transition hover:shadow-sm dark:bg-neutral-950', className)}>
      <p className="text-xs font-medium uppercase text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
      {trend ? (
        <p className={cn('mt-1.5 inline-flex items-center gap-1 text-xs font-semibold', trendClass)}>
          <TrendingUp size={12} className={trendDirection === 'down' ? 'rotate-180' : undefined} aria-hidden />
          {trend}
        </p>
      ) : null}
    </article>
  );
}
