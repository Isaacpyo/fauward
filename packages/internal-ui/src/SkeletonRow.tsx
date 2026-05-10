import { cn } from './cn.js';

type SkeletonRowProps = {
  columns?: number;
  className?: string;
};

export function SkeletonRow({ columns = 4, className }: SkeletonRowProps) {
  return (
    <div className={cn('grid gap-3 border-b border-[var(--color-border)] p-3', className)} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: columns }).map((_, index) => (
        <div key={index} className="h-4 animate-pulse rounded bg-[var(--color-surface-50)] dark:bg-neutral-800" />
      ))}
    </div>
  );
}
