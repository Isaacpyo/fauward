import { cn } from './cn.js';

type HealthStatus = 'green' | 'amber' | 'red';

type HealthPillProps = {
  status: HealthStatus;
  label: string;
  tooltip?: string;
  className?: string;
};

const statusClasses: Record<HealthStatus, string> = {
  green: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
};

export function HealthPill({ status, label, tooltip, className }: HealthPillProps) {
  return (
    <span title={tooltip} className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold', statusClasses[status], className)}>
      {label}
    </span>
  );
}
