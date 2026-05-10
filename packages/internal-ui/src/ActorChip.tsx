import { cn } from './cn.js';

type ActorChipProps = {
  name: string;
  role: string;
  avatarUrl?: string | null;
  className?: string;
};

export function ActorChip({ name, role, avatarUrl, className }: ActorChipProps) {
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-2 py-1 text-xs dark:bg-neutral-950', className)}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
      ) : (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--color-surface-50)] font-semibold text-[var(--color-text-muted)]">{initials}</span>
      )}
      <span className="font-medium text-[var(--color-text-primary)]">{name}</span>
      <span className="text-[var(--color-text-muted)]">{role}</span>
    </span>
  );
}
