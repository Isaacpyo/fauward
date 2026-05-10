import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from './cn.js';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-[var(--color-border)] bg-white p-6 text-center dark:bg-neutral-950', className)}>
      <div className="mb-3 text-[var(--color-text-muted)]">{icon ?? <Inbox size={22} aria-hidden />}</div>
      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
