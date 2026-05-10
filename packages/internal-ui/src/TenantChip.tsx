import { cn } from './cn.js';

type TenantChipProps = {
  tenantId: string;
  name: string;
  href?: string;
  className?: string;
};

export function TenantChip({ tenantId, name, href, className }: TenantChipProps) {
  return (
    <a
      href={href ?? `/customer/360/${tenantId}`}
      className={cn('inline-flex items-center rounded-full border border-[var(--color-border)] bg-white px-2 py-1 text-xs font-medium text-[var(--fauward-navy)] hover:bg-[var(--color-surface-50)] dark:bg-neutral-950', className)}
    >
      {name}
    </a>
  );
}
